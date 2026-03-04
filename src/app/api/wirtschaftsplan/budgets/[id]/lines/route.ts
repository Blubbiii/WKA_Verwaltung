/**
 * PUT /api/wirtschaftsplan/budgets/[id]/lines
 * Bulk upsert of budget lines for a budget plan.
 * Replaces all lines for the given budget.
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { withMonitoring } from "@/lib/monitoring";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";
import { Decimal } from "@prisma/client/runtime/library";

const monthSchema = z.number().or(z.string()).transform((v) => new Decimal(Number(v) || 0));

const lineSchema = z.object({
  id: z.string().optional(),
  costCenterId: z.string().min(1),
  category: z.enum([
    "REVENUE_ENERGY",
    "REVENUE_OTHER",
    "COST_LEASE",
    "COST_MAINTENANCE",
    "COST_INSURANCE",
    "COST_ADMIN",
    "COST_DEPRECIATION",
    "COST_FINANCING",
    "COST_OTHER",
    "RESERVE",
  ]),
  description: z.string().min(1),
  notes: z.string().optional().nullable(),
  jan: monthSchema,
  feb: monthSchema,
  mar: monthSchema,
  apr: monthSchema,
  may: monthSchema,
  jun: monthSchema,
  jul: monthSchema,
  aug: monthSchema,
  sep: monthSchema,
  oct: monthSchema,
  nov: monthSchema,
  dec: monthSchema,
});

const bodySchema = z.object({
  lines: z.array(lineSchema),
});

async function putHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("wirtschaftsplan:update");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const budget = await prisma.annualBudget.findFirst({
      where: { id, tenantId: check.tenantId! },
    });
    if (!budget) {
      return NextResponse.json({ error: "Budgetplan nicht gefunden" }, { status: 404 });
    }
    if (budget.status === "LOCKED") {
      return NextResponse.json({ error: "Gesperrter Budget kann nicht bearbeitet werden" }, { status: 403 });
    }

    const body = await request.json();
    const { lines } = bodySchema.parse(body);

    // Delete existing lines and recreate — simpler than upsert for bulk
    await prisma.$transaction(async (tx) => {
      await tx.budgetLine.deleteMany({ where: { budgetId: id } });
      if (lines.length > 0) {
        await tx.budgetLine.createMany({
          data: lines.map((line) => ({
            budgetId: id,
            costCenterId: line.costCenterId,
            category: line.category,
            description: line.description,
            notes: line.notes ?? null,
            jan: line.jan,
            feb: line.feb,
            mar: line.mar,
            apr: line.apr,
            may: line.may,
            jun: line.jun,
            jul: line.jul,
            aug: line.aug,
            sep: line.sep,
            oct: line.oct,
            nov: line.nov,
            dec: line.dec,
          })),
        });
      }
    });

    const updatedBudget = await prisma.annualBudget.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            costCenter: { select: { id: true, code: true, name: true, type: true } },
          },
          orderBy: [{ category: "asc" }],
        },
      },
    });

    return NextResponse.json(updatedBudget);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validierungsfehler", details: error.errors }, { status: 400 });
    }
    logger.error({ err: error }, "Error updating budget lines");
    return NextResponse.json({ error: "Fehler beim Speichern der Budgetzeilen" }, { status: 500 });
  }
}

export const PUT = withMonitoring(putHandler);
