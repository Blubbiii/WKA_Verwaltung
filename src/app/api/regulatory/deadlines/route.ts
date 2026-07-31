/**
 * GET   /api/regulatory/deadlines — Meldefristen
 * POST  /api/regulatory/deadlines — Fristen aus den Stammdaten erzeugen
 * PATCH /api/regulatory/deadlines — eine Frist erledigen oder verwerfen
 *
 * B2 (Audit 2026-07). Der Fristenkalender existiert bereits — er leitet seine
 * Termine aus Verträgen und Pachten ab. Regulatorische Fristen hängen dagegen
 * an Regeln (§ 71 EEG, § 5 MaStRV, § 36h EEG) und müssen einzeln erledigt
 * werden können. Deshalb sind sie gespeichert.
 *
 * ## Warum das Erzeugen idempotent ist und nichts überschreibt
 *
 * Der Lauf legt an, was fehlt, und lässt alles Bestehende in Ruhe. Würde er
 * aktualisieren, verlöre eine bereits erledigte Frist ihren Haken, sobald sich
 * ein Stammdatum ändert — und die versäumte Meldung sähe aus wie eine neue.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import { proposeDeadlines } from "@/lib/regulatory/deadline-rules";

const generateSchema = z.object({
  /** Auf einen Park oder eine Anlage beschränken. Ohne Angabe: alle. */
  parkId: z.string().uuid().optional(),
  turbineId: z.string().uuid().optional(),
  /** Wie viele Jahre Jahresmeldungen im Voraus. */
  horizonYears: z.number().int().min(0).max(5).default(2),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["OPEN", "DONE", "NOT_APPLICABLE"]),
  reference: z.string().max(200).nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.TURBINES_READ);
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const parkId = searchParams.get("parkId");
    const turbineId = searchParams.get("turbineId");

    const deadlines = await prisma.complianceDeadline.findMany({
      where: {
        tenantId: check.tenantId!,
        // Standardmässig nur offene: erledigte Fristen sind eine Historie,
        // keine Arbeitsliste.
        ...(status && status !== "ALL"
          ? { status: status as "OPEN" | "DONE" | "NOT_APPLICABLE" }
          : status === "ALL"
            ? {}
            : { status: "OPEN" as const }),
        ...(turbineId ? { turbineId } : {}),
        ...(parkId ? { OR: [{ parkId }, { turbine: { parkId } }] } : {}),
      },
      include: {
        turbine: {
          select: {
            id: true,
            designation: true,
            park: { select: { id: true, name: true, shortName: true } },
          },
        },
        park: { select: { id: true, name: true, shortName: true } },
        completedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ dueDate: "asc" }],
    });

    return NextResponse.json({ data: deadlines });
  } catch (error) {
    logger.error({ err: error }, "[Regulatory] Fristen konnten nicht geladen werden");
    return apiError("FETCH_FAILED", 500, { message: "Fristen konnten nicht geladen werden" });
  }
}

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.TURBINES_UPDATE);
    if (!check.authorized) return check.error;

    const raw = await request.json().catch(() => ({}));
    const parsed = generateSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { details: { issues: parsed.error.issues } });
    }
    const { parkId, turbineId, horizonYears } = parsed.data;

    const turbines = await prisma.turbine.findMany({
      where: {
        park: { tenantId: check.tenantId! },
        status: "ACTIVE",
        ...(turbineId ? { id: turbineId } : {}),
        ...(parkId ? { parkId } : {}),
      },
      select: {
        id: true,
        designation: true,
        commissioningDate: true,
        regulatoryProfile: true,
      },
    });

    if (turbines.length === 0) {
      return apiError("NOT_FOUND", 404, { message: "Keine passende Anlage gefunden" });
    }

    const referenceDate = new Date();
    let created = 0;
    let skipped = 0;
    const withoutProfile: string[] = [];

    for (const turbine of turbines) {
      const profile = turbine.regulatoryProfile;

      if (!profile) {
        // Ohne Stammdatensatz keine Regeln — ausser der offensichtlichen:
        // eine Anlage ohne Regulatorik-Datensatz hat auch keine geprüfte
        // MaStR-Nummer. Sie wird gemeldet statt stillschweigend übersprungen.
        withoutProfile.push(turbine.designation);
        skipped += 1;
        continue;
      }

      const proposals = proposeDeadlines(
        {
          commissioningDate: turbine.commissioningDate,
          mastrUnitNumber: profile.mastrUnitNumber,
          lastChangeAt: profile.lastChangeAt,
          lastChangeReportedAt: profile.lastChangeReportedAt,
          // Nur der Zuschlag aus einer Ausschreibung kennt die
          // Standortgüte-Korrektur nach § 36h EEG.
          subjectToSiteQualityReview: profile.scheme === "TENDER_AWARD",
          annualReportDay: profile.annualReportDay,
        },
        { referenceDate, horizonYears },
      );

      for (const proposal of proposals) {
        try {
          await prisma.complianceDeadline.create({
            data: {
              tenantId: check.tenantId!,
              kind: proposal.kind,
              turbineId: turbine.id,
              dueDate: proposal.dueDate,
              basis: proposal.basis,
              operatingYear: proposal.operatingYear,
              ruleKey: proposal.ruleKey,
            },
          });
          created += 1;
        } catch (error) {
          // P2002 = die Frist gibt es schon. Das ist der Normalfall bei jedem
          // Lauf nach dem ersten und kein Fehler.
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            skipped += 1;
            continue;
          }
          throw error;
        }
      }
    }

    if (created > 0) {
      await createAuditLog({
        action: "CREATE",
        entityType: "Turbine",
        entityId: turbineId ?? parkId ?? "alle",
        newValues: { createdDeadlines: created, skipped },
        description: `${created} Meldefristen erzeugt`,
      });
    }

    return NextResponse.json({
      created,
      skipped,
      // Der Aufrufer soll erfahren, WELCHE Anlagen übergangen wurden — sonst
      // liest sich „12 erzeugt" wie Vollständigkeit.
      turbinesWithoutProfile: withoutProfile,
    });
  } catch (error) {
    logger.error({ err: error }, "[Regulatory] Fristen konnten nicht erzeugt werden");
    return apiError("PROCESS_FAILED", 500, { message: "Fristen konnten nicht erzeugt werden" });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.TURBINES_UPDATE);
    if (!check.authorized) return check.error;

    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { details: { issues: parsed.error.issues } });
    }
    const data = parsed.data;

    const existing = await prisma.complianceDeadline.findFirst({
      where: { id: data.id, tenantId: check.tenantId! },
      select: { id: true, status: true, kind: true, dueDate: true },
    });
    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Frist nicht gefunden" });
    }

    const done = data.status === "DONE";

    const updated = await prisma.complianceDeadline.update({
      where: { id: data.id },
      data: {
        status: data.status,
        // Beim Zurücksetzen auf OFFEN auch den Erledigungsvermerk räumen —
        // sonst stünde dort ein Datum zu einer offenen Frist.
        completedAt: data.status === "OPEN" ? null : new Date(),
        completedById: data.status === "OPEN" ? null : check.userId,
        ...(data.reference !== undefined ? { reference: data.reference } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
    });

    await createAuditLog({
      action: "UPDATE",
      entityType: "Turbine",
      entityId: updated.turbineId ?? updated.id,
      oldValues: { status: existing.status },
      newValues: { status: data.status, reference: data.reference ?? null },
      description: done
        ? `Meldefrist erledigt (${existing.kind})`
        : `Meldefrist auf ${data.status} gesetzt (${existing.kind})`,
    });

    return NextResponse.json({ deadline: updated });
  } catch (error) {
    logger.error({ err: error }, "[Regulatory] Frist konnte nicht geändert werden");
    return apiError("UPDATE_FAILED", 500, { message: "Frist konnte nicht geändert werden" });
  }
}
