/**
 * GET /api/approvals/pending
 *
 * Sprint 3: Liste aller PENDING ApprovalRequests die der aktuelle User
 * entscheiden kann (= nicht die er selbst initiiert hat).
 */

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { listPendingForUser } from "@/lib/approvals/manager";

export async function GET() {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;
    if (!check.tenantId || !check.userId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant/User fehlt" });
    }

    const requests = await listPendingForUser(check.tenantId, check.userId);

    return NextResponse.json({
      data: requests.map((r) => ({
        id: r.id,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        amountEur: r.amountEur ? Number(r.amountEur) : null,
        requestedBy: r.requestedBy,
        requestedAt: r.requestedAt.toISOString(),
        requestReason: r.requestReason,
        expiresAt: r.expiresAt.toISOString(),
      })),
      total: requests.length,
    });
  } catch (error) {
    logger.error({ err: error }, "Approval-List fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, { message: "Approval-List fehlgeschlagen" });
  }
}
