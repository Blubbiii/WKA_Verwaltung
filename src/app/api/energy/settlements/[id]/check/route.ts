/**
 * POST /api/energy/settlements/[id]/check — Dreiecksabgleich rechnen
 * GET  /api/energy/settlements/[id]/check — letzten Abgleich laden
 *
 * A3 (Audit 2026-07): Heute werden die Zahlen der Netzbetreiber-Abrechnung
 * abgetippt und geglaubt. Diese Route hält die Gegenrechnung dagegen —
 * abgerechnete Menge gegen SCADA gegen erfasste Produktion, abgerechneter Satz
 * gegen den hinterlegten.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import { loadSourceQuantities } from "@/lib/settlement-check/check-service";
import {
  reconcile,
  DEFAULT_TOLERANCES,
  type ReconciliationTolerances,
} from "@/lib/settlement-check/reconciliation";

const bodySchema = z.object({
  tolerances: z
    .object({
      quantityPct: z.number().min(0).max(100),
      quantityFloorKwh: z.number().min(0),
      revenuePct: z.number().min(0).max(100),
      revenueFloorEur: z.number().min(0),
    })
    .partial()
    .optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission(PERMISSIONS.ENERGY_READ);
    if (!check.authorized) return check.error;

    const { id } = await params;

    const latest = await prisma.settlementCheck.findFirst({
      where: { settlementId: id, tenantId: check.tenantId! },
      orderBy: { createdAt: "desc" },
      include: { reviewedBy: { select: { id: true, firstName: true, lastName: true } } },
    });

    return NextResponse.json({ data: latest });
  } catch (error) {
    logger.error({ err: error }, "[SettlementCheck] Laden fehlgeschlagen");
    return apiError("FETCH_FAILED", 500, { message: "Abgleich konnte nicht geladen werden" });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission(PERMISSIONS.ENERGY_SETTLEMENT_CHECK);
    if (!check.authorized) return check.error;

    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        message: "Ungültige Toleranzen",
        details: parsed.error.issues,
      });
    }

    const tolerances: ReconciliationTolerances = {
      ...DEFAULT_TOLERANCES,
      ...(parsed.data.tolerances ?? {}),
    };

    const settlement = await prisma.energySettlement.findFirst({
      where: { id, tenantId: check.tenantId! },
      select: {
        id: true,
        parkId: true,
        year: true,
        month: true,
        totalProductionKwh: true,
        netOperatorRevenueEur: true,
        park: { select: { name: true, shortName: true } },
      },
    });

    if (!settlement) {
      return apiError("NOT_FOUND", 404, { message: "Abrechnung nicht gefunden" });
    }

    const sources = await loadSourceQuantities({
      tenantId: check.tenantId!,
      parkId: settlement.parkId,
      year: settlement.year,
      month: settlement.month,
    });

    const settledKwh = Number(settlement.totalProductionKwh);
    const settledRevenue = Number(settlement.netOperatorRevenueEur);

    const result = reconcile({
      settled: {
        productionKwh: Number.isFinite(settledKwh) ? settledKwh : null,
        revenueEur: Number.isFinite(settledRevenue) ? settledRevenue : null,
      },
      scadaKwh: sources.scadaKwh,
      reportedKwh: sources.reportedKwh,
      expectedRatePerKwh: sources.expectedRatePerKwh,
      tolerances,
    });

    const expectedRevenue =
      sources.expectedRatePerKwh !== null && Number.isFinite(settledKwh)
        ? Math.round(sources.expectedRatePerKwh * settledKwh * 100) / 100
        : null;

    // Jeder Lauf wird als eigener Datensatz festgehalten und ersetzt nicht den
    // vorherigen: die SCADA-Daten können nachgeliefert werden, und dann stimmt
    // eine nachgerechnete Zahl nicht mehr mit der überein, die beim
    // Reklamieren vorlag.
    const stored = await prisma.settlementCheck.create({
      data: {
        tenantId: check.tenantId!,
        settlementId: id,
        settledKwh: Number.isFinite(settledKwh) ? settledKwh : null,
        scadaKwh: sources.scadaKwh,
        reportedKwh: sources.reportedKwh,
        settledRevenueEur: Number.isFinite(settledRevenue) ? settledRevenue : null,
        expectedRatePerKwh: sources.expectedRatePerKwh,
        expectedRevenueEur: expectedRevenue,
        findings: result.findings as unknown as object,
        worstSeverity: result.worstSeverity,
        interpretation: result.interpretation,
        tolerances: {
          ...tolerances,
          scadaSource: sources.scadaSource,
          rateSource: sources.rateSource,
          notes: sources.notes,
        },
      },
    });

    await createAuditLog({
      action: "VIEW",
      entityType: "EnergySettlement",
      entityId: id,
      description: `Abrechnungsabgleich ${settlement.year}${
        settlement.month ? `-${String(settlement.month).padStart(2, "0")}` : ""
      }: ${result.worstSeverity}`,
    });

    logger.info(
      {
        settlementId: id,
        worstSeverity: result.worstSeverity,
        availableSources: result.availableSources,
        scadaSource: sources.scadaSource,
      },
      "[SettlementCheck] Abgleich gerechnet",
    );

    return NextResponse.json({
      check: stored,
      findings: result.findings,
      worstSeverity: result.worstSeverity,
      interpretation: result.interpretation,
      availableSources: result.availableSources,
      // Die Hinweise zur Datenherkunft gehören vor die Augen des Bearbeiters:
      // eine Menge aus der Leistungsintegration ist weniger belastbar als eine
      // aus dem Zählwerk.
      sourceNotes: sources.notes,
      scadaSource: sources.scadaSource,
      rateSource: sources.rateSource,
    });
  } catch (error) {
    logger.error({ err: error }, "[SettlementCheck] Abgleich fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, { message: "Abgleich konnte nicht gerechnet werden" });
  }
}
