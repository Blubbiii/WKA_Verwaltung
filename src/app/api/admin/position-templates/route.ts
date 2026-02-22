import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const createSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich").max(100),
  description: z.string().min(1, "Beschreibung ist erforderlich").max(1000),
  category: z.string().max(50).optional().nullable(),
  unit: z.string().max(20).default("pauschal"),
  taxType: z.enum(["STANDARD", "REDUCED", "EXEMPT"]).default("EXEMPT"),
  defaultPrice: z.number().min(0).optional().nullable(),
  sortOrder: z.number().int().default(0),
});

// GET /api/admin/position-templates - Alle Vorlagen laden
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const category = searchParams.get("category") || "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any


    const where: any = {
      tenantId: check.tenantId!,
      isActive: true,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    if (category) {
      where.category = category;
    }

    const templates = await prisma.invoiceItemTemplate.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({ data: templates });
  } catch (error) {
    logger.error({ err: error }, "Error fetching position templates");
    return NextResponse.json(
      { error: "Fehler beim Laden der Positionsvorlagen" },
      { status: 500 }
    );
  }
}

// POST /api/admin/position-templates - Neue Vorlage erstellen
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Ungueltige Eingabe" },
        { status: 400 }
      );
    }

    const template = await prisma.invoiceItemTemplate.create({
      data: {
        ...parsed.data,
        defaultPrice: parsed.data.defaultPrice ?? undefined,
        tenantId: check.tenantId!,
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Error creating position template");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Positionsvorlage" },
      { status: 500 }
    );
  }
}
