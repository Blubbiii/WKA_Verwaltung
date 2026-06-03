/**
 * PF-3: Approve / Reject einer pending Bankdaten-Änderung.
 *
 * POST /api/admin/bank-update-requests/:id  → body: { action: "APPROVE" | "REJECT", notes?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";
import { Prisma } from "@prisma/client";

const decisionSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  notes: z.string().max(1000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("admin:manage");
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("BAD_REQUEST", undefined, { message: "Kein Mandant zugeordnet" });
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = decisionSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", undefined, {
        message: "Ungültige Eingabe",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const pending = await prisma.pendingBankUpdate.findFirst({
      where: { id, tenantId: check.tenantId },
      include: { person: true },
    });
    if (!pending) {
      return apiError("NOT_FOUND", undefined, { message: "Anfrage nicht gefunden" });
    }
    if (pending.status !== "PENDING") {
      return apiError("CONFLICT", 409, { message: "Anfrage wurde bereits entschieden" });
    }

    const userId = check.userId;
    const newStatus = parsed.data.action === "APPROVE" ? "APPROVED" : "REJECTED";

    // Transaction: bei Approve → Person updaten + AuditLog + Pending updaten
    await prisma.$transaction(async (tx) => {
      await tx.pendingBankUpdate.update({
        where: { id: pending.id },
        data: {
          status: newStatus,
          decidedAt: new Date(),
          decidedById: userId || null,
          decisionNotes: parsed.data.notes || null,
        },
      });

      if (parsed.data.action === "APPROVE") {
        await tx.person.update({
          where: { id: pending.personId, tenantId: check.tenantId! },
          data: {
            bankIban: pending.requestedIban,
            bankBic: pending.requestedBic,
            bankName: pending.requestedBankName,
          },
        });
      }

      // Audit-Log
      await tx.auditLog.create({
        data: {
          action: parsed.data.action === "APPROVE" ? "BANK_UPDATE_APPROVED" : "BANK_UPDATE_REJECTED",
          entityType: "Person",
          entityId: pending.personId,
          tenantId: check.tenantId!,
          userId: userId || null,
          oldValues: {
            bankIban: pending.person.bankIban,
            bankBic: pending.person.bankBic,
            bankName: pending.person.bankName,
          },
          newValues:
            parsed.data.action === "APPROVE"
              ? ({
                  bankIban: pending.requestedIban,
                  bankBic: pending.requestedBic,
                  bankName: pending.requestedBankName,
                } as Prisma.InputJsonValue)
              : Prisma.JsonNull,
        },
      });
    });

    logger.info(
      { pendingId: pending.id, action: parsed.data.action, by: userId },
      "Bank update decision recorded"
    );

    return NextResponse.json({
      success: true,
      status: newStatus,
      message:
        parsed.data.action === "APPROVE"
          ? "Bankdaten-Änderung freigegeben"
          : "Bankdaten-Änderung abgelehnt",
    });
  } catch (error) {
    logger.error({ err: error }, "Error deciding bank update");
    return apiError("UPDATE_FAILED", undefined, { message: "Fehler bei der Entscheidung" });
  }
}
