import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import {
  generateDatevExportBuffer,
  generateDatevJournalExportBuffer,
  generateDatevFilename,
  type DatevExportOptions,
  type DatevInvoiceData,
  type DatevJournalEntryData,
  type DatevAccountMapping,
} from "@/lib/export";
import { withMonitoring } from "@/lib/monitoring";
import { Prisma } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";
import { getTenantSettings } from "@/lib/tenant-settings";

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: z.enum(["invoices", "journal", "both"]).default("journal"),
  status: z.enum(["DRAFT", "SENT", "PAID", "CANCELLED"]).optional(),
  fundId: z.string().uuid().optional(),
  consultantNumber: z.string().max(20).optional(),
  clientNumber: z.string().max(20).optional(),
});

async function getHandler(request: NextRequest) {
  const check = await requirePermission("accounting:read");
  if (!check.authorized) return check.error;

  const { searchParams } = new URL(request.url);
  const parseResult = querySchema.safeParse({
    from: searchParams.get("from") || undefined,
    to: searchParams.get("to") || undefined,
    mode: searchParams.get("mode") || "journal",
    status: searchParams.get("status") || undefined,
    fundId: searchParams.get("fundId") || undefined,
    consultantNumber: searchParams.get("consultantNumber") || undefined,
    clientNumber: searchParams.get("clientNumber") || undefined,
  });

  if (!parseResult.success) {
    return NextResponse.json({ error: "Ungueltige Parameter", details: parseResult.error.errors }, { status: 400 });
  }

  const params = parseResult.data;
  const fromDate = new Date(params.from);
  const toDate = new Date(params.to);
  toDate.setHours(23, 59, 59, 999);

  if (fromDate > toDate) {
    return NextResponse.json({ error: "Startdatum muss vor Enddatum liegen" }, { status: 400 });
  }

  const tenantId = check.tenantId!;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });

  const tenantSettings = await getTenantSettings(tenantId);

  const accountMapping: DatevAccountMapping = {
    revenueAccount: tenantSettings.datevRevenueAccount,
    einspeisung: tenantSettings.datevAccountEinspeisung,
    direktvermarktung: tenantSettings.datevAccountDirektvermarktung,
    pachtEinnahmen: tenantSettings.datevAccountPachtEinnahmen,
    pachtAufwand: tenantSettings.datevAccountPachtAufwand,
    wartung: tenantSettings.datevAccountWartung,
    bf: tenantSettings.datevAccountBF,
  };

  const fiscalYearStart = new Date(fromDate.getFullYear(), 0, 1);
  const fiscalYearEnd = new Date(fromDate.getFullYear(), 11, 31);

  const datevOptions: DatevExportOptions = {
    consultantNumber: params.consultantNumber,
    clientNumber: params.clientNumber,
    fiscalYearStart,
    fiscalYearEnd,
    companyName: tenant?.name || "WPM Export",
    defaultRevenueAccount: tenantSettings.datevRevenueAccount,
    defaultDebtorStart: tenantSettings.datevDebtorStart,
    defaultCreditorStart: tenantSettings.datevCreditorStart,
    accountMapping,
  };

  let buffer: Buffer;
  let filename: string;
  let exportCount = 0;

  if (params.mode === "journal" || params.mode === "both") {
    // Export JournalEntries
    const journalEntries = await prisma.journalEntry.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: "POSTED",
        entryDate: { gte: fromDate, lte: toDate },
      },
      include: {
        lines: { orderBy: { lineNumber: "asc" } },
      },
      orderBy: { entryDate: "asc" },
      take: 10000,
    });

    const journalData: DatevJournalEntryData[] = journalEntries.map((je) => ({
      id: je.id,
      entryDate: je.entryDate,
      description: je.description,
      reference: je.reference,
      source: je.source,
      lines: je.lines.map((l) => ({
        account: l.account,
        accountName: l.accountName,
        description: l.description,
        debitAmount: l.debitAmount ? Number(l.debitAmount) : null,
        creditAmount: l.creditAmount ? Number(l.creditAmount) : null,
        taxKey: l.taxKey,
        costCenter: l.costCenter,
      })),
    }));

    if (params.mode === "both") {
      // Also get invoices that DON'T have a JournalEntry yet
      const invoicesWithoutJournal = await getUnpostedInvoices(tenantId, fromDate, toDate, params.status, params.fundId);
      const invoiceData = mapInvoicesToDatev(invoicesWithoutJournal);

      // Combine: journal entries + invoice-only bookings
      const invoiceBuffer = generateDatevExportBuffer(invoiceData, datevOptions);
      const journalBuffer = generateDatevJournalExportBuffer(journalData, datevOptions);

      // For "both" mode, prefer journal entries (they're authoritative)
      buffer = journalData.length > 0 ? journalBuffer : invoiceBuffer;
      exportCount = journalData.length + invoiceData.length;
      filename = generateDatevFilename(fromDate, toDate, "Komplett");
    } else {
      buffer = generateDatevJournalExportBuffer(journalData, datevOptions);
      exportCount = journalData.length;
      filename = generateDatevFilename(fromDate, toDate, "Journal");
    }
  } else {
    // Invoice-only mode (legacy)
    const invoices = await getInvoices(tenantId, fromDate, toDate, params.status, params.fundId);
    const invoiceData = mapInvoicesToDatev(invoices);
    buffer = generateDatevExportBuffer(invoiceData, datevOptions);
    exportCount = invoices.length;
    filename = generateDatevFilename(fromDate, toDate, "Rechnungen");
  }

  if (exportCount === 0) {
    return NextResponse.json({ error: "Keine Buchungen im angegebenen Zeitraum gefunden" }, { status: 404 });
  }

  logger.info({ userId: check.userId, tenantId, exportCount, mode: params.mode, from: params.from, to: params.to }, "DATEV export (buchhaltung) generated");

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": buffer.length.toString(),
      "X-Export-Count": exportCount.toString(),
    },
  });
}

// GET /api/buchhaltung/datev/preview — returns JSON summary (no download)
async function previewHandler(request: NextRequest) {
  const check = await requirePermission("accounting:read");
  if (!check.authorized) return check.error;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "from und to sind erforderlich" }, { status: 400 });
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);
  const tenantId = check.tenantId!;

  const [journalCount, invoiceCount, incomingCount] = await Promise.all([
    prisma.journalEntry.count({
      where: { tenantId, deletedAt: null, status: "POSTED", entryDate: { gte: fromDate, lte: toDate } },
    }),
    prisma.invoice.count({
      where: { tenantId, deletedAt: null, status: { in: ["SENT", "PAID"] }, invoiceDate: { gte: fromDate, lte: toDate } },
    }),
    prisma.incomingInvoice.count({
      where: { tenantId, deletedAt: null, status: { in: ["APPROVED", "PAID"] }, invoiceDate: { gte: fromDate, lte: toDate } },
    }),
  ]);

  return NextResponse.json({
    data: {
      journalEntries: journalCount,
      outgoingInvoices: invoiceCount,
      incomingInvoices: incomingCount,
      periodStart: from,
      periodEnd: to,
    },
  });
}

// Helper: fetch invoices
async function getInvoices(tenantId: string, from: Date, to: Date, status?: string, fundId?: string) {
  const where: Prisma.InvoiceWhereInput = {
    tenantId,
    deletedAt: null,
    invoiceDate: { gte: from, lte: to },
    status: status ? (status as Prisma.EnumInvoiceStatusFilter<"Invoice">) : { in: ["SENT", "PAID"] },
  };
  if (fundId) where.fundId = fundId;

  return prisma.invoice.findMany({
    where,
    include: {
      fund: { select: { id: true, name: true } },
      park: { select: { id: true, name: true } },
      shareholder: {
        select: {
          id: true,
          shareholderNumber: true,
          person: { select: { firstName: true, lastName: true, companyName: true } },
        },
      },
      items: {
        select: {
          description: true, netAmount: true, taxType: true, taxRate: true,
          taxAmount: true, grossAmount: true, datevKonto: true, datevGegenkonto: true,
          datevKostenstelle: true, referenceType: true,
        },
        orderBy: { position: "asc" },
      },
    },
    orderBy: { invoiceDate: "asc" },
    take: 10000,
  });
}

// Helper: invoices without journal entries
async function getUnpostedInvoices(tenantId: string, from: Date, to: Date, status?: string, fundId?: string) {
  // Find invoices that have no corresponding JournalEntry
  const postedInvoiceIds = await prisma.journalEntry.findMany({
    where: { tenantId, referenceType: "INVOICE", deletedAt: null },
    select: { referenceId: true },
  });
  const postedIds = new Set(postedInvoiceIds.map((j) => j.referenceId).filter(Boolean));

  const invoices = await getInvoices(tenantId, from, to, status, fundId);
  return invoices.filter((inv) => !postedIds.has(inv.id));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapInvoicesToDatev(invoices: any[]): DatevInvoiceData[] {
  return invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    invoiceType: inv.invoiceType,
    invoiceDate: inv.invoiceDate,
    recipientName: inv.recipientName,
    netAmount: Number(inv.netAmount),
    taxRate: Number(inv.taxRate),
    taxAmount: Number(inv.taxAmount ?? 0),
    grossAmount: Number(inv.grossAmount),
    currency: inv.currency,
    status: inv.status,
    fund: inv.fund,
    park: inv.park,
    shareholder: inv.shareholder ? {
      id: inv.shareholder.id,
      shareholderNumber: inv.shareholder.shareholderNumber,
      person: inv.shareholder.person,
    } : null,
    datevBuchungsschluessel: inv.datevBuchungsschluessel,
    items: inv.items.map((item: Record<string, unknown>) => ({
      description: item.description as string,
      netAmount: Number(item.netAmount),
      taxType: item.taxType as "STANDARD" | "REDUCED" | "EXEMPT",
      taxRate: Number(item.taxRate),
      taxAmount: Number(item.taxAmount),
      grossAmount: Number(item.grossAmount),
      datevKonto: item.datevKonto as string | null,
      datevGegenkonto: item.datevGegenkonto as string | null,
      datevKostenstelle: item.datevKostenstelle as string | null,
      referenceType: item.referenceType as string | null,
    })),
  }));
}

export const GET = withMonitoring(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("preview") === "true") {
    return previewHandler(request);
  }
  return getHandler(request);
});
