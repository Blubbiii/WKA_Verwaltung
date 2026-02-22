/**
 * API Route: /api/admin/scheduled-reports
 * GET: List all scheduled reports for the tenant
 * POST: Create a new scheduled report configuration
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { z } from "zod";
import { calculateInitialNextRun } from "@/lib/reports/scheduled-report-service";
import { apiLogger as logger } from "@/lib/logger";

// Validation schema for creating a scheduled report
const createScheduledReportSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich").max(200),
  reportType: z.enum([
    "MONTHLY_PRODUCTION",
    "QUARTERLY_FINANCIAL",
    "ANNUAL_SUMMARY",
    "CUSTOM",
  ]),
  schedule: z.enum(["MONTHLY", "QUARTERLY", "ANNUALLY"]),
  recipients: z
    .array(z.string().email("Ungueltige E-Mail-Adresse"))
    .min(1, "Mindestens ein Empfaenger ist erforderlich"),
  config: z.object({
    parkId: z.string().uuid().optional(),
    fundId: z.string().uuid().optional(),
    modules: z.array(z.string()).optional(),
    format: z.string().optional(),
  }),
  enabled: z.boolean().optional().default(true),
});

// GET /api/admin/scheduled-reports
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.SETTINGS_UPDATE);
    if (!check.authorized) return check.error!;

    const { searchParams } = new URL(request.url);
    const reportType = searchParams.get("reportType");
    const enabled = searchParams.get("enabled");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    // Build where clause
    const where: Prisma.ScheduledReportWhereInput = {
      tenantId: check.tenantId!,
      ...(reportType && {
        reportType: reportType as Prisma.EnumScheduledReportTypeFilter,
      }),
      ...(enabled !== null &&
        enabled !== undefined && { enabled: enabled === "true" }),
    };

    const [scheduledReports, total] = await Promise.all([
      prisma.scheduledReport.findMany({
        where,
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: [{ enabled: "desc" }, { nextRunAt: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.scheduledReport.count({ where }),
    ]);

    // Transform for response
    const data = scheduledReports.map((report) => ({
      id: report.id,
      name: report.name,
      reportType: report.reportType,
      schedule: report.schedule,
      recipients: report.recipients,
      config: report.config,
      enabled: report.enabled,
      nextRunAt: report.nextRunAt.toISOString(),
      lastRunAt: report.lastRunAt?.toISOString() || null,
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
      createdBy: report.createdBy,
    }));

    return NextResponse.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching scheduled reports");
    return NextResponse.json(
      { error: "Fehler beim Laden der geplanten Berichte" },
      { status: 500 }
    );
  }
}

// POST /api/admin/scheduled-reports
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.SETTINGS_UPDATE);
    if (!check.authorized) return check.error!;

    const body = await request.json();
    const validatedData = createScheduledReportSchema.parse(body);

    // If parkId is provided, verify it belongs to the tenant
    if (validatedData.config.parkId) {
      const park = await prisma.park.findFirst({
        where: {
          id: validatedData.config.parkId,
          tenantId: check.tenantId!,
        },
      });

      if (!park) {
        return NextResponse.json(
          { error: "Windpark nicht gefunden oder keine Berechtigung" },
          { status: 404 }
        );
      }
    }

    // If fundId is provided, verify it belongs to the tenant
    if (validatedData.config.fundId) {
      const fund = await prisma.fund.findFirst({
        where: {
          id: validatedData.config.fundId,
          tenantId: check.tenantId!,
        },
      });

      if (!fund) {
        return NextResponse.json(
          { error: "Gesellschaft nicht gefunden oder keine Berechtigung" },
          { status: 404 }
        );
      }
    }

    // Calculate initial nextRunAt
    const nextRunAt = calculateInitialNextRun(
      validatedData.schedule as "MONTHLY" | "QUARTERLY" | "ANNUALLY"
    );

    // Create the scheduled report
    const scheduledReport = await prisma.scheduledReport.create({
      data: {
        name: validatedData.name,
        reportType: validatedData.reportType,
        schedule: validatedData.schedule,
        recipients: validatedData.recipients,
        config: validatedData.config as Prisma.InputJsonValue,
        enabled: validatedData.enabled,
        nextRunAt,
        tenantId: check.tenantId!,
        createdById: check.userId!,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        id: scheduledReport.id,
        name: scheduledReport.name,
        reportType: scheduledReport.reportType,
        schedule: scheduledReport.schedule,
        recipients: scheduledReport.recipients,
        config: scheduledReport.config,
        enabled: scheduledReport.enabled,
        nextRunAt: scheduledReport.nextRunAt.toISOString(),
        lastRunAt: scheduledReport.lastRunAt?.toISOString() || null,
        createdAt: scheduledReport.createdAt.toISOString(),
        updatedAt: scheduledReport.updatedAt.toISOString(),
        createdBy: scheduledReport.createdBy,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error creating scheduled report");
    return NextResponse.json(
      { error: "Fehler beim Erstellen des geplanten Berichts" },
      { status: 500 }
    );
  }
}
