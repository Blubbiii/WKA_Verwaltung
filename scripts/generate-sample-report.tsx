/**
 * Generate a sample monthly report PDF with mock data.
 * Run: npx tsx scripts/generate-sample-report.tsx
 */

import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { MonthlyReportTemplate } from "../src/lib/pdf/templates/MonthlyReportTemplate";
import type { MonthlyReportData } from "../src/lib/pdf/templates/MonthlyReportTemplate";
import fs from "fs";
import path from "path";

// Mock letterhead and template (minimal, no background PDF)
const mockLetterhead = {
  marginTop: 60,
  marginBottom: 40,
  marginLeft: 40,
  marginRight: 40,
  headerHeight: 0,
  footerHeight: 30,
  logoWidth: 100,
  logoMarginTop: 10,
  logoMarginLeft: 40,
  logoPosition: "top-left" as const,
  headerImageUrl: null,
  footerImageUrl: null,
  backgroundPdfKey: null,
  footerText: null,
  companyInfo: null,
};

const mockTemplate = {
  layout: {
    sections: {
      header: { showLogo: false, showCompanyName: false },
      footer: { showBankDetails: false, showTaxDisclaimer: false },
    },
    taxExemptDisclaimer: "",
  },
  footerText: null,
};

// Sample turbine data for a fictional wind park
const turbineNames = ["WKA-01", "WKA-02", "WKA-03", "WKA-04", "WKA-05", "WKA-06", "WKA-07", "WKA-08"];

const mockData: MonthlyReportData = {
  parkName: "Windpark Nordheide",
  parkAddress: "Nordheider Weg 12, 21274 Undeloh",
  fundName: "Windpark Nordheide GmbH & Co. KG",
  operatorName: "NordWind Betriebsführung GmbH",
  year: 2026,
  month: 2,
  monthName: "Februar",

  // KPIs
  totalProductionMwh: 4832.7,
  avgAvailabilityPct: 96.4,
  avgWindSpeedMs: 7.8,
  specificYieldKwhPerKw: 282,
  totalRevenueEur: 412580.50,

  // Previous year comparison
  prevYearProductionMwh: 4215.3,
  prevYearAvailabilityPct: 94.8,
  prevYearWindSpeedMs: 7.2,
  prevYearRevenueEur: 358920.00,

  // Per-turbine production
  turbineProduction: turbineNames.map((name, i) => {
    const base = 550 + Math.sin(i * 1.5) * 120;
    const prod = Math.round(base * 100) / 100;
    return {
      turbineId: `turb-${i + 1}`,
      designation: name,
      productionMwh: prod,
      operatingHours: Math.round(500 + Math.random() * 150),
      availabilityPct: Math.round((93 + Math.random() * 6) * 10) / 10,
      capacityFactor: Math.round((25 + Math.random() * 15) * 10) / 10,
      ratedPowerKw: 3000,
    };
  }),

  // Per-turbine availability (IEC 61400-26 T1-T6)
  turbineAvailability: turbineNames.map((name, i) => {
    const totalH = 672; // Feb 2026 = 28 days
    const t5 = i === 3 ? 85 : Math.round(Math.random() * 20); // WKA-04 has high failure
    const t4 = Math.round(5 + Math.random() * 15);
    const t3 = Math.round(Math.random() * 8);
    const t6 = Math.round(Math.random() * 5);
    const t2 = Math.round(80 + Math.random() * 60);
    const t1 = totalH - t2 - t3 - t4 - t5 - t6;
    const avail = ((t1 + t2 + t3) / totalH) * 100;
    return {
      turbineId: `turb-${i + 1}`,
      designation: name,
      t1Hours: Math.max(t1, 0),
      t2Hours: t2,
      t3Hours: t3,
      t4Hours: t4,
      t5Hours: t5,
      t6Hours: t6,
      availabilityPct: Math.round(avail * 10) / 10,
    };
  }),

  // Service events
  serviceEvents: [
    {
      id: "ev-1",
      eventDate: new Date(2026, 1, 3),
      eventType: "MAINTENANCE",
      turbineDesignation: "WKA-02",
      description: "Planmäßiger Ölwechsel Getriebe, Filter gewechselt",
      durationHours: 6.5,
    },
    {
      id: "ev-2",
      eventDate: new Date(2026, 1, 8),
      eventType: "REPAIR",
      turbineDesignation: "WKA-04",
      description: "Generatorlager defekt — Austausch durch Serviceteam",
      durationHours: 48,
    },
    {
      id: "ev-3",
      eventDate: new Date(2026, 1, 12),
      eventType: "GRID_OUTAGE",
      turbineDesignation: "WKA-01",
      description: "Netzausfall Umspannwerk Nordheide, alle Anlagen betroffen",
      durationHours: 3.2,
    },
    {
      id: "ev-4",
      eventDate: new Date(2026, 1, 15),
      eventType: "INSPECTION",
      turbineDesignation: "WKA-06",
      description: "Wiederkehrende Prüfung nach BetrSichV",
      durationHours: 4,
    },
    {
      id: "ev-5",
      eventDate: new Date(2026, 1, 19),
      eventType: "CURTAILMENT",
      turbineDesignation: "WKA-03",
      description: "Abregelung durch Netzbetreiber wegen Netzengpass",
      durationHours: 12,
    },
    {
      id: "ev-6",
      eventDate: new Date(2026, 1, 22),
      eventType: "INCIDENT",
      turbineDesignation: "WKA-07",
      description: "Blattwinkelverstellung Störung, automatischer Neustart",
      durationHours: 1.5,
    },
    {
      id: "ev-7",
      eventDate: new Date(2026, 1, 25),
      eventType: "MAINTENANCE",
      turbineDesignation: "WKA-05",
      description: "Austausch Bremsbeläge, Sichtprüfung Rotorblätter",
      durationHours: 8,
    },
  ],

  // Notable downtimes
  notableDowntimes: [
    "WKA-04: Verfügbarkeit 84.2% (T5: 85h Störung — Generatorlager-Austausch)",
  ],

  generatedAt: new Date().toISOString(),
};

// Quarterly mock data — extends monthly with trend
const quarterlyData: MonthlyReportData = {
  ...mockData,
  periodType: "QUARTERLY",
  monthName: "Q4 2025",
  periodLabel: "Oktober – Dezember 2025",
  month: 10,

  // Monthly trend for Q4
  monthlyTrend: [
    { month: 10, monthNameShort: "Okt", productionMwh: 1870.1, avgAvailabilityPct: 97.1, avgWindSpeedMs: 8.2, revenueEur: 159840 },
    { month: 11, monthNameShort: "Nov", productionMwh: 1350.0, avgAvailabilityPct: 97.0, avgWindSpeedMs: 7.4, revenueEur: 115560 },
    { month: 12, monthNameShort: "Dez", productionMwh: 1612.6, avgAvailabilityPct: 95.0, avgWindSpeedMs: 7.9, revenueEur: 137180 },
  ],

  // Per-turbine monthly production
  turbineMonthlyProduction: turbineNames.map((name, i) => ({
    turbineId: `turb-${i + 1}`,
    designation: name,
    monthlyMwh: [
      Math.round((200 + Math.sin(i * 1.5) * 40) * 10) / 10,
      Math.round((170 + Math.sin(i * 1.5) * 35) * 10) / 10,
      Math.round((190 + Math.sin(i * 1.5) * 38) * 10) / 10,
    ],
    totalMwh: Math.round((560 + Math.sin(i * 1.5) * 113) * 10) / 10,
  })),
};

async function main() {
  const mode = process.argv[2] || "monthly"; // "monthly" or "quarterly"
  const isQuarterly = mode === "quarterly" || mode === "q";

  const reportData = isQuarterly ? quarterlyData : mockData;
  const label = isQuarterly ? "quarterly" : "monthly";
  console.log(`Rendering ${label} report PDF...`);

  const pdfBuffer = await renderToBuffer(
    <MonthlyReportTemplate
      data={reportData}
      template={mockTemplate as any}
      letterhead={mockLetterhead as any}
    />
  );

  const filename = isQuarterly ? "sample-quarterly-report.pdf" : "sample-report.pdf";
  const outPath = path.join(__dirname, "..", filename);
  fs.writeFileSync(outPath, pdfBuffer);
  console.log(`PDF saved to: ${outPath}`);
  console.log(`File size: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
