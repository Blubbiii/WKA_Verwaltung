import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

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
      return NextResponse.json(
        { error: "Vorlage nicht gefunden" },
        { status: 404 }
      );
    }

    return NextResponse.json(template);
  } catch (error) {
    logger.error({ err: error }, "Error fetching position template");
    return NextResponse.json(
      { error: "Fehler beim Laden der Vorlage" },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: "Vorlage nicht gefunden" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Ungültige Eingabe" },
        { status: 400 }
      );
    }

    const template = await prisma.invoiceItemTemplate.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json(template);
  } catch (error) {
    logger.error({ err: error }, "Error updating position template");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der Vorlage" },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: "Vorlage nicht gefunden" },
        { status: 404 }
      );
    }

    await prisma.invoiceItemTemplate.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting position template");
    return NextResponse.json(
      { error: "Fehler beim Löschen der Vorlage" },
      { status: 500 }
    );
  }
}
