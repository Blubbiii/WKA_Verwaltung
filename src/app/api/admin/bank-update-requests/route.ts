/**
 * PF-3: Admin-API für Bankdaten-Änderungs-Approval-Workflow.
 *
 * GET  /api/admin/bank-update-requests       → Liste aller pending requests
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("admin:manage");
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("BAD_REQUEST", undefined, { message: "Kein Mandant zugeordnet" });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "PENDING";

    const requests = await prisma.pendingBankUpdate.findMany({
      where: {
        tenantId: check.tenantId,
        ...(status !== "ALL" && { status: status as "PENDING" | "APPROVED" | "REJECTED" }),
      },
      include: {
        person: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            companyName: true,
            email: true,
            bankIban: true,
            bankBic: true,
            bankName: true,
          },
        },
        decidedBy: { select: { id: true, firstName: true, lastName: true } },
        requestedByUser: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { requestedAt: "desc" },
    });

    return NextResponse.json({
      data: requests.map((r) => ({
        id: r.id,
        personId: r.personId,
        personName:
          r.person.companyName ||
          [r.person.firstName, r.person.lastName].filter(Boolean).join(" "),
        personEmail: r.person.email,
        currentIban: r.person.bankIban,
        currentBic: r.person.bankBic,
        currentBankName: r.person.bankName,
        requestedIban: r.requestedIban,
        requestedBic: r.requestedBic,
        requestedBankName: r.requestedBankName,
        previousIban: r.previousIban,
        previousBic: r.previousBic,
        previousBankName: r.previousBankName,
        status: r.status,
        requestedAt: r.requestedAt.toISOString(),
        decidedAt: r.decidedAt?.toISOString() || null,
        decisionNotes: r.decisionNotes,
        decidedBy: r.decidedBy
          ? [r.decidedBy.firstName, r.decidedBy.lastName].filter(Boolean).join(" ")
          : null,
        requestedBy: r.requestedByUser
          ? [r.requestedByUser.firstName, r.requestedByUser.lastName].filter(Boolean).join(" ") ||
            r.requestedByUser.email
          : null,
      })),
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching bank update requests");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Anfragen" });
  }
}
