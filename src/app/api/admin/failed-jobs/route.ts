/**
 * Dead-Letter-Queue: Lesepfad.
 *
 * GET /api/admin/failed-jobs → endgueltig gescheiterte Jobs
 *
 * F18 (Audit 2026-07, Worker/Queues): Die Tabelle `FailedJob` wurde befuellt,
 * aber NIRGENDS im Code gelesen — keine API, keine UI, kein Alert. Endgueltig
 * gescheiterte Jobs (inklusive saemtlicher E-Mails, siehe F3) verschwanden
 * lautlos in einer Tabelle, die niemand ansieht. Das Schema modelliert sogar
 * einen vollstaendigen Resolution-Workflow (resolved/resolvedAt/resolvedBy/
 * resolutionNote), der nie benutzt wurde.
 *
 * Mandantentrennung: Ein Tenant-Admin sieht nur die Fehlschlaege des eigenen
 * Mandanten. Systemjobs ohne tenantId bleiben Superadmins vorbehalten — die
 * Payloads enthalten Empfaengeradressen und Betraege.
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { isSuperadmin } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { PAGE_SIZE_ADMIN } from "@/lib/config/pagination";
import type { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("system:health");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const queueName = searchParams.get("queue");
    const resolvedParam = searchParams.get("resolved");
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || String(PAGE_SIZE_ADMIN), 10) || PAGE_SIZE_ADMIN, 1),
      100,
    );

    const crossTenant = await isSuperadmin(check.userId!);
    if (!crossTenant && !check.tenantId) {
      return apiError("BAD_REQUEST", undefined, { message: "Kein Mandant zugeordnet" });
    }

    const where: Prisma.FailedJobWhereInput = {
      // Superadmin sieht alles inkl. Systemjobs (tenantId = null).
      ...(crossTenant ? {} : { tenantId: check.tenantId }),
      ...(queueName && queueName !== "ALL" ? { queueName } : {}),
      ...(resolvedParam === "true"
        ? { resolved: true }
        : resolvedParam === "false"
          ? { resolved: false }
          : {}),
    };

    const [items, total, openCount, byQueue] = await Promise.all([
      prisma.failedJob.findMany({
        where,
        orderBy: { failedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.failedJob.count({ where }),
      // Offene Fehlschlaege insgesamt — das ist die Zahl, die ein Operator
      // wirklich braucht ("gibt es gerade etwas zu tun?").
      prisma.failedJob.count({
        where: {
          ...(crossTenant ? {} : { tenantId: check.tenantId }),
          resolved: false,
        },
      }),
      prisma.failedJob.groupBy({
        by: ["queueName"],
        where: {
          ...(crossTenant ? {} : { tenantId: check.tenantId }),
          resolved: false,
        },
        _count: { _all: true },
      }),
    ]);

    return NextResponse.json({
      data: items.map((job) => ({
        id: job.id,
        tenantId: job.tenantId,
        queueName: job.queueName,
        jobName: job.jobName,
        jobId: job.jobId,
        payload: job.payload,
        attemptsMade: job.attemptsMade,
        error: job.error,
        stackTrace: job.stackTrace,
        failedAt: job.failedAt.toISOString(),
        resolved: job.resolved,
        resolvedAt: job.resolvedAt?.toISOString() ?? null,
        resolvedBy: job.resolvedBy,
        resolutionNote: job.resolutionNote,
      })),
      summary: {
        openCount,
        byQueue: byQueue
          .map((row) => ({ queueName: row.queueName, count: row._count._all }))
          .sort((a, b) => b.count - a.count),
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[API:admin/failed-jobs] GET error");
    return apiError("FETCH_FAILED", 500, {
      message: "Fehler beim Laden der fehlgeschlagenen Jobs",
    });
  }
}
