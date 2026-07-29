import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import {
  fetchAvailabilityBreakdown,
  fetchAvailabilityTrend,
  fetchAvailabilityHeatmap,
  fetchDowntimePareto,
} from "@/lib/analytics/module-fetchers";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

// =============================================================================
// GET /api/energy/analytics/availability
// IEC 61400-26 Availability: T1-T6 breakdown, trends, heatmap, pareto
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;
    const { searchParams } = new URL(request.url);

    const parkId = searchParams.get("parkId");
    const yearParam = searchParams.get("year");

    // Validate year
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
    if (isNaN(year) || year < 2000 || year > 2100) {
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungültiges Jahr (2000-2100 erwartet)" });
    }

    // Fetch all data in parallel
    const [breakdown, trend, heatmap, pareto] = await Promise.all([
      fetchAvailabilityBreakdown(tenantId, year, parkId),
      fetchAvailabilityTrend(tenantId, year, parkId),
      fetchAvailabilityHeatmap(tenantId, year, parkId),
      fetchDowntimePareto(tenantId, year, parkId),
    ]);

    // Fleet-Summen aus dem Breakdown.
    // Kennzahl-Definitionen: siehe fetchAvailabilityBreakdown() in module-fetchers.ts
    const totalT1 = breakdown.reduce((s, b) => s + b.t1, 0);
    const totalT4 = breakdown.reduce((s, b) => s + b.t4, 0);
    const totalT5 = breakdown.reduce((s, b) => s + b.t5, 0);
    const totalAll = breakdown.reduce((s, b) => s + b.totalSeconds, 0);

    // Technische Verfügbarkeit: T1 / (T1 + T5), zeitgewichtet über alle Anlagen
    const fleetRelevant = totalT1 + totalT5;
    const avgAvail = fleetRelevant > 0 ? (totalT1 / fleetRelevant) * 100 : 0;

    // Zeitbasierte Verfügbarkeit nach IEC 61400-26-1: (Gesamt − T4 − T5) / Gesamt
    const avgTimeBasedAvail =
      totalAll > 0 ? ((totalAll - totalT4 - totalT5) / totalAll) * 100 : 0;

    return NextResponse.json({
      breakdown,
      trend,
      heatmap,
      pareto,
      fleet: {
        // Beibehalten für Bestandsclients — identisch mit avgTechnicalAvailability
        avgAvailability: Math.round(avgAvail * 100) / 100,
        avgTechnicalAvailability: Math.round(avgAvail * 100) / 100,
        avgTimeBasedAvailability: Math.round(avgTimeBasedAvail * 100) / 100,
        totalProductionHours: Math.round(totalT1 / 3600),
        totalDowntimeHours: Math.round(totalT5 / 3600),
        totalMaintenanceHours: Math.round(totalT4 / 3600),
      },
      meta: {
        year,
        parkId: parkId || "all",
        // Kennzahl explizit benennen, damit sie nicht mit der VERTRAGLICHEN
        // Verfügbarkeit aus dem Wartungsvertrag verwechselt wird.
        availabilityDefinitions: {
          technical: {
            label: "Technische Verfügbarkeit",
            formula: "T1 / (T1 + T5)",
            note: "T2 (Windstille), T3 (Umwelt), T4 (Wartung) und T6 (Sonstiges) sind aus Zähler und Nenner ausgeschlossen. Nicht identisch mit der vertraglichen Verfügbarkeit aus dem Wartungsvertrag.",
          },
          timeBased: {
            label: "Zeitbasierte Verfügbarkeit (IEC 61400-26-1)",
            formula: "(T1+T2+T3+T4+T5+T6 − T4 − T5) / (T1+T2+T3+T4+T5+T6)",
            note: "Windstille zählt als verfügbar; Wartung und Störung als nicht verfügbar. Vertragliche Definitionen können abweichen (Ausschlüsse, Karenzzeiten).",
          },
        },
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden der Verfügbarkeits-Analytics");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Verfügbarkeits-Analytics" });
  }
}
