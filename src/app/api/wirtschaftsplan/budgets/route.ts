import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { withMonitoring } from "@/lib/monitoring";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";

const createSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  name: z.string().min(1).max(200),
  notes: z.string().optional().nullable(),
});

async function getHandler(request: NextRequest) {
  try {
    const check = await requirePermission("wirtschaftsplan:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year") ? parseInt(searchParams.get("year")!) : undefined;

    const budgets = await prisma.annualBudget.findMany({
      where: {
        tenantId: check.tenantId!,
        ...(year ? { year } : {}),
      },
      include: {
        _count: { select: { lines: true } },
      },
      orderBy: [{ year: "desc" }, { name: "asc" }],
    });

    return NextResponse.json(budgets);
  } catch (error) {
    logger.error({ err: error }, "Error fetching budgets");
    return NextResponse.json({ error: "Fehler beim Laden der Budgetpläne" }, { status: 500 });
  }
}

async function postHandler(request: NextRequest) {
  try {
    const check = await requirePermission("wirtschaftsplan:create");
    if (!check.authorized) return check.error;

    const body = await request.json();

    // Check if we should duplicate from previous year
    if (body.duplicateFromId) {
      const source = await prisma.annualBudget.findFirst({
        where: { id: body.duplicateFromId, tenantId: check.tenantId! },
        include: { lines: true },
      });
      if (!source) {
        return NextResponse.json({ error: "Quell-Budget nicht gefunden" }, { status: 404 });
      }

      const data = createSchema.parse(body);
      const newBudget = await prisma.annualBudget.create({
        data: {
          tenantId: check.tenantId!,
          year: data.year,
          name: data.name,
          notes: data.notes,
          lines: {
            create: source.lines.map(({ id: _id, budgetId: _budgetId, createdAt: _ca, updatedAt: _ua, ...line }) => line),
          },
        },
        include: { _count: { select: { lines: true } } },
      });

      return NextResponse.json(newBudget, { status: 201 });
    }

    const data = createSchema.parse(body);
    const budget = await prisma.annualBudget.create({
      data: {
        tenantId: check.tenantId!,
        year: data.year,
        name: data.name,
        notes: data.notes,
      },
      include: { _count: { select: { lines: true } } },
    });

    return NextResponse.json(budget, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validierungsfehler", details: error.issues }, { status: 400 });
    }
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Ein Budget mit diesem Namen und Jahr existiert bereits" }, { status: 409 });
    }
    logger.error({ err: error }, "Error creating budget");
    return NextResponse.json({ error: "Fehler beim Erstellen des Budgetplans" }, { status: 500 });
  }
}

export const GET = withMonitoring(getHandler);
export const POST = withMonitoring(postHandler);
