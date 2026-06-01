/**
 * GET /api/buchhaltung/value-adjustments
 *   ?type=EWB|PWB|DIRECT_WRITEOFF&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Liefert die EWB/PWB/Forderungsausfall-Liste für den Mandanten. Wird
 * vom Anlagenspiegel und der Bilanz-Komponente (für Wertberichtigungen)
 * konsumiert.
 *
 * Zum Anlegen siehe POST /api/invoices/[id]/write-off (an einer Rechnung)
 * oder /api/buchhaltung/value-adjustments für PWB ohne Invoice-Bezug.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Decimal } from "@prisma/client-runtime-utils";
import { ValueAdjustmentType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

const pwbSchema = z.object({
  amount: z.number().positive(),
  reason: z.string().min(3).max(500),
  effectiveDate: z.iso.datetime().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as ValueAdjustmentType | null;
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Prisma.ValueAdjustmentWhereInput = {
      tenantId: check.tenantId,
    };
    if (type) where.type = type;
    if (from || to) {
      where.effectiveDate = {};
      if (from) where.effectiveDate.gte = new Date(from);
      if (to) where.effectiveDate.lte = new Date(to);
    }

    const items = await prisma.valueAdjustment.findMany({
      where,
      include: {
        invoice: { select: { id: true, invoiceNumber: true, grossAmount: true } },
        createdBy: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { effectiveDate: "desc" },
    });

    return NextResponse.json({ data: serializePrisma(items) });
  } catch (error) {
    logger.error({ err: error }, "Error listing value adjustments");
    return apiError("FETCH_FAILED", 500, {
      message: "Fehler beim Laden der Wertberichtigungen",
    });
  }
}

/**
 * POST: PWB (Pauschalwertberichtigung) anlegen — ohne Invoice-Bezug.
 * EWB / DIRECT_WRITEOFF mit Invoice-Bezug nutzt /api/invoices/[id]/write-off.
 */
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const body = await request.json();
    const parsed = pwbSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400, {
        message: parsed.error.issues[0]?.message || "Ungültige Eingabe",
      });
    }

    const effectiveDate = parsed.data.effectiveDate
      ? new Date(parsed.data.effectiveDate)
      : new Date();

    const created = await prisma.valueAdjustment.create({
      data: {
        tenantId: check.tenantId,
        type: ValueAdjustmentType.PWB,
        amountEur: new Decimal(parsed.data.amount),
        reason: parsed.data.reason.slice(0, 500),
        effectiveDate,
        createdById: check.userId!,
      },
    });

    logger.info(
      {
        tenantId: check.tenantId,
        adjustmentId: created.id,
        type: "PWB",
        amount: parsed.data.amount,
      },
      "PWB value adjustment created",
    );

    return NextResponse.json(serializePrisma(created), { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Error creating PWB");
    return apiError("CREATE_FAILED", 500, {
      message: "Fehler bei der PWB-Erstellung",
    });
  }
}
