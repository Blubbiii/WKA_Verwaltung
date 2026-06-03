/**
 * GET /api/approvals/my-decisions
 *
 * Liste der Approval-Requests, die der aktuelle User entschieden hat
 * (APPROVED oder REJECTED). Nur abgeschlossene Entscheidungen.
 */

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { listMyDecisions } from "@/lib/approvals/manager";

export async function GET() {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;
    if (!check.tenantId || !check.userId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant/User fehlt" });
    }

    const requests = await listMyDecisions(check.tenantId, check.userId);

    return NextResponse.json({
      data: requests.map((r) => ({
        id: r.id,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        amountEur: r.amountEur ? Number(r.amountEur) : null,
        status: r.status,
        requestedAt: r.requestedAt.toISOString(),
        requestReason: r.requestReason,
        decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
        decisionReason: r.decisionReason,
        requestedBy: r.requestedBy
          ? {
              id: r.requestedBy.id,
              firstName: r.requestedBy.firstName,
              lastName: r.requestedBy.lastName,
              email: r.requestedBy.email,
            }
          : null,
        executionError: r.executionError,
        executedAt: r.executedAt ? r.executedAt.toISOString() : null,
      })),
      total: requests.length,
    });
  } catch (error) {
    logger.error({ err: error }, "My-Decisions-List fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, {
      message: "Approval-Liste fehlgeschlagen",
    });
  }
}
