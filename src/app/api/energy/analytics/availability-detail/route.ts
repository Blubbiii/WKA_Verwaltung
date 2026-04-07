import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import type {
  AvailabilityMonthlyDetail,
  DowntimeEvent,
  AvailabilityTarget,
} from "@/types/analytics";

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
}

interface ParkAvailRow {
  parkId: string;
  parkName: string;
  t1_total: bigint;
  t5_total: bigint;
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
      return NextResponse.json(
        { error: "Ungültiges Jahr (2000-2100 erwartet)" },
        { status: 400 }
      );
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
        return NextResponse.json({ error: "Anlage nicht gefunden" }, { status: 404 });
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
          SUM(t6)::bigint AS t6_total
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

        // Contractual: exclude force majeure categories from T5
        // For now simplified: contractual = technical (can be refined with sub-category data)
        const contractPct = techPct;

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
      contractualPct = technicalPct; // Simplified — same as technical without sub-categories
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
    return NextResponse.json(
      { error: "Fehler beim Laden der Verfügbarkeits-Details" },
      { status: 500 }
    );
  }
}
