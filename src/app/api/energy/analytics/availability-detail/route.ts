import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import type {
  AvailabilityMonthlyDetail,
  DowntimeEvent,
  AvailabilityTarget,
} from "@/types/analytics";
import { apiError } from "@/lib/api-errors";
import {
  computeContractualAvailability,
  SUB_CATEGORIES,
  type TimeBuckets,
  type SubCategory,
} from "@/lib/availability/contractual-availability";

// =============================================================================
// GET /api/energy/analytics/availability-detail
// Drill-down: monthly breakdown, downtime events, contractual vs technical,
// availability targets per park.
// =============================================================================

interface MonthlyRow {
  month_start: Date;
  t1_total: bigint;
  t2_total: bigint;
  t3_total: bigint;
  t4_total: bigint;
  t5_total: bigint;
  t6_total: bigint;
  // Unterkategorien von T5. Sie fehlten hier, weshalb `excludeContractual`
  // gar nicht wirken KONNTE — siehe Kommentar bei der Berechnung unten.
  t5_1_total: bigint;
  t5_2_total: bigint;
  t5_3_total: bigint;
}

/** Nur Unterkategorien duerfen ueber den Query-Parameter ausgeschlossen werden. */
function isSubCategory(value: string): value is SubCategory {
  return (SUB_CATEGORIES as readonly string[]).includes(value);
}

const MONTH_LABELS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function round(val: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;
    const { searchParams } = new URL(request.url);

    const turbineId = searchParams.get("turbineId");
    const parkId = searchParams.get("parkId");
    const yearParam = searchParams.get("year");
    // Categories to exclude from contractual availability (e.g. "t5_1,t5_3")
    const excludeContractual = searchParams.get("excludeContractual")?.split(",") || ["t5_1", "t5_3"];

    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
    if (isNaN(year) || year < 2000 || year > 2100) {
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungültiges Jahr (2000-2100 erwartet)" });
    }

    const from = new Date(Date.UTC(year, 0, 1));
    const to = new Date(Date.UTC(year + 1, 0, 1));

    // --- 1. Monthly detail for a specific turbine ---
    let monthlyDetail: AvailabilityMonthlyDetail[] = [];
    let technicalPct = 0;
    let contractualPct = 0;
    let designation = "";

    if (turbineId) {
      // Verify turbine belongs to tenant (via park)
      const turbine = await prisma.turbine.findFirst({
        where: { id: turbineId, park: { tenantId } },
        select: { id: true, designation: true },
      });
      if (!turbine) {
        return apiError("NOT_FOUND", undefined, { message: "Anlage nicht gefunden" });
      }
      designation = turbine.designation;

      const monthlyRows = await prisma.$queryRaw<MonthlyRow[]>`
        SELECT
          date_trunc('month', date) AS month_start,
          SUM(t1)::bigint AS t1_total,
          SUM(t2)::bigint AS t2_total,
          SUM(t3)::bigint AS t3_total,
          SUM(t4)::bigint AS t4_total,
          SUM(t5)::bigint AS t5_total,
          SUM(t6)::bigint AS t6_total,
          SUM(t5_1)::bigint AS t5_1_total,
          SUM(t5_2)::bigint AS t5_2_total,
          SUM(t5_3)::bigint AS t5_3_total
        FROM scada_availability
        WHERE "tenantId" = ${tenantId}
          AND "turbineId" = ${turbineId}
          AND "periodType" = 'MONTHLY'
          AND date >= ${from}
          AND date < ${to}
        GROUP BY date_trunc('month', date)
        ORDER BY month_start
      `;

      let yearT1 = 0, yearT5 = 0;

      monthlyDetail = monthlyRows.map((r) => {
        const d = new Date(r.month_start);
        const t1 = Number(r.t1_total);
        const t2 = Number(r.t2_total);
        const t3 = Number(r.t3_total);
        const t4 = Number(r.t4_total);
        const t5 = Number(r.t5_total);
        const t6 = Number(r.t6_total);

        yearT1 += t1;
        yearT5 += t5;

        // Technical: T1 / (T1 + T5)
        const techRelevant = t1 + t5;
        const techPct = techRelevant > 0 ? round((t1 / techRelevant) * 100, 2) : 0;

        /*
         * A2 / F21 (Audit 2026-07): Hier stand
         *
         *     const contractPct = techPct;  // simplified
         *
         * Die "vertragliche Verfuegbarkeit" war also die technische unter
         * anderem Namen, und der Parameter `excludeContractual` wurde gelesen,
         * im meta zurueckgegeben und NIE angewandt — die Abfrage holte die
         * Unterkategorien nicht einmal. Bei einer 97-%-Garantie mit Poenale
         * entscheidet genau diese Zahl ueber fuenfstellige Betraege.
         *
         * Jetzt gerechnet mit demselben Kern wie der Jahresabgleich. Die
         * Definition hier ist die technische (nur T1 zaehlt als verfuegbar,
         * T2/T3/T4/T6 fallen heraus) MINUS der angefragten Ausschluesse — was
         * im Vertrag steht, kommt aus AvailabilityGuarantee und nicht aus
         * einem Query-Parameter.
         */
        const monthBuckets: TimeBuckets = {
          t1,
          t2,
          t3,
          t4,
          t5,
          t6,
          t5_1: Number(r.t5_1_total),
          t5_2: Number(r.t5_2_total),
          t5_3: Number(r.t5_3_total),
        };
        const contractual = computeContractualAvailability(monthBuckets, {
          availableCategories: ["t1"],
          excludedCategories: [
            "t2",
            "t3",
            "t4",
            "t6",
            ...(excludeContractual.filter(isSubCategory)),
          ],
        });
        const contractPct = contractual.availabilityPct ?? techPct;

        return {
          month: d.getUTCMonth() + 1,
          year: d.getUTCFullYear(),
          label: MONTH_LABELS[d.getUTCMonth()],
          t1Hours: round(t1 / 3600, 1),
          t2Hours: round(t2 / 3600, 1),
          t3Hours: round(t3 / 3600, 1),
          t4Hours: round(t4 / 3600, 1),
          t5Hours: round(t5 / 3600, 1),
          t6Hours: round(t6 / 3600, 1),
          technicalPct: techPct,
          contractualPct: contractPct,
        };
      });

      const yearRelevant = yearT1 + yearT5;
      technicalPct = yearRelevant > 0 ? round((yearT1 / yearRelevant) * 100, 2) : 0;

      // Jahreswert aus den Monatssummen, nicht als Mittel der Monatswerte:
      // ein Monat mit wenigen Stunden Datengrundlage waehre sonst genauso
      // schwer wie ein voller.
      const yearBuckets: TimeBuckets = monthlyRows.reduce<TimeBuckets>(
        (acc, r) => ({
          t1: acc.t1 + Number(r.t1_total),
          t2: acc.t2 + Number(r.t2_total),
          t3: acc.t3 + Number(r.t3_total),
          t4: acc.t4 + Number(r.t4_total),
          t5: acc.t5 + Number(r.t5_total),
          t6: acc.t6 + Number(r.t6_total),
          t5_1: acc.t5_1 + Number(r.t5_1_total),
          t5_2: acc.t5_2 + Number(r.t5_2_total),
          t5_3: acc.t5_3 + Number(r.t5_3_total),
        }),
        { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t5_1: 0, t5_2: 0, t5_3: 0 },
      );
      const yearContractual = computeContractualAvailability(yearBuckets, {
        availableCategories: ["t1"],
        excludedCategories: ["t2", "t3", "t4", "t6", ...excludeContractual.filter(isSubCategory)],
      });
      contractualPct = yearContractual.availabilityPct ?? technicalPct;
    }

    // --- 2. Downtime events (ScadaStateEvent with isFault=true) ---
    let downtimeEvents: DowntimeEvent[] = [];
    if (turbineId) {
      const events = await prisma.scadaStateEvent.findMany({
        where: {
          tenantId,
          turbineId,
          timestamp: { gte: from, lt: to },
          isFault: true,
        },
        orderBy: { timestamp: "desc" },
        take: 100,
        select: {
          id: true,
          timestamp: true,
          state: true,
          subState: true,
          isFault: true,
          isService: true,
        },
      });

      // Look up status codes for descriptions
      const statusCodes = await prisma.scadaStatusCode.findMany({
        where: { codeType: "STATUS" },
        select: { mainCode: true, subCode: true, description: true, parentLabel: true, timeKey: true },
      });
      const codeMap = new Map(
        statusCodes.map((c) => [`${c.mainCode}-${c.subCode}`, c])
      );

      downtimeEvents = events.map((e) => {
        const code = codeMap.get(`${e.state}-${e.subState}`);
        // Categorize based on timeKey or parentLabel
        let category = "Sonstige";
        if (code?.timeKey === "T4") category = "Wartung";
        else if (code?.timeKey === "T5") category = "Störung";
        else if (code?.timeKey === "T3") category = "Umwelt";
        else if (code?.parentLabel?.toLowerCase().includes("netz")) category = "Netz";
        else if (code?.parentLabel?.toLowerCase().includes("elektr")) category = "Elektrisch";
        else if (code?.parentLabel?.toLowerCase().includes("mech")) category = "Mechanisch";
        else if (e.isService) category = "Wartung";
        else if (e.isFault) category = "Störung";

        return {
          id: e.id,
          timestamp: e.timestamp.toISOString(),
          state: e.state,
          subState: e.subState,
          isFault: e.isFault,
          isService: e.isService,
          description: code?.description || `Status ${e.state}.${e.subState}`,
          category,
        };
      });
    }

    // --- 3. Availability targets per park ---
    const parks = await prisma.park.findMany({
      where: { tenantId, deletedAt: null, ...(parkId ? { id: parkId } : {}) },
      select: {
        id: true,
        name: true,
        metadata: true,
        turbines: { select: { id: true } },
      },
    });

    const targets: AvailabilityTarget[] = [];

    if (parks.length > 0) {
      // Collect all turbine IDs with their park mapping
      const turbineToPark = new Map<string, { parkId: string; parkName: string }>();
      for (const park of parks) {
        for (const t of park.turbines) {
          turbineToPark.set(t.id, { parkId: park.id, parkName: park.name });
        }
      }
      const allTurbineIds = [...turbineToPark.keys()];

      if (allTurbineIds.length > 0) {
        const rows = await prisma.$queryRaw<{ turbineId: string; t1_total: bigint; t5_total: bigint }[]>`
          SELECT
            "turbineId",
            SUM(t1)::bigint AS t1_total,
            SUM(t5)::bigint AS t5_total
          FROM scada_availability
          WHERE "tenantId" = ${tenantId}
            AND "periodType" = 'MONTHLY'
            AND "turbineId" = ANY(${allTurbineIds})
            AND date >= ${from}
            AND date < ${to}
          GROUP BY "turbineId"
        `;

        // Group results by park
        const parkTotals = new Map<string, { t1: number; t5: number }>();
        for (const row of rows) {
          const parkInfo = turbineToPark.get(row.turbineId);
          if (!parkInfo) continue;
          const existing = parkTotals.get(parkInfo.parkId) || { t1: 0, t5: 0 };
          existing.t1 += Number(row.t1_total);
          existing.t5 += Number(row.t5_total);
          parkTotals.set(parkInfo.parkId, existing);
        }

        // Build targets from aggregated data
        for (const park of parks) {
          const totals = parkTotals.get(park.id);
          if (!totals) continue;
          const relevant = totals.t1 + totals.t5;
          const actualPct = relevant > 0 ? round((totals.t1 / relevant) * 100, 2) : 0;
          const meta = (park.metadata as Record<string, unknown>) || {};
          const targetPct = typeof meta.availabilityTargetPct === "number" ? meta.availabilityTargetPct : 97;
          const delta = round(actualPct - targetPct, 2);
          let status: "green" | "yellow" | "red" = "green";
          if (delta < -2) status = "red";
          else if (delta < 0) status = "yellow";
          targets.push({ parkId: park.id, parkName: park.name, targetPct, actualPct, delta, status });
        }
      }
    }

    return NextResponse.json({
      turbineId: turbineId || null,
      designation,
      monthlyDetail,
      technicalPct,
      contractualPct,
      downtimeEvents,
      targets,
      meta: { year, parkId: parkId || "all", excludeContractual },
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden der Verfügbarkeits-Details");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Verfügbarkeits-Details" });
  }
}
