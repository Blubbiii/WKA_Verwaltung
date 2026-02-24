import { renderToBuffer } from "@react-pdf/renderer";
import {
  SettlementReportTemplate,
  type SettlementReportData,
} from "../templates/SettlementReportTemplate";
import { resolveTemplateAndLetterhead, applyLetterheadBackground } from "../utils/templateResolver";
import { prisma } from "@/lib/prisma";
import { calculateSettlement } from "@/lib/settlement";

/**
 * Generiert ein PDF für einen Settlement Report
 */
export async function generateSettlementReportPdf(
  periodId: string,
  tenantId: string
): Promise<Buffer> {
  // Periode mit Park laden
  const period = await prisma.leaseSettlementPeriod.findUnique({
    where: { id: periodId },
    include: {
      park: {
        select: {
          id: true,
          name: true,
          minimumRentPerTurbine: true,
          weaSharePercentage: true,
          poolSharePercentage: true,
        },
      },
      tenant: {
        select: {
          name: true,
          bankName: true,
          iban: true,
          bic: true,
        },
      },
    },
  });

  if (!period) {
    throw new Error("Abrechnungsperiode nicht gefunden");
  }

  if (period.tenantId !== tenantId) {
    throw new Error("Keine Berechtigung für diese Abrechnungsperiode");
  }

  // Berechnung durchfuehren
  const calculation = await calculateSettlement({
    parkId: period.parkId,
    year: period.year,
    totalRevenue: period.totalRevenue ? Number(period.totalRevenue) : undefined,
    tenantId,
  });

  // Template und Letterhead aufloesen
  const { template, letterhead } = await resolveTemplateAndLetterhead(
    tenantId,
    "SETTLEMENT_REPORT",
    period.parkId
  );

  // Daten für PDF aufbereiten
  const reportData: SettlementReportData = {
    calculation,
    periodId: period.id,
    periodStatus: period.status,
    notes: period.notes,
    tenant: period.tenant
      ? {
          name: period.tenant.name,
          bankName: period.tenant.bankName,
          iban: period.tenant.iban,
          bic: period.tenant.bic,
        }
      : undefined,
  };

  // PDF rendern
  const pdfBuffer = await renderToBuffer(
    <SettlementReportTemplate
      data={reportData}
      template={template}
      letterhead={letterhead}
    />
  );

  return applyLetterheadBackground(pdfBuffer, letterhead);
}

/**
 * Generiert ein PDF als Base64-String (für Vorschau)
 */
export async function generateSettlementReportPdfBase64(
  periodId: string,
  tenantId: string
): Promise<string> {
  const buffer = await generateSettlementReportPdf(periodId, tenantId);
  return buffer.toString("base64");
}

/**
 * Generiert einen Dateinamen für den Settlement Report
 */
export function getSettlementReportFilename(
  parkName: string,
  year: number,
  format: "pdf" | "download" = "pdf"
): string {
  const sanitizedParkName = parkName
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .substring(0, 30);

  const timestamp = new Date().toISOString().split("T")[0];

  if (format === "download") {
    return `Pachtabrechnung_${sanitizedParkName}_${year}_${timestamp}.pdf`;
  }

  return `settlement_report_${sanitizedParkName}_${year}.pdf`;
}
