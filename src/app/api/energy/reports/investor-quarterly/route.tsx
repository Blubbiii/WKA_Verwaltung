/**
 * POST /api/energy/reports/investor-quarterly
 *
 * Generates an investor-focused quarterly report PDF.
 * Returns the raw PDF as application/pdf.
 */

import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import {
  InvestorQuarterlyTemplate,
  type InvestorQuarterlyData,
} from "@/lib/pdf/templates/InvestorQuarterlyTemplate";
import { apiLogger as logger } from "@/lib/logger";

const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

const QUARTER_MONTHS: Record<number, number[]> = {
  1: [1, 2, 3],
  2: [4, 5, 6],
  3: [7, 8, 9],
  4: [10, 11, 12],
};

const RequestSchema = z.object({
  parkId: z.string().uuid(),
  fundId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  quarter: z.number().int().min(1).max(4),
});

function hoursInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate() * 24;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Auth
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error!;
    const tenantId = check.tenantId!;

    // 2. Parse body
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Anfrage", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { parkId, fundId, year, quarter } = parsed.data;
    const months = QUARTER_MONTHS[quarter];

    // 3. Fetch park + fund
    const park = await prisma.park.findUnique({
      where: { id: parkId },
      include: {
        turbines: {
          where: { status: "ACTIVE", deviceType: "WEA" },
          orderBy: { designation: "asc" },
          select: { id: true, designation: true, ratedPowerKw: true },
        },
      },
    });
    if (!park) {
      return NextResponse.json({ error: "Park nicht gefunden" }, { status: 404 });
    }

    const fund = await prisma.fund.findUnique({
      where: { id: fundId },
      select: { name: true },
    });
    if (!fund) {
      return NextResponse.json({ error: "Gesellschaft nicht gefunden" }, { status: 404 });
    }

    const turbineIds = park.turbines.map((t) => t.id);

    // 4. Production data for the 3 quarter months
    const productions = await prisma.turbineProduction.findMany({
      where: {
        turbineId: { in: turbineIds },
        year,
        month: { in: months },
        tenantId,
      },
      select: {
        turbineId: true,
        month: true,
        productionKwh: true,
        availabilityPct: true,
      },
    });

    // 5. Wind data
    const startMonth = months[0];
    const endMonth = months[months.length - 1];
    const monthStart = new Date(year, startMonth - 1, 1);
    const monthEnd = new Date(year, endMonth, 0);

    const windData = await prisma.scadaWindSummary.findMany({
      where: {
        turbineId: { in: turbineIds },
        date: { gte: monthStart, lte: monthEnd },
        periodType: "MONTHLY",
      },
      select: { turbineId: true, date: true, meanWindSpeed: true },
    });

    // 6. Revenue (settlements)
    const settlements = await prisma.energySettlement.findMany({
      where: { parkId, year, month: { in: months }, tenantId },
      select: {
        month: true,
        netOperatorRevenueEur: true,
        eegRevenueEur: true,
        dvRevenueEur: true,
      },
    });

    // 7. Previous year same quarter (for YoY comparison)
    const prevProductions = await prisma.turbineProduction.findMany({
      where: {
        turbineId: { in: turbineIds },
        year: year - 1,
        month: { in: months },
        tenantId,
      },
      select: { productionKwh: true },
    });

    // ---- AGGREGATE DATA ----

    // Monthly breakdown
    const monthlyData = months.map((m) => {
      const mProds = productions.filter((p) => p.month === m);
      const mKwh = mProds.reduce((s, p) => s + Number(p.productionKwh), 0);
      const mAvails = mProds
        .map((p) => (p.availabilityPct ? Number(p.availabilityPct) : null))
        .filter((v): v is number => v != null);
      const mWinds = windData
        .filter((w) => new Date(w.date).getMonth() + 1 === m)
        .map((w) => (w.meanWindSpeed ? Number(w.meanWindSpeed) : null))
        .filter((v): v is number => v != null);

      const settlement = settlements.find((s) => s.month === m);

      return {
        name: MONTH_NAMES[m - 1],
        productionMwh: mKwh / 1000,
        availabilityPct:
          mAvails.length > 0
            ? mAvails.reduce((s, v) => s + v, 0) / mAvails.length
            : null,
        windSpeedMs:
          mWinds.length > 0
            ? mWinds.reduce((s, v) => s + v, 0) / mWinds.length
            : null,
        revenueEur: settlement ? Number(settlement.netOperatorRevenueEur) : null,
      };
    });

    // Monthly revenue breakdown (EEG / DV / Total)
    const monthlyRevenue = months.map((m) => {
      const settlement = settlements.find((s) => s.month === m);
      return {
        name: MONTH_NAMES[m - 1],
        eegRevenueEur: settlement?.eegRevenueEur ? Number(settlement.eegRevenueEur) : null,
        dvRevenueEur: settlement?.dvRevenueEur ? Number(settlement.dvRevenueEur) : null,
        totalRevenueEur: settlement ? Number(settlement.netOperatorRevenueEur) : null,
      };
    });

    // Quarter totals
    const totalProductionMwh = monthlyData.reduce((s, m) => s + m.productionMwh, 0);
    const allAvails = monthlyData
      .map((m) => m.availabilityPct)
      .filter((v): v is number => v != null);
    const avgAvailabilityPct =
      allAvails.length > 0
        ? allAvails.reduce((s, v) => s + v, 0) / allAvails.length
        : 0;

    const allWinds = monthlyData
      .map((m) => m.windSpeedMs)
      .filter((v): v is number => v != null);
    const avgWindSpeedMs =
      allWinds.length > 0
        ? allWinds.reduce((s, v) => s + v, 0) / allWinds.length
        : null;

    const totalRevenueEur = settlements.reduce(
      (s, se) => s + Number(se.netOperatorRevenueEur),
      0
    );

    // Capacity factor
    const totalHoursInQuarter = months.reduce((s, m) => s + hoursInMonth(year, m), 0);
    const totalRatedKw = park.turbines.reduce(
      (s, t) => s + (t.ratedPowerKw ? Number(t.ratedPowerKw) : 0),
      0
    );
    const capacityFactor =
      totalRatedKw > 0
        ? ((totalProductionMwh * 1000) / (totalRatedKw * totalHoursInQuarter)) * 100
        : 0;

    // YoY comparison
    const prevTotalKwh = prevProductions.reduce(
      (s, p) => s + Number(p.productionKwh),
      0
    );
    const prevYearProductionMwh =
      prevProductions.length > 0 ? prevTotalKwh / 1000 : null;
    const productionChangePercent =
      prevYearProductionMwh != null && prevYearProductionMwh > 0
        ? ((totalProductionMwh - prevYearProductionMwh) / prevYearProductionMwh) * 100
        : null;

    // ---- BUILD TEMPLATE DATA ----

    const reportData: InvestorQuarterlyData = {
      fundName: fund.name,
      parkName: park.name,
      quarter,
      year,
      totalProductionMwh,
      avgAvailabilityPct,
      totalRevenueEur,
      avgWindSpeedMs,
      capacityFactor,
      months: monthlyData,
      monthlyRevenue,
      prevYearProductionMwh,
      productionChangePercent,
    };

    // ---- RENDER PDF ----
    // Build JSX element outside renderToBuffer to satisfy ESLint no-jsx-in-try-catch
    const template = InvestorQuarterlyTemplate({ data: reportData });
    const pdfBuffer = await renderToBuffer(template);

    const sanitizedParkName = park.name
      .replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, "_")
      .replace(/_+/g, "_")
      .substring(0, 30);
    const filename = `Investorbericht_${sanitizedParkName}_${year}_Q${quarter}.pdf`;

    // Convert NodeJS Buffer to Uint8Array for NextResponse compatibility
    const uint8 = new Uint8Array(pdfBuffer);

    return new NextResponse(uint8, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Investor quarterly report generation failed");
    return NextResponse.json(
      { error: "Fehler bei der Berichterstellung" },
      { status: 500 }
    );
  }
}
