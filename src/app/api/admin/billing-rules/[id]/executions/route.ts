/**
 * API Route: /api/admin/billing-rules/[id]/executions
 * GET: Ausführungshistorie einer Regel (paginiert)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

// GET /api/admin/billing-rules/[id]/executions
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const status = searchParams.get("status");

    // Pruefe ob Regel existiert und zum Tenant gehoert
    const rule = await prisma.billingRule.findUnique({
      where: {
        id,
        tenantId: check.tenantId!,
      },
      select: {
        id: true,
        name: true,
        ruleType: true,
      },
    });

    if (!rule) {
      return NextResponse.json(
        { error: "Abrechnungsregel nicht gefunden" },
        { status: 404 }
      );
    }

    // Baue Where-Clause
    const where = {
      ruleId: id,
      ...(status && { status }),
    };

    // Lade Ausführungen
    const [executions, total] = await Promise.all([
      prisma.billingRuleExecution.findMany({
        where,
        orderBy: { startedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          status: true,
          startedAt: true,
          completedAt: true,
          invoicesCreated: true,
          totalAmount: true,
          errorMessage: true,
          details: true,
        },
      }),
      prisma.billingRuleExecution.count({ where }),
    ]);

    // Statistiken berechnen
    const stats = await prisma.billingRuleExecution.groupBy({
      by: ["status"],
      where: { ruleId: id },
      _count: { status: true },
    });

    const statusCounts = {
      success: 0,
      failed: 0,
      partial: 0,
    };

    for (const stat of stats) {
      if (stat.status in statusCounts) {
        statusCounts[stat.status as keyof typeof statusCounts] = stat._count.status;
      }
    }

    // Gesamtsumme berechnen
    const totals = await prisma.billingRuleExecution.aggregate({
      where: { ruleId: id },
      _sum: {
        invoicesCreated: true,
        totalAmount: true,
      },
    });

    return NextResponse.json({
      rule: {
        id: rule.id,
        name: rule.name,
        ruleType: rule.ruleType,
      },
      data: executions.map((exec) => ({
        id: exec.id,
        status: exec.status,
        startedAt: exec.startedAt.toISOString(),
        completedAt: exec.completedAt?.toISOString() || null,
        duration: exec.completedAt
          ? exec.completedAt.getTime() - exec.startedAt.getTime()
          : null,
        invoicesCreated: exec.invoicesCreated,
        totalAmount: exec.totalAmount ? Number(exec.totalAmount) : null,
        errorMessage: exec.errorMessage,
        details: exec.details,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      statistics: {
        totalExecutions: total,
        statusCounts,
        totalInvoicesCreated: totals._sum.invoicesCreated || 0,
        totalAmount: totals._sum.totalAmount ? Number(totals._sum.totalAmount) : 0,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching billing rule executions");
    return NextResponse.json(
      { error: "Fehler beim Laden der Ausführungshistorie" },
      { status: 500 }
    );
  }
}
