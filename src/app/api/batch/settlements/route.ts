import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { processBatch } from "@/lib/batch/batch-operations";
import { createAuditLog } from "@/lib/audit";

const batchSettlementSchema = z.object({
  action: z.enum(["approve", "reject"]),
  settlementIds: z.array(z.string().uuid()).min(1).max(100),
  reason: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("energy:update");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = batchSettlementSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Anfrage", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { action, settlementIds, reason } = parsed.data;

    const settlements = await prisma.energySettlement.findMany({
      where: { id: { in: settlementIds } },
      select: { id: true, status: true, park: { select: { tenantId: true } } },
    });

    const foundIds = new Set(settlements.map((s) => s.id));
    const missingIds = settlementIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      return NextResponse.json(
        { error: `Abrechnungen nicht gefunden: ${missingIds.join(", ")}` },
        { status: 404 }
      );
    }

    // Tenant check
    const unauthorized = settlements.filter(
      (s) => s.park.tenantId !== check.tenantId
    );
    if (unauthorized.length > 0) {
      return NextResponse.json(
        { error: "Keine Berechtigung für einige Abrechnungen" },
        { status: 403 }
      );
    }

    const result = await processBatch(settlementIds, async (id) => {
      const settlement = settlements.find((s) => s.id === id)!;

      switch (action) {
        case "approve": {
          if (settlement.status !== "CALCULATED") {
            throw new Error(
              `Abrechnung hat Status ${settlement.status}, nur CALCULATED kann genehmigt werden`
            );
          }
          await prisma.energySettlement.update({
            where: { id },
            data: { status: "INVOICED", notes: reason || undefined },
          });
          break;
        }

        case "reject": {
          if (
            settlement.status !== "CALCULATED" &&
            settlement.status !== "INVOICED"
          ) {
            throw new Error(
              `Abrechnung hat Status ${settlement.status}, kann nicht abgelehnt werden`
            );
          }
          await prisma.energySettlement.update({
            where: { id },
            data: {
              status: "DRAFT",
              notes: reason ? `Abgelehnt: ${reason}` : "Abgelehnt",
            },
          });
          break;
        }
      }

      await createAuditLog({
        action: "UPDATE",
        entityType: "EnergySettlement",
        entityId: id,
        newValues: { batchAction: action, reason },
        description: `Batch ${action}: Energieabrechnung`,
      });
    });

    return NextResponse.json({
      action,
      ...result,
      message: `${result.success.length} von ${result.totalProcessed} Abrechnungen erfolgreich verarbeitet`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Interner Serverfehler",
      },
      { status: 500 }
    );
  }
}
