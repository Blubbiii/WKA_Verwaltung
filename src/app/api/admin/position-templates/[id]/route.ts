import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(1000).optional(),
  category: z.string().max(50).optional().nullable(),
  unit: z.string().max(20).optional(),
  taxType: z.enum(["STANDARD", "REDUCED", "EXEMPT"]).optional(),
  defaultPrice: z.number().min(0).optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

// GET /api/admin/position-templates/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const template = await prisma.invoiceItemTemplate.findFirst({
      where: { id, tenantId: check.tenantId! },
    });

    if (!template) {
      return apiError("NOT_FOUND", undefined, { message: "Vorlage nicht gefunden" });
    }

    return NextResponse.json(template);
  } catch (error) {
    logger.error({ err: error }, "Error fetching position template");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Vorlage" });
  }
}

// PATCH /api/admin/position-templates/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const existing = await prisma.invoiceItemTemplate.findFirst({
      where: { id, tenantId: check.tenantId! },
    });

    if (!existing) {
      return apiError("NOT_FOUND", undefined, { message: "Vorlage nicht gefunden" });
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("BAD_REQUEST", undefined, { message: parsed.error.issues[0]?.message || "Ungültige Eingabe" });
    }

    const template = await prisma.invoiceItemTemplate.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json(template);
  } catch (error) {
    logger.error({ err: error }, "Error updating position template");
    return apiError("UPDATE_FAILED", undefined, { message: "Fehler beim Aktualisieren der Vorlage" });
  }
}

// DELETE /api/admin/position-templates/[id] - Soft Delete
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const existing = await prisma.invoiceItemTemplate.findFirst({
      where: { id, tenantId: check.tenantId! },
    });

    if (!existing) {
      return apiError("NOT_FOUND", undefined, { message: "Vorlage nicht gefunden" });
    }

    await prisma.invoiceItemTemplate.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting position template");
    return apiError("DELETE_FAILED", undefined, { message: "Fehler beim Löschen der Vorlage" });
  }
}
