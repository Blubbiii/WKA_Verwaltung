import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  code: z.string().min(1).max(20).optional(),
  description: z.string().max(500).optional().nullable(),
  calculationType: z.enum(["FIXED_RATE", "MARKET_PRICE", "MANUAL"]).optional(),
  taxType: z.enum(["STANDARD", "REDUCED", "EXEMPT"]).optional(),
  hasTax: z.boolean().optional(),
  taxRate: z.number().min(0).max(100).optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

// GET /api/admin/revenue-types/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const revenueType = await prisma.energyRevenueType.findFirst({
      where: { id, tenantId: check.tenantId! },
    });

    if (!revenueType) {
      return apiError("NOT_FOUND", undefined, { message: "Vergütungsart nicht gefunden" });
    }

    return NextResponse.json(revenueType);
  } catch (error) {
    logger.error({ err: error }, "Error fetching revenue type");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Vergütungsart" });
  }
}

// PATCH /api/admin/revenue-types/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const existing = await prisma.energyRevenueType.findFirst({
      where: { id, tenantId: check.tenantId! },
    });

    if (!existing) {
      return apiError("NOT_FOUND", undefined, { message: "Vergütungsart nicht gefunden" });
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("BAD_REQUEST", undefined, { message: parsed.error.issues[0]?.message || "Ungültige Eingabe" });
    }

    // Check duplicate code if code is being changed
    if (parsed.data.code && parsed.data.code !== existing.code) {
      const duplicate = await prisma.energyRevenueType.findFirst({
        where: {
          code: parsed.data.code,
          tenantId: check.tenantId!,
          id: { not: id },
        },
      });
      if (duplicate) {
        return apiError("CONFLICT", undefined, { message: `Code "${parsed.data.code}" existiert bereits` });
      }
    }

    const revenueType = await prisma.energyRevenueType.update({
      where: { id, tenantId: check.tenantId! },
      data: parsed.data,
    });

    return NextResponse.json(revenueType);
  } catch (error) {
    logger.error({ err: error }, "Error updating revenue type");
    return apiError("UPDATE_FAILED", undefined, { message: "Fehler beim Aktualisieren der Vergütungsart" });
  }
}

// DELETE /api/admin/revenue-types/[id] - Soft Delete (set isActive=false)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const existing = await prisma.energyRevenueType.findFirst({
      where: { id, tenantId: check.tenantId! },
    });

    if (!existing) {
      return apiError("NOT_FOUND", undefined, { message: "Vergütungsart nicht gefunden" });
    }

    // Check if any monthly rates reference this revenue type
    const usageCount = await prisma.energyMonthlyRate.count({
      where: { revenueTypeId: id },
    });

    if (usageCount > 0) {
      // Soft delete - just deactivate
      await prisma.energyRevenueType.update({
        where: { id, tenantId: check.tenantId! },
        data: { isActive: false },
      });
      return NextResponse.json({
        success: true,
        message: `Vergütungsart deaktiviert (${usageCount} Monatssaetze referenzieren diese)`,
      });
    }

    // Hard delete if unused
    await prisma.energyRevenueType.delete({ where: { id, tenantId: check.tenantId! } });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting revenue type");
    return apiError("DELETE_FAILED", undefined, { message: "Fehler beim Löschen der Vergütungsart" });
  }
}
