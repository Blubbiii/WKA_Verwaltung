/**
 * GET /api/approvals/[id]/diff
 *
 * Feature B7: Diff-Vorschau für einen ApprovalRequest.
 * Liefert strukturierte Vorher/Nachher-Werte für die UI, damit der Decider
 * vor der Freigabe sieht *was sich verändern wird*.
 *
 * Permissions: kein extra Check — wer den Approval-Request lesen darf
 * (accounting:read), sieht auch dessen Diff. Tenant-Isolation läuft über
 * den tenantId-Filter im Diff-Computer.
 */

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { computeApprovalDiff } from "@/lib/approvals/compute-diff";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;
    if (!check.tenantId || !check.userId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant/User fehlt" });
    }

    const { id } = await params;
    const diff = await computeApprovalDiff(id, check.tenantId);

    return NextResponse.json({ diff });
  } catch (error) {
    logger.error({ err: error }, "Approval-Diff-Computation fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, {
      message: "Approval-Diff konnte nicht berechnet werden",
    });
  }
}
