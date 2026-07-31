/**
 * GET /api/reports/portfolio-cockpit?from=2022&to=2026 — Matrix Park × Jahr
 *
 * B5 (Audit 2026-07): „Reine Verdichtung vorhandener Daten." Genau das tut
 * diese Route — sie legt kein neues Schema an, sie führt zusammen, was
 * `multi-park-soll-ist`, `park-pl` und die SCADA-Verfügbarkeit einzeln schon
 * zeigen.
 *
 * ## Die Ausschüttung je Park ist eine Zuordnung, keine Summe
 *
 * Ausgeschüttet wird auf Fondsebene, nicht je Park. Ein Fonds kann mehrere
 * Parks halten und ein Park mehreren Fonds gehören. Die Ausschüttung wird
 * deshalb über `FundPark.ownershipPercentage` zugeordnet — und wo diese Quote
 * fehlt, wird NICHT gleichverteilt, sondern die Zelle bleibt leer. Eine
 * geratene Zuordnung wäre in einem Beiratsbericht die falsche Zahl am
 * falschen Park.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { buildCell, summarize, type CockpitInputRow } from "@/lib/portfolio/cockpit";
import type { TimeBuckets } from "@/lib/availability/contractual-availability";

/** Wie viele Jahre die Matrix höchstens umfasst. */
const MAX_YEARS = 10;

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("invoices:read");
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const { searchParams } = new URL(request.url);
    const currentYear = new Date().getFullYear();
    const to = Number(searchParams.get("to")) || currentYear;
    const from = Number(searchParams.get("from")) || to - 4;

    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültiger Zeitraum" });
    }
    if (to - from + 1 > MAX_YEARS) {
      return apiError("VALIDATION_FAILED", 400, {
        message: `Höchstens ${MAX_YEARS} Jahre auf einmal`,
      });
    }

    const years = Array.from({ length: to - from + 1 }, (_, index) => from + index);
    const rangeStart = new Date(Date.UTC(from, 0, 1));
    const rangeEnd = new Date(Date.UTC(to + 1, 0, 1));

    const parks = await prisma.park.findMany({
      where: { tenantId: check.tenantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        shortName: true,
        turbines: { select: { id: true, ratedPowerKw: true, status: true } },
        fundParks: { select: { fundId: true, ownershipPercentage: true } },
      },
      orderBy: { name: "asc" },
    });

    if (parks.length === 0) {
      return NextResponse.json({ years, parks: [], cells: [], summaries: [] });
    }

    const parkIds = parks.map((park) => park.id);
    const turbineIds = parks.flatMap((park) => park.turbines.map((turbine) => turbine.id));
    const fundIds = [...new Set(parks.flatMap((park) => park.fundParks.map((fp) => fp.fundId)))];

    const [settlements, invoices, costAllocations, availability, distributions] = await Promise.all([
      prisma.energySettlement.groupBy({
        by: ["parkId", "year"],
        where: { tenantId: check.tenantId, parkId: { in: parkIds }, year: { gte: from, lte: to } },
        _sum: { totalProductionKwh: true, netOperatorRevenueEur: true },
      }),

      prisma.invoice.findMany({
        where: {
          tenantId: check.tenantId,
          parkId: { in: parkIds },
          invoiceDate: { gte: rangeStart, lt: rangeEnd },
          invoiceType: "INVOICE",
          status: { notIn: ["CANCELLED"] },
          deletedAt: null,
        },
        select: { parkId: true, invoiceDate: true, grossAmount: true, leaseId: true },
      }),

      prisma.parkCostAllocation.findMany({
        where: {
          tenantId: check.tenantId,
          leaseRevenueSettlement: { parkId: { in: parkIds }, year: { gte: from, lte: to } },
        },
        select: {
          totalUsageFeeEur: true,
          leaseRevenueSettlement: { select: { parkId: true, year: true } },
        },
      }),

      turbineIds.length > 0
        ? prisma.scadaAvailability.findMany({
            where: {
              tenantId: check.tenantId,
              turbineId: { in: turbineIds },
              date: { gte: rangeStart, lt: rangeEnd },
              // Nur Tageswerte summieren. Monats- und Jahreszeilen daneben
              // würden dieselbe Zeit ein zweites Mal zählen.
              periodType: "DAILY",
            },
            select: {
              turbineId: true,
              date: true,
              t1: true,
              t2: true,
              t3: true,
              t4: true,
              t5: true,
              t6: true,
              t5_1: true,
              t5_2: true,
              t5_3: true,
            },
          })
        : Promise.resolve([]),

      fundIds.length > 0
        ? prisma.distribution.findMany({
            where: {
              tenantId: check.tenantId,
              fundId: { in: fundIds },
              status: "EXECUTED",
              distributionDate: { gte: rangeStart, lt: rangeEnd },
            },
            select: { fundId: true, distributionDate: true, totalAmount: true },
          })
        : Promise.resolve([]),
    ]);

    // --- Zuordnungstabellen aufbauen ----------------------------------------
    const key = (parkId: string, year: number) => `${parkId}::${year}`;

    const production = new Map<string, number>();
    const energyRevenue = new Map<string, number>();
    for (const row of settlements) {
      production.set(key(row.parkId, row.year), Number(row._sum.totalProductionKwh ?? 0));
      energyRevenue.set(key(row.parkId, row.year), Number(row._sum.netOperatorRevenueEur ?? 0));
    }

    const otherRevenue = new Map<string, number>();
    const leaseCost = new Map<string, number>();
    for (const invoice of invoices) {
      if (!invoice.parkId || !invoice.invoiceDate) continue;
      const year = invoice.invoiceDate.getUTCFullYear();
      const mapKey = key(invoice.parkId, year);
      const amount = Math.abs(Number(invoice.grossAmount));
      // Dieselbe Unterscheidung wie in park-pl: eine Rechnung mit Pachtbezug
      // ist Aufwand, ohne ist sie Ertrag.
      const target = invoice.leaseId ? leaseCost : otherRevenue;
      target.set(mapKey, (target.get(mapKey) ?? 0) + amount);
    }

    const operatingCost = new Map<string, number>();
    for (const allocation of costAllocations) {
      const { parkId, year } = allocation.leaseRevenueSettlement;
      const mapKey = key(parkId, year);
      operatingCost.set(
        mapKey,
        (operatingCost.get(mapKey) ?? 0) + Number(allocation.totalUsageFeeEur),
      );
    }

    const turbineToPark = new Map<string, string>();
    for (const park of parks) {
      for (const turbine of park.turbines) turbineToPark.set(turbine.id, park.id);
    }

    const buckets = new Map<string, TimeBuckets>();
    for (const row of availability) {
      const parkId = turbineToPark.get(row.turbineId);
      if (!parkId) continue;
      const mapKey = key(parkId, row.date.getUTCFullYear());
      const current =
        buckets.get(mapKey) ??
        ({ t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t5_1: 0, t5_2: 0, t5_3: 0 } as TimeBuckets);
      current.t1 += row.t1;
      current.t2 += row.t2;
      current.t3 += row.t3;
      current.t4 += row.t4;
      current.t5 += row.t5;
      current.t6 += row.t6;
      current.t5_1 += row.t5_1;
      current.t5_2 += row.t5_2;
      current.t5_3 += row.t5_3;
      buckets.set(mapKey, current);
    }

    // Ausschüttung je Fonds und Jahr, danach über die Beteiligungsquote auf die
    // Parks verteilt.
    const fundDistribution = new Map<string, number>();
    for (const distribution of distributions) {
      const mapKey = `${distribution.fundId}::${distribution.distributionDate.getUTCFullYear()}`;
      fundDistribution.set(
        mapKey,
        (fundDistribution.get(mapKey) ?? 0) + Number(distribution.totalAmount),
      );
    }

    const distributedByPark = new Map<string, number>();
    const unmappedFunds = new Set<string>();
    for (const park of parks) {
      for (const link of park.fundParks) {
        if (link.ownershipPercentage === null) {
          // NICHT gleichverteilen. Eine geratene Zuordnung wäre in einem
          // Beiratsbericht die falsche Zahl am falschen Park.
          unmappedFunds.add(link.fundId);
          continue;
        }
        const share = Number(link.ownershipPercentage) / 100;
        for (const year of years) {
          const amount = fundDistribution.get(`${link.fundId}::${year}`);
          if (amount === undefined) continue;
          const mapKey = key(park.id, year);
          distributedByPark.set(mapKey, (distributedByPark.get(mapKey) ?? 0) + amount * share);
        }
      }
    }

    // --- Zellen bauen --------------------------------------------------------
    const cells = parks.flatMap((park) => {
      const installedKw = park.turbines
        .filter((turbine) => turbine.status === "ACTIVE")
        .reduce((sum, turbine) => sum + Number(turbine.ratedPowerKw ?? 0), 0);

      return years.map((year) => {
        const mapKey = key(park.id, year);
        const productionKwh = production.get(mapKey) ?? null;
        const energy = energyRevenue.get(mapKey);
        const other = otherRevenue.get(mapKey);

        const row: CockpitInputRow = {
          parkId: park.id,
          parkName: park.shortName || park.name,
          year,
          productionKwh: productionKwh && productionKwh > 0 ? productionKwh : null,
          // Es gibt kein Feld dafür — siehe cockpit.ts.
          forecastKwh: null,
          revenueEur:
            energy === undefined && other === undefined ? null : (energy ?? 0) + (other ?? 0),
          operatingCostEur: operatingCost.get(mapKey) ?? null,
          leaseCostEur: leaseCost.get(mapKey) ?? null,
          availability: buckets.get(mapKey) ?? null,
          distributedEur: distributedByPark.get(mapKey) ?? null,
          installedKw: installedKw > 0 ? installedKw : null,
        };

        return buildCell(row);
      });
    });

    const summaries = years.map((year) => summarize(cells, year));

    const warnings: string[] = [];
    if (unmappedFunds.size > 0) {
      warnings.push(
        `${unmappedFunds.size} Gesellschaft(en) haben keine Beteiligungsquote am Park hinterlegt. Ihre Ausschüttungen sind keinem Park zugeordnet und fehlen in der Ausschüttungsquote — sie werden NICHT gleichverteilt.`,
      );
    }

    return NextResponse.json({
      years,
      parks: parks.map((park) => ({ id: park.id, name: park.shortName || park.name })),
      cells,
      summaries,
      warnings,
    });
  } catch (error) {
    logger.error({ err: error }, "[Cockpit] Portfolio-Matrix konnte nicht erstellt werden");
    return apiError("FETCH_FAILED", 500, {
      message: "Portfolio-Cockpit konnte nicht geladen werden",
    });
  }
}
