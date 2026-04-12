import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

const updateSchema = z.object({
  taxType: z.enum(["STANDARD", "REDUCED", "EXEMPT"]).optional(),
  rate: z.number().min(0).max(100).optional(),
  validFrom: z.string().optional(),
  validTo: z.string().optional().nullable(),
  label: z.string().optional().nullable(),
});

// PATCH /api/admin/tax-rates/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const existing = await prisma.taxRateConfig.findFirst({
      where: { id, tenantId: check.tenantId! },
    });

    if (!existing) {
      return apiError("NOT_FOUND", undefined, { message: "Steuersatz nicht gefunden" });
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("BAD_REQUEST", undefined, { message: parsed.error.issues[0]?.message || "Ungültige Eingabe" });
    }

    // Build update data, converting date strings to Date objects
    const updateData: Record<string, unknown> = {};
    if (parsed.data.taxType !== undefined) updateData.taxType = parsed.data.taxType;
    if (parsed.data.rate !== undefined) updateData.rate = parsed.data.rate;
    if (parsed.data.validFrom !== undefined) updateData.validFrom = new Date(parsed.data.validFrom);
    if (parsed.data.validTo !== undefined) updateData.validTo = parsed.data.validTo ? new Date(parsed.data.validTo) : null;
    if (parsed.data.label !== undefined) updateData.label = parsed.data.label;

    const taxRate = await prisma.taxRateConfig.update({
      where: { id, tenantId: check.tenantId! },
      data: updateData,
    });

    return NextResponse.json(taxRate);
  } catch (error) {
    logger.error({ err: error }, "Error updating tax rate");
    return apiError("UPDATE_FAILED", undefined, { message: "Fehler beim Aktualisieren des Steuersatzes" });
  }
}

// DELETE /api/admin/tax-rates/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const existing = await prisma.taxRateConfig.findFirst({
      where: { id, tenantId: check.tenantId! },
    });

    if (!existing) {
      return apiError("NOT_FOUND", undefined, { message: "Steuersatz nicht gefunden" });
    }

    await prisma.taxRateConfig.delete({ where: { id, tenantId: check.tenantId! } });

    return NextResponse.json({
      success: true,
      message: "Steuersatz erfolgreich gelöscht",
    });
  } catch (error) {
    logger.error({ err: error }, "Error deleting tax rate");
    return apiError("DELETE_FAILED", undefined, { message: "Fehler beim Löschen des Steuersatzes" });
  }
}
