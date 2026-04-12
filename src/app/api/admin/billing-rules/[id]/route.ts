/**
 * API Route: /api/admin/billing-rules/[id]
 * GET: Regel-Details mit Ausführungshistorie
 * PATCH: Regel aktualisieren
 * DELETE: Regel deaktivieren (soft-delete via isActive)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/withPermission";
import { z } from "zod";
import { validateRuleParameters, calculateNextRun, BillingRuleType, BillingRuleFrequency } from "@/lib/billing";
import { apiLogger as logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-utils";
import { apiError } from "@/lib/api-errors";

// Validation Schema für Update
const updateRuleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  frequency: z.enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL", "CUSTOM_CRON"]).optional(),
  cronPattern: z.string().max(100).optional().nullable(),
  dayOfMonth: z.number().int().min(1).max(28).optional().nullable(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

// GET /api/admin/billing-rules/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const { id } = await params;

    const rule = await prisma.billingRule.findUnique({
      where: {
        id,
        tenantId: check.tenantId!,
      },
      include: {
        executions: {
          orderBy: { startedAt: "desc" },
          take: 10,
          select: {
            id: true,
            status: true,
            startedAt: true,
            completedAt: true,
            invoicesCreated: true,
            totalAmount: true,
            errorMessage: true,
          },
        },
        _count: {
          select: { executions: true },
        },
      },
    });

    if (!rule) {
      return apiError("NOT_FOUND", undefined, { message: "Abrechnungsregel nicht gefunden" });
    }

    return NextResponse.json({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      ruleType: rule.ruleType,
      frequency: rule.frequency,
      cronPattern: rule.cronPattern,
      dayOfMonth: rule.dayOfMonth,
      parameters: rule.parameters,
      isActive: rule.isActive,
      lastRunAt: rule.lastRunAt?.toISOString() || null,
      nextRunAt: rule.nextRunAt?.toISOString() || null,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
      executionCount: rule._count.executions,
      recentExecutions: rule.executions.map((exec) => ({
        id: exec.id,
        status: exec.status,
        startedAt: exec.startedAt.toISOString(),
        completedAt: exec.completedAt?.toISOString() || null,
        invoicesCreated: exec.invoicesCreated,
        totalAmount: exec.totalAmount ? Number(exec.totalAmount) : null,
        errorMessage: exec.errorMessage,
      })),
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching billing rule");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Abrechnungsregel" });
  }
}

// PATCH /api/admin/billing-rules/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();
    const validatedData = updateRuleSchema.parse(body);

    // Pruefe ob Regel existiert
    const existingRule = await prisma.billingRule.findUnique({
      where: {
        id,
        tenantId: check.tenantId!,
      },
    });

    if (!existingRule) {
      return apiError("NOT_FOUND", undefined, { message: "Abrechnungsregel nicht gefunden" });
    }

    // Validiere Cron-Pattern wenn CUSTOM_CRON
    const newFrequency = validatedData.frequency || existingRule.frequency;
    if (newFrequency === "CUSTOM_CRON") {
      const newCronPattern = validatedData.cronPattern ?? existingRule.cronPattern;
      if (!newCronPattern) {
        return apiError("MISSING_FIELD", undefined, { message: "Cron-Pattern ist erforderlich für CUSTOM_CRON Frequenz" });
      }
    }

    // Validiere Parameter wenn geändert
    if (validatedData.parameters) {
      const paramValidation = validateRuleParameters(
        existingRule.ruleType as BillingRuleType,
        validatedData.parameters
      );

      if (!paramValidation.valid) {
        return apiError("BAD_REQUEST", undefined, { message: paramValidation.error || "Ungültige Parameter" });
      }
    }

    // Berechne nextRunAt neu wenn Frequenz oder dayOfMonth geändert
    let nextRunAt = existingRule.nextRunAt;
    if (validatedData.frequency || validatedData.dayOfMonth !== undefined || validatedData.cronPattern !== undefined) {
      nextRunAt = calculateNextRun({
        frequency: validatedData.frequency || existingRule.frequency,
        cronPattern: validatedData.cronPattern ?? existingRule.cronPattern,
        dayOfMonth: validatedData.dayOfMonth ?? existingRule.dayOfMonth,
        lastRunAt: existingRule.lastRunAt,
        nextRunAt: existingRule.nextRunAt,
      });
    }

    // Update Regel
    const updatedRule = await prisma.billingRule.update({
      where: { id },
      data: {
        ...(validatedData.name !== undefined && { name: validatedData.name }),
        ...(validatedData.description !== undefined && { description: validatedData.description }),
        ...(validatedData.frequency !== undefined && {
          frequency: validatedData.frequency as BillingRuleFrequency,
        }),
        ...(validatedData.cronPattern !== undefined && { cronPattern: validatedData.cronPattern }),
        ...(validatedData.dayOfMonth !== undefined && { dayOfMonth: validatedData.dayOfMonth }),
        ...(validatedData.parameters !== undefined && { parameters: validatedData.parameters as Prisma.InputJsonValue }),
        ...(validatedData.isActive !== undefined && { isActive: validatedData.isActive }),
        nextRunAt,
      },
    });

    return NextResponse.json({
      id: updatedRule.id,
      name: updatedRule.name,
      description: updatedRule.description,
      ruleType: updatedRule.ruleType,
      frequency: updatedRule.frequency,
      cronPattern: updatedRule.cronPattern,
      dayOfMonth: updatedRule.dayOfMonth,
      parameters: updatedRule.parameters,
      isActive: updatedRule.isActive,
      lastRunAt: updatedRule.lastRunAt?.toISOString() || null,
      nextRunAt: updatedRule.nextRunAt?.toISOString() || null,
      createdAt: updatedRule.createdAt.toISOString(),
      updatedAt: updatedRule.updatedAt.toISOString(),
    });
  } catch (error) {
    return handleApiError(error, "Fehler beim Aktualisieren der Abrechnungsregel");
  }
}

// DELETE /api/admin/billing-rules/[id] - Soft-Delete via isActive=false
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Pruefe ob Regel existiert
    const existingRule = await prisma.billingRule.findUnique({
      where: {
        id,
        tenantId: check.tenantId!,
      },
    });

    if (!existingRule) {
      return apiError("NOT_FOUND", undefined, { message: "Abrechnungsregel nicht gefunden" });
    }

    // Soft-Delete: Setze isActive auf false
    await prisma.billingRule.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true, message: "Abrechnungsregel deaktiviert" });
  } catch (error) {
    logger.error({ err: error }, "Error deleting billing rule");
    return apiError("DELETE_FAILED", undefined, { message: "Fehler beim Löschen der Abrechnungsregel" });
  }
}
