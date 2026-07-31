/**
 * POST /api/share-transfers/[id]/execute — Übertragung vollziehen
 *
 * A8 (Audit 2026-07). Erst hier wird der Anteilsverlauf fortgeschrieben. Der
 * Vollzug ist bewusst ein eigener Schritt hinter einem eigenen Recht: er
 * ändert die Gesellschafterliste, die zum Handelsregister eingereicht wird.
 *
 * Zwei Dinge, die diese Route ablehnt statt zurechtzubiegen:
 *  - fehlende Zustimmung bei vinkulierten Anteilen (schwebend unwirksam),
 *  - ein Stichtag, der VOR einer bereits vollzogenen Übertragung liegt. Sie
 *    rückwirkend einzuschieben würde die Quoten der späteren Übertragung
 *    falsch fortschreiben.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import { checkTransfer, executeTransfer } from "@/lib/shareholding/transfer-service";
import { resolveShareholderSharesFrom } from "@/lib/shareholding/resolve-shares";
import { shareRegisterAt } from "@/lib/shareholding/distribution-split";

const bodySchema = z.object({
  /** Zustimmung beim Vollzug nachtragen. */
  consentGrantedAt: z.string().nullable().optional(),
  consentReference: z.string().max(200).optional(),
  registerFiledAt: z.string().nullable().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission(PERMISSIONS.SHAREHOLDERS_TRANSFER);
    if (!check.authorized) return check.error;

    const { id } = await params;
    const raw = await request.json().catch(() => ({}));
    const body = bodySchema.parse(raw);

    const transfer = await prisma.shareTransfer.findFirst({
      where: { id, tenantId: check.tenantId! },
      include: {
        fund: {
          select: {
            id: true,
            shareholders: {
              select: {
                id: true,
                entryDate: true,
                exitDate: true,
                ownershipPercentage: true,
                distributionPercentage: true,
                shareHistory: {
                  select: { sharePercent: true, validFrom: true, validTo: true },
                  orderBy: { validFrom: "asc" },
                },
              },
            },
          },
        },
      },
    });

    if (!transfer) {
      return apiError("NOT_FOUND", undefined, { message: "Übertragung nicht gefunden" });
    }

    if (transfer.status === "EXECUTED") {
      return apiError("BAD_REQUEST", undefined, {
        message: "Die Übertragung ist bereits vollzogen",
      });
    }
    if (transfer.status === "CANCELLED") {
      return apiError("BAD_REQUEST", undefined, {
        message: "Eine stornierte Übertragung kann nicht vollzogen werden",
      });
    }

    // Reihenfolge: eine ältere Übertragung nachträglich einzuschieben würde
    // die Fortschreibung der bereits vollzogenen falsch machen.
    const later = await prisma.shareTransfer.findFirst({
      where: {
        fundId: transfer.fundId,
        status: "EXECUTED",
        effectiveDate: { gt: transfer.effectiveDate },
      },
      select: { transferNumber: true, effectiveDate: true },
      orderBy: { effectiveDate: "asc" },
    });

    if (later) {
      return apiError("BAD_REQUEST", undefined, {
        message: `Es ist bereits eine spätere Übertragung vollzogen (${later.transferNumber}). Übertragungen müssen in der Reihenfolge ihrer Stichtage vollzogen werden.`,
      });
    }

    const consentGrantedAt = body.consentGrantedAt
      ? new Date(body.consentGrantedAt)
      : transfer.consentGrantedAt;

    const resolved = resolveShareholderSharesFrom(transfer.fund.shareholders);
    const register = shareRegisterAt(resolved.shares, transfer.effectiveDate);
    const fromEntry = transfer.fromShareholderId
      ? register.find((r) => r.shareholderId === transfer.fromShareholderId)
      : undefined;

    const input = {
      id: transfer.id,
      type: transfer.type,
      effectiveDate: transfer.effectiveDate,
      sharePercent: Number(transfer.sharePercent),
      capitalAmount: transfer.capitalAmount === null ? null : Number(transfer.capitalAmount),
      consentRequired: transfer.consentRequired,
      consentGrantedAt,
      fromShareholderId: transfer.fromShareholderId,
      toShareholderId: transfer.toShareholderId,
    };

    const verdict = checkTransfer(input, {
      fromSharePercent: fromEntry
        ? fromEntry.sharePercent
        : transfer.fromShareholderId
          ? 0
          : null,
      totalSharePercent: register.reduce((sum, r) => sum + r.sharePercent, 0),
    });

    if (!verdict.ok) {
      return apiError("VALIDATION_FAILED", 400, {
        message: verdict.problems[0],
        details: { problems: verdict.problems },
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      if (consentGrantedAt !== transfer.consentGrantedAt || body.registerFiledAt) {
        await tx.shareTransfer.update({
          where: { id: transfer.id },
          data: {
            consentGrantedAt,
            ...(body.consentReference ? { consentReference: body.consentReference } : {}),
            ...(body.registerFiledAt ? { registerFiledAt: new Date(body.registerFiledAt) } : {}),
          },
        });
      }
      return executeTransfer(tx, input, check.userId ?? null);
    });

    await createAuditLog({
      action: "UPDATE",
      entityType: "ShareTransfer",
      entityId: transfer.id,
      oldValues: { status: transfer.status },
      newValues: {
        status: "EXECUTED",
        effectiveDate: transfer.effectiveDate.toISOString().slice(0, 10),
        sharePercent: Number(transfer.sharePercent),
        historyRowsClosed: result.closed,
        historyRowsOpened: result.opened,
      },
    });

    return NextResponse.json({
      executed: true,
      ...result,
      warnings: verdict.warnings,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("VALIDATION_FAILED", 400, { details: { issues: error.issues } });
    }
    logger.error({ err: error }, "Error executing share transfer");
    return apiError("UPDATE_FAILED", undefined, {
      message: "Fehler beim Vollzug der Anteilsübertragung",
    });
  }
}
