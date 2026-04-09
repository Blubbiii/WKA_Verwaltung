import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

const bodySchema = z.object({
  tagId: z.uuid(),
});

// POST /api/crm/contacts/[id]/tags — attach tag
export async function POST(
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
    const raw = await request.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" },
        { status: 400 },
      );
    }

    // Verify both person and tag belong to tenant
    const [person, tag] = await Promise.all([
      prisma.person.findFirst({
        where: { id, tenantId: check.tenantId! },
        select: { id: true },
      }),
      prisma.personTag.findFirst({
        where: { id: parsed.data.tagId, tenantId: check.tenantId! },
        select: { id: true },
      }),
    ]);
    if (!person || !tag) {
      return NextResponse.json(
        { error: "Kontakt oder Tag nicht gefunden" },
        { status: 404 },
      );
    }

    const updated = await prisma.person.update({
      where: { id },
      data: { tags: { connect: { id: parsed.data.tagId } } },
      include: { tags: true },
    });
    return NextResponse.json(serializePrisma(updated.tags));
  } catch (error) {
    logger.error({ err: error }, "Error attaching tag");
    return NextResponse.json(
      { error: "Fehler beim Zuweisen des Tags" },
      { status: 500 },
    );
  }
}

// DELETE /api/crm/contacts/[id]/tags?tagId=...
export async function DELETE(
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
    const { searchParams } = new URL(request.url);
    const tagId = searchParams.get("tagId");
    if (!tagId) {
      return NextResponse.json(
        { error: "tagId required" },
        { status: 400 },
      );
    }

    const person = await prisma.person.findFirst({
      where: { id, tenantId: check.tenantId! },
      select: { id: true },
    });
    if (!person) {
      return NextResponse.json(
        { error: "Kontakt nicht gefunden" },
        { status: 404 },
      );
    }

    await prisma.person.update({
      where: { id },
      data: { tags: { disconnect: { id: tagId } } },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error detaching tag");
    return NextResponse.json(
      { error: "Fehler beim Entfernen des Tags" },
      { status: 500 },
    );
  }
}
