/**
 * GET  /api/subscriptions — Zeichnungen mit Frist-, Zahlungs- und GwG-Stand
 * POST /api/subscriptions — Zeichnung erfassen
 *
 * B6 (Audit 2026-07): „`shareholders/onboard` deckt die Datenerfassung. Es
 * fehlen Zeichnungsschein mit Widerrufsfrist, Einzahlungsüberwachung und
 * Legitimationsprüfung nach GwG mit Wiedervorlage."
 *
 * ## Warum die drei Prüfungen mit der Liste kommen
 *
 * Sie sind der Vorgang. Eine Zeichnungsliste ohne den Hinweis „Legitimation
 * fehlt" oder „Einlage seit 40 Tagen offen" wäre eine Tabelle, die man
 * daneben noch einmal von Hand durchgehen muss — also genau der
 * Bedienaufwand, den der Audit sonst beklagt.
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
  DEFAULT_WITHDRAWAL_DAYS,
  type AmlInput,
} from "@/lib/subscriptions/subscription";

const createSchema = z.object({
  fundId: z.string().uuid(),
  personId: z.string().uuid(),
  amountEur: z.number().positive(),
  agioPercent: z.number().min(0).max(100).default(0),
  signedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  withdrawalInstructionAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  withdrawalPeriodDays: z.number().int().min(0).max(365).default(DEFAULT_WITHDRAWAL_DAYS),
  paymentDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  documentId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const PREFIX = "ZS";
const DIGITS = 4;

/**
 * Der massgebliche GwG-Stand einer Person: die jüngste Prüfung.
 * Ältere bleiben als Nachweis erhalten, tragen den Status aber nicht mehr.
 */
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

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.SHAREHOLDERS_READ);
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const fundId = searchParams.get("fundId");
    const status = searchParams.get("status");
    /** Nur was Arbeit macht: offene Einlage oder fehlende Legitimation. */
    const openOnly = searchParams.get("openOnly") === "true";

    const subscriptions = await prisma.subscription.findMany({
      where: {
        tenantId: check.tenantId!,
        ...(fundId ? { fundId } : {}),
        ...(status ? { status: status as never } : {}),
      },
      include: {
        fund: { select: { id: true, name: true } },
        person: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            companyName: true,
            personType: true,
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
      orderBy: [{ signedAt: "desc" }, { createdAt: "desc" }],
    });

    const now = new Date();

    const enriched = subscriptions.map((subscription) => {
      const withdrawal = computeWithdrawal(
        {
          signedAt: subscription.signedAt,
          instructionGivenAt: subscription.withdrawalInstructionAt,
          periodDays: subscription.withdrawalPeriodDays,
        },
        now,
      );
      const payment = checkPayment(
        {
          amountEur: Number(subscription.amountEur),
          agioPercent: Number(subscription.agioPercent),
          paidEur: Number(subscription.paidEur),
          dueDate: subscription.paymentDueDate,
        },
        now,
      );
      const aml = checkAml(latestAml(subscription.person.amlChecks), now);
      const acceptance = checkAcceptance({
        status: subscription.status,
        aml,
        withdrawal,
        signedAt: subscription.signedAt,
      });

      return { ...subscription, withdrawal, payment, aml, acceptance };
    });

    const filtered = openOnly
      ? enriched.filter(
          (entry) =>
            entry.status !== "WITHDRAWN" &&
            entry.status !== "REJECTED" &&
            (!entry.payment.isSettled || !entry.aml.isValid || entry.aml.reviewDue),
        )
      : enriched;

    return NextResponse.json({ data: filtered });
  } catch (error) {
    logger.error({ err: error }, "[Subscriptions] Liste konnte nicht geladen werden");
    return apiError("FETCH_FAILED", 500, { message: "Zeichnungen konnten nicht geladen werden" });
  }
}

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.SHAREHOLDERS_CREATE);
    if (!check.authorized) return check.error;

    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe",
        details: { issues: parsed.error.issues },
      });
    }
    const data = parsed.data;

    const [fund, person] = await Promise.all([
      prisma.fund.findFirst({
        where: { id: data.fundId, tenantId: check.tenantId! },
        select: { id: true, name: true },
      }),
      prisma.person.findFirst({
        where: { id: data.personId, tenantId: check.tenantId! },
        select: { id: true },
      }),
    ]);

    if (!fund) return apiError("NOT_FOUND", 404, { message: "Gesellschaft nicht gefunden" });
    if (!person) return apiError("NOT_FOUND", 404, { message: "Person nicht gefunden" });

    const signedAt = data.signedAt ? new Date(`${data.signedAt}T00:00:00.000Z`) : null;
    const instructionAt = data.withdrawalInstructionAt
      ? new Date(`${data.withdrawalInstructionAt}T00:00:00.000Z`)
      : null;

    if (instructionAt && signedAt && instructionAt < signedAt) {
      // Zulässig — die Belehrung darf vor der Unterschrift erfolgen. Die Frist
      // beginnt dann mit der Unterschrift; das rechnet computeWithdrawal.
      // Kein Fehler, nur nicht stillschweigend umdrehen.
    }

    const withdrawal = computeWithdrawal(
      {
        signedAt,
        instructionGivenAt: instructionAt,
        periodDays: data.withdrawalPeriodDays,
      },
      new Date(),
    );

    const subscriptionNumber = await nextSubscriptionNumber(check.tenantId!, signedAt ?? new Date());

    const subscription = await prisma.subscription.create({
      data: {
        tenantId: check.tenantId!,
        fundId: data.fundId,
        personId: data.personId,
        subscriptionNumber,
        status: signedAt ? "SIGNED" : "DRAFT",
        amountEur: data.amountEur,
        agioPercent: data.agioPercent,
        signedAt,
        withdrawalInstructionAt: instructionAt,
        withdrawalPeriodDays: data.withdrawalPeriodDays,
        // Mitgespeichert, damit die Frist auch dann nachvollziehbar bleibt,
        // wenn die Voreinstellung später geändert wird.
        withdrawalDeadline: withdrawal.deadline,
        paymentDueDate: data.paymentDueDate
          ? new Date(`${data.paymentDueDate}T00:00:00.000Z`)
          : null,
        documentId: data.documentId || null,
        notes: data.notes || null,
        createdById: check.userId,
      },
    });

    await createAuditLog({
      action: "CREATE",
      entityType: "Fund",
      entityId: data.fundId,
      newValues: {
        subscriptionId: subscription.id,
        subscriptionNumber,
        amountEur: data.amountEur,
        agioPercent: data.agioPercent,
      },
      description: `Zeichnung ${subscriptionNumber} für ${fund.name} erfasst`,
    });

    const warnings: string[] = [];
    if (signedAt && !instructionAt) {
      // Der wichtigste Hinweis beim Anlegen: ohne Belehrung ist der Widerruf
      // zeitlich unbegrenzt möglich.
      warnings.push(withdrawal.statement);
    }

    return NextResponse.json({ subscription, withdrawal, warnings }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "[Subscriptions] Anlegen fehlgeschlagen");
    return apiError("CREATE_FAILED", 500, { message: "Zeichnung konnte nicht angelegt werden" });
  }
}

async function nextSubscriptionNumber(tenantId: string, reference: Date): Promise<string> {
  const year = reference.getUTCFullYear();
  const prefix = `${PREFIX}-${year}-`;

  const latest = await prisma.subscription.findFirst({
    where: { tenantId, subscriptionNumber: { startsWith: prefix } },
    orderBy: { subscriptionNumber: "desc" },
    select: { subscriptionNumber: true },
  });

  const last = latest ? Number.parseInt(latest.subscriptionNumber.slice(prefix.length), 10) : 0;
  const next = Number.isFinite(last) ? last + 1 : 1;
  return `${prefix}${String(next).padStart(DIGITS, "0")}`;
}
