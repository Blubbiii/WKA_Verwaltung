import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

const createSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().max(20).optional().nullable(),
});

// GET /api/crm/tags
export async function GET() {
  try {
    const check = await requirePermission("crm:read");
    if (!check.authorized) return check.error;
    if (!(await getConfigBoolean("crm.enabled", check.tenantId, false)))
      return NextResponse.json(
        { error: "CRM nicht aktiviert" },
        { status: 404 },
      );

    const tags = await prisma.personTag.findMany({
      where: { tenantId: check.tenantId! },
      include: { _count: { select: { persons: true } } },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(serializePrisma(tags));
  } catch (error) {
    logger.error({ err: error }, "Error fetching person tags");
    return NextResponse.json(
      { error: "Fehler beim Laden der Tags" },
      { status: 500 },
    );
  }
}

// POST /api/crm/tags
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("crm:create");
    if (!check.authorized) return check.error;
    if (!(await getConfigBoolean("crm.enabled", check.tenantId, false)))
      return NextResponse.json(
        { error: "CRM nicht aktiviert" },
        { status: 404 },
      );

    const raw = await request.json();
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" },
        { status: 400 },
      );
    }

    try {
      const tag = await prisma.personTag.create({
        data: {
          tenantId: check.tenantId!,
          name: parsed.data.name.trim(),
          color: parsed.data.color ?? null,
        },
      });
      return NextResponse.json(serializePrisma(tag), { status: 201 });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return NextResponse.json(
          { error: "Ein Tag mit diesem Namen existiert bereits" },
          { status: 409 },
        );
      }
      throw err;
    }
  } catch (error) {
    logger.error({ err: error }, "Error creating person tag");
    return NextResponse.json(
      { error: "Fehler beim Erstellen" },
      { status: 500 },
    );
  }
}
