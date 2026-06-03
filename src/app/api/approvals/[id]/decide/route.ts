/**
 * POST /api/approvals/[id]/decide
 *
 * Sprint 3: Entscheidet einen ApprovalRequest (APPROVE oder REJECT).
 * Body: { decision: "APPROVED" | "REJECTED", reason?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import {
  decideApproval,
  ApprovalNotFoundError,
  ApprovalAlreadyDecidedError,
  SelfApprovalForbiddenError,
  ApprovalExpiredError,
} from "@/lib/approvals/manager";

const schema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  reason: z.string().max(500).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;
    if (!check.tenantId || !check.userId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant/User fehlt" });
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400, {
        message: parsed.error.issues[0]?.message || "Ungültige Eingabe",
      });
    }

    try {
      const updated = await decideApproval({
        requestId: id,
        tenantId: check.tenantId,
        deciderId: check.userId,
        decision: parsed.data.decision,
        decisionReason: parsed.data.reason,
      });

      logger.info(
        {
          tenantId: check.tenantId,
          userId: check.userId,
          requestId: id,
          decision: parsed.data.decision,
        },
        "Approval-Request entschieden",
      );

      return NextResponse.json({
        id: updated.id,
        status: updated.status,
        decidedAt: updated.decidedAt?.toISOString(),
      });
    } catch (err) {
      if (err instanceof ApprovalNotFoundError) {
        return apiError("NOT_FOUND", 404, { message: err.message });
      }
      if (err instanceof ApprovalAlreadyDecidedError) {
        return apiError("CONFLICT", 409, { message: err.message });
      }
      if (err instanceof SelfApprovalForbiddenError) {
        return apiError("SELF_APPROVAL_FORBIDDEN", 403, { message: err.message });
      }
      if (err instanceof ApprovalExpiredError) {
        return apiError("BAD_REQUEST", 400, { message: err.message });
      }
      throw err;
    }
  } catch (error) {
    logger.error({ err: error }, "Approval-Decide fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, { message: "Approval-Decide fehlgeschlagen" });
  }
}
