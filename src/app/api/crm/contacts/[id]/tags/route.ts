import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import { apiError } from "@/lib/api-errors";

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
      return apiError("FEATURE_DISABLED", 404, { message: "CRM nicht aktiviert" });

    const { id } = await params;
    const raw = await request.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", undefined, { message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" });
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
      return apiError("NOT_FOUND", undefined, { message: "Kontakt oder Tag nicht gefunden" });
    }

    const updated = await prisma.person.update({
      where: { id },
      data: { tags: { connect: { id: parsed.data.tagId } } },
      include: { tags: true },
    });
    return NextResponse.json(serializePrisma(updated.tags));
  } catch (error) {
    logger.error({ err: error }, "Error attaching tag");
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Zuweisen des Tags" });
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
      return apiError("FEATURE_DISABLED", 404, { message: "CRM nicht aktiviert" });

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const tagId = searchParams.get("tagId");
    if (!tagId) {
      return apiError("MISSING_FIELD", undefined, { message: "tagId required" });
    }

    const person = await prisma.person.findFirst({
      where: { id, tenantId: check.tenantId! },
      select: { id: true },
    });
    if (!person) {
      return apiError("NOT_FOUND", undefined, { message: "Kontakt nicht gefunden" });
    }

    await prisma.person.update({
      where: { id },
      data: { tags: { disconnect: { id: tagId } } },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error detaching tag");
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Entfernen des Tags" });
  }
}
