import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import { apiError } from "@/lib/api-errors";

const updateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().max(20).optional().nullable(),
});

// PUT /api/crm/tags/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission("crm:update");
    if (!check.authorized) return check.error;
    if (!(await getConfigBoolean("crm.enabled", check.tenantId, false)))
      return apiError("FEATURE_DISABLED", 404, { message: "CRM nicht aktiviert" });

    const { id } = await params;
    const existing = await prisma.personTag.findFirst({
      where: { id, tenantId: check.tenantId! },
    });
    if (!existing) {
      return apiError("NOT_FOUND", undefined, { message: "Tag nicht gefunden" });
    }

    const raw = await request.json();
    const parsed = updateSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", undefined, { message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" });
    }

    const updated = await prisma.personTag.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name.trim() }),
        ...(parsed.data.color !== undefined && { color: parsed.data.color }),
      },
    });
    return NextResponse.json(serializePrisma(updated));
  } catch (error) {
    logger.error({ err: error }, "Error updating person tag");
    return apiError("UPDATE_FAILED", undefined, { message: "Fehler beim Aktualisieren" });
  }
}

// DELETE /api/crm/tags/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission("crm:delete");
    if (!check.authorized) return check.error;
    if (!(await getConfigBoolean("crm.enabled", check.tenantId, false)))
      return apiError("FEATURE_DISABLED", 404, { message: "CRM nicht aktiviert" });

    const { id } = await params;
    const existing = await prisma.personTag.findFirst({
      where: { id, tenantId: check.tenantId! },
    });
    if (!existing) {
      return apiError("NOT_FOUND", undefined, { message: "Tag nicht gefunden" });
    }

    await prisma.personTag.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting person tag");
    return apiError("DELETE_FAILED", undefined, { message: "Fehler beim Löschen" });
  }
}
