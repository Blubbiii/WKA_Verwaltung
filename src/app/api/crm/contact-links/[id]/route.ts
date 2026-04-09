import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

const updateSchema = z.object({
  role: z
    .enum([
      "VERPAECHTER",
      "NETZBETREIBER",
      "GUTACHTER",
      "BETRIEBSFUEHRER",
      "VERSICHERUNG",
      "RECHTSANWALT",
      "STEUERBERATER",
      "DIENSTLEISTER",
      "BEHOERDE",
      "SONSTIGES",
    ])
    .optional(),
  notes: z.string().max(1000).optional().nullable(),
  isPrimary: z.boolean().optional(),
  validFrom: z.iso.datetime().optional().nullable(),
  validTo: z.iso.datetime().optional().nullable(),
});

// PUT /api/crm/contact-links/[id]
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
    const existing = await prisma.contactLink.findFirst({
      where: { id, tenantId: check.tenantId! },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Verknüpfung nicht gefunden" },
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
    const d = parsed.data;

    const updated = await prisma.contactLink.update({
      where: { id },
      data: {
        ...(d.role !== undefined && { role: d.role }),
        ...(d.notes !== undefined && { notes: d.notes }),
        ...(d.isPrimary !== undefined && { isPrimary: d.isPrimary }),
        ...(d.validFrom !== undefined && {
          validFrom: d.validFrom ? new Date(d.validFrom) : null,
        }),
        ...(d.validTo !== undefined && {
          validTo: d.validTo ? new Date(d.validTo) : null,
        }),
      },
    });
    return NextResponse.json(serializePrisma(updated));
  } catch (error) {
    logger.error({ err: error }, "Error updating contact link");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren" },
      { status: 500 },
    );
  }
}

// DELETE /api/crm/contact-links/[id]
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
    const existing = await prisma.contactLink.findFirst({
      where: { id, tenantId: check.tenantId! },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Verknüpfung nicht gefunden" },
        { status: 404 },
      );
    }

    await prisma.contactLink.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting contact link");
    return NextResponse.json(
      { error: "Fehler beim Löschen" },
      { status: 500 },
    );
  }
}
