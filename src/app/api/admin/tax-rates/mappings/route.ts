import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const mappingSchema = z.object({
  mappings: z.array(
    z.object({
      category: z.string().min(1),
      taxType: z.enum(["STANDARD", "REDUCED", "EXEMPT"]),
    })
  ),
});

// PUT /api/admin/tax-rates/mappings
export async function PUT(request: NextRequest) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = mappingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Ungueltige Eingabe" },
        { status: 400 }
      );
    }

    const tenantId = check.tenantId!;

    // Update each mapping in a transaction
    await prisma.$transaction(
      parsed.data.mappings.map((m) =>
        prisma.positionTaxMapping.update({
          where: { tenantId_category: { tenantId, category: m.category } },
          data: { taxType: m.taxType },
        })
      )
    );

    // Return updated mappings
    const updated = await prisma.positionTaxMapping.findMany({
      where: { tenantId },
      orderBy: [{ module: "asc" }, { category: "asc" }],
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error({ err: error }, "Error updating position tax mappings");
    return NextResponse.json(
      { error: "Fehler beim Speichern der Zuordnungen" },
      { status: 500 }
    );
  }
}
