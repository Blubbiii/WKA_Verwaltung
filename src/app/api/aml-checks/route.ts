/**
 * GET  /api/aml-checks — Legitimationsprüfungen, mit Wiedervorlageliste
 * POST /api/aml-checks — Prüfung erfassen
 *
 * B6 (Audit 2026-07): „Legitimationsprüfung nach GwG mit Wiedervorlage."
 *
 * ## Warum jede Prüfung ein eigener Datensatz ist
 *
 * Die Identifizierung wird wiederholt (§ 10 Abs. 1 Nr. 5 GwG), und jede
 * einzelne ist ein eigener Nachweis mit eigener Aufbewahrungsfrist (§ 8 Abs. 4
 * GwG). Sie am Personenstammsatz zu überschreiben würde genau den Nachweis
 * vernichten, für den die Aufbewahrungspflicht besteht.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import { checkAml, AML_RETENTION_YEARS } from "@/lib/subscriptions/subscription";

const createSchema = z.object({
  personId: z.string().uuid(),
  subscriptionId: z.string().uuid().nullable().optional(),
  status: z.enum(["PENDING", "VERIFIED", "EXPIRED", "REJECTED"]).default("PENDING"),
  method: z
    .enum(["IN_PERSON", "VIDEO_IDENT", "POST_IDENT", "QUALIFIED_SIGNATURE", "THIRD_PARTY", "OTHER"])
    .default("IN_PERSON"),
  identifiedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  documentType: z.string().trim().max(60).nullable().optional(),
  documentNumber: z.string().trim().max(60).nullable().optional(),
  issuingAuthority: z.string().trim().max(200).nullable().optional(),
  documentValidUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  beneficialOwnerVerified: z.boolean().default(false),
  beneficialOwnerNotes: z.string().nullable().optional(),
  isPep: z.boolean().default(false),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).default("LOW"),
  nextReviewAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  documentId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
});

/**
 * Regelmässiger Abstand der Wiedervorlage in Jahren, nach Risiko.
 *
 * Das GwG nennt keine festen Intervalle — es verlangt eine Aktualisierung „in
 * angemessenen zeitlichen Abständen" (§ 10 Abs. 1 Nr. 5). Diese Werte sind
 * eine Vorbelegung nach üblicher Praxis und ausdrücklich überschreibbar; sie
 * sind keine Rechtsauskunft.
 */
const REVIEW_INTERVAL_YEARS: Record<"LOW" | "MEDIUM" | "HIGH", number> = {
  LOW: 5,
  MEDIUM: 3,
  HIGH: 1,
};

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.SHAREHOLDERS_READ);
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const personId = searchParams.get("personId");
    /** Nur was Arbeit macht: fällige oder überfällige Wiedervorlagen. */
    const dueOnly = searchParams.get("dueOnly") === "true";

    const checks = await prisma.amlCheck.findMany({
      where: {
        tenantId: check.tenantId!,
        ...(personId ? { personId } : {}),
      },
      include: {
        person: {
          select: { id: true, firstName: true, lastName: true, companyName: true, personType: true },
        },
        subscription: { select: { id: true, subscriptionNumber: true } },
        identifiedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ createdAt: "desc" }],
    });

    const now = new Date();
    const enriched = checks.map((entry) => ({
      ...entry,
      state: checkAml(
        {
          status: entry.status,
          identifiedAt: entry.identifiedAt,
          documentValidUntil: entry.documentValidUntil,
          nextReviewAt: entry.nextReviewAt,
          beneficialOwnerVerified: entry.beneficialOwnerVerified,
          isPep: entry.isPep,
        },
        now,
      ),
    }));

    return NextResponse.json({
      data: dueOnly
        ? enriched.filter((entry) => entry.state.reviewDue || !entry.state.isValid)
        : enriched,
    });
  } catch (error) {
    logger.error({ err: error }, "[AML] Liste konnte nicht geladen werden");
    return apiError("FETCH_FAILED", 500, {
      message: "Legitimationsprüfungen konnten nicht geladen werden",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.SHAREHOLDERS_UPDATE);
    if (!check.authorized) return check.error;

    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe",
        details: { issues: parsed.error.issues },
      });
    }
    const data = parsed.data;

    const person = await prisma.person.findFirst({
      where: { id: data.personId, tenantId: check.tenantId! },
      select: { id: true },
    });
    if (!person) return apiError("NOT_FOUND", 404, { message: "Person nicht gefunden" });

    const identifiedAt = data.identifiedAt
      ? new Date(`${data.identifiedAt}T00:00:00.000Z`)
      : null;

    // VERIFIED ohne Identifizierungsdatum ist ein Widerspruch — und einer,
    // der den Nachweis wertlos macht: § 8 Abs. 1 GwG verlangt die Aufzeichnung
    // der erhobenen Angaben, wozu der Zeitpunkt gehört.
    if (data.status === "VERIFIED" && !identifiedAt) {
      return apiError("VALIDATION_FAILED", 400, {
        message:
          "Status „abgeschlossen“ ohne Datum der Identifizierung. Der Zeitpunkt gehört zum Nachweis (§ 8 Abs. 1 GwG).",
      });
    }

    // Wiedervorlage vorbelegen, wenn keine angegeben ist — sonst bliebe die
    // Pflicht zur Aktualisierung unsichtbar.
    let nextReviewAt = data.nextReviewAt ? new Date(`${data.nextReviewAt}T00:00:00.000Z`) : null;
    if (!nextReviewAt && data.status === "VERIFIED" && identifiedAt) {
      nextReviewAt = new Date(
        Date.UTC(
          identifiedAt.getUTCFullYear() + REVIEW_INTERVAL_YEARS[data.riskLevel],
          identifiedAt.getUTCMonth(),
          identifiedAt.getUTCDate(),
        ),
      );
    }

    const created = await prisma.amlCheck.create({
      data: {
        tenantId: check.tenantId!,
        personId: data.personId,
        subscriptionId: data.subscriptionId || null,
        status: data.status,
        method: data.method,
        identifiedAt,
        identifiedById: identifiedAt ? check.userId : null,
        documentType: data.documentType || null,
        documentNumber: data.documentNumber || null,
        issuingAuthority: data.issuingAuthority || null,
        documentValidUntil: data.documentValidUntil
          ? new Date(`${data.documentValidUntil}T00:00:00.000Z`)
          : null,
        beneficialOwnerVerified: data.beneficialOwnerVerified,
        beneficialOwnerNotes: data.beneficialOwnerNotes || null,
        isPep: data.isPep,
        riskLevel: data.riskLevel,
        nextReviewAt,
        documentId: data.documentId || null,
        notes: data.notes || null,
      },
    });

    await createAuditLog({
      action: "CREATE",
      entityType: "Person",
      entityId: data.personId,
      newValues: {
        amlCheckId: created.id,
        status: data.status,
        method: data.method,
        riskLevel: data.riskLevel,
        isPep: data.isPep,
      },
      description: "GwG-Legitimationsprüfung erfasst",
    });

    const state = checkAml(
      {
        status: created.status,
        identifiedAt: created.identifiedAt,
        documentValidUntil: created.documentValidUntil,
        nextReviewAt: created.nextReviewAt,
        beneficialOwnerVerified: created.beneficialOwnerVerified,
        isPep: created.isPep,
      },
      new Date(),
    );

    const warnings = [...state.warnings];
    if (nextReviewAt && !data.nextReviewAt) {
      warnings.push(
        `Wiedervorlage auf ${nextReviewAt.toISOString().slice(0, 10)} vorbelegt (${REVIEW_INTERVAL_YEARS[data.riskLevel]} Jahre bei Risiko ${data.riskLevel}). Das GwG nennt keine festen Intervalle — bitte prüfen und anpassen.`,
      );
    }
    warnings.push(
      `Die Unterlagen sind ${AML_RETENTION_YEARS} Jahre nach Ende der Geschäftsbeziehung aufzubewahren (§ 8 Abs. 4 S. 1 GwG).`,
    );

    return NextResponse.json({ check: created, state, warnings }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "[AML] Anlegen fehlgeschlagen");
    return apiError("CREATE_FAILED", 500, {
      message: "Legitimationsprüfung konnte nicht angelegt werden",
    });
  }
}
