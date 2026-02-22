/**
 * API Route: /api/admin/billing-rules
 * GET: Liste aller Billing Rules (paginiert, filterbar)
 * POST: Neue Billing Rule erstellen
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/withPermission";
import { z } from "zod";
import { validateRuleParameters, calculateNextRun, BillingRuleType, BillingRuleFrequency } from "@/lib/billing";
import { apiLogger as logger } from "@/lib/logger";

// Validation Schema fuer neue Regel
const createRuleSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich").max(200),
  description: z.string().max(1000).optional(),
  ruleType: z.enum(["LEASE_PAYMENT", "LEASE_ADVANCE", "DISTRIBUTION", "MANAGEMENT_FEE", "CUSTOM"]),
  frequency: z.enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL", "CUSTOM_CRON"]),
  cronPattern: z.string().max(100).optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  parameters: z.record(z.unknown()),
  isActive: z.boolean().optional().default(true),
});

// GET /api/admin/billing-rules
export async function GET(request: NextRequest) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const ruleType = searchParams.get("ruleType");
    const frequency = searchParams.get("frequency");
    const isActive = searchParams.get("isActive");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const where = {
      tenantId: check.tenantId!,
      ...(ruleType && { ruleType: ruleType as BillingRuleType }),
      ...(frequency && { frequency: frequency as BillingRuleFrequency }),
      ...(isActive !== null && { isActive: isActive === "true" }),
    };

    const [rules, total] = await Promise.all([
      prisma.billingRule.findMany({
        where,
        include: {
          _count: {
            select: { executions: true },
          },
          executions: {
            orderBy: { startedAt: "desc" },
            take: 1,
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
        },
        orderBy: [{ isActive: "desc" }, { nextRunAt: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.billingRule.count({ where }),
    ]);

    // Transformiere Regeln fuer Response
    const transformedRules = rules.map((rule) => ({
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
      lastExecution: rule.executions[0]
        ? {
            id: rule.executions[0].id,
            status: rule.executions[0].status,
            startedAt: rule.executions[0].startedAt.toISOString(),
            completedAt: rule.executions[0].completedAt?.toISOString() || null,
            invoicesCreated: rule.executions[0].invoicesCreated,
            totalAmount: rule.executions[0].totalAmount
              ? Number(rule.executions[0].totalAmount)
              : null,
            errorMessage: rule.executions[0].errorMessage,
          }
        : null,
    }));

    return NextResponse.json({
      data: transformedRules,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching billing rules");
    return NextResponse.json(
      { error: "Fehler beim Laden der Abrechnungsregeln" },
      { status: 500 }
    );
  }
}

// POST /api/admin/billing-rules
export async function POST(request: NextRequest) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const body = await request.json();
    const validatedData = createRuleSchema.parse(body);

    // Validiere Cron-Pattern wenn CUSTOM_CRON
    if (validatedData.frequency === "CUSTOM_CRON" && !validatedData.cronPattern) {
      return NextResponse.json(
        { error: "Cron-Pattern ist erforderlich fuer CUSTOM_CRON Frequenz" },
        { status: 400 }
      );
    }

    // Validiere Parameter basierend auf Regel-Typ
    const paramValidation = validateRuleParameters(
      validatedData.ruleType as BillingRuleType,
      validatedData.parameters
    );

    if (!paramValidation.valid) {
      return NextResponse.json(
        { error: paramValidation.error || "Ungueltige Parameter" },
        { status: 400 }
      );
    }

    // Berechne nextRunAt
    const nextRunAt = calculateNextRun({
      frequency: validatedData.frequency as BillingRuleFrequency,
      cronPattern: validatedData.cronPattern || null,
      dayOfMonth: validatedData.dayOfMonth || null,
      lastRunAt: null,
      nextRunAt: null,
    });

    // Erstelle Regel
    const rule = await prisma.billingRule.create({
      data: {
        name: validatedData.name,
        description: validatedData.description,
        ruleType: validatedData.ruleType as BillingRuleType,
        frequency: validatedData.frequency as BillingRuleFrequency,
        cronPattern: validatedData.cronPattern,
        dayOfMonth: validatedData.dayOfMonth,
        parameters: validatedData.parameters as Prisma.InputJsonValue,
        isActive: validatedData.isActive,
        nextRunAt,
        tenantId: check.tenantId!,
      },
    });

    return NextResponse.json(
      {
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
    logger.error({ err: error }, "Error creating billing rule");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Abrechnungsregel" },
      { status: 500 }
    );
  }
}
