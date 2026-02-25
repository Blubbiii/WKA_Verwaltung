import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getNextInvoiceNumber, calculateTaxAmounts, getTaxRateByType } from "@/lib/invoices/numberGenerator";
import { calculateSkontoDiscount, calculateSkontoDeadline } from "@/lib/invoices/skonto";
import { parsePaginationParams } from "@/lib/api-utils";
import { z } from "zod";
import { TaxType } from "@prisma/client";
import { withMonitoring } from "@/lib/monitoring";
import { apiLogger as logger } from "@/lib/logger";
import { invalidate } from "@/lib/cache/invalidation";
import { dispatchWebhook } from "@/lib/webhooks";

// Schema für Invoice-Items
const invoiceItemSchema = z.object({
  description: z.string().min(1, "Beschreibung erforderlich"),
  quantity: z.number().positive().default(1),
  unit: z.string().optional(),
  unitPrice: z.number(),
  taxType: z.enum(["STANDARD", "REDUCED", "EXEMPT"]).default("STANDARD"),
  plotAreaType: z.enum(["WEA_STANDORT", "POOL", "WEG", "AUSGLEICH", "KABEL"]).optional(),
  plotId: z.string().uuid().optional(),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
});

const invoiceCreateSchema = z.object({
  invoiceType: z.enum(["INVOICE", "CREDIT_NOTE"]),
  invoiceDate: z.string(),
  dueDate: z.string().optional().nullable(),
  recipientType: z.string().optional().nullable(),
  recipientName: z.string().optional().nullable(),
  recipientAddress: z.string().optional().nullable(),
  serviceStartDate: z.string().optional().nullable(),
  serviceEndDate: z.string().optional().nullable(),
  paymentReference: z.string().optional().nullable(),
  internalReference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  fundId: z.string().uuid().optional().nullable(),
  shareholderId: z.string().uuid().optional().nullable(),
  leaseId: z.string().uuid().optional().nullable(),
  parkId: z.string().uuid().optional().nullable(),
  // Skonto (early payment discount) - both optional
  skontoPercent: z.number().min(0.01).max(99.99).optional().nullable(),
  skontoDays: z.number().int().min(1).max(365).optional().nullable(),
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
          _count: {
            select: { items: true },
          },
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
    return NextResponse.json(
      { error: "Fehler beim Laden der Rechnungen" },
      { status: 500 }
    );
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

    // Berechne Summen aus Items
    let totalNet = 0;
    let totalTax = 0;
    let totalGross = 0;

    const itemsData = validatedData.items.map((item, index) => {
      const netAmount = item.quantity * item.unitPrice;
      const { taxRate, taxAmount, grossAmount } = calculateTaxAmounts(
        netAmount,
        item.taxType as "STANDARD" | "REDUCED" | "EXEMPT"
      );

      totalNet += netAmount;
      totalTax += taxAmount;
      totalGross += grossAmount;

      return {
        position: index + 1,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        netAmount,
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

    // Generiere Rechnungsnummer atomar
    const { number: invoiceNumber } = await getNextInvoiceNumber(
      check.tenantId!,
      validatedData.invoiceType
    );

    // Calculate Skonto fields if both percent and days are provided
    const invoiceDate = new Date(validatedData.invoiceDate);
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

    // Erstelle Rechnung mit Items in einer Transaktion
    const invoice = await prisma.invoice.create({
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
    }).catch(() => {});

    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error creating invoice");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Rechnung" },
      { status: 500 }
    );
  }
}

export const POST = withMonitoring(postHandler);
