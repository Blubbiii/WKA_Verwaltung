/**
 * API Route: /api/admin/recurring-invoices
 * GET: List all recurring invoices for the tenant
 * POST: Create a new recurring invoice
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/withPermission";
import { z } from "zod";
import {
  calculateInitialNextRun,
  calculateNextRunDate,
} from "@/lib/invoices/recurring-invoice-service";
import { withMonitoring } from "@/lib/monitoring";
import { apiLogger as logger } from "@/lib/logger";

// ============================================================================
// Validation Schemas
// ============================================================================

const positionSchema = z.object({
  description: z.string().min(1, "Beschreibung erforderlich"),
  quantity: z.number().positive("Menge muss positiv sein").default(1),
  unitPrice: z.number().min(0, "Preis darf nicht negativ sein"),
  taxType: z.enum(["STANDARD", "REDUCED", "EXEMPT"]).default("STANDARD"),
  unit: z.string().optional(),
});

const createRecurringInvoiceSchema = z.object({
  name: z.string().min(1, "Name erforderlich").max(200),
  recipientType: z.enum(["shareholder", "lessor", "fund", "custom"]),
  recipientId: z.string().optional().nullable(),
  recipientName: z.string().min(1, "Empfängername erforderlich"),
  recipientAddress: z.string().optional().nullable(),
  invoiceType: z.enum(["INVOICE", "CREDIT_NOTE"]).default("INVOICE"),
  positions: z
    .array(positionSchema)
    .min(1, "Mindestens eine Position erforderlich"),
  frequency: z.enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"]),
  dayOfMonth: z.number().int().min(1).max(28).optional().nullable(),
  startDate: z.string().min(1, "Startdatum erforderlich"),
  endDate: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  enabled: z.boolean().default(true),
  fundId: z.string().uuid().optional().nullable(),
  parkId: z.string().uuid().optional().nullable(),
});

// ============================================================================
// GET /api/admin/recurring-invoices
// ============================================================================

async function getHandler(request: NextRequest) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const enabled = searchParams.get("enabled");
    const frequency = searchParams.get("frequency");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

    const where = {
      tenantId: check.tenantId!,
      ...(enabled !== null && enabled !== undefined && enabled !== ""
        ? { enabled: enabled === "true" }
        : {}),
      ...(frequency ? { frequency } : {}),
    };

    const [recurringInvoices, total] = await Promise.all([
      prisma.recurringInvoice.findMany({
        where,
        include: {
          createdBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: [{ enabled: "desc" }, { nextRunAt: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.recurringInvoice.count({ where }),
    ]);

    // Calculate total amount per invoice for display
    const transformedData = recurringInvoices.map((ri) => {
      const positions = ri.positions as Array<{
        quantity: number;
        unitPrice: number;
      }>;
      const totalNet = Array.isArray(positions)
        ? positions.reduce(
            (sum, pos) => sum + (pos.quantity || 1) * (pos.unitPrice || 0),
            0
          )
        : 0;

      return {
        id: ri.id,
        name: ri.name,
        recipientType: ri.recipientType,
        recipientId: ri.recipientId,
        recipientName: ri.recipientName,
        recipientAddress: ri.recipientAddress,
        invoiceType: ri.invoiceType,
        positions: ri.positions,
        frequency: ri.frequency,
        dayOfMonth: ri.dayOfMonth,
        startDate: ri.startDate.toISOString(),
        endDate: ri.endDate?.toISOString() || null,
        nextRunAt: ri.nextRunAt.toISOString(),
        lastRunAt: ri.lastRunAt?.toISOString() || null,
        enabled: ri.enabled,
        notes: ri.notes,
        totalNet,
        totalGenerated: ri.totalGenerated,
        lastInvoiceId: ri.lastInvoiceId,
        fundId: ri.fundId,
        parkId: ri.parkId,
        createdBy: ri.createdBy,
        createdAt: ri.createdAt.toISOString(),
        updatedAt: ri.updatedAt.toISOString(),
      };
    });

    return NextResponse.json({
      data: transformedData,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching recurring invoices");
    return NextResponse.json(
      { error: "Fehler beim Laden der wiederkehrenden Rechnungen" },
      { status: 500 }
    );
  }
}

export const GET = withMonitoring(getHandler);

// ============================================================================
// POST /api/admin/recurring-invoices
// ============================================================================

async function postHandler(request: NextRequest) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const body = await request.json();
    const validatedData = createRecurringInvoiceSchema.parse(body);

    const startDate = new Date(validatedData.startDate);
    const endDate = validatedData.endDate
      ? new Date(validatedData.endDate)
      : null;

    // Validate dates
    if (endDate && endDate <= startDate) {
      return NextResponse.json(
        { error: "Enddatum muss nach dem Startdatum liegen" },
        { status: 400 }
      );
    }

    // Calculate initial nextRunAt
    const nextRunAt = calculateInitialNextRun(
      validatedData.frequency,
      startDate,
      validatedData.dayOfMonth
    );

    // Create the recurring invoice
    const recurringInvoice = await prisma.recurringInvoice.create({
      data: {
        name: validatedData.name,
        recipientType: validatedData.recipientType,
        recipientId: validatedData.recipientId || null,
        recipientName: validatedData.recipientName,
        recipientAddress: validatedData.recipientAddress || null,
        invoiceType: validatedData.invoiceType,
        positions: validatedData.positions,
        frequency: validatedData.frequency,
        dayOfMonth: validatedData.dayOfMonth || null,
        startDate,
        endDate,
        nextRunAt,
        enabled: validatedData.enabled,
        notes: validatedData.notes || null,
        fundId: validatedData.fundId || null,
        parkId: validatedData.parkId || null,
        tenantId: check.tenantId!,
        createdById: check.userId!,
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    logger.info(
      {
        id: recurringInvoice.id,
        name: recurringInvoice.name,
        frequency: recurringInvoice.frequency,
        nextRunAt: nextRunAt.toISOString(),
      },
      "Recurring invoice created"
    );

    return NextResponse.json(
      {
        id: recurringInvoice.id,
        name: recurringInvoice.name,
        recipientType: recurringInvoice.recipientType,
        recipientName: recurringInvoice.recipientName,
        frequency: recurringInvoice.frequency,
        nextRunAt: nextRunAt.toISOString(),
        enabled: recurringInvoice.enabled,
        createdAt: recurringInvoice.createdAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error creating recurring invoice");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der wiederkehrenden Rechnung" },
      { status: 500 }
    );
  }
}

export const POST = withMonitoring(postHandler);
