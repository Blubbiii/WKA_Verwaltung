/**
 * PATCH /api/subscriptions/[id] — Zeichnung fortschreiben
 *
 * Deckt die vier Schritte ab: unterzeichnen, annehmen, widerrufen, einzahlen.
 *
 * B6 (Audit 2026-07).
 *
 * ## Die Annahme ist die Stelle mit der harten Schranke
 *
 * Ohne abgeschlossene GwG-Legitimation wird nicht angenommen — mit 409 und
 * Begründung, nicht mit einer Warnung. Nach § 10 Abs. 1 Nr. 1 i. V. m. § 11
 * Abs. 1 GwG ist vor Begründung der Geschäftsbeziehung zu identifizieren; die
 * Annahme IST die Begründung. Ein „später nachholen" gibt es hier nicht.
 *
 * ## Der Widerruf löscht nichts
 *
 * Er setzt den Status und hält Datum und Grund fest. Ein gelöschter
 * Zeichnungsschein wäre eine Lücke in der Nummernfolge, die niemand erklären
 * kann — und der Zeichner hat Anspruch auf den Nachweis, dass er widerrufen
 * hat.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import {
  computeWithdrawal,
  checkPayment,
  checkAml,
  checkAcceptance,
  type AmlInput,
} from "@/lib/subscriptions/subscription";

const patchSchema = z
  .object({
    action: z.enum(["SIGN", "ACCEPT", "WITHDRAW", "REJECT", "RECORD_PAYMENT", "UPDATE"]),

    signedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    withdrawalInstructionAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    documentId: z.string().uuid().nullable().optional(),

    /** Bei WITHDRAW / REJECT. */
    reason: z.string().max(2000).nullable().optional(),

    /** Bei RECORD_PAYMENT: der neue Gesamtstand, nicht der Teilbetrag. */
    paidEur: z.number().min(0).optional(),
    paymentDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),

    notes: z.string().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.action === "RECORD_PAYMENT" && data.paidEur === undefined) {
      ctx.addIssue({ code: "custom", path: ["paidEur"], message: "Zahlungsbetrag fehlt" });
    }
    if (data.action === "SIGN" && !data.signedAt) {
      ctx.addIssue({ code: "custom", path: ["signedAt"], message: "Datum der Unterzeichnung fehlt" });
    }
  });

function latestAml(
  checks: {
    status: string;
    identifiedAt: Date | null;
    documentValidUntil: Date | null;
    nextReviewAt: Date | null;
    beneficialOwnerVerified: boolean;
    isPep: boolean;
    createdAt: Date;
  }[],
): AmlInput {
  const latest = [...checks].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (!latest) {
    return {
      status: "PENDING",
      identifiedAt: null,
      documentValidUntil: null,
      nextReviewAt: null,
      beneficialOwnerVerified: false,
      isPep: false,
    };
  }
  return {
    status: latest.status as AmlInput["status"],
    identifiedAt: latest.identifiedAt,
    documentValidUntil: latest.documentValidUntil,
    nextReviewAt: latest.nextReviewAt,
    beneficialOwnerVerified: latest.beneficialOwnerVerified,
    isPep: latest.isPep,
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission(PERMISSIONS.SHAREHOLDERS_UPDATE);
    if (!check.authorized) return check.error;

    const { id } = await params;
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe",
        details: { issues: parsed.error.issues },
      });
    }
    const data = parsed.data;

    const subscription = await prisma.subscription.findFirst({
      where: { id, tenantId: check.tenantId! },
      include: {
        person: {
          select: {
            id: true,
            amlChecks: {
              select: {
                status: true,
                identifiedAt: true,
                documentValidUntil: true,
                nextReviewAt: true,
                beneficialOwnerVerified: true,
                isPep: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });
    if (!subscription) {
      return apiError("NOT_FOUND", 404, { message: "Zeichnung nicht gefunden" });
    }

    const now = new Date();
    const warnings: string[] = [];
    let update: Record<string, unknown> = {};

    const signedAt =
      data.signedAt !== undefined
        ? data.signedAt
          ? new Date(`${data.signedAt}T00:00:00.000Z`)
          : null
        : subscription.signedAt;
    const instructionAt =
      data.withdrawalInstructionAt !== undefined
        ? data.withdrawalInstructionAt
          ? new Date(`${data.withdrawalInstructionAt}T00:00:00.000Z`)
          : null
        : subscription.withdrawalInstructionAt;

    const withdrawal = computeWithdrawal(
      {
        signedAt,
        instructionGivenAt: instructionAt,
        periodDays: subscription.withdrawalPeriodDays,
      },
      now,
    );
    const aml = checkAml(latestAml(subscription.person.amlChecks), now);

    switch (data.action) {
      case "SIGN": {
        update = {
          status: "SIGNED",
          signedAt,
          withdrawalInstructionAt: instructionAt,
          withdrawalDeadline: withdrawal.deadline,
          ...(data.documentId !== undefined ? { documentId: data.documentId } : {}),
        };
        if (!instructionAt) warnings.push(withdrawal.statement);
        break;
      }

      case "ACCEPT": {
        const acceptance = checkAcceptance({
          status: subscription.status,
          aml,
          withdrawal,
          signedAt,
        });

        if (!acceptance.canAccept) {
          // 409 statt 400: der Zustand steht der Annahme entgegen, nicht die
          // Eingabe.
          return apiError("CONFLICT", 409, {
            message: acceptance.blockers[0],
            details: { blockers: acceptance.blockers, warnings: acceptance.warnings },
          });
        }

        warnings.push(...acceptance.warnings);
        update = { status: "ACCEPTED", acceptedAt: now, acceptedById: check.userId };
        break;
      }

      case "WITHDRAW": {
        if (subscription.status === "WITHDRAWN") {
          return apiError("BAD_REQUEST", undefined, { message: "Bereits widerrufen" });
        }
        // Ein Widerruf nach Fristablauf wird NICHT abgewiesen: ob er
        // wirksam ist, entscheidet nicht diese Software. Er wird erfasst und
        // der Fristablauf dazu vermerkt.
        if (withdrawal.isRunning === false) {
          warnings.push(
            `${withdrawal.statement} Ob der Widerruf gleichwohl wirksam ist, ist rechtlich zu prüfen — er wird hier vollständig erfasst.`,
          );
        }
        update = {
          status: "WITHDRAWN",
          withdrawnAt: now,
          withdrawalReason: data.reason || null,
        };
        break;
      }

      case "REJECT": {
        update = { status: "REJECTED", rejectedAt: now, rejectionReason: data.reason || null };
        break;
      }

      case "RECORD_PAYMENT": {
        const payment = checkPayment(
          {
            amountEur: Number(subscription.amountEur),
            agioPercent: Number(subscription.agioPercent),
            paidEur: data.paidEur!,
            dueDate: subscription.paymentDueDate,
          },
          now,
        );
        warnings.push(...payment.warnings);

        update = {
          paidEur: data.paidEur,
          ...(data.paymentDueDate !== undefined
            ? {
                paymentDueDate: data.paymentDueDate
                  ? new Date(`${data.paymentDueDate}T00:00:00.000Z`)
                  : null,
              }
            : {}),
          // Auf PAID nur, wenn wirklich alles da ist UND angenommen wurde.
          // Eine bezahlte, aber nicht angenommene Zeichnung ist kein
          // Gesellschafter — das Geld liegt dann treuhänderisch.
          ...(payment.isSettled && subscription.status === "ACCEPTED"
            ? { status: "PAID", fullyPaidAt: now }
            : {}),
        };

        if (payment.isSettled && subscription.status !== "ACCEPTED") {
          warnings.push(
            "Die Einlage ist vollständig eingegangen, die Zeichnung aber noch nicht angenommen. Der Betrag ist bis zur Annahme nicht als Einlage vereinnahmt.",
          );
        }
        break;
      }

      case "UPDATE": {
        update = {
          ...(data.signedAt !== undefined
            ? { signedAt, withdrawalDeadline: withdrawal.deadline }
            : {}),
          ...(data.withdrawalInstructionAt !== undefined
            ? { withdrawalInstructionAt: instructionAt, withdrawalDeadline: withdrawal.deadline }
            : {}),
          ...(data.documentId !== undefined ? { documentId: data.documentId } : {}),
          ...(data.paymentDueDate !== undefined
            ? {
                paymentDueDate: data.paymentDueDate
                  ? new Date(`${data.paymentDueDate}T00:00:00.000Z`)
                  : null,
              }
            : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
        };
        break;
      }
    }

    const updated = await prisma.subscription.update({ where: { id }, data: update });

    await createAuditLog({
      action: "UPDATE",
      entityType: "Fund",
      entityId: updated.fundId,
      oldValues: { status: subscription.status, paidEur: Number(subscription.paidEur) },
      newValues: { status: updated.status, paidEur: Number(updated.paidEur), action: data.action },
      description: `Zeichnung ${updated.subscriptionNumber}: ${data.action}`,
    });

    const payment = checkPayment(
      {
        amountEur: Number(updated.amountEur),
        agioPercent: Number(updated.agioPercent),
        paidEur: Number(updated.paidEur),
        dueDate: updated.paymentDueDate,
      },
      now,
    );

    return NextResponse.json({
      subscription: updated,
      withdrawal: computeWithdrawal(
        {
          signedAt: updated.signedAt,
          instructionGivenAt: updated.withdrawalInstructionAt,
          periodDays: updated.withdrawalPeriodDays,
        },
        now,
      ),
      payment,
      aml,
      warnings: [...new Set(warnings)],
    });
  } catch (error) {
    logger.error({ err: error }, "[Subscriptions] Fortschreiben fehlgeschlagen");
    return apiError("UPDATE_FAILED", 500, {
      message: "Zeichnung konnte nicht fortgeschrieben werden",
    });
  }
}
