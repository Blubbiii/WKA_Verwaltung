/**
 * Multi-Park Soll/Ist-Vergleich (Energie-MWh).
 *
 * Aggregiert pro aktivem Park:
 *   - Ist-MWh: Σ EnergySettlement.totalProductionKwh (für das Jahr, FINAL/POSTED)
 *   - Soll-MWh: Σ (Turbine.ratedPowerKw × Jahresstunden × Reference-Capacity-Factor)
 *
 * Reference-Capacity-Factor:
 *   - Standardwert 0.25 (typisch Onshore-Wind)
 *   - Über Query-Param ?cf=0.27 anpassbar
 *
 * Optional ?year=YYYY (default: aktuelles Jahr).
 *
 * KEINE Schema-Änderung — nutzt bestehende Tables (Park, Turbine,
 * EnergySettlement). Falls in Zukunft ein per-park "Soll-MWh"-Plan
 * gepflegt wird, kann der Soll-Wert aus diesem Plan übersteuert werden.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client-runtime-utils";

const HOURS_PER_YEAR = 8760;
const DEFAULT_CAPACITY_FACTOR = 0.25;

function toNum(d: Decimal | null | undefined): number {
  if (!d) return 0;
  return typeof d === "number" ? d : Number(d);
}

export interface MultiParkSollIstRow {
  parkId: string;
  parkName: string;
  parkShortName: string | null;
  activeTurbines: number;
  capacityKw: number;
  /** Plan / Soll in MWh */
  sollMwh: number;
  /** Ist in MWh (aus EnergySettlement) */
  istMwh: number;
  /** Differenz in MWh (Ist - Soll) */
  diffMwh: number;
  /** Abweichung in % vom Soll */
  deviationPct: number | null;
  /** Ampel-Wert: green/amber/red basierend auf Abweichung */
  trafficLight: "green" | "amber" | "red";
}

export interface MultiParkSollIstResult {
  year: number;
  capacityFactor: number;
  rows: MultiParkSollIstRow[];
  totals: {
    sollMwh: number;
    istMwh: number;
    diffMwh: number;
    deviationPct: number | null;
  };
}

/**
 * Ampel-Logik:
 *   green:  ≥ -5 %  (Soll knapp verfehlt oder übertroffen)
 *   amber:  -15 % … -5 %
 *   red:    < -15 %
 */
function trafficLight(deviationPct: number | null): "green" | "amber" | "red" {
  if (deviationPct === null) return "amber";
  if (deviationPct >= -5) return "green";
  if (deviationPct >= -15) return "amber";
  return "red";
}

// GET /api/buchhaltung/multi-park-soll-ist?year=2026&cf=0.25
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const cfParam = searchParams.get("cf");

    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return apiError("BAD_REQUEST", 400, { message: "Ungültiges Jahr" });
    }
    const cf = cfParam ? parseFloat(cfParam) : DEFAULT_CAPACITY_FACTOR;
    if (!Number.isFinite(cf) || cf <= 0 || cf > 1) {
      return apiError("BAD_REQUEST", 400, { message: "Ungültiger Capacity-Factor (0…1)" });
    }

    // 1) Aktive Parks mit aktiven Turbinen laden
    const parks = await prisma.park.findMany({
      where: {
        tenantId: check.tenantId!,
        status: "ACTIVE",
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        shortName: true,
        turbines: {
          where: { status: "ACTIVE" },
          select: { ratedPowerKw: true },
        },
      },
      orderBy: { name: "asc" },
    });

    // 2) Ist-MWh pro Park aus EnergySettlement
    const settlements = await prisma.energySettlement.groupBy({
      by: ["parkId"],
      where: {
        tenantId: check.tenantId!,
        year,
        parkId: { in: parks.map((p) => p.id) },
        // status: { in: ["FINAL", "POSTED"] }, // optional — alle Settlements zählen
      },
      _sum: { totalProductionKwh: true },
    });

    const istByPark = new Map<string, number>();
    for (const s of settlements) {
      istByPark.set(s.parkId, toNum(s._sum.totalProductionKwh as Decimal));
    }

    // 3) Rows bauen
    const rows: MultiParkSollIstRow[] = parks.map((park) => {
      const capacityKw = park.turbines.reduce(
        (sum, t) => sum + toNum(t.ratedPowerKw as Decimal | null),
        0,
      );
      // Soll = kW × h × CF / 1000 = MWh
      const sollMwh = (capacityKw * HOURS_PER_YEAR * cf) / 1000;
      const istKwh = istByPark.get(park.id) ?? 0;
      const istMwh = istKwh / 1000;
      const diffMwh = istMwh - sollMwh;
      const deviationPct = sollMwh !== 0 ? (diffMwh / sollMwh) * 100 : null;

      return {
        parkId: park.id,
        parkName: park.name,
        parkShortName: park.shortName,
        activeTurbines: park.turbines.length,
        capacityKw,
        sollMwh,
        istMwh,
        diffMwh,
        deviationPct,
        trafficLight: trafficLight(deviationPct),
      };
    });

    // 4) Totals
    const totalSoll = rows.reduce((sum, r) => sum + r.sollMwh, 0);
    const totalIst = rows.reduce((sum, r) => sum + r.istMwh, 0);
    const totalDiff = totalIst - totalSoll;
    const totalDevPct = totalSoll !== 0 ? (totalDiff / totalSoll) * 100 : null;

    const result: MultiParkSollIstResult = {
      year,
      capacityFactor: cf,
      rows,
      totals: {
        sollMwh: totalSoll,
        istMwh: totalIst,
        diffMwh: totalDiff,
        deviationPct: totalDevPct,
      },
    };

    return NextResponse.json({ data: result });
  } catch (error) {
    logger.error({ err: error }, "Error generating multi-park Soll/Ist comparison");
    return apiError("INTERNAL_ERROR", 500, { message: "Interner Serverfehler" });
  }
}
