/**
 * Zahlungsmarkierung einer Eingangsrechnung (P13).
 *
 * POST /api/inbox/[id]/pay
 *
 * Status-Wechsel APPROVED → PAID. Setzt paidAt + paidAmount.
 *
 * P13-Härtung:
 *  - Approval-Gate: nur APPROVED-Rechnungen können bezahlt werden
 *    (DRAFT/INBOX/REVIEW → 409 APPROVAL_REQUIRED).
 *    Verhindert: Rechnung umgehen den 4-Augen-Freigabe-Prozess.
 *  - Race-Safe-Idempotenz: paidAt-Set via conditional update — wenn zwei
 *    parallele Aufrufe ankommen, gewinnt der erste, der zweite findet
 *    paidAt != null und bekommt 409.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

const paySchema = z.object({
  paidAt: z.iso.datetime().optional(),
  paidAmount: z.number().positive().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission("inbox:update");
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }
    if (!(await getConfigBoolean("inbox.enabled", check.tenantId, false))) {
      return apiError("FEATURE_DISABLED", 404, { message: "Inbox nicht aktiviert" });
    }
    const { id } = await params;

    const existing = await prisma.incomingInvoice.findFirst({
      where: { id, tenantId: check.tenantId, deletedAt: null },
      select: {
        id: true,
        status: true,
        grossAmount: true,
        paidAt: true,
        approvedAt: true,
      },
    });
    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Rechnung nicht gefunden" });
    }

    if (existing.status === "PAID") {
      return apiError("CONFLICT", 409, { message: "Rechnung bereits als bezahlt markiert" });
    }

    // P13 D8: Approval-Gate — keine Zahlung ohne 4-Augen-Freigabe.
    if (existing.status !== "APPROVED" || existing.approvedAt === null) {
      return apiError("APPROVAL_REQUIRED", 409, {
        message: `Rechnung muss vor Zahlung im Status "APPROVED" sein (aktuell: ${existing.status})`,
      });
    }

    const raw = await request.json();
    const parsed = paySchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400, {
        message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe",
      });
    }

    const paidAtValue = parsed.data.paidAt ? new Date(parsed.data.paidAt) : new Date();
    const paidAmountValue = parsed.data.paidAmount ?? Number(existing.grossAmount);

    // Race-Safe-Idempotenz: updateMany mit paidAt:null als Vorbedingung —
    // wenn zwei parallele Calls ankommen, schlägt der zweite mit count=0 fehl.
    const result = await prisma.incomingInvoice.updateMany({
      where: {
        id,
        tenantId: check.tenantId,
        deletedAt: null,
        paidAt: null,
        status: "APPROVED",
      },
      data: {
        status: "PAID",
        paidAt: paidAtValue,
        paidAmount: paidAmountValue,
      },
    });

    if (result.count === 0) {
      // Wettlauf verloren → Status hat sich zwischen findFirst und updateMany geändert.
      return apiError("CONFLICT", 409, {
        message: "Rechnung wurde parallel verändert. Bitte Liste aktualisieren.",
      });
    }

    const updated = await prisma.incomingInvoice.findUniqueOrThrow({
      where: { id },
    });

    logger.info(
      { tenantId: check.tenantId, invoiceId: id, paidById: check.userId },
      "Incoming invoice marked paid",
    );

    return NextResponse.json(serializePrisma(updated));
  } catch (error) {
    logger.error({ err: error }, "Error marking invoice as paid");
    return apiError("SAVE_FAILED", 500, { message: "Fehler beim Speichern" });
  }
}
