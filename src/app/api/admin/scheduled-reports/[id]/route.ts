/**
 * API Route: /api/admin/scheduled-reports/[id]
 * GET: Get a single scheduled report configuration
 * PATCH: Update a scheduled report (enable/disable, change schedule, recipients)
 * DELETE: Remove a scheduled report configuration
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { z } from "zod";
import { calculateNextRun } from "@/lib/reports/scheduled-report-service";
import { apiLogger as logger } from "@/lib/logger";

// Validation schema for updating a scheduled report
const updateScheduledReportSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  reportType: z
    .enum([
      "MONTHLY_PRODUCTION",
      "QUARTERLY_FINANCIAL",
      "ANNUAL_SUMMARY",
      "CUSTOM",
    ])
    .optional(),
  schedule: z.enum(["MONTHLY", "QUARTERLY", "ANNUALLY"]).optional(),
  recipients: z
    .array(z.string().email("Ungueltige E-Mail-Adresse"))
    .min(1, "Mindestens ein Empfaenger ist erforderlich")
    .optional(),
  config: z
    .object({
      parkId: z.string().uuid().optional(),
      fundId: z.string().uuid().optional(),
      modules: z.array(z.string()).optional(),
      format: z.string().optional(),
    })
    .optional(),
  enabled: z.boolean().optional(),
});

// GET /api/admin/scheduled-reports/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.SETTINGS_UPDATE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    const scheduledReport = await prisma.scheduledReport.findFirst({
      where: {
        id,
        tenantId: check.tenantId!,
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

    if (!scheduledReport) {
      return NextResponse.json(
        { error: "Geplanter Bericht nicht gefunden" },
        { status: 404 }
      );
    }

    return NextResponse.json({
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
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching scheduled report");
    return NextResponse.json(
      { error: "Fehler beim Laden des geplanten Berichts" },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/scheduled-reports/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.SETTINGS_UPDATE);
    if (!check.authorized) return check.error!;

    const { id } = await params;
    const body = await request.json();
    const validatedData = updateScheduledReportSchema.parse(body);

    // Check if the scheduled report exists and belongs to this tenant
    const existingReport = await prisma.scheduledReport.findFirst({
      where: {
        id,
        tenantId: check.tenantId!,
      },
    });

    if (!existingReport) {
      return NextResponse.json(
        { error: "Geplanter Bericht nicht gefunden" },
        { status: 404 }
      );
    }

    // If parkId is being updated, verify it belongs to the tenant
    if (validatedData.config?.parkId) {
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

    // If fundId is being updated, verify it belongs to the tenant
    if (validatedData.config?.fundId) {
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

    // Recalculate nextRunAt if schedule changed
    let nextRunAt = existingReport.nextRunAt;
    if (validatedData.schedule && validatedData.schedule !== existingReport.schedule) {
      nextRunAt = calculateNextRun(
        validatedData.schedule as "MONTHLY" | "QUARTERLY" | "ANNUALLY"
      );
    }

    // Build update data
    const updateData: Prisma.ScheduledReportUpdateInput = {
      ...(validatedData.name !== undefined && { name: validatedData.name }),
      ...(validatedData.reportType !== undefined && {
        reportType: validatedData.reportType,
      }),
      ...(validatedData.schedule !== undefined && {
        schedule: validatedData.schedule,
        nextRunAt,
      }),
      ...(validatedData.recipients !== undefined && {
        recipients: validatedData.recipients,
      }),
      ...(validatedData.config !== undefined && {
        config: validatedData.config as Prisma.InputJsonValue,
      }),
      ...(validatedData.enabled !== undefined && {
        enabled: validatedData.enabled,
      }),
    };

    const updatedReport = await prisma.scheduledReport.update({
      where: { id },
      data: updateData,
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

    return NextResponse.json({
      id: updatedReport.id,
      name: updatedReport.name,
      reportType: updatedReport.reportType,
      schedule: updatedReport.schedule,
      recipients: updatedReport.recipients,
      config: updatedReport.config,
      enabled: updatedReport.enabled,
      nextRunAt: updatedReport.nextRunAt.toISOString(),
      lastRunAt: updatedReport.lastRunAt?.toISOString() || null,
      createdAt: updatedReport.createdAt.toISOString(),
      updatedAt: updatedReport.updatedAt.toISOString(),
      createdBy: updatedReport.createdBy,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error updating scheduled report");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren des geplanten Berichts" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/scheduled-reports/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.SETTINGS_UPDATE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Check if the scheduled report exists and belongs to this tenant
    const existingReport = await prisma.scheduledReport.findFirst({
      where: {
        id,
        tenantId: check.tenantId!,
      },
    });

    if (!existingReport) {
      return NextResponse.json(
        { error: "Geplanter Bericht nicht gefunden" },
        { status: 404 }
      );
    }

    // Hard delete - scheduled reports don't have execution history to preserve
    await prisma.scheduledReport.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Geplanter Bericht wurde geloescht",
    });
  } catch (error) {
    logger.error({ err: error }, "Error deleting scheduled report");
    return NextResponse.json(
      { error: "Fehler beim Loeschen des geplanten Berichts" },
      { status: 500 }
    );
  }
}
