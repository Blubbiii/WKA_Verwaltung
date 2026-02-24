/**
 * API Routes für Report Archive
 *
 * GET  /api/reports/archive - Liste archivierter Reports
 * POST /api/reports/archive - Neuen Report archivieren
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { z } from "zod";
import {
  getArchivedReports,
  saveGeneratedReport,
  getArchiveStats,
  mapReportTypeToEnum,
  mapFormatToEnum,
  getMimeType,
  getFileExtension,
} from "@/lib/reports/archive";
import { ReportType, ReportFormat } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";

// ===========================================
// VALIDATION SCHEMAS
// ===========================================

const getReportsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  reportType: z.nativeEnum(ReportType).optional(),
  format: z.nativeEnum(ReportFormat).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  search: z.string().optional(),
});

const postReportSchema = z.object({
  title: z.string().min(1, "Titel ist erforderlich").max(255),
  reportType: z.string().min(1, "Report-Typ ist erforderlich"),
  format: z.string().min(1, "Format ist erforderlich"),
  fileBase64: z.string().min(1, "Datei ist erforderlich"),
  parameters: z.record(z.unknown()).optional(),
});

// ===========================================
// GET - Liste archivierter Reports
// ===========================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.REPORTS_READ);
    if (!check.authorized) return check.error!;

    // Query-Parameter parsen
    const searchParams = request.nextUrl.searchParams;
    const parsed = getReportsSchema.safeParse({
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
      reportType: searchParams.get("reportType"),
      format: searchParams.get("format"),
      startDate: searchParams.get("startDate"),
      endDate: searchParams.get("endDate"),
      search: searchParams.get("search"),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Parameter", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { page, pageSize, reportType, format, startDate, endDate, search } =
      parsed.data;

    // Stats abfragen wenn gewuenscht
    const includeStats = searchParams.get("includeStats") === "true";

    // Reports abrufen
    const result = await getArchivedReports(
      check.tenantId!,
      { reportType, format, startDate, endDate, search },
      page,
      pageSize
    );

    // Optional: Stats hinzufügen
    let stats = null;
    if (includeStats) {
      stats = await getArchiveStats(check.tenantId!);
    }

    return NextResponse.json({
      ...result,
      ...(stats && { stats }),
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Abrufen der archivierten Reports");
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// ===========================================
// POST - Report archivieren
// ===========================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.REPORTS_CREATE);
    if (!check.authorized) return check.error!;

    // Body parsen und validieren
    const body = await request.json();
    const parsed = postReportSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Daten", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { title, reportType, format, fileBase64, parameters } = parsed.data;

    // Base64 zu Buffer konvertieren
    const fileBuffer = Buffer.from(fileBase64, "base64");

    // Report-Typ und Format mappen
    const reportTypeEnum = mapReportTypeToEnum(reportType);
    const formatEnum = mapFormatToEnum(format);

    // Dateiname generieren
    const timestamp = new Date().toISOString().split("T")[0];
    const sanitizedTitle = title.replace(/[^a-zA-Z0-9_-]/g, "_");
    const fileName = `${sanitizedTitle}_${timestamp}${getFileExtension(formatEnum)}`;

    // Report speichern
    const report = await saveGeneratedReport({
      title,
      reportType: reportTypeEnum,
      format: formatEnum,
      fileBuffer,
      fileName,
      mimeType: getMimeType(formatEnum),
      tenantId: check.tenantId!,
      generatedById: check.userId!,
      parameters,
    });

    return NextResponse.json(
      {
        success: true,
        report: {
          id: report.id,
          title: report.title,
          reportType: report.reportType,
          format: report.format,
          fileSize: report.fileSize,
          generatedAt: report.generatedAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Archivieren des Reports");
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
