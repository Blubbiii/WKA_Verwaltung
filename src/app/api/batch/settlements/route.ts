import { NextRequest, NextResponse, after } from "next/server";
import { apiError } from "@/lib/api-errors";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { hasPermission } from "@/lib/auth/permissions";
import { processBatch } from "@/lib/batch/batch-operations";
import { createAuditLog } from "@/lib/audit";

const batchSettlementSchema = z.object({
  action: z.enum(["approve", "reject"]),
  settlementIds: z.array(z.uuid()).min(1).max(100),
  reason: z.string().optional(),
});

/**
 * Statusmodell EnergySettlement (siehe prisma EnergySettlementStatus):
 *   DRAFT      → erfasst, noch nicht verteilt
 *   CALCULATED → Verteilung berechnet, noch keine Gutschriften
 *   INVOICED   → Gutschriften existieren (NUR via create-invoices erreichbar)
 *   CLOSED     → freigegeben/abgeschlossen
 *
 * Deshalb:
 * - "approve" = Freigabe einer bereits fakturierten Abrechnung (INVOICED → CLOSED).
 *   Ein Sprung CALCULATED → INVOICED ohne Rechnungen ist fachlich falsch (Settlement
 *   gilt als abgerechnet, es floss nie Geld) und blockiert zusätzlich create-invoices.
 * - "reject" = Rückabwicklung der Berechnung (CALCULATED → DRAFT). Nur zulässig, solange
 *   KEIN Item eine invoiceId trägt — sonst könnten über calculate + create-invoices
 *   doppelte Gutschriften für denselben Zeitraum entstehen.
 */

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("energy:update");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = batchSettlementSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültige Anfrage", details: parsed.error.flatten() });
    }

    const { action, settlementIds, reason } = parsed.data;

    // "approve" schließt eine fakturierte Abrechnung ab → Finalize-Recht nötig.
    if (action === "approve") {
      const canFinalize = await hasPermission(check.userId!, "energy:settlements:finalize");
      if (!canFinalize) {
        return apiError("FORBIDDEN", 403, {
          message: "Zum Freigeben von Stromabrechnungen fehlt die Berechtigung energy:settlements:finalize",
        });
      }
    }

    // Scoped by tenantId to prevent ID-enumeration across tenants
    const settlements = await prisma.energySettlement.findMany({
      where: { id: { in: settlementIds }, tenantId: check.tenantId! },
      select: {
        id: true,
        status: true,
        items: { select: { invoiceId: true } },
      },
    });

    const foundIds = new Set(settlements.map((s) => s.id));
    const missingIds = settlementIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      return apiError("NOT_FOUND", 404, { message: `Abrechnungen nicht gefunden: ${missingIds.join(", ")}` });
    }

    const result = await processBatch(settlementIds, async (id) => {
      const settlement = settlements.find((s) => s.id === id)!;
      const hasInvoices = settlement.items.some((it) => it.invoiceId !== null);

      switch (action) {
        case "approve": {
          // Freigabe = INVOICED → CLOSED. Ein Settlement ohne Gutschriften darf
          // NIE als abgerechnet gelten.
          if (settlement.status !== "INVOICED") {
            throw new Error(
              `Abrechnung hat Status ${settlement.status}, nur fakturierte Abrechnungen (INVOICED) können freigegeben werden. Erzeuge zuerst die Gutschriften.`
            );
          }
          if (!hasInvoices) {
            throw new Error(
              "Abrechnung ist als INVOICED markiert, es existieren aber keine Gutschriften — bitte Datenstand prüfen"
            );
          }
          await prisma.energySettlement.update({
            where: { id, tenantId: check.tenantId!},
            data: { status: "CLOSED", notes: reason || undefined },
          });
          break;
        }

        case "reject": {
          if (settlement.status !== "CALCULATED") {
            throw new Error(
              `Abrechnung hat Status ${settlement.status}, nur berechnete Abrechnungen (CALCULATED) können zurückgewiesen werden`
            );
          }
          // Schutz gegen doppelte Gutschriften: calculate löscht beim Neuberechnen
          // ALLE Items (auch die mit invoiceId), danach würde create-invoices einen
          // zweiten Satz Gutschriften für denselben Zeitraum erzeugen.
          if (hasInvoices) {
            throw new Error(
              "Für diese Abrechnung existieren bereits Gutschriften — bitte zuerst die Gutschriften stornieren"
            );
          }
          await prisma.energySettlement.update({
            where: { id, tenantId: check.tenantId!},
            data: {
              status: "DRAFT",
              notes: reason ? `Abgelehnt: ${reason}` : "Abgelehnt",
            },
          });
          break;
        }
      }

      after(async () => {
        await createAuditLog({
          action: "UPDATE",
          entityType: "EnergySettlement",
          entityId: id,
          newValues: { batchAction: action, reason },
          description: `Batch ${action}: Energieabrechnung`,
        });
      });
    });

    return NextResponse.json({
      action,
      ...result,
      message: `${result.success.length} von ${result.totalProcessed} Abrechnungen erfolgreich verarbeitet`,
    });
  } catch (error) {
    return apiError("INTERNAL_ERROR", 500, { message: error instanceof Error ? error.message : "Interner Serverfehler" });
  }
}
