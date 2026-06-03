/**
 * Dunning-Hold API — strittige Rechnungen vom Mahnlauf ausschließen.
 *
 * PATCH /api/invoices/[id]/dunning-hold
 * Body: { hold: boolean, reason?: string, until?: ISO-date }
 *
 * - hold=true + until=null: permanenter Hold
 * - hold=true + until=ISO:  temporärer Hold bis Datum
 * - hold=false: Hold aufheben (reason/until werden zurückgesetzt)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";

const holdSchema = z
  .object({
    hold: z.boolean(),
    reason: z.string().max(500).optional().nullable(),
    until: z.string().datetime().optional().nullable(),
  })
  .refine(
    (data) => !data.hold || (data.reason && data.reason.trim().length >= 3),
    {
      message: "Begründung erforderlich (mind. 3 Zeichen) wenn hold=true",
      path: ["reason"],
    },
  );

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission("invoice:update");
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const { id } = await params;

    let bodyParsed;
    try {
      const body = await request.json();
      bodyParsed = holdSchema.safeParse(body);
    } catch {
      return apiError("BAD_REQUEST", 400, {
        message: "Ungültiger Request-Body",
      });
    }

    if (!bodyParsed.success) {
      return apiError("BAD_REQUEST", 400, {
        message:
          bodyParsed.error.issues[0]?.message || "Ungültige Eingabedaten",
      });
    }

    const { hold, reason, until } = bodyParsed.data;

    const existing = await prisma.invoice.findFirst({
      where: { id, tenantId: check.tenantId, deletedAt: null },
      select: {
        id: true,
        dunningHold: true,
        dunningHoldReason: true,
        dunningHoldUntil: true,
      },
    });

    if (!existing) {
      return apiError("NOT_FOUND", 404, {
        message: "Rechnung nicht gefunden",
      });
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        dunningHold: hold,
        dunningHoldReason: hold ? reason ?? null : null,
        dunningHoldUntil: hold && until ? new Date(until) : null,
      },
      select: {
        id: true,
        invoiceNumber: true,
        dunningHold: true,
        dunningHoldReason: true,
        dunningHoldUntil: true,
      },
    });

    await createAuditLog({
      action: "UPDATE",
      entityType: "Invoice",
      entityId: id,
      oldValues: {
        dunningHold: existing.dunningHold,
        dunningHoldReason: existing.dunningHoldReason,
        dunningHoldUntil: existing.dunningHoldUntil,
      },
      newValues: {
        dunningHold: updated.dunningHold,
        dunningHoldReason: updated.dunningHoldReason,
        dunningHoldUntil: updated.dunningHoldUntil,
      },
      description: hold
        ? `Mahnsperre gesetzt: ${reason ?? "(ohne Begründung)"}`
        : "Mahnsperre aufgehoben",
    });

    logger.info(
      {
        tenantId: check.tenantId,
        userId: check.userId,
        invoiceId: id,
        hold,
        reason,
        until,
      },
      "Invoice dunning-hold toggled",
    );

    return NextResponse.json(updated);
  } catch (error) {
    logger.error({ err: error }, "Error toggling invoice dunning-hold");
    return apiError("PROCESS_FAILED", 500, {
      message: "Fehler beim Setzen der Mahnsperre",
    });
  }
}
