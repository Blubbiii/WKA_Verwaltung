import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getNextQuoteNumber } from "@/lib/quotes/numberGenerator";
import { calculateTaxAmounts } from "@/lib/invoices/numberGenerator";
import { parsePaginationParams } from "@/lib/api-utils";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const quoteItemSchema = z.object({
  description: z.string().min(1, "Beschreibung erforderlich"),
  quantity: z.number().positive().default(1),
  unit: z.string().optional(),
  unitPrice: z.number(),
  taxType: z.enum(["STANDARD", "REDUCED", "EXEMPT"]).default("STANDARD"),
});

const quoteCreateSchema = z.object({
  quoteDate: z.string(),
  validUntil: z.string(),
  recipientType: z.string().optional().nullable(),
  recipientName: z.string().optional().nullable(),
  recipientAddress: z.string().optional().nullable(),
  serviceStartDate: z.string().optional().nullable(),
  serviceEndDate: z.string().optional().nullable(),
  internalReference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  fundId: z.uuid().optional().nullable(),
  parkId: z.uuid().optional().nullable(),
  letterheadId: z.uuid().optional().nullable(),
  items: z.array(quoteItemSchema).min(1, "Mindestens eine Position erforderlich"),
});

// GET /api/buchhaltung/angebote
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const fundId = searchParams.get("fundId");
    const { page, limit, skip } = parsePaginationParams(searchParams, {
      defaultLimit: 50,
      maxLimit: 100,
    });

    const where = {
      tenantId: check.tenantId!,
      deletedAt: null,
      ...(status && { status: status as "DRAFT" | "SENT" | "ACCEPTED" | "INVOICED" | "EXPIRED" | "CANCELLED" }),
      ...(fundId && { fundId }),
    };

    const [quotes, total] = await Promise.all([
      prisma.quote.findMany({
        where,
        include: {
          fund: { select: { id: true, name: true } },
          park: { select: { id: true, name: true } },
          items: { orderBy: { position: "asc" } },
          convertedInvoice: { select: { id: true, invoiceNumber: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.quote.count({ where }),
    ]);

    return NextResponse.json({
      data: quotes,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error({ err: error }, "Error listing quotes");
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// POST /api/buchhaltung/angebote
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("invoices:create");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = quoteCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Daten", details: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;
    const { number: quoteNumber } = await getNextQuoteNumber(check.tenantId!);

    // Calculate item amounts
    const items = data.items.map((item, i) => {
      const net = Math.round(item.quantity * item.unitPrice * 100) / 100;
      const tax = calculateTaxAmounts(net, item.taxType);
      return {
        position: i + 1,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit || null,
        unitPrice: item.unitPrice,
        netAmount: net,
        taxType: item.taxType,
        taxRate: tax.taxRate,
        taxAmount: tax.taxAmount,
        grossAmount: tax.grossAmount,
      };
    });

    const netAmount = items.reduce((sum, it) => sum + it.netAmount, 0);
    const taxAmount = items.reduce((sum, it) => sum + it.taxAmount, 0);
    const grossAmount = items.reduce((sum, it) => sum + it.grossAmount, 0);

    const quote = await prisma.quote.create({
      data: {
        tenantId: check.tenantId!,
        quoteNumber,
        quoteDate: new Date(data.quoteDate),
        validUntil: new Date(data.validUntil),
        recipientType: data.recipientType || null,
        recipientName: data.recipientName || null,
        recipientAddress: data.recipientAddress || null,
        serviceStartDate: data.serviceStartDate ? new Date(data.serviceStartDate) : null,
        serviceEndDate: data.serviceEndDate ? new Date(data.serviceEndDate) : null,
        internalReference: data.internalReference || null,
        notes: data.notes || null,
        fundId: data.fundId || null,
        parkId: data.parkId || null,
        letterheadId: data.letterheadId || null,
        createdById: check.userId || null,
        netAmount,
        taxAmount,
        grossAmount,
        items: { create: items },
      },
      include: { items: true },
    });

    return NextResponse.json({ data: quote }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Error creating quote");
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
