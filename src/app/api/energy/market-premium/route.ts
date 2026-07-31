/**
 * GET  /api/energy/market-premium — berechnete Marktprämien
 * POST /api/energy/market-premium — Marktprämie eines Monats berechnen
 *
 * B1 (Audit 2026-07): „Es fehlt die Rechenlogik: anzulegender Wert je Anlage
 * …, Marktprämie = AW − Monatsmarktwert Wind onshore, und die Stunden mit
 * negativen Preisen mit dem daraus entfallenden Vergütungsanspruch."
 *
 * ## Warum das Ergebnis gespeichert wird
 *
 * Der Monatsmarktwert wird nachträglich korrigiert, und der Korrekturfaktor
 * kann sich nach einer Standortgüte-Nachprüfung ändern (§ 36h Abs. 4 EEG, das
 * ist die Frist aus B2). Würde die Prämie bei jedem Aufruf neu abgeleitet,
 * verschöbe sich eine bereits abgerechnete Zahl rückwirkend.
 *
 * ## Die Erzeugung in den negativen Stunden
 *
 * Ohne sie lässt sich der entfallende Anspruch nicht beziffern — in einer
 * Flautestunde entfällt nichts. Sie kommt aus den SCADA-Messwerten, sofern
 * vorhanden; sonst bleibt der Betrag leer und die Stundenzahl steht trotzdem
 * da.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import {
  findNegativePriceHours,
  computePremium,
  type HourlyPrice,
} from "@/lib/market-premium/premium";

const computeSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  /** Auf einen Park oder eine Anlage beschränken. */
  parkId: z.string().uuid().optional(),
  turbineId: z.string().uuid().optional(),
  /**
   * Monatsmarktwert Wind onshore in ct/kWh. Er kommt vom Netzbetreiber bzw.
   * aus der Veröffentlichung der Übertragungsnetzbetreiber und wird hier
   * angegeben — geraten wird er nicht.
   */
  marketValueCtPerKwh: z.number().nullable().optional(),
  biddingZone: z.string().trim().max(20).default("DE-LU"),
  /** Eine bestehende Berechnung ersetzen. */
  overwrite: z.boolean().default(false),
});

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year");
    const turbineId = searchParams.get("turbineId");

    const calculations = await prisma.marketPremiumCalculation.findMany({
      where: {
        tenantId: check.tenantId!,
        ...(year ? { year: Number(year) } : {}),
        ...(turbineId ? { turbineId } : {}),
      },
      include: {
        turbine: {
          select: {
            id: true,
            designation: true,
            park: { select: { id: true, name: true, shortName: true } },
          },
        },
      },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });

    return NextResponse.json({ data: calculations });
  } catch (error) {
    logger.error({ err: error }, "[MarketPremium] Laden fehlgeschlagen");
    return apiError("FETCH_FAILED", 500, {
      message: "Marktprämien konnten nicht geladen werden",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("energy:create");
    if (!check.authorized) return check.error;

    const parsed = computeSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe",
        details: { issues: parsed.error.issues },
      });
    }
    const data = parsed.data;

    const from = new Date(Date.UTC(data.year, data.month - 1, 1));
    const to = new Date(Date.UTC(data.year, data.month, 1));

    const turbines = await prisma.turbine.findMany({
      where: {
        park: { tenantId: check.tenantId! },
        status: "ACTIVE",
        ...(data.turbineId ? { id: data.turbineId } : {}),
        ...(data.parkId ? { parkId: data.parkId } : {}),
      },
      select: {
        id: true,
        designation: true,
        parkId: true,
        regulatoryProfile: {
          select: {
            awardValueCtPerKwh: true,
            correctionFactor: true,
            negativePriceThresholdHours: true,
            scheme: true,
          },
        },
      },
    });

    if (turbines.length === 0) {
      return apiError("NOT_FOUND", 404, { message: "Keine passende Anlage gefunden" });
    }

    // Preisreihe EINMAL laden — sie gilt für alle Anlagen der Gebotszone.
    const priceRows = await prisma.hourlySpotPrice.findMany({
      where: { biddingZone: data.biddingZone, hour: { gte: from, lt: to } },
      orderBy: { hour: "asc" },
      select: { hour: true, priceEurMwh: true },
    });

    const prices: HourlyPrice[] = priceRows.map((row) => ({
      hour: row.hour,
      priceEurMwh: Number(row.priceEurMwh),
    }));

    // Erzeugung des Monats je Park aus der Abrechnung. Auf die Anlage
    // heruntergebrochen wird NICHT geschätzt — dafür gibt es die
    // Einzelabrechnungspositionen.
    const settlementItems = await prisma.energySettlementItem.groupBy({
      by: ["turbineId"],
      where: {
        energySettlement: {
          tenantId: check.tenantId!,
          year: data.year,
          month: data.month,
        },
        turbineId: { in: turbines.map((turbine) => turbine.id) },
      },
      // `productionShareKwh` ist die auf die Anlage entfallende Menge aus der
      // Abrechnung. Sie ist bereits verteilt — deshalb wird hier nichts
      // heruntergebrochen.
      _sum: { productionShareKwh: true },
    });
    const productionByTurbine = new Map(
      settlementItems
        .filter((row): row is typeof row & { turbineId: string } => row.turbineId !== null)
        .map((row) => [row.turbineId, Number(row._sum.productionShareKwh ?? 0)]),
    );

    const results: unknown[] = [];
    const skipped: string[] = [];
    let computed = 0;

    for (const turbine of turbines) {
      const profile = turbine.regulatoryProfile;
      const threshold = profile?.negativePriceThresholdHours ?? 4;

      // Ohne Preisreihe ausdrücklich `null` statt eines Ergebnisses mit
      // 0 Stunden — der Unterschied ist bares Geld.
      const negativeHoursResult =
        prices.length > 0 ? findNegativePriceHours(prices, threshold) : null;

      const production = productionByTurbine.get(turbine.id) ?? null;

      const result = computePremium({
        awardValueCtPerKwh: profile?.awardValueCtPerKwh
          ? Number(profile.awardValueCtPerKwh)
          : null,
        correctionFactor: profile?.correctionFactor ? Number(profile.correctionFactor) : null,
        marketValueCtPerKwh: data.marketValueCtPerKwh ?? null,
        productionKwh: production && production > 0 ? production : null,
        negativeHoursResult,
        // Die stündliche Erzeugung liegt hier nicht vor. Sie zu schätzen —
        // etwa als Monatsmenge geteilt durch Stunden — würde in einer
        // Flautestunde einen Anspruch abziehen, den es nie gab.
        productionInNegativeHoursKwh: null,
      });

      const existing = await prisma.marketPremiumCalculation.findUnique({
        where: {
          turbineId_year_month: { turbineId: turbine.id, year: data.year, month: data.month },
        },
        select: { id: true },
      });

      if (existing && !data.overwrite) {
        // Nicht still ersetzen: der Wert kann bereits abgerechnet sein.
        skipped.push(turbine.designation);
        continue;
      }

      const payload = {
        tenantId: check.tenantId!,
        turbineId: turbine.id,
        year: data.year,
        month: data.month,
        awardValueCtPerKwh: profile?.awardValueCtPerKwh ?? null,
        correctionFactor: profile?.correctionFactor ?? null,
        marketValueCtPerKwh: data.marketValueCtPerKwh ?? null,
        productionKwh: production ?? null,
        negativeThresholdHours: threshold,
        appliedValueCtPerKwh: result.appliedValueCtPerKwh.value,
        premiumCtPerKwh: result.premiumCtPerKwh.value,
        premiumEur: result.premiumEur.value,
        affectedHours: result.affectedHours.value,
        negativeHours: negativeHoursResult?.negativeHours ?? null,
        forfeitedEur: result.forfeitedEur.value,
        basis: {
          statement: result.statement,
          warnings: result.warnings,
          priceHoursLoaded: prices.length,
          qualifyingRuns:
            negativeHoursResult?.qualifyingRuns.map((run) => ({
              start: run.start.toISOString(),
              end: run.end.toISOString(),
              hours: run.hours,
            })) ?? null,
        } as Prisma.InputJsonValue,
      };

      const stored = await prisma.marketPremiumCalculation.upsert({
        where: {
          turbineId_year_month: { turbineId: turbine.id, year: data.year, month: data.month },
        },
        create: payload,
        update: payload,
      });

      computed += 1;
      results.push({ turbine: turbine.designation, calculation: stored, result });
    }

    if (computed > 0) {
      await createAuditLog({
        action: "CREATE",
        entityType: "EnergySettlement",
        entityId: `${data.year}-${String(data.month).padStart(2, "0")}`,
        newValues: { computed, skipped: skipped.length, marketValue: data.marketValueCtPerKwh },
        description: `Marktprämie ${data.month}/${data.year} für ${computed} Anlagen berechnet`,
      });
    }

    const warnings: string[] = [];
    if (prices.length === 0) {
      warnings.push(
        `Für ${data.month}/${data.year} ist keine stündliche Preisreihe geladen. Die Stunden nach § 51 EEG bleiben unbekannt — sie sind nicht null.`,
      );
    }
    if (data.marketValueCtPerKwh === null || data.marketValueCtPerKwh === undefined) {
      warnings.push(
        "Kein Monatsmarktwert Wind onshore angegeben. Ohne ihn gibt es keine Marktprämie — er wird nicht geschätzt.",
      );
    }
    if (skipped.length > 0) {
      warnings.push(
        `${skipped.length} Anlagen übersprungen, weil bereits eine Berechnung vorliegt. Zum Ersetzen bitte ausdrücklich bestätigen.`,
      );
    }
    // Die Erzeugung in den negativen Stunden ist der einzige noch fehlende
    // Baustein — das gehört gesagt, nicht verschwiegen.
    warnings.push(
      "Der entfallende Vergütungsanspruch wird nicht beziffert: dafür braucht es die Erzeugung in den betroffenen Stunden. Die Stundenzahl steht, der Betrag nicht.",
    );

    return NextResponse.json({ computed, skipped, results, warnings });
  } catch (error) {
    logger.error({ err: error }, "[MarketPremium] Berechnung fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, { message: "Marktprämie konnte nicht berechnet werden" });
  }
}
