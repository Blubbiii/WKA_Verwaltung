import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

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
      return NextResponse.json(
        { error: "CRM nicht aktiviert" },
        { status: 404 },
      );

    const { id } = await params;
    const existing = await prisma.emailTemplate.findFirst({
      where: { id, tenantId: check.tenantId!, category: "CRM" },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Template nicht gefunden" },
        { status: 404 },
      );
    }

    const raw = await request.json();
    const parsed = updateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" },
        { status: 400 },
      );
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
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren" },
      { status: 500 },
    );
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
      return NextResponse.json(
        { error: "CRM nicht aktiviert" },
        { status: 404 },
      );

    const { id } = await params;
    const existing = await prisma.emailTemplate.findFirst({
      where: { id, tenantId: check.tenantId!, category: "CRM" },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Template nicht gefunden" },
        { status: 404 },
      );
    }

    await prisma.emailTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting CRM email template");
    return NextResponse.json(
      { error: "Fehler beim Löschen" },
      { status: 500 },
    );
  }
}
