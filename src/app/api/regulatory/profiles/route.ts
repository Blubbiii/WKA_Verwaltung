/**
 * GET /api/regulatory/profiles — Regulatorik-Stammdaten, mit offenen Fristen
 * PUT /api/regulatory/profiles — Stammdaten einer Anlage setzen
 *
 * B2 (Audit 2026-07): `mastrNumber` war ein ungeprüftes Freitextfeld auf
 * `Turbine`, sonst nichts.
 *
 * ## Warum die Prüfung der Kennungen hier steht und nicht nur im Formular
 *
 * Eine MaStR-Nummer mit einem Zeichen zu wenig sieht richtig aus und ist es
 * nicht — sie fällt erst auf, wenn der Netzbetreiber die Meldung ablehnt. Die
 * Formate sind fest, also werden sie hier geprüft und nicht bloss angezeigt.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";

/**
 * MaStR-Nummern beginnen mit einem Präfix (SEE für Einheiten, SEL/SNB für
 * andere Objekte) gefolgt von zwölf Stellen. Bewusst grosszügig gefasst:
 * die Präfixe sind vom Register gesetzt und könnten erweitert werden — ein zu
 * enges Muster würde gültige Nummern ablehnen.
 */
const MASTR_PATTERN = /^[A-Z]{3}[0-9]{12}$/;

/**
 * Der EEG-Anlagenschlüssel hat 33 Zeichen (§ 3 Nr. 1 HkNRV): Ländercode,
 * Betreiberschlüssel, Anlagennummer. Die Länge ist fest und ein häufiger
 * Tippfehler.
 */
const EEG_KEY_LENGTH = 33;

const putSchema = z.object({
  turbineId: z.string().uuid(),
  mastrUnitNumber: z.string().trim().max(30).nullable().optional(),
  mastrPlantNumber: z.string().trim().max(30).nullable().optional(),
  mastrStatus: z
    .enum(["NOT_REGISTERED", "PENDING", "REGISTERED", "DECOMMISSIONED"])
    .default("NOT_REGISTERED"),
  mastrRegisteredAt: z.string().nullable().optional(),
  lastChangeAt: z.string().nullable().optional(),
  lastChangeReportedAt: z.string().nullable().optional(),
  eegPlantKey: z.string().trim().max(40).nullable().optional(),
  scheme: z
    .enum(["FIXED_FEED_IN", "MARKET_PREMIUM", "TENDER_AWARD", "OUTSIDE_EEG", "UNKNOWN"])
    .default("UNKNOWN"),
  awardValueCtPerKwh: z.number().nonnegative().max(100).nullable().optional(),
  awardDate: z.string().nullable().optional(),
  awardReference: z.string().trim().max(100).nullable().optional(),
  siteQualityPercent: z.number().positive().max(500).nullable().optional(),
  gridOperator: z.string().trim().max(200).nullable().optional(),
  gridConnectionDate: z.string().nullable().optional(),
  annualReportDay: z
    .string()
    .regex(/^\d{2}-\d{2}$/, "Termin muss als MM-TT angegeben werden")
    .nullable()
    .optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.TURBINES_READ);
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const turbineId = searchParams.get("turbineId");
    const parkId = searchParams.get("parkId");

    const turbines = await prisma.turbine.findMany({
      where: {
        // Turbine trägt keine tenantId — die Mandantentrennung läuft über den Park.
        park: { tenantId: check.tenantId! },
        ...(turbineId ? { id: turbineId } : {}),
        ...(parkId ? { parkId } : {}),
      },
      select: {
        id: true,
        designation: true,
        commissioningDate: true,
        mastrNumber: true,
        park: { select: { id: true, name: true, shortName: true } },
        regulatoryProfile: true,
        complianceDeadlines: {
          where: { status: "OPEN" },
          orderBy: { dueDate: "asc" },
          select: { id: true, kind: true, dueDate: true, basis: true, operatingYear: true },
        },
      },
      orderBy: [{ park: { name: "asc" } }, { designation: "asc" }],
    });

    return NextResponse.json({ data: turbines });
  } catch (error) {
    logger.error({ err: error }, "[Regulatory] Stammdaten konnten nicht geladen werden");
    return apiError("FETCH_FAILED", 500, {
      message: "Regulatorik-Stammdaten konnten nicht geladen werden",
    });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.TURBINES_UPDATE);
    if (!check.authorized) return check.error;

    const parsed = putSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe",
        details: { issues: parsed.error.issues },
      });
    }
    const data = parsed.data;

    const turbine = await prisma.turbine.findFirst({
      where: { id: data.turbineId, park: { tenantId: check.tenantId! } },
      select: { id: true, designation: true },
    });
    if (!turbine) {
      return apiError("NOT_FOUND", 404, { message: "Anlage nicht gefunden" });
    }

    const problems: string[] = [];

    const unit = data.mastrUnitNumber?.toUpperCase() || null;
    const plant = data.mastrPlantNumber?.toUpperCase() || null;
    for (const [label, value] of [
      ["Einheitennummer", unit],
      ["Anlagennummer", plant],
    ] as const) {
      if (value && !MASTR_PATTERN.test(value)) {
        problems.push(
          `Die MaStR-${label} „${value}“ hat nicht das erwartete Format (drei Buchstaben, zwölf Ziffern).`,
        );
      }
    }

    const eegKey = data.eegPlantKey?.toUpperCase() || null;
    if (eegKey && eegKey.length !== EEG_KEY_LENGTH) {
      problems.push(
        `Der EEG-Anlagenschlüssel hat ${eegKey.length} statt ${EEG_KEY_LENGTH} Zeichen (§ 3 Nr. 1 HkNRV).`,
      );
    }

    // REGISTERED ohne Nummer ist ein Widerspruch — und einer, der teuer ist:
    // die Liste zeigte „registriert“, während der Zahlungsanspruch fehlt.
    if (data.mastrStatus === "REGISTERED" && !unit) {
      problems.push(
        "Status „registriert“ ohne Einheitennummer. Ohne Registrierung entfällt der Zahlungsanspruch (§ 52 Abs. 1 EEG).",
      );
    }

    if (data.annualReportDay) {
      const [month, day] = data.annualReportDay.split("-").map(Number);
      if (month < 1 || month > 12 || day < 1 || day > 31) {
        problems.push(`„${data.annualReportDay}“ ist kein gültiger Termin im Jahr.`);
      }
    }

    if (
      data.lastChangeReportedAt &&
      data.lastChangeAt &&
      new Date(data.lastChangeReportedAt) < new Date(data.lastChangeAt)
    ) {
      problems.push("Die Meldung kann nicht vor der Änderung liegen.");
    }

    if (problems.length > 0) {
      return apiError("VALIDATION_FAILED", 400, {
        message: problems[0],
        details: { problems },
      });
    }

    const payload = {
      tenantId: check.tenantId!,
      turbineId: data.turbineId,
      mastrUnitNumber: unit,
      mastrPlantNumber: plant,
      mastrStatus: data.mastrStatus,
      mastrRegisteredAt: toDate(data.mastrRegisteredAt),
      lastChangeAt: toDate(data.lastChangeAt),
      lastChangeReportedAt: toDate(data.lastChangeReportedAt),
      eegPlantKey: eegKey,
      scheme: data.scheme,
      awardValueCtPerKwh: data.awardValueCtPerKwh ?? null,
      awardDate: toDate(data.awardDate),
      awardReference: data.awardReference || null,
      siteQualityPercent: data.siteQualityPercent ?? null,
      gridOperator: data.gridOperator || null,
      gridConnectionDate: toDate(data.gridConnectionDate),
      annualReportDay: data.annualReportDay || null,
      notes: data.notes || null,
    };

    const profile = await prisma.regulatoryProfile.upsert({
      where: { turbineId: data.turbineId },
      create: payload,
      update: payload,
    });

    // `Turbine.mastrNumber` wird BEWUSST nicht überschrieben: bestehende
    // Auswertungen lesen das Feld weiter, und ein stiller Doppelschreib würde
    // zwei Wahrheiten erzeugen, ohne dass jemand merkt welche gilt.

    await createAuditLog({
      action: "UPDATE",
      entityType: "Turbine",
      entityId: data.turbineId,
      newValues: {
        mastrUnitNumber: unit,
        mastrStatus: data.mastrStatus,
        eegPlantKey: eegKey,
        scheme: data.scheme,
      },
      description: `Regulatorik-Stammdaten für ${turbine.designation} gesetzt`,
    });

    return NextResponse.json({ profile });
  } catch (error) {
    logger.error({ err: error }, "[Regulatory] Stammdaten konnten nicht gespeichert werden");
    return apiError("UPDATE_FAILED", 500, {
      message: "Regulatorik-Stammdaten konnten nicht gespeichert werden",
    });
  }
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
