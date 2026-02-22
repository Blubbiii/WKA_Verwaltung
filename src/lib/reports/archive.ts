/**
 * Report Archive Service
 * Verwaltet die Speicherung und den Abruf generierter Reports
 */

import { prisma } from "@/lib/prisma";
import { uploadFile, getSignedUrl, deleteFile } from "@/lib/storage";
import { ReportType, ReportFormat, Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";

// ===========================================
// TYPES
// ===========================================

export interface SaveReportInput {
  title: string;
  reportType: ReportType;
  format: ReportFormat;
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  tenantId: string;
  generatedById: string;
  parameters?: Record<string, unknown>;
}

export interface GetReportsFilter {
  reportType?: ReportType;
  format?: ReportFormat;
  startDate?: Date;
  endDate?: Date;
  search?: string;
}

export interface ArchivedReport {
  id: string;
  title: string;
  reportType: ReportType;
  format: ReportFormat;
  fileUrl: string;
  fileSize: number;
  parameters: Record<string, unknown> | null;
  generatedAt: Date;
  generatedBy: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
}

// ===========================================
// HELPER FUNCTIONS
// ===========================================

/**
 * Mappt den API Report Type String zum Prisma Enum
 */
export function mapReportTypeToEnum(type: string): ReportType {
  const mapping: Record<string, ReportType> = {
    "parks-overview": ReportType.PARKS_OVERVIEW,
    "turbines-overview": ReportType.TURBINES_OVERVIEW,
    "shareholders-overview": ReportType.SHAREHOLDERS,
    "contracts-overview": ReportType.CONTRACTS,
    "contracts-expiring": ReportType.CONTRACTS,
    "invoices-overview": ReportType.INVOICES,
    "votes-results": ReportType.VOTES_RESULTS,
    "fund-performance": ReportType.FUND_PERFORMANCE,
    monthly: ReportType.MONTHLY,
    annual: ReportType.ANNUAL,
    settlement: ReportType.SETTLEMENT,
    custom: ReportType.CUSTOM,
  };

  return mapping[type.toLowerCase()] || ReportType.CUSTOM;
}

/**
 * Mappt das Format zum Prisma Enum
 */
export function mapFormatToEnum(format: string): ReportFormat {
  const mapping: Record<string, ReportFormat> = {
    pdf: ReportFormat.PDF,
    xlsx: ReportFormat.XLSX,
    csv: ReportFormat.CSV,
  };

  return mapping[format.toLowerCase()] || ReportFormat.PDF;
}

/**
 * Gibt den MIME-Type fuer ein Format zurueck
 */
export function getMimeType(format: ReportFormat): string {
  const mimeTypes: Record<ReportFormat, string> = {
    [ReportFormat.PDF]: "application/pdf",
    [ReportFormat.XLSX]:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    [ReportFormat.CSV]: "text/csv",
  };

  return mimeTypes[format];
}

/**
 * Gibt die Dateiendung fuer ein Format zurueck
 */
export function getFileExtension(format: ReportFormat): string {
  const extensions: Record<ReportFormat, string> = {
    [ReportFormat.PDF]: ".pdf",
    [ReportFormat.XLSX]: ".xlsx",
    [ReportFormat.CSV]: ".csv",
  };

  return extensions[format];
}

/**
 * Gibt den deutschen Namen fuer einen ReportType zurueck
 */
export function getReportTypeName(type: ReportType): string {
  const names: Record<ReportType, string> = {
    [ReportType.MONTHLY]: "Monatsbericht",
    [ReportType.ANNUAL]: "Jahresbericht",
    [ReportType.SHAREHOLDERS]: "Gesellschafterbericht",
    [ReportType.SETTLEMENT]: "Pachtabrechnung",
    [ReportType.CONTRACTS]: "Vertragsuebersicht",
    [ReportType.INVOICES]: "Rechnungsuebersicht",
    [ReportType.PARKS_OVERVIEW]: "Windpark-Uebersicht",
    [ReportType.TURBINES_OVERVIEW]: "Turbinen-Uebersicht",
    [ReportType.FUND_PERFORMANCE]: "Gesellschafts-Performance",
    [ReportType.VOTES_RESULTS]: "Abstimmungsergebnisse",
    [ReportType.CUSTOM]: "Benutzerdefiniert",
  };

  return names[type];
}

// ===========================================
// MAIN FUNCTIONS
// ===========================================

/**
 * Speichert einen generierten Report im Archiv
 *
 * @param data - Report-Daten inkl. File Buffer
 * @returns Der erstellte GeneratedReport Record
 */
export async function saveGeneratedReport(data: SaveReportInput) {
  const {
    title,
    reportType,
    format,
    fileBuffer,
    fileName,
    mimeType,
    tenantId,
    generatedById,
    parameters,
  } = data;

  // 1. Datei in S3/MinIO hochladen
  const fileKey = await uploadFile(fileBuffer, fileName, mimeType, tenantId);

  // 2. Report-Metadaten in Datenbank speichern
  const report = await prisma.generatedReport.create({
    data: {
      title,
      reportType,
      format,
      fileUrl: fileKey,
      fileSize: fileBuffer.length,
      parameters: parameters as Prisma.InputJsonValue,
      tenantId,
      generatedById,
    },
    include: {
      generatedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  return report;
}

/**
 * Holt archivierte Reports mit Filtern
 *
 * @param tenantId - Mandanten-ID
 * @param filters - Optionale Filter
 * @param page - Seitenzahl (1-basiert)
 * @param pageSize - Anzahl Ergebnisse pro Seite
 * @returns Paginierte Liste von Reports
 */
export async function getArchivedReports(
  tenantId: string,
  filters: GetReportsFilter = {},
  page: number = 1,
  pageSize: number = 20
): Promise<{ data: ArchivedReport[]; total: number; page: number; pageSize: number }> {
  const { reportType, format, startDate, endDate, search } = filters;

  // Where-Bedingungen aufbauen
  const where: Prisma.GeneratedReportWhereInput = {
    tenantId,
    ...(reportType && { reportType }),
    ...(format && { format }),
    ...(startDate || endDate
      ? {
          generatedAt: {
            ...(startDate && { gte: startDate }),
            ...(endDate && { lte: endDate }),
          },
        }
      : {}),
    ...(search && {
      title: {
        contains: search,
        mode: Prisma.QueryMode.insensitive,
      },
    }),
  };

  // Parallele Abfrage fuer Daten und Gesamtanzahl
  const [reports, total] = await Promise.all([
    prisma.generatedReport.findMany({
      where,
      include: {
        generatedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { generatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.generatedReport.count({ where }),
  ]);

  // Daten transformieren
  const data: ArchivedReport[] = reports.map((report) => ({
    id: report.id,
    title: report.title,
    reportType: report.reportType,
    format: report.format,
    fileUrl: report.fileUrl,
    fileSize: report.fileSize,
    parameters: report.parameters as Record<string, unknown> | null,
    generatedAt: report.generatedAt,
    generatedBy: report.generatedBy,
  }));

  return { data, total, page, pageSize };
}

/**
 * Holt einen einzelnen Report mit Download-URL
 *
 * @param id - Report ID
 * @param tenantId - Mandanten-ID (fuer Sicherheitspruefung)
 * @returns Report mit signierter Download-URL
 */
export async function getArchivedReportById(id: string, tenantId: string) {
  const report = await prisma.generatedReport.findFirst({
    where: { id, tenantId },
    include: {
      generatedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  if (!report) {
    return null;
  }

  // Signierte Download-URL generieren (1 Stunde gueltig)
  const downloadUrl = await getSignedUrl(report.fileUrl, 3600);

  return {
    ...report,
    downloadUrl,
  };
}

/**
 * Loescht einen archivierten Report (inkl. Datei)
 *
 * @param id - Report ID
 * @param tenantId - Mandanten-ID (fuer Sicherheitspruefung)
 * @returns true wenn erfolgreich, false wenn nicht gefunden
 */
export async function deleteArchivedReport(
  id: string,
  tenantId: string
): Promise<boolean> {
  // Report aus DB holen
  const report = await prisma.generatedReport.findFirst({
    where: { id, tenantId },
  });

  if (!report) {
    return false;
  }

  // Datei aus S3/MinIO loeschen
  try {
    await deleteFile(report.fileUrl);
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Loeschen der Datei aus Storage");
    // Wir loeschen den DB-Eintrag trotzdem, um Orphans zu vermeiden
  }

  // DB-Eintrag loeschen
  await prisma.generatedReport.delete({
    where: { id },
  });

  return true;
}

/**
 * Holt Statistiken ueber archivierte Reports
 *
 * @param tenantId - Mandanten-ID
 * @returns Statistiken
 */
export async function getArchiveStats(tenantId: string) {
  const [total, byType, byFormat, totalSize] = await Promise.all([
    // Gesamtanzahl
    prisma.generatedReport.count({ where: { tenantId } }),

    // Nach Typ gruppiert
    prisma.generatedReport.groupBy({
      by: ["reportType"],
      where: { tenantId },
      _count: { id: true },
    }),

    // Nach Format gruppiert
    prisma.generatedReport.groupBy({
      by: ["format"],
      where: { tenantId },
      _count: { id: true },
    }),

    // Gesamtgroesse
    prisma.generatedReport.aggregate({
      where: { tenantId },
      _sum: { fileSize: true },
    }),
  ]);

  return {
    totalReports: total,
    totalSizeBytes: totalSize._sum.fileSize || 0,
    byType: byType.map((item) => ({
      type: item.reportType,
      typeName: getReportTypeName(item.reportType),
      count: item._count.id,
    })),
    byFormat: byFormat.map((item) => ({
      format: item.format,
      count: item._count.id,
    })),
  };
}
