import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { findDunningCandidates, executeDunningRun } from "@/lib/accounting/dunning";
import { z } from "zod";

const dunningRunSchema = z.object({
  invoiceIds: z.array(z.uuid()).min(1, "Keine Rechnungen ausgewählt"),
});

// GET /api/buchhaltung/dunning — List dunning runs OR get candidates
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode"); // "candidates" or default (list runs)

    if (mode === "candidates") {
      const candidates = await findDunningCandidates(check.tenantId!);
      return NextResponse.json({ data: candidates });
    }

    const runs = await prisma.dunningRun.findMany({
      where: { tenantId: check.tenantId! },
      orderBy: { runDate: "desc" },
      take: 50,
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        _count: { select: { items: true } },
      },
    });

    return NextResponse.json({ data: runs });
  } catch (error) {
    logger.error({ err: error }, "Error in dunning GET");
    return apiError("INTERNAL_ERROR", 500, { message: "Interner Serverfehler" });
  }
}

// POST /api/buchhaltung/dunning — Execute a dunning run
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:create");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = dunningRunSchema.parse(body);

    const result = await executeDunningRun(check.tenantId!, check.userId!, parsed.invoiceIds);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, "Fehler beim Ausführen des Mahnlaufs");
  }
}
