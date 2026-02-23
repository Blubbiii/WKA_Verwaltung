/**
 * Billing Worker - Verarbeitet Jobs aus der "billing" Queue
 *
 * Dieser Worker ist verantwortlich fuer Abrechnungsprozesse:
 * - Rechnungsgenerierung (aus Job-Daten oder BillingRule)
 * - Pachtabrechnungen (LeaseSettlementPeriod)
 * - Mahnwesen (Zahlungserinnerungen per E-Mail)
 * - Gebuehrenberechnung (Management Fees via BillingRule)
 * - Massenrechnungen (Bulk Invoicing fuer Gesellschafter)
 *
 * Verwendet:
 *   - src/lib/billing/executor.ts (executeRule) for rule-based billing
 *   - src/lib/billing/rules/ for individual rule handlers
 *   - src/lib/invoices/numberGenerator.ts for atomic invoice numbering
 *   - src/lib/queue/queues/email.queue.ts for sending notification emails
 *   - Prisma models: Invoice, BillingRule, BillingRuleExecution, LeaseSettlementPeriod
 */

import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../connection";
import { billingLogger } from "@/lib/logger";
import { getTenantSettings } from "@/lib/tenant-settings";

// =============================================================================
// Types
// =============================================================================

/**
 * Billing-Job-Typen
 */
export type BillingJobType =
  | "generate-invoice"
  | "generate-settlement"
  | "send-reminder"
  | "calculate-fees"
  | "bulk-invoice"
  | "process-recurring-invoices";

/**
 * Basis-Interface fuer alle Billing-Jobs
 */
interface BaseBillingJobData {
  /** Eindeutige Job-ID fuer Tracking */
  jobId: string;
  /** Typ des Billing-Jobs */
  type: BillingJobType;
  /** Tenant-ID fuer Multi-Tenancy */
  tenantId: string;
}

/**
 * Job-Daten fuer Rechnungsgenerierung
 */
export interface GenerateInvoiceJobData extends BaseBillingJobData {
  type: "generate-invoice";
  /** Kunde oder Gesellschafter ID */
  customerId: string;
  /** Rechnungsposten */
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
  }>;
  /** Faelligkeitsdatum (ISO-String) */
  dueDate?: string;
  /** Interne Referenz */
  reference?: string;
}

/**
 * Job-Daten fuer Settlement-Generierung
 */
export interface GenerateSettlementJobData extends BaseBillingJobData {
  type: "generate-settlement";
  /** Park ID */
  parkId: string;
  /** Jahr der Abrechnung */
  year: number;
  /** Gesamteinnahmen */
  totalRevenue?: number;
}

/**
 * Job-Daten fuer Zahlungserinnerungen
 */
export interface SendReminderJobData extends BaseBillingJobData {
  type: "send-reminder";
  /** Rechnungs-ID */
  invoiceId: string;
  /** Mahnstufe */
  reminderLevel: 1 | 2 | 3;
}

/**
 * Job-Daten fuer Gebuehrenberechnung
 */
export interface CalculateFeesJobData extends BaseBillingJobData {
  type: "calculate-fees";
  /** Zeitraum Start (ISO-String) */
  periodStart: string;
  /** Zeitraum Ende (ISO-String) */
  periodEnd: string;
  /** Betroffene Entity-IDs */
  entityIds?: string[];
}

/**
 * Job-Daten fuer Massenrechnungen
 */
export interface BulkInvoiceJobData extends BaseBillingJobData {
  type: "bulk-invoice";
  /** Park ID */
  parkId: string;
  /** Abrechnungsperiode */
  period: string;
  /** Filter fuer Gesellschafter */
  shareholderFilter?: {
    status?: string[];
    minimumShare?: number;
  };
}

/**
 * Job-Daten fuer wiederkehrende Rechnungen
 */
export interface ProcessRecurringInvoicesJobData extends BaseBillingJobData {
  type: "process-recurring-invoices";
  /** Optional: Nur fuer bestimmten Tenant ausfuehren (default: alle) */
  targetTenantId?: string;
}

/**
 * Union-Typ fuer alle Billing-Job-Daten
 */
export type BillingJobData =
  | GenerateInvoiceJobData
  | GenerateSettlementJobData
  | SendReminderJobData
  | CalculateFeesJobData
  | BulkInvoiceJobData
  | ProcessRecurringInvoicesJobData;

/**
 * Ergebnis nach Billing-Job
 */
export interface BillingJobResult {
  success: boolean;
  /** Generierte Rechnungs-IDs */
  invoiceIds?: string[];
  /** Generierte Settlement-IDs */
  settlementIds?: string[];
  /** Anzahl verarbeiteter Elemente */
  processedCount?: number;
  /** Fehler wenn fehlgeschlagen */
  error?: string;
  /** Details zur Verarbeitung */
  details?: Record<string, unknown>;
  /** Zeitpunkt der Verarbeitung */
  processedAt?: Date;
}

// =============================================================================
// Logger
// =============================================================================

const logger = billingLogger.child({ component: "billing-worker" });

function log(level: "info" | "warn" | "error", jobId: string, message: string, meta?: Record<string, unknown>): void {
  const logData = { jobId, ...meta };
  if (level === "error") {
    logger.error(logData, message);
  } else if (level === "warn") {
    logger.warn(logData, message);
  } else {
    logger.info(logData, message);
  }
}

// =============================================================================
// Tax rate helper (matching src/lib/invoices/numberGenerator.ts)
// =============================================================================

function getTaxRateFromPercent(taxRatePercent: number): "STANDARD" | "REDUCED" | "EXEMPT" {
  if (taxRatePercent >= 19) return "STANDARD";
  if (taxRatePercent >= 7) return "REDUCED";
  return "EXEMPT";
}

// =============================================================================
// Billing Processors
// =============================================================================

/**
 * Generiert eine Rechnung aus den Job-Daten.
 *
 * 1. Loads customer/recipient data from Prisma (tries Shareholder -> Person -> Lessor)
 * 2. Calculates line item totals with tax
 * 3. Creates Invoice record in database via Prisma with InvoiceItems
 * 4. Generates invoice number (sequential per tenant) atomically
 * 5. Returns real invoice ID from database
 */
async function processGenerateInvoice(data: GenerateInvoiceJobData): Promise<BillingJobResult> {
  log("info", data.jobId, "Processing generate-invoice job", {
    customerId: data.customerId,
    itemCount: data.items.length,
  });

  // Dynamic imports to avoid circular dependencies in worker context
  const { prisma } = await import("@/lib/prisma");
  const { getNextInvoiceNumber, calculateTaxAmounts } = await import("@/lib/invoices/numberGenerator");
  const { InvoiceType } = await import("@prisma/client");

  // 1. Load customer data - try Shareholder first, then Person
  let recipientName: string | null = null;
  let recipientAddress: string | null = null;
  let recipientType: string = "other";
  let shareholderId: string | null = null;
  let fundId: string | null = null;

  const shareholder = await prisma.shareholder.findUnique({
    where: { id: data.customerId },
    include: {
      person: {
        select: {
          firstName: true,
          lastName: true,
          companyName: true,
          street: true,
          postalCode: true,
          city: true,
        },
      },
      fund: {
        select: { id: true, name: true },
      },
    },
  });

  if (shareholder) {
    recipientName =
      shareholder.person.companyName ||
      `${shareholder.person.firstName || ""} ${shareholder.person.lastName || ""}`.trim();
    recipientAddress = [
      shareholder.person.street,
      `${shareholder.person.postalCode || ""} ${shareholder.person.city || ""}`.trim(),
    ]
      .filter(Boolean)
      .join("\n");
    recipientType = "shareholder";
    shareholderId = shareholder.id;
    fundId = shareholder.fund?.id || null;
  } else {
    // Try Person directly
    const person = await prisma.person.findUnique({
      where: { id: data.customerId },
      select: {
        firstName: true,
        lastName: true,
        companyName: true,
        street: true,
        postalCode: true,
        city: true,
      },
    });

    if (person) {
      recipientName =
        person.companyName ||
        `${person.firstName || ""} ${person.lastName || ""}`.trim();
      recipientAddress = [
        person.street,
        `${person.postalCode || ""} ${person.city || ""}`.trim(),
      ]
        .filter(Boolean)
        .join("\n");
      recipientType = "person";
    }
  }

  if (!recipientName) {
    log("error", data.jobId, "Customer not found", { customerId: data.customerId });
    return {
      success: false,
      error: `Kunde mit ID "${data.customerId}" nicht gefunden`,
      processedCount: 0,
      processedAt: new Date(),
    };
  }

  // 2. Calculate line item totals with tax
  let totalNet = 0;
  let totalTax = 0;
  let totalGross = 0;

  const itemsData = data.items.map((item, index) => {
    const netAmount = item.quantity * item.unitPrice;
    const taxType = getTaxRateFromPercent(item.taxRate);
    const { taxRate, taxAmount, grossAmount } = calculateTaxAmounts(netAmount, taxType);

    totalNet += netAmount;
    totalTax += taxAmount;
    totalGross += grossAmount;

    return {
      position: index + 1,
      description: item.description,
      quantity: item.quantity,
      unit: "Stueck" as string,
      unitPrice: item.unitPrice,
      netAmount,
      taxType: taxType,
      taxRate,
      taxAmount,
      grossAmount,
    };
  });

  // 3. Generate invoice number atomically
  const { number: invoiceNumber } = await getNextInvoiceNumber(
    data.tenantId,
    InvoiceType.INVOICE
  );

  // 4. Calculate due date from tenant settings
  const tenantSettings = await getTenantSettings(data.tenantId);
  const paymentTermDays = tenantSettings.paymentTermDays;
  const dueDate = data.dueDate
    ? new Date(data.dueDate)
    : new Date(Date.now() + paymentTermDays * 24 * 60 * 60 * 1000);

  // 5. Create Invoice with items in database
  const invoice = await prisma.invoice.create({
    data: {
      invoiceType: InvoiceType.INVOICE,
      invoiceNumber,
      invoiceDate: new Date(),
      dueDate,
      recipientType,
      recipientName,
      recipientAddress,
      paymentReference: data.reference || invoiceNumber,
      internalReference: data.reference,
      netAmount: totalNet,
      taxRate: 0, // Mixed rates across items
      taxAmount: totalTax,
      grossAmount: totalGross,
      status: "DRAFT",
      tenantId: data.tenantId,
      shareholderId,
      fundId,
      items: {
        create: itemsData,
      },
    },
  });

  log("info", data.jobId, "Invoice created successfully", {
    invoiceId: invoice.id,
    invoiceNumber,
    grossAmount: totalGross,
    recipientName,
  });

  return {
    success: true,
    invoiceIds: [invoice.id],
    processedCount: 1,
    details: {
      invoiceNumber,
      recipientName,
      netAmount: totalNet,
      taxAmount: totalTax,
      grossAmount: totalGross,
      itemCount: data.items.length,
    },
    processedAt: new Date(),
  };
}

/**
 * Generiert eine Pachtabrechnung (Settlement Period) fuer einen Park.
 *
 * 1. Loads park data and all associated leases/shareholders from Prisma
 * 2. Creates a LeaseSettlementPeriod record in the database
 * 3. If totalRevenue is provided, stores it on the settlement period
 * 4. Calculates totalMinimumRent from all active leases for the year
 * 5. Returns real settlement ID from database
 */
async function processGenerateSettlement(data: GenerateSettlementJobData): Promise<BillingJobResult> {
  log("info", data.jobId, "Processing generate-settlement job", {
    parkId: data.parkId,
    year: data.year,
    totalRevenue: data.totalRevenue,
  });

  const { prisma } = await import("@/lib/prisma");
  const { ContractStatus } = await import("@prisma/client");

  // 1. Load park data
  const park = await prisma.park.findUnique({
    where: { id: data.parkId },
    select: {
      id: true,
      name: true,
      tenantId: true,
      minimumRentPerTurbine: true,
      turbines: {
        where: { status: "ACTIVE" },
        select: { id: true },
      },
    },
  });

  if (!park) {
    log("error", data.jobId, "Park not found", { parkId: data.parkId });
    return {
      success: false,
      error: `Park mit ID "${data.parkId}" nicht gefunden`,
      processedCount: 0,
      processedAt: new Date(),
    };
  }

  // Verify tenant matches
  if (park.tenantId !== data.tenantId) {
    log("error", data.jobId, "Tenant mismatch for park", {
      parkTenant: park.tenantId,
      jobTenant: data.tenantId,
    });
    return {
      success: false,
      error: "Park gehoert nicht zum angegebenen Tenant",
      processedCount: 0,
      processedAt: new Date(),
    };
  }

  // 2. Check if settlement period already exists (annual = month is null)
  const existingPeriod = await prisma.leaseSettlementPeriod.findFirst({
    where: {
      tenantId: data.tenantId,
      parkId: data.parkId,
      year: data.year,
      month: null, // null = Jahresabrechnung
    },
  });

  if (existingPeriod) {
    log("warn", data.jobId, "Settlement period already exists", {
      existingId: existingPeriod.id,
      status: existingPeriod.status,
    });
    return {
      success: false,
      error: `Abrechnungsperiode fuer Park "${park.name}" Jahr ${data.year} existiert bereits (ID: ${existingPeriod.id})`,
      settlementIds: [existingPeriod.id],
      processedCount: 0,
      processedAt: new Date(),
    };
  }

  // 3. Calculate total minimum rent from active leases for this park and year
  const activeLeases = await prisma.lease.findMany({
    where: {
      tenantId: data.tenantId,
      status: ContractStatus.ACTIVE,
      startDate: { lte: new Date(data.year, 11, 31) }, // Started before end of year
      OR: [
        { endDate: null }, // No end date
        { endDate: { gte: new Date(data.year, 0, 1) } }, // Ends after start of year
      ],
      leasePlots: {
        some: {
          plot: {
            parkId: data.parkId,
          },
        },
      },
    },
    select: { id: true },
  });

  // Calculate total minimum rent: minimumRentPerTurbine * number of turbines
  const minimumRentPerTurbine = park.minimumRentPerTurbine
    ? Number(park.minimumRentPerTurbine)
    : 0;
  const turbineCount = park.turbines.length;
  const totalMinimumRent = minimumRentPerTurbine * turbineCount;

  // 4. Create the settlement period
  const settlementPeriod = await prisma.leaseSettlementPeriod.create({
    data: {
      year: data.year,
      status: "OPEN",
      totalRevenue: data.totalRevenue ?? null,
      totalMinimumRent: totalMinimumRent > 0 ? totalMinimumRent : null,
      periodType: "FINAL",
      tenantId: data.tenantId,
      parkId: data.parkId,
    },
  });

  log("info", data.jobId, "Settlement period created successfully", {
    settlementId: settlementPeriod.id,
    year: data.year,
    parkName: park.name,
    totalMinimumRent,
    totalRevenue: data.totalRevenue,
    activeLeaseCount: activeLeases.length,
    turbineCount,
  });

  return {
    success: true,
    settlementIds: [settlementPeriod.id],
    processedCount: 1,
    details: {
      parkId: data.parkId,
      parkName: park.name,
      year: data.year,
      totalMinimumRent,
      totalRevenue: data.totalRevenue ?? null,
      activeLeaseCount: activeLeases.length,
      turbineCount,
    },
    processedAt: new Date(),
  };
}

/**
 * Sendet eine Zahlungserinnerung (Dunning) fuer eine ueberfaellige Rechnung.
 *
 * 1. Loads invoice from database and verifies it is overdue
 * 2. Determines correct reminder level (1st, 2nd, 3rd notice)
 * 3. Calculates late fees if applicable (level 2: 5 EUR, level 3: 10 EUR)
 * 4. Sends reminder email via email queue
 * 5. Updates invoice notes with reminder history
 * 6. For level 3: logs escalation warning for management
 */
async function processSendReminder(data: SendReminderJobData): Promise<BillingJobResult> {
  log("info", data.jobId, "Processing send-reminder job", {
    invoiceId: data.invoiceId,
    reminderLevel: data.reminderLevel,
  });

  const { prisma } = await import("@/lib/prisma");

  // 1. Load invoice and verify it exists and is overdue
  const invoice = await prisma.invoice.findUnique({
    where: { id: data.invoiceId },
    include: {
      tenant: {
        select: { id: true, name: true },
      },
      fund: {
        select: { id: true, name: true },
      },
    },
  });

  if (!invoice) {
    log("error", data.jobId, "Invoice not found", { invoiceId: data.invoiceId });
    return {
      success: false,
      error: `Rechnung mit ID "${data.invoiceId}" nicht gefunden`,
      processedCount: 0,
      processedAt: new Date(),
    };
  }

  // Verify tenant matches
  if (invoice.tenantId !== data.tenantId) {
    log("error", data.jobId, "Tenant mismatch for invoice", {
      invoiceTenant: invoice.tenantId,
      jobTenant: data.tenantId,
    });
    return {
      success: false,
      error: "Rechnung gehoert nicht zum angegebenen Tenant",
      processedCount: 0,
      processedAt: new Date(),
    };
  }

  // 2. Check invoice status - only SENT invoices can receive reminders
  if (invoice.status === "PAID") {
    log("info", data.jobId, "Invoice already paid, skipping reminder", {
      invoiceId: data.invoiceId,
    });
    return {
      success: true,
      processedCount: 0,
      details: {
        skipped: true,
        reason: "Rechnung bereits bezahlt",
        invoiceId: data.invoiceId,
      },
      processedAt: new Date(),
    };
  }

  if (invoice.status === "CANCELLED") {
    log("info", data.jobId, "Invoice cancelled, skipping reminder", {
      invoiceId: data.invoiceId,
    });
    return {
      success: true,
      processedCount: 0,
      details: {
        skipped: true,
        reason: "Rechnung storniert",
        invoiceId: data.invoiceId,
      },
      processedAt: new Date(),
    };
  }

  if (invoice.status === "DRAFT") {
    log("warn", data.jobId, "Invoice is still in DRAFT status, skipping reminder", {
      invoiceId: data.invoiceId,
    });
    return {
      success: false,
      error: "Rechnung ist noch im Entwurf-Status und wurde nicht versendet",
      processedCount: 0,
      processedAt: new Date(),
    };
  }

  // 3. Check if invoice is actually overdue
  const now = new Date();
  if (invoice.dueDate && invoice.dueDate > now) {
    log("info", data.jobId, "Invoice not yet overdue", {
      invoiceId: data.invoiceId,
      dueDate: invoice.dueDate.toISOString(),
    });
    return {
      success: false,
      error: `Rechnung ist noch nicht faellig (Faelligkeit: ${invoice.dueDate.toLocaleDateString("de-DE")})`,
      processedCount: 0,
      processedAt: new Date(),
    };
  }

  // 4. Calculate days overdue and late fee
  const daysOverdue = invoice.dueDate
    ? Math.floor((now.getTime() - invoice.dueDate.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  let lateFee = 0;
  const reminderLabels: Record<number, string> = {
    1: "1. Zahlungserinnerung",
    2: "2. Mahnung",
    3: "3. Mahnung (Letzte Aufforderung)",
  };

  // Late fees based on reminder level
  if (data.reminderLevel === 2) {
    lateFee = 5.0; // 5 EUR Mahngebuehr
  } else if (data.reminderLevel === 3) {
    lateFee = 10.0; // 10 EUR Mahngebuehr
  }

  const reminderLabel = reminderLabels[data.reminderLevel] || `Mahnstufe ${data.reminderLevel}`;

  // 5. Update invoice notes with reminder history
  const reminderTimestamp = now.toLocaleString("de-DE");
  const reminderNote = `\n[${reminderTimestamp}] ${reminderLabel} versendet (${daysOverdue} Tage ueberfaellig)${
    lateFee > 0 ? ` - Mahngebuehr: ${lateFee.toFixed(2)} EUR` : ""
  }`;

  const updatedNotes = (invoice.notes || "") + reminderNote;

  await prisma.invoice.update({
    where: { id: data.invoiceId },
    data: {
      notes: updatedNotes,
    },
  });

  // 6. Send reminder email via email queue
  let emailSent = false;
  try {
    const { enqueueEmail } = await import("@/lib/queue/queues/email.queue");

    // Try to find the recipient email
    let recipientEmail: string | null = null;

    if (invoice.shareholderId) {
      const shareholder = await prisma.shareholder.findUnique({
        where: { id: invoice.shareholderId },
        include: {
          person: { select: { email: true } },
        },
      });
      recipientEmail = shareholder?.person.email || null;
    }

    if (!recipientEmail && invoice.leaseId) {
      const lease = await prisma.lease.findUnique({
        where: { id: invoice.leaseId },
        include: {
          lessor: { select: { email: true } },
        },
      });
      recipientEmail = lease?.lessor.email || null;
    }

    if (recipientEmail) {
      await enqueueEmail({
        to: recipientEmail,
        subject: `${reminderLabel} - Rechnung ${invoice.invoiceNumber}`,
        template: "invoice-notification",
        data: {
          invoiceNumber: invoice.invoiceNumber,
          recipientName: invoice.recipientName || "Empfaenger",
          grossAmount: Number(invoice.grossAmount),
          dueDate: invoice.dueDate?.toLocaleDateString("de-DE") || "n/a",
          daysOverdue,
          reminderLevel: data.reminderLevel,
          reminderLabel,
          lateFee,
          tenantName: invoice.tenant.name,
        },
        tenantId: data.tenantId,
        priority: data.reminderLevel >= 3 ? 1 : 3, // Higher priority for final notices
      });
      emailSent = true;
      log("info", data.jobId, "Reminder email enqueued", {
        to: recipientEmail,
        reminderLevel: data.reminderLevel,
      });
    } else {
      log("warn", data.jobId, "No email address found for invoice recipient", {
        invoiceId: data.invoiceId,
        recipientName: invoice.recipientName,
      });
    }
  } catch (emailError) {
    // Email sending is non-critical - log and continue
    log("warn", data.jobId, "Failed to enqueue reminder email", {
      error: emailError instanceof Error ? emailError.message : "Unknown error",
    });
  }

  // 7. For level 3: log escalation warning
  if (data.reminderLevel >= 3) {
    log("warn", data.jobId, "ESCALATION: Level 3 reminder sent - requires management attention", {
      invoiceId: data.invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      recipientName: invoice.recipientName,
      grossAmount: Number(invoice.grossAmount),
      daysOverdue,
    });
  }

  log("info", data.jobId, "Reminder processed successfully", {
    invoiceId: data.invoiceId,
    invoiceNumber: invoice.invoiceNumber,
    reminderLevel: data.reminderLevel,
    daysOverdue,
    lateFee,
    emailSent,
  });

  return {
    success: true,
    processedCount: 1,
    details: {
      invoiceId: data.invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      recipientName: invoice.recipientName,
      reminderLevel: data.reminderLevel,
      reminderLabel,
      daysOverdue,
      lateFee,
      emailSent,
      grossAmount: Number(invoice.grossAmount),
    },
    processedAt: new Date(),
  };
}

/**
 * Berechnet Verwaltungsgebuehren (Management Fees) basierend auf BillingRules.
 *
 * 1. Loads all active MANAGEMENT_FEE billing rules for the tenant and period
 * 2. Filters by entityIds if provided
 * 3. Executes each rule via the billing executor (src/lib/billing/executor.ts)
 * 4. Stores calculated fees as Invoice records in database
 * 5. Returns aggregate results
 */
async function processCalculateFees(data: CalculateFeesJobData): Promise<BillingJobResult> {
  log("info", data.jobId, "Processing calculate-fees job", {
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    entityCount: data.entityIds?.length || "all",
  });

  const { prisma } = await import("@/lib/prisma");
  const { executeRule } = await import("@/lib/billing/executor");

  const periodStart = new Date(data.periodStart);
  const periodEnd = new Date(data.periodEnd);

  // 1. Load all active MANAGEMENT_FEE billing rules for this tenant
  const feeRules = await prisma.billingRule.findMany({
    where: {
      tenantId: data.tenantId,
      isActive: true,
      ruleType: "MANAGEMENT_FEE",
      // Only consider rules that should have run within or before the period
      OR: [
        { nextRunAt: { lte: periodEnd } },
        { nextRunAt: null }, // Never run
      ],
    },
    include: {
      tenant: {
        select: { id: true, name: true },
      },
    },
  });

  if (feeRules.length === 0) {
    log("info", data.jobId, "No active management fee rules found for tenant", {
      tenantId: data.tenantId,
    });
    return {
      success: true,
      invoiceIds: [],
      processedCount: 0,
      details: {
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        message: "Keine aktiven Verwaltungsgebuehr-Regeln gefunden",
      },
      processedAt: new Date(),
    };
  }

  // 2. Filter by entityIds if provided (match against fundId or parkId in rule parameters)
  let filteredRules = feeRules;
  if (data.entityIds && data.entityIds.length > 0) {
    filteredRules = feeRules.filter((rule) => {
      const params = rule.parameters as Record<string, unknown>;
      const fundId = params.fundId as string | undefined;
      const parkId = params.parkId as string | undefined;

      // Include rule if its fundId or parkId matches any entityId
      if (fundId && data.entityIds!.includes(fundId)) return true;
      if (parkId && data.entityIds!.includes(parkId)) return true;
      // Include rules without specific entity (general fee rules)
      if (!fundId && !parkId) return true;
      return false;
    });
  }

  // 3. Execute each rule via the billing executor
  const allInvoiceIds: string[] = [];
  let totalProcessed = 0;
  let totalSuccessful = 0;
  let totalFailed = 0;
  let totalAmount = 0;
  const ruleResults: Array<Record<string, unknown>> = [];

  for (const rule of filteredRules) {
    try {
      const result = await executeRule(rule.id, {
        forceRun: true, // Worker jobs force execution regardless of schedule
      });

      totalProcessed++;

      if (result.status === "success" || result.status === "partial") {
        totalSuccessful++;
        totalAmount += result.totalAmount;

        // Collect invoice IDs from result details
        if (result.details?.invoices) {
          for (const inv of result.details.invoices) {
            if (inv.invoiceId) {
              allInvoiceIds.push(inv.invoiceId);
            }
          }
        }
      } else {
        totalFailed++;
      }

      ruleResults.push({
        ruleId: rule.id,
        ruleName: rule.name,
        status: result.status,
        invoicesCreated: result.invoicesCreated,
        totalAmount: result.totalAmount,
        errorMessage: result.errorMessage,
      });

      log("info", data.jobId, `Fee rule executed: ${rule.name}`, {
        ruleId: rule.id,
        status: result.status,
        invoicesCreated: result.invoicesCreated,
        totalAmount: result.totalAmount,
      });
    } catch (error) {
      totalProcessed++;
      totalFailed++;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      ruleResults.push({
        ruleId: rule.id,
        ruleName: rule.name,
        status: "failed",
        errorMessage,
      });

      log("error", data.jobId, `Fee rule execution failed: ${rule.name}`, {
        ruleId: rule.id,
        error: errorMessage,
      });
    }
  }

  const overallSuccess = totalFailed === 0;

  log("info", data.jobId, "Calculate-fees job completed", {
    totalProcessed,
    totalSuccessful,
    totalFailed,
    totalAmount,
    invoiceCount: allInvoiceIds.length,
  });

  return {
    success: overallSuccess,
    invoiceIds: allInvoiceIds,
    processedCount: totalProcessed,
    error: totalFailed > 0
      ? `${totalFailed} von ${totalProcessed} Gebuehrenberechnungen fehlgeschlagen`
      : undefined,
    details: {
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      totalAmount,
      rulesProcessed: totalProcessed,
      rulesSuccessful: totalSuccessful,
      rulesFailed: totalFailed,
      ruleResults,
    },
    processedAt: new Date(),
  };
}

/**
 * Erstellt Massenrechnungen (Bulk Invoicing) fuer alle Gesellschafter eines Parks.
 *
 * 1. Loads all shareholders for the given park via FundPark -> Fund -> Shareholder
 * 2. Applies shareholderFilter (status, minimumShare) to filter recipients
 * 3. For each shareholder: calculates amounts based on ownership/distribution percentage
 * 4. Creates Invoice records in database (with Prisma transactions)
 * 5. Reports progress via job.updateProgress() for UI feedback
 * 6. Returns all created invoice IDs
 */
async function processBulkInvoice(
  data: BulkInvoiceJobData,
  job?: Job
): Promise<BillingJobResult> {
  log("info", data.jobId, "Processing bulk-invoice job", {
    parkId: data.parkId,
    period: data.period,
    filter: data.shareholderFilter,
  });

  const { prisma } = await import("@/lib/prisma");
  const { InvoiceType, EntityStatus } = await import("@prisma/client");
  const { getNextInvoiceNumbers, calculateTaxAmounts } = await import(
    "@/lib/invoices/numberGenerator"
  );

  // 1. Load park data
  const park = await prisma.park.findUnique({
    where: { id: data.parkId },
    select: {
      id: true,
      name: true,
      tenantId: true,
    },
  });

  if (!park) {
    log("error", data.jobId, "Park not found", { parkId: data.parkId });
    return {
      success: false,
      error: `Park mit ID "${data.parkId}" nicht gefunden`,
      processedCount: 0,
      processedAt: new Date(),
    };
  }

  if (park.tenantId !== data.tenantId) {
    return {
      success: false,
      error: "Park gehoert nicht zum angegebenen Tenant",
      processedCount: 0,
      processedAt: new Date(),
    };
  }

  // 2. Load all shareholders associated with the park via FundPark relations
  const fundParks = await prisma.fundPark.findMany({
    where: {
      parkId: data.parkId,
    },
    include: {
      fund: {
        include: {
          shareholders: {
            where: {
              status: EntityStatus.ACTIVE,
              ...(data.shareholderFilter?.minimumShare
                ? {
                    distributionPercentage: {
                      gte: data.shareholderFilter.minimumShare,
                    },
                  }
                : {}),
            },
            include: {
              person: {
                select: {
                  firstName: true,
                  lastName: true,
                  companyName: true,
                  street: true,
                  postalCode: true,
                  city: true,
                  email: true,
                },
              },
            },
          },
        },
      },
    },
  });

  // Flatten all shareholders across all funds associated with this park
  const shareholders: Array<{
    shareholder: typeof fundParks[0]["fund"]["shareholders"][0];
    fundId: string;
    fundName: string;
    ownershipPercentage: number;
  }> = [];

  for (const fp of fundParks) {
    for (const sh of fp.fund.shareholders) {
      shareholders.push({
        shareholder: sh,
        fundId: fp.fund.id,
        fundName: fp.fund.name,
        ownershipPercentage: fp.ownershipPercentage
          ? Number(fp.ownershipPercentage)
          : 0,
      });
    }
  }

  if (shareholders.length === 0) {
    log("info", data.jobId, "No shareholders found matching criteria", {
      parkId: data.parkId,
      filter: data.shareholderFilter,
    });
    return {
      success: true,
      invoiceIds: [],
      processedCount: 0,
      details: {
        parkId: data.parkId,
        parkName: park.name,
        period: data.period,
        message: "Keine Gesellschafter gefunden die den Filterkriterien entsprechen",
      },
      processedAt: new Date(),
    };
  }

  // 3. Generate all invoice numbers at once (atomic, prevents N+1)
  const { numbers: invoiceNumbers } = await getNextInvoiceNumbers(
    data.tenantId,
    InvoiceType.CREDIT_NOTE,
    shareholders.length
  );

  // 4. Create invoices in a transaction for atomicity
  const allInvoiceIds: string[] = [];
  let successCount = 0;
  let failCount = 0;
  const errors: Array<{ entityId: string; message: string }> = [];

  for (let i = 0; i < shareholders.length; i++) {
    const { shareholder: sh, fundId, fundName } = shareholders[i];
    const invoiceNumber = invoiceNumbers[i];

    try {
      const distributionPct = Number(sh.distributionPercentage || 0);
      if (distributionPct <= 0) {
        errors.push({
          entityId: sh.id,
          message: "Kein Ausschuettungsanteil definiert",
        });
        failCount++;
        continue;
      }

      const recipientName =
        sh.person.companyName ||
        `${sh.person.firstName || ""} ${sh.person.lastName || ""}`.trim();
      const recipientAddress = [
        sh.person.street,
        `${sh.person.postalCode || ""} ${sh.person.city || ""}`.trim(),
      ]
        .filter(Boolean)
        .join("\n");

      // Description for the invoice position
      const description = `Abrechnung ${data.period} - ${park.name} - Anteil ${distributionPct.toFixed(3)}%`;

      // For bulk invoices (credit notes/Gutschriften), we use a nominal amount
      // based on the distribution percentage. The actual amount would normally
      // come from the settlement calculation, but for the bulk job we create
      // placeholder credit notes that can be finalized later.
      // Using EXEMPT tax type for distributions (Kapitalertraege)
      const netAmount = 0; // Will be filled when settlement is calculated
      const { taxRate, taxAmount, grossAmount } = calculateTaxAmounts(
        netAmount,
        "EXEMPT"
      );

      const invoice = await prisma.invoice.create({
        data: {
          invoiceType: InvoiceType.CREDIT_NOTE,
          invoiceNumber,
          invoiceDate: new Date(),
          recipientType: "shareholder",
          recipientName,
          recipientAddress,
          paymentReference: `${invoiceNumber}-${sh.shareholderNumber || sh.id.slice(0, 8)}`,
          netAmount,
          taxRate,
          taxAmount,
          grossAmount,
          status: "DRAFT",
          notes: `Massenabrechnung fuer Periode ${data.period}, Park: ${park.name}, Gesellschaft: ${fundName}`,
          tenantId: data.tenantId,
          fundId,
          shareholderId: sh.id,
          parkId: data.parkId,
          items: {
            create: [
              {
                position: 1,
                description,
                quantity: 1,
                unit: "pauschal",
                unitPrice: netAmount,
                netAmount,
                taxType: "EXEMPT",
                taxRate,
                taxAmount,
                grossAmount,
                referenceType: "BULK_INVOICE",
              },
            ],
          },
        },
      });

      allInvoiceIds.push(invoice.id);
      successCount++;

      log("info", data.jobId, `Bulk invoice created for shareholder`, {
        shareholderId: sh.id,
        invoiceId: invoice.id,
        invoiceNumber,
        recipientName,
        distributionPct,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      errors.push({
        entityId: sh.id,
        message: errorMessage,
      });
      failCount++;

      log("error", data.jobId, `Failed to create bulk invoice for shareholder`, {
        shareholderId: sh.id,
        error: errorMessage,
      });
    }

    // Report progress for UI feedback
    if (job) {
      const progress = Math.round(((i + 1) / shareholders.length) * 100);
      await job.updateProgress(progress);
    }
  }

  const overallSuccess = failCount === 0;

  log("info", data.jobId, "Bulk invoice job completed", {
    parkId: data.parkId,
    period: data.period,
    totalShareholders: shareholders.length,
    successCount,
    failCount,
    invoiceCount: allInvoiceIds.length,
  });

  return {
    success: overallSuccess,
    invoiceIds: allInvoiceIds,
    processedCount: successCount + failCount,
    error: failCount > 0
      ? `${failCount} von ${successCount + failCount} Rechnungen konnten nicht erstellt werden`
      : undefined,
    details: {
      parkId: data.parkId,
      parkName: park.name,
      period: data.period,
      totalShareholders: shareholders.length,
      successCount,
      failCount,
      errors: errors.length > 0 ? errors : undefined,
    },
    processedAt: new Date(),
  };
}

/**
 * Verarbeitet wiederkehrende Rechnungen.
 *
 * Delegiert die eigentliche Verarbeitung an den recurring-invoice-service.
 * Dieser Job wird typischerweise stuendlich per BullMQ Repeat ausgefuehrt.
 */
async function processRecurringInvoicesJob(data: ProcessRecurringInvoicesJobData): Promise<BillingJobResult> {
  log("info", data.jobId, "Processing recurring invoices job", {
    targetTenantId: data.targetTenantId || "all",
  });

  const { processRecurringInvoices } = await import("@/lib/invoices/recurring-invoice-service");

  const tenantId = data.targetTenantId && data.targetTenantId !== "__all__"
    ? data.targetTenantId
    : undefined;

  const result = await processRecurringInvoices(tenantId);

  log("info", data.jobId, "Recurring invoices job completed", {
    processed: result.processed,
    succeeded: result.succeeded,
    failed: result.failed,
  });

  return {
    success: result.failed === 0,
    invoiceIds: result.invoiceIds,
    processedCount: result.processed,
    error: result.failed > 0
      ? `${result.failed} von ${result.processed} wiederkehrenden Rechnungen fehlgeschlagen`
      : undefined,
    details: {
      succeeded: result.succeeded,
      failed: result.failed,
      errors: result.errors.length > 0 ? result.errors : undefined,
    },
    processedAt: new Date(),
  };
}

// =============================================================================
// Job Processor
// =============================================================================

/**
 * Verarbeitet einen Billing-Job
 */
async function processBillingJob(job: Job<BillingJobData, BillingJobResult>): Promise<BillingJobResult> {
  const { data } = job;
  const jobId = data.jobId || job.id || "unknown";

  log("info", jobId, `Processing billing job`, {
    type: data.type,
    tenantId: data.tenantId,
    attempt: job.attemptsMade + 1,
  });

  try {
    let result: BillingJobResult;

    switch (data.type) {
      case "generate-invoice":
        result = await processGenerateInvoice(data as GenerateInvoiceJobData);
        break;

      case "generate-settlement":
        result = await processGenerateSettlement(data as GenerateSettlementJobData);
        break;

      case "send-reminder":
        result = await processSendReminder(data as SendReminderJobData);
        break;

      case "calculate-fees":
        result = await processCalculateFees(data as CalculateFeesJobData);
        break;

      case "bulk-invoice":
        result = await processBulkInvoice(data as BulkInvoiceJobData, job);
        break;

      case "process-recurring-invoices":
        result = await processRecurringInvoicesJob(data as ProcessRecurringInvoicesJobData);
        break;

      default: {
        // TypeScript exhaustive check
        const exhaustiveCheck: never = data;
        throw new Error(`Unknown billing job type: ${(exhaustiveCheck as BillingJobData).type}`);
      }
    }

    log("info", jobId, `Billing job completed successfully`, {
      type: data.type,
      processedCount: result.processedCount,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    log("error", jobId, `Billing job failed`, {
      type: data.type,
      error: errorMessage,
      attempt: job.attemptsMade + 1,
      maxAttempts: job.opts.attempts || 3,
    });

    // Re-throw fuer BullMQ Retry-Logik
    throw error;
  }
}

// =============================================================================
// Worker Instance
// =============================================================================

let billingWorker: Worker<BillingJobData, BillingJobResult> | null = null;

/**
 * Startet den Billing-Worker
 */
export function startBillingWorker(): Worker<BillingJobData, BillingJobResult> {
  if (billingWorker) {
    logger.info("Billing worker already running");
    return billingWorker;
  }

  const connection = getRedisConnection();

  billingWorker = new Worker<BillingJobData, BillingJobResult>("billing", processBillingJob, {
    connection,
    concurrency: 5,
    // Kein Sandbox-Modus fuer Next.js Kompatibilitaet
    useWorkerThreads: false,
    // Billing kann komplexe Berechnungen haben
    lockDuration: 180000, // 3 Minuten
  });

  // Event-Handler
  billingWorker.on("completed", (job, result) => {
    log("info", job.data.jobId || job.id || "unknown", "Job completed", {
      type: job.data.type,
      processedCount: result.processedCount,
      success: result.success,
    });
  });

  billingWorker.on("failed", (job, error) => {
    const jobId = job?.data?.jobId || job?.id || "unknown";
    log("error", jobId, "Job failed permanently", {
      type: job?.data?.type,
      error: error.message,
      attempts: job?.attemptsMade,
    });
  });

  billingWorker.on("error", (error) => {
    logger.error({ err: error }, "Billing worker error");
  });

  billingWorker.on("stalled", (jobId) => {
    log("warn", jobId, "Job stalled - will be retried");
  });

  logger.info({ concurrency: 5 }, "Billing worker started");

  return billingWorker;
}

/**
 * Stoppt den Billing-Worker gracefully
 */
export async function stopBillingWorker(): Promise<void> {
  if (!billingWorker) {
    logger.info("No billing worker running");
    return;
  }

  logger.info("Stopping billing worker...");

  try {
    await billingWorker.close();
    billingWorker = null;
    logger.info("Billing worker stopped gracefully");
  } catch (error) {
    logger.error({ err: error }, "Error stopping billing worker");
    throw error;
  }
}

/**
 * Prueft ob der Worker laeuft
 */
export function isBillingWorkerRunning(): boolean {
  return billingWorker !== null && billingWorker.isRunning();
}

/**
 * Gibt den Worker zurueck (fuer Health-Checks)
 */
export function getBillingWorker(): Worker<BillingJobData, BillingJobResult> | null {
  return billingWorker;
}
