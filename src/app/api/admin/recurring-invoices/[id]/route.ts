/**
 * API Route: /api/admin/recurring-invoices/[id]
 * GET: Single recurring invoice with generation history
 * PATCH: Update recurring invoice (enable/disable, change positions, frequency)
 * DELETE: Disable (soft-delete) a recurring invoice
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/withPermission";
import { z } from "zod";
import {
  calculateInitialNextRun,
} from "@/lib/invoices/recurring-invoice-service";
import { withMonitoring } from "@/lib/monitoring";
import { apiLogger as logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-utils";
import { apiError } from "@/lib/api-errors";

// ============================================================================
// Validation
// ============================================================================

const positionSchema = z.object({
  description: z.string().min(1, "Beschreibung erforderlich"),
  quantity: z.number().positive("Menge muss positiv sein").default(1),
  unitPrice: z.number().min(0, "Preis darf nicht negativ sein"),
  taxType: z.enum(["STANDARD", "REDUCED", "EXEMPT"]).default("STANDARD"),
  unit: z.string().optional(),
});

const updateRecurringInvoiceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  recipientType: z.enum(["shareholder", "lessor", "fund", "custom"]).optional(),
  recipientId: z.string().optional().nullable(),
  recipientName: z.string().min(1).optional(),
  recipientAddress: z.string().optional().nullable(),
  invoiceType: z.enum(["INVOICE", "CREDIT_NOTE"]).optional(),
  positions: z.array(positionSchema).min(1).optional(),
  frequency: z.enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"]).optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional().nullable(),
  startDate: z.string().optional(),
  endDate: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  enabled: z.boolean().optional(),
  fundId: z.uuid().optional().nullable(),
  parkId: z.uuid().optional().nullable(),
});

// ============================================================================
// Route parameter type
// ============================================================================

type RouteContext = { params: Promise<{ id: string }> };

// ============================================================================
// GET /api/admin/recurring-invoices/[id]
// ============================================================================

async function getHandler(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const { id } = await context.params;

    const recurringInvoice = await prisma.recurringInvoice.findFirst({
      where: {
        id,
        tenantId: check.tenantId!,
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!recurringInvoice) {
      return apiError("NOT_FOUND", undefined, { message: "Wiederkehrende Rechnung nicht gefunden" });
    }

    // Fetch recently generated invoices (last 10)
    const generatedInvoices = recurringInvoice.lastInvoiceId
      ? await prisma.invoice.findMany({
          where: {
            tenantId: check.tenantId!,
            internalReference: {
              contains: recurringInvoice.name,
            },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            invoiceNumber: true,
            invoiceDate: true,
            grossAmount: true,
            status: true,
            createdAt: true,
          },
        })
      : [];

    // Calculate total amount for display
    const positions = recurringInvoice.positions as Array<{
      quantity: number;
      unitPrice: number;
    }>;
    const totalNet = Array.isArray(positions)
      ? positions.reduce(
          (sum, pos) => sum + (pos.quantity || 1) * (pos.unitPrice || 0),
          0
        )
      : 0;

    return NextResponse.json({
      id: recurringInvoice.id,
      name: recurringInvoice.name,
      recipientType: recurringInvoice.recipientType,
      recipientId: recurringInvoice.recipientId,
      recipientName: recurringInvoice.recipientName,
      recipientAddress: recurringInvoice.recipientAddress,
      invoiceType: recurringInvoice.invoiceType,
      positions: recurringInvoice.positions,
      frequency: recurringInvoice.frequency,
      dayOfMonth: recurringInvoice.dayOfMonth,
      startDate: recurringInvoice.startDate.toISOString(),
      endDate: recurringInvoice.endDate?.toISOString() || null,
      nextRunAt: recurringInvoice.nextRunAt.toISOString(),
      lastRunAt: recurringInvoice.lastRunAt?.toISOString() || null,
      enabled: recurringInvoice.enabled,
      notes: recurringInvoice.notes,
      totalNet,
      totalGenerated: recurringInvoice.totalGenerated,
      lastInvoiceId: recurringInvoice.lastInvoiceId,
      fundId: recurringInvoice.fundId,
      parkId: recurringInvoice.parkId,
      createdBy: recurringInvoice.createdBy,
      createdAt: recurringInvoice.createdAt.toISOString(),
      updatedAt: recurringInvoice.updatedAt.toISOString(),
      generatedInvoices,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching recurring invoice");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der wiederkehrenden Rechnung" });
  }
}

export const GET = withMonitoring(getHandler);

// ============================================================================
// PATCH /api/admin/recurring-invoices/[id]
// ============================================================================

async function patchHandler(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const { id } = await context.params;
    const body = await request.json();
    const validatedData = updateRecurringInvoiceSchema.parse(body);

    // Verify recurring invoice exists and belongs to tenant
    const existing = await prisma.recurringInvoice.findFirst({
      where: {
        id,
        tenantId: check.tenantId!,
      },
    });

    if (!existing) {
      return apiError("NOT_FOUND", undefined, { message: "Wiederkehrende Rechnung nicht gefunden" });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (validatedData.name !== undefined) updateData.name = validatedData.name;
    if (validatedData.recipientType !== undefined)
      updateData.recipientType = validatedData.recipientType;
    if (validatedData.recipientId !== undefined)
      updateData.recipientId = validatedData.recipientId;
    if (validatedData.recipientName !== undefined)
      updateData.recipientName = validatedData.recipientName;
    if (validatedData.recipientAddress !== undefined)
      updateData.recipientAddress = validatedData.recipientAddress;
    if (validatedData.invoiceType !== undefined)
      updateData.invoiceType = validatedData.invoiceType;
    if (validatedData.positions !== undefined)
      updateData.positions = validatedData.positions;
    if (validatedData.notes !== undefined)
      updateData.notes = validatedData.notes;
    if (validatedData.enabled !== undefined)
      updateData.enabled = validatedData.enabled;
    if (validatedData.fundId !== undefined)
      updateData.fundId = validatedData.fundId;
    if (validatedData.parkId !== undefined)
      updateData.parkId = validatedData.parkId;
    if (validatedData.dayOfMonth !== undefined)
      updateData.dayOfMonth = validatedData.dayOfMonth;

    // Handle date changes
    if (validatedData.startDate !== undefined) {
      updateData.startDate = new Date(validatedData.startDate);
    }
    if (validatedData.endDate !== undefined) {
      updateData.endDate = validatedData.endDate
        ? new Date(validatedData.endDate)
        : null;
    }

    // Recalculate nextRunAt if frequency, startDate, or dayOfMonth changed
    const frequencyChanged = validatedData.frequency !== undefined;
    const startDateChanged = validatedData.startDate !== undefined;
    const dayOfMonthChanged = validatedData.dayOfMonth !== undefined;
    const reEnabled =
      validatedData.enabled === true && !existing.enabled;

    if (frequencyChanged || startDateChanged || dayOfMonthChanged || reEnabled) {
      const freq = validatedData.frequency || existing.frequency;
      const startDt = validatedData.startDate
        ? new Date(validatedData.startDate)
        : existing.startDate;
      const day = validatedData.dayOfMonth !== undefined
        ? validatedData.dayOfMonth
        : existing.dayOfMonth;

      updateData.frequency = freq;
      updateData.nextRunAt = calculateInitialNextRun(freq, startDt, day);
    }

    // Validate endDate > startDate
    const effectiveStartDate = (updateData.startDate as Date) || existing.startDate;
    const effectiveEndDate =
      updateData.endDate !== undefined
        ? (updateData.endDate as Date | null)
        : existing.endDate;

    if (effectiveEndDate && effectiveEndDate <= effectiveStartDate) {
      return apiError("BAD_REQUEST", undefined, { message: "Enddatum muss nach dem Startdatum liegen" });
    }

    const updated = await prisma.recurringInvoice.update({
      where: { id, tenantId: check.tenantId!},
      data: updateData,
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    logger.info(
      {
        id: updated.id,
        name: updated.name,
        enabled: updated.enabled,
        nextRunAt: updated.nextRunAt?.toISOString(),
        changedFields: Object.keys(validatedData),
      },
      "Recurring invoice updated"
    );

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      recipientName: updated.recipientName,
      frequency: updated.frequency,
      enabled: updated.enabled,
      nextRunAt: updated.nextRunAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    return handleApiError(error, "Fehler beim Aktualisieren der wiederkehrenden Rechnung");
  }
}

export const PATCH = withMonitoring(patchHandler);

// ============================================================================
// DELETE /api/admin/recurring-invoices/[id]
// ============================================================================

async function deleteHandler(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const { id } = await context.params;

    // Verify recurring invoice exists and belongs to tenant
    const existing = await prisma.recurringInvoice.findFirst({
      where: {
        id,
        tenantId: check.tenantId!,
      },
    });

    if (!existing) {
      return apiError("NOT_FOUND", undefined, { message: "Wiederkehrende Rechnung nicht gefunden" });
    }

    // Soft-delete: disable the recurring invoice
    // We keep the record for audit trail / history
    await prisma.recurringInvoice.update({
      where: { id },
      data: { enabled: false },
    });

    logger.info(
      { id, name: existing.name },
      "Recurring invoice disabled (soft-deleted)"
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting recurring invoice");
    return apiError("DELETE_FAILED", undefined, { message: "Fehler beim Löschen der wiederkehrenden Rechnung" });
  }
}

export const DELETE = withMonitoring(deleteHandler);
