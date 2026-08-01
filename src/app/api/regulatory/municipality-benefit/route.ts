/**
 * GET /api/regulatory/municipality-benefit?year=YYYY
 *
 * Gemeindebeteiligung nach § 6 EEG für ein Jahr.
 *
 * Bemessungsgrundlage ist die eingespeiste Menge zuzüglich der fiktiven Menge
 * aus Abregelung. Beides kommt aus verschiedenen Quellen — `TurbineProduction`
 * und `CurtailmentEvent` —, und beide können lückenhaft sein. Die Antwort
 * unterscheidet deshalb „keine Abregelung" von „Abregelung nicht bewertet":
 * im ersten Fall stimmt die Zahlung, im zweiten ist sie zu niedrig.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import {
  computeMunicipalityBenefit,
  type TurbineBenefitInput,
} from "@/lib/regulatory/municipality-benefit";

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.TURBINES_READ);
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const { searchParams } = new URL(request.url);
    const year = Number.parseInt(
      searchParams.get("year") ?? String(new Date().getFullYear()),
      10,
    );
    if (!Number.isFinite(year) || year < 1990 || year > 2100) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültiges Jahr" });
    }

    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

    // Nur Anlagen mit Vereinbarung — ohne Vereinbarung gibt es nichts zu
    // zahlen, und eine leere Zeile wäre kein Ergebnis, sondern Rauschen.
    const turbines = await prisma.turbine.findMany({
      where: {
        park: { tenantId: check.tenantId },
        municipalityBenefits: { some: {} },
        // Nur echte Windkraftanlagen — siehe capacity-by-municipality.
        // Der 2.500-m-Umkreis haengt am Turm; ein Parkrechner hat keinen.
        deviceType: "WEA",
      },
      select: {
        id: true,
        designation: true,
        park: { select: { name: true } },
        turbineProductions: {
          where: { year, status: { not: "DRAFT" } },
          select: { productionKwh: true },
        },
        curtailmentEvents: {
          where: { startAt: { gte: yearStart, lte: yearEnd } },
          select: { lostWorkKwh: true },
        },
        municipalityBenefits: {
          where: {
            OR: [{ validFrom: null }, { validFrom: { lte: yearEnd } }],
            AND: [{ OR: [{ validUntil: null }, { validUntil: { gte: yearStart } }] }],
          },
          select: {
            areaShare: true,
            rateCtPerKwh: true,
            municipality: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ park: { name: "asc" } }, { designation: "asc" }],
    });

    const input: TurbineBenefitInput[] = turbines.map((t) => {
      const producedKwh =
        t.turbineProductions.length === 0
          ? null
          : t.turbineProductions.reduce((sum, p) => sum + Number(p.productionKwh), 0);

      const hadCurtailment = t.curtailmentEvents.length > 0;
      // `null` bei irgendeinem Ereignis heisst „nicht bewertet" — dann ist die
      // Summe unvollständig und wird als unbekannt gemeldet, statt die
      // bewerteten Anteile als Gesamtwert auszugeben.
      const anyUnvalued = t.curtailmentEvents.some((e) => e.lostWorkKwh === null);
      const curtailedKwh = !hadCurtailment
        ? 0
        : anyUnvalued
          ? null
          : t.curtailmentEvents.reduce((s, e) => s + Number(e.lostWorkKwh), 0);

      return {
        turbineId: t.id,
        designation: t.designation,
        parkName: t.park.name,
        producedKwh,
        curtailedKwh,
        hadCurtailment,
        agreements: t.municipalityBenefits.map((b) => ({
          municipalityId: b.municipality.id,
          municipalityName: b.municipality.name,
          areaShare: Number(b.areaShare),
          rateCtPerKwh: Number(b.rateCtPerKwh),
        })),
      };
    });

    const result = computeMunicipalityBenefit(input);

    logger.info(
      {
        tenantId: check.tenantId,
        year,
        municipalities: result.rows.length,
        totalEur: result.totalEur,
      },
      "Gemeindebeteiligung § 6 EEG ermittelt",
    );

    return NextResponse.json({ year, ...result });
  } catch (error) {
    logger.error({ err: error }, "Gemeindebeteiligung fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, {
      message: "Auswertung konnte nicht erstellt werden",
    });
  }
}
