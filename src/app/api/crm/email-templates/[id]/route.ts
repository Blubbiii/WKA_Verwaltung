import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import { apiError } from "@/lib/api-errors";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  subject: z.string().min(1).max(500).optional(),
  body: z.string().min(1).optional(),
});

// PUT /api/crm/email-templates/[id]
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
    const existing = await prisma.emailTemplate.findFirst({
      where: { id, tenantId: check.tenantId!, category: "CRM" },
    });
    if (!existing) {
      return apiError("NOT_FOUND", undefined, { message: "Template nicht gefunden" });
    }

    const raw = await request.json();
    const parsed = updateSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", undefined, { message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" });
    }

    const updated = await prisma.emailTemplate.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.subject !== undefined && { subject: parsed.data.subject }),
        ...(parsed.data.body !== undefined && { htmlContent: parsed.data.body }),
      },
    });
    return NextResponse.json(serializePrisma(updated));
  } catch (error) {
    logger.error({ err: error }, "Error updating CRM email template");
    return apiError("UPDATE_FAILED", undefined, { message: "Fehler beim Aktualisieren" });
  }
}

// DELETE /api/crm/email-templates/[id]
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
    const existing = await prisma.emailTemplate.findFirst({
      where: { id, tenantId: check.tenantId!, category: "CRM" },
    });
    if (!existing) {
      return apiError("NOT_FOUND", undefined, { message: "Template nicht gefunden" });
    }

    await prisma.emailTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting CRM email template");
    return apiError("DELETE_FAILED", undefined, { message: "Fehler beim Löschen" });
  }
}
