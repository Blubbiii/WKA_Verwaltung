"use client";

/**
 * ReportLivePreview
 *
 * Live-Preview of the CustomReport PDF using @react-pdf/renderer's PDFViewer.
 * - Browser-only (SSR disabled via next/dynamic).
 * - Renders a MOCK dataset that reflects the currently selected module list
 *   and their order. Real analytics data is intentionally NOT fetched here —
 *   the preview shows the report *structure* so the user can iterate quickly
 *   on module selection, ordering, and per-module config without waiting on
 *   heavy aggregations. The final "Generate PDF" call uses live data.
 */

import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { CustomReportData } from "@/lib/pdf/templates/CustomReportTemplate";
import { CustomReportTemplate } from "@/lib/pdf/templates/CustomReportTemplate";
import { Loader2 } from "lucide-react";

const PDFViewer = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  }
);

// =============================================================================
// Mock-Data Factory
// =============================================================================

function buildMockReportData(params: {
  parkName: string;
  year: number;
  month?: number;
  tenantName: string;
  selectedModules: string[];
}): CustomReportData {
  const { parkName, year, month, tenantName, selectedModules } = params;

  // Small synthetic dataset — enough that all rendered pages have *something*
  // to show. Values are round numbers so the preview looks tidy.
  const mockTurbines = [
    { id: "t1", designation: "WEA-01" },
    { id: "t2", designation: "WEA-02" },
    { id: "t3", designation: "WEA-03" },
  ];

  const monthLabels = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

  return {
    parkName,
    year,
    month,
    generatedAt: new Date().toISOString(),
    tenantName,
    selectedModules,

    performanceKpis: {
      fleet: {
        totalProductionKwh: 12_500_000,
        avgCapacityFactor: 28.4,
        avgSpecificYield: 2400,
        totalInstalledKw: 6000,
        avgWindSpeed: 6.8,
      },
      turbines: mockTurbines.map((t, i) => ({
        turbineId: t.id,
        designation: t.designation,
        parkName,
        ratedPowerKw: 2000,
        productionKwh: 4_200_000 - i * 100_000,
        hoursInPeriod: 8760,
        capacityFactor: 29 - i * 1.5,
        specificYield: 2400 - i * 80,
        avgWindSpeed: 6.8 - i * 0.2,
        dataPoints: 52560,
        dataCompleteness: 98,
      })),
    },

    productionHeatmap: mockTurbines.map((t) => ({
      turbineId: t.id,
      designation: t.designation,
      months: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        year,
        value: 300_000 + Math.round(Math.sin(i / 2) * 100_000),
        normalized: 0.3 + Math.abs(Math.sin(i / 2)) * 0.5,
      })),
    })),

    yearOverYear: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      label: monthLabels[i],
      currentYear: 1_000_000 + Math.round(Math.sin(i / 2) * 200_000),
      previousYear: 950_000 + Math.round(Math.sin(i / 2) * 180_000),
    })),

    availabilityBreakdown: mockTurbines.map((t) => ({
      turbineId: t.id,
      designation: t.designation,
      t1: 8000 * 3600,
      t2: 200 * 3600,
      t3: 100 * 3600,
      t4: 200 * 3600,
      t5: 150 * 3600,
      t6: 110 * 3600,
      t5_1: 0,
      t5_2: 0,
      t5_3: 0,
      availabilityPct: 97.2,
      totalSeconds: 8760 * 3600,
    })),

    availabilityTrend: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      year,
      label: monthLabels[i],
      avgAvailability: 96 + Math.sin(i / 3) * 2,
      turbineCount: 3,
    })),

    availabilityHeatmap: mockTurbines.map((t) => ({
      turbineId: t.id,
      designation: t.designation,
      months: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        year,
        value: 96 + Math.sin(i / 3) * 3,
        normalized: 0.9,
      })),
    })),

    downtimePareto: [
      { category: "t5", label: "Störung", totalSeconds: 500 * 3600, percentage: 45, cumulative: 45 },
      { category: "t2", label: "Windstille", totalSeconds: 300 * 3600, percentage: 27, cumulative: 72 },
      { category: "t4", label: "Wartung", totalSeconds: 200 * 3600, percentage: 18, cumulative: 90 },
      { category: "t3", label: "Umweltstopp", totalSeconds: 80 * 3600, percentage: 7, cumulative: 97 },
      { category: "t6", label: "Sonstige", totalSeconds: 30 * 3600, percentage: 3, cumulative: 100 },
    ],

    turbineComparison: {
      comparison: mockTurbines.map((t, i) => ({
        turbineId: t.id,
        designation: t.designation,
        parkName,
        ratedPowerKw: 2000,
        productionKwh: 4_200_000 - i * 100_000,
        capacityFactor: 29 - i * 1.5,
        specificYield: 2400 - i * 80,
        avgWindSpeed: 6.8 - i * 0.2,
        avgPowerKw: 800 - i * 30,
        deviationFromFleetPct: i === 0 ? 3.5 : i === 1 ? 0 : -3.5,
        rank: i + 1,
      })),
      powerCurves: mockTurbines.map((t) => ({
        turbineId: t.id,
        designation: t.designation,
        curve: Array.from({ length: 20 }, (_, i) => ({
          windSpeed: i,
          avgPowerKw: Math.min(2000, Math.pow(i, 3) * 5),
        })),
      })),
    },

    faultPareto: Array.from({ length: 8 }, (_, i) => ({
      state: 50 + i,
      subState: 0,
      isFault: i < 3,
      label: `Beispielstörung ${i + 1}`,
      totalFrequency: 20 - i * 2,
      totalDurationSeconds: (500 - i * 50) * 3600,
      percentage: 25 - i * 3,
      cumulative: Math.min(100, 25 + i * 10),
    })),

    warningTrend: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      year,
      label: monthLabels[i],
      totalFrequency: 40 + Math.round(Math.cos(i / 2) * 10),
      totalDurationSeconds: 3600 * (100 + Math.round(Math.cos(i / 2) * 20)),
    })),

    windDistribution: Array.from({ length: 20 }, (_, i) => ({
      windSpeedBin: i,
      count: Math.round(1000 * Math.exp(-((i - 6) ** 2) / 10)),
      percentage: 10 * Math.exp(-((i - 6) ** 2) / 10),
    })),

    environmentalData: [
      { direction: "N", directionDeg: 0, avgPowerKw: 400, avgWindSpeed: 5.5, count: 300 },
      { direction: "NE", directionDeg: 45, avgPowerKw: 600, avgWindSpeed: 7.0, count: 500 },
      { direction: "E", directionDeg: 90, avgPowerKw: 500, avgWindSpeed: 6.2, count: 400 },
      { direction: "SE", directionDeg: 135, avgPowerKw: 400, avgWindSpeed: 5.4, count: 300 },
      { direction: "S", directionDeg: 180, avgPowerKw: 800, avgWindSpeed: 8.2, count: 700 },
      { direction: "SW", directionDeg: 225, avgPowerKw: 900, avgWindSpeed: 9.0, count: 1200 },
      { direction: "W", directionDeg: 270, avgPowerKw: 700, avgWindSpeed: 7.8, count: 900 },
      { direction: "NW", directionDeg: 315, avgPowerKw: 500, avgWindSpeed: 6.0, count: 400 },
    ],

    financialOverview: {
      totalRevenueEur: 950_000,
      totalProductionKwh: 12_500_000,
      avgRevenuePerKwh: 0.076,
    },

    revenueComparison: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      year,
      label: monthLabels[i],
      revenueEur: 75_000 + Math.round(Math.sin(i / 2) * 15_000),
      productionKwh: 1_000_000 + Math.round(Math.sin(i / 2) * 200_000),
      revenuePerKwh: 0.075,
    })),

    curtailmentAnalysis: {
      timeSeries: Array.from({ length: 12 }, (_, i) => ({
        bucket: `${year}-${String(i + 1).padStart(2, "0")}`,
        windKw: 100,
        technicalKw: 40,
        forcedKw: 20,
        externalKw: 60,
        lostEnergyKwh: 3000,
        lostRevenueEur: 200,
      })),
      byCategory: [
        { category: "wind", label: "Wind", totalLostKwh: 15_000, totalLostEur: 1_100, pctOfProduction: 0.12 },
        { category: "technical", label: "Technisch", totalLostKwh: 6_000, totalLostEur: 450, pctOfProduction: 0.05 },
        { category: "forced", label: "Forced", totalLostKwh: 3_000, totalLostEur: 220, pctOfProduction: 0.02 },
        { category: "external", label: "Extern (§13a EnWG)", totalLostKwh: 12_000, totalLostEur: 900, pctOfProduction: 0.1 },
      ],
      summary: {
        totalLostKwh: 36_000,
        totalLostEur: 2_670,
        externalRedispatchKwh: 12_000,
        externalRedispatchEur: 900,
        year,
      },
    },

    reactivePowerQuality: {
      timeSeries: Array.from({ length: 12 }, (_, i) => ({
        bucket: `${year}-${String(i + 1).padStart(2, "0")}-01`,
        meanReactiveVar: 40_000,
        meanCosPhi: 0.98,
        cosPhiOutOfRangePct: 2,
        meanFrequencyHz: 50.0,
        frequencyOutOfRangePct: 0.5,
      })),
      summary: {
        totalReactiveEnergyMWh: 120,
        inductiveReactiveEnergyMWh: 80,
        capacitiveReactiveEnergyMWh: 40,
        meanCosPhiOverall: 0.98,
        cosPhiComplianceRate: 98,
        freqComplianceRate: 99.5,
        year,
      },
      hourlyProfile: Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        meanReactiveVar: 40_000 + Math.round(Math.sin(i / 4) * 5000),
        meanCosPhi: 0.98,
      })),
      meta: { year, parkId: "all" },
    },

    meteoExtended: {
      timeSeries: Array.from({ length: 12 }, (_, i) => ({
        bucket: `${year}-${String(i + 1).padStart(2, "0")}-15`,
        meanAirPressureHpa: 1013 + Math.sin(i / 2) * 5,
        meanHumidityPct: 70 + Math.sin(i / 3) * 10,
        meanRainIndex: 2 + Math.abs(Math.sin(i / 2)),
        meanVisibility: 20_000,
        meanBrightnessNight: 0.1,
      })),
      icing: {
        totalIcingHours: 45,
        totalColdIcingHours: 30,
        icingRate: 0.5,
        monthlyIcingHours: Array.from({ length: 12 }, (_, i) => ({
          month: i + 1,
          hours: i < 3 || i > 10 ? 10 - i : 0,
          coldHours: i < 2 || i > 11 ? 5 : 0,
        })),
        peakIcingMonth: { month: 1, hours: 20 },
      },
      summary: {
        year,
        dataAvailability: 97,
      },
    },
  };
}

// =============================================================================
// Component
// =============================================================================

export interface ReportLivePreviewProps {
  parkName: string;
  year: number;
  month?: number;
  tenantName: string;
  selectedModules: string[];
}

export function ReportLivePreview(props: ReportLivePreviewProps) {
  const data = useMemo(
    () =>
      buildMockReportData({
        parkName: props.parkName,
        year: props.year,
        month: props.month,
        tenantName: props.tenantName,
        selectedModules: props.selectedModules,
      }),
    [props.parkName, props.year, props.month, props.tenantName, props.selectedModules]
  );

  if (props.selectedModules.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted/20 text-sm text-muted-foreground p-8 text-center">
        Bitte Module auswählen, um die Live-Preview zu sehen.
      </div>
    );
  }

  return (
    <PDFViewer width="100%" height="100%" showToolbar={false} style={{ border: "none" }}>
      <CustomReportTemplate data={data} />
    </PDFViewer>
  );
}
