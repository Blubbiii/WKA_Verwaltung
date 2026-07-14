import { NextRequest, NextResponse } from "next/server";
import { Decimal } from "@prisma/client-runtime-utils";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getNextInvoiceNumberInTx, calculateTaxAmounts } from "@/lib/invoices/numberGenerator";
import { getAllTaxRates } from "@/lib/tax/tax-rates";
import { calculateSkontoDiscount, calculateSkontoDeadline } from "@/lib/invoices/skonto";
import { parsePaginationParams, handleApiError } from "@/lib/api-utils";
import { z } from "zod";
import { TaxType } from "@prisma/client";
import { withMonitoring } from "@/lib/monitoring";
import { apiLogger as logger } from "@/lib/logger";
import { invalidate } from "@/lib/cache/invalidation";
import { dispatchWebhook } from "@/lib/webhooks";
import { apiError } from "@/lib/api-errors";
import { assertPeriodOpen, PeriodLockedError } from "@/lib/accounting/period-lock";

// Schema für Invoice-Items
const invoiceItemSchema = z.object({
  description: z.string().min(1, "Beschreibung erforderlich"),
  quantity: z.number().positive().default(1),
  unit: z.string().optional(),
  unitPrice: z.number(),
  taxType: z.enum(["STANDARD", "REDUCED", "EXEMPT"]).default("STANDARD"),
  plotAreaType: z.enum(["WEA_STANDORT", "POOL", "WEG", "AUSGLEICH", "KABEL"]).optional(),
  plotId: z.uuid().optional(),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
});

const invoiceCreateSchema = z.object({
  invoiceType: z.enum(["INVOICE", "CREDIT_NOTE"]),
  // F8-Compliance: invoiceDate darf nicht in der Zukunft liegen (keine Vor-Datierung
  // von Umsätzen; wichtig für GoBD/Zeitgerechtheit §239 HGB).
  invoiceDate: z
    .string()
    .refine((v) => {
      const d = new Date(v);
      return !Number.isNaN(d.getTime()) && d.getTime() <= Date.now();
    }, {
      message: "Rechnungsdatum darf nicht in der Zukunft liegen",
    }),
  dueDate: z.string().optional().nullable(),
  recipientType: z.string().optional().nullable(),
  recipientName: z.string().optional().nullable(),
  recipientAddress: z.string().optional().nullable(),
  serviceStartDate: z.string().optional().nullable(),
  serviceEndDate: z.string().optional().nullable(),
  paymentReference: z.string().optional().nullable(),
  internalReference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  fundId: z.uuid().optional().nullable(),
  shareholderId: z.uuid().optional().nullable(),
  leaseId: z.uuid().optional().nullable(),
  parkId: z.uuid().optional().nullable(),
  // Skonto (early payment discount) - both optional
  skontoPercent: z.number().min(0.01).max(99.99).optional().nullable(),
  skontoDays: z.number().int().min(1).max(365).optional().nullable(),
  // §25b UStG Dreiecksgeschäft (innergemeinschaftliche Lieferkette).
  isTriangulationDeal: z.boolean().optional().default(false),
  // EU-Empfänger-Felder (für ZM-Meldung). Sind optional auf Schema-Ebene,
  // werden aber vom EU-Detection-Code in ZM nur genutzt wenn beide gesetzt.
  recipientCountry: z.string().length(2).optional().nullable(),
  recipientVatId: z.string().min(4).max(50).optional().nullable(),
  items: z.array(invoiceItemSchema).min(1, "Mindestens eine Position erforderlich"),
});

// GET /api/invoices
async function getHandler(request: NextRequest) {
  try {
    const check = await requirePermission("invoices:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const invoiceType = searchParams.get("invoiceType");
    const status = searchParams.get("status");
    const fundId = searchParams.get("fundId");
    const parkId = searchParams.get("parkId");
    const leaseId = searchParams.get("leaseId");
    const { page, limit, skip } = parsePaginationParams(searchParams, {
      defaultLimit: 50,
      maxLimit: 100,
    });

    const where = {
      tenantId: check.tenantId!,
      deletedAt: null, // Soft-deleted Rechnungen ausschließen
      ...(invoiceType && { invoiceType: invoiceType as "INVOICE" | "CREDIT_NOTE" }),
      ...(status && { status: status as "DRAFT" | "SENT" | "PAID" | "CANCELLED" }),
      ...(fundId && { fundId }),
      ...(parkId && { parkId }),
      ...(leaseId && { leaseId }),
    };

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          fund: {
            select: { id: true, name: true },
          },
          shareholder: {
            select: {
              id: true,
              person: {
                select: { firstName: true, lastName: true, companyName: true },
              },
            },
          },
          park: {
            select: { id: true, name: true },
          },
          lease: {
            select: {
              id: true,
              lessor: {
                select: { firstName: true, lastName: true, companyName: true },
              },
            },
          },
          createdBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          // P23: `_count: { items: true }` entfernt — die Zahl wird in der
          // Rechnungsliste (page.tsx) nicht angezeigt und kostete pro Row
          // eine zusaetzliche COUNT-Query.
        },
        orderBy: { invoiceDate: "desc" },
        skip,
        take: limit,
      }),
      prisma.invoice.count({ where }),
    ]);

    return NextResponse.json({
      data: invoices,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching invoices");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Rechnungen" });
  }
}

export const GET = withMonitoring(getHandler);

// POST /api/invoices - Neue Rechnung mit Items erstellen
async function postHandler(request: NextRequest) {
  try {
    const check = await requirePermission("invoices:create");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const validatedData = invoiceCreateSchema.parse(body);

    // Steuersätze aus DB laden (TaxRateConfig), fallback auf hardcoded Defaults.
    // Wichtig für §-Wechsel wie Corona-USt-Senkung — hardcoded 19% wäre falsch.
    const invoiceDate = new Date(validatedData.invoiceDate);

    // F8-Compliance (GoBD §146 AO): Rechnung darf nicht in einen bereits
    // geschlossenen Buchungsmonat gebucht werden. Ausserhalb der Transaktion
    // OK — der Period-Lock ändert sich innerhalb der TX nicht sinnvoll rueckwaerts.
    await assertPeriodOpen(check.tenantId!, invoiceDate);

    const taxRatesForDate = await getAllTaxRates(check.tenantId!, invoiceDate);

    // Berechne Summen aus Items (Decimal-Arithmetik, kein Float-Drift).
    let totalNetDec = new Decimal(0);
    let totalTaxDec = new Decimal(0);
    let totalGrossDec = new Decimal(0);

    const itemsData = validatedData.items.map((item, index) => {
      const taxType = item.taxType as "STANDARD" | "REDUCED" | "EXEMPT";
      const rateForType = taxRatesForDate[taxType as TaxType];
      const netDec = new Decimal(item.quantity).mul(item.unitPrice);
      const { taxRate, taxAmount, grossAmount } = calculateTaxAmounts(
        netDec.toNumber(),
        taxType,
        rateForType,
      );

      totalNetDec = totalNetDec.plus(netDec);
      totalTaxDec = totalTaxDec.plus(taxAmount);
      totalGrossDec = totalGrossDec.plus(grossAmount);

      return {
        position: index + 1,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        netAmount: netDec.toDecimalPlaces(2).toNumber(),
        taxType: item.taxType as TaxType,
        taxRate,
        taxAmount,
        grossAmount,
        plotAreaType: item.plotAreaType as "WEA_STANDORT" | "POOL" | "WEG" | "AUSGLEICH" | "KABEL" | undefined,
        plotId: item.plotId,
        referenceType: item.referenceType,
        referenceId: item.referenceId,
      };
    });

    const totalNet = totalNetDec.toDecimalPlaces(2).toNumber();
    const totalTax = totalTaxDec.toDecimalPlaces(2).toNumber();
    const totalGross = totalGrossDec.toDecimalPlaces(2).toNumber();

    // Calculate Skonto fields if both percent and days are provided
    let skontoData: {
      skontoPercent?: number;
      skontoDays?: number;
      skontoDeadline?: Date;
      skontoAmount?: number;
    } = {};

    if (validatedData.skontoPercent && validatedData.skontoDays) {
      const skontoDiscount = calculateSkontoDiscount(totalGross, validatedData.skontoPercent);
      const skontoDeadline = calculateSkontoDeadline(invoiceDate, validatedData.skontoDays);
      skontoData = {
        skontoPercent: validatedData.skontoPercent,
        skontoDays: validatedData.skontoDays,
        skontoDeadline,
        skontoAmount: skontoDiscount,
      };
    }

    // GoBD-konform: Nummerngenerierung UND Invoice-Insert in EINER
    // Transaktion. Wenn der Insert failt, wird auch der Sequence-Increment
    // zurückgerollt → keine Lücken in der lückenlosen Nummerierung.
    const invoice = await prisma.$transaction(async (tx) => {
      const { number: invoiceNumber } = await getNextInvoiceNumberInTx(
        tx,
        check.tenantId!,
        validatedData.invoiceType,
      );

      return tx.invoice.create({
        data: {
          invoiceType: validatedData.invoiceType,
          invoiceNumber,
          invoiceDate,
          dueDate: validatedData.dueDate ? new Date(validatedData.dueDate) : null,
          recipientType: validatedData.recipientType,
          recipientName: validatedData.recipientName,
          recipientAddress: validatedData.recipientAddress,
          serviceStartDate: validatedData.serviceStartDate
            ? new Date(validatedData.serviceStartDate)
            : null,
          serviceEndDate: validatedData.serviceEndDate
            ? new Date(validatedData.serviceEndDate)
            : null,
          paymentReference: validatedData.paymentReference || invoiceNumber,
          netAmount: totalNet,
          taxRate: 0, // Wird pro Position berechnet
          taxAmount: totalTax,
          grossAmount: totalGross,
          notes: validatedData.notes,
          status: "DRAFT",
          tenantId: check.tenantId!,
          createdById: check.userId,
          fundId: validatedData.fundId,
          shareholderId: validatedData.shareholderId,
          leaseId: validatedData.leaseId,
          parkId: validatedData.parkId,
          recipientCountry: validatedData.recipientCountry ?? null,
          recipientVatId: validatedData.recipientVatId ?? null,
          isTriangulationDeal: validatedData.isTriangulationDeal ?? false,
          ...skontoData,
          items: {
            create: itemsData,
          },
        },
        include: {
          items: true,
          fund: { select: { id: true, name: true } },
          shareholder: {
            select: {
              id: true,
              person: { select: { firstName: true, lastName: true } },
            },
          },
          park: { select: { id: true, name: true } },
        },
      });
    });

    // Invalidate dashboard caches after invoice creation
    invalidate.onInvoiceChange(check.tenantId!, invoice.id, 'create').catch((err) => {
      logger.warn({ err }, '[Invoices] Cache invalidation error after create');
    });

    // Fire-and-forget webhook dispatch
    dispatchWebhook(check.tenantId!, "invoice.created", {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      type: invoice.invoiceType,
      grossAmount: invoice.grossAmount?.toString(),
    }).catch((err) => { logger.warn({ err }, "[Webhook] Dispatch failed"); });

    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    if (error instanceof PeriodLockedError) {
      // F8-Compliance: 409 statt 500 wenn Rechnungsdatum in gesperrter Periode
      return apiError("PERIOD_LOCKED", 409, {
        message: error.message,
        details: { periodYear: error.periodYear, periodMonth: error.periodMonth },
      });
    }
    return handleApiError(error, "Fehler beim Erstellen der Rechnung");
  }
}

export const POST = withMonitoring(postHandler);
