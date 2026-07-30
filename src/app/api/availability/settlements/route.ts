/**
 * GET  /api/availability/settlements — Jahresabgleiche auflisten
 * POST /api/availability/settlements — Abgleich rechnen und festhalten
 *
 * A2 (Audit 2026-07): Der Hersteller rechnet die Verfügbarkeit selbst ab. Das
 * hier ist die Gegenrechnung — und die Abweichung zwischen beiden ist der
 * eigentliche Ertrag dieser Funktion.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import { computeSettlement } from "@/lib/availability/settlement-service";

const createSchema = z
  .object({
    guaranteeId: z.string().uuid(),
    periodStart: z.string(),
    periodEnd: z.string(),
    /** Was der Hersteller gemeldet hat — optional, aber der Kern des Abgleichs. */
    vendorReportedPct: z.number().min(0).max(100).nullable().optional(),
    vendorReportNotes: z.string().optional(),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (new Date(data.periodEnd) <= new Date(data.periodStart)) {
      ctx.addIssue({
        code: "custom",
        path: ["periodEnd"],
        message: "Das Ende des Zeitraums muss nach dem Beginn liegen",
      });
    }
  });

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.AVAILABILITY_READ);
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const guaranteeId = searchParams.get("guaranteeId");
    const status = searchParams.get("status");

    const settlements = await prisma.availabilitySettlement.findMany({
      where: {
        tenantId: check.tenantId!,
        ...(guaranteeId ? { guaranteeId } : {}),
        ...(status ? { status: status as never } : {}),
      },
      include: {
        guarantee: {
          select: {
            id: true,
            targetAvailabilityPct: true,
            contract: {
              select: {
                id: true,
                title: true,
                park: { select: { id: true, name: true, shortName: true } },
              },
            },
          },
        },
        invoice: { select: { id: true, invoiceNumber: true, status: true } },
      },
      orderBy: { periodStart: "desc" },
    });

    return NextResponse.json({ data: settlements });
  } catch (error) {
    logger.error({ err: error }, "[Availability] Abgleiche konnten nicht geladen werden");
    return apiError("FETCH_FAILED", 500, { message: "Abgleiche konnten nicht geladen werden" });
  }
}

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.AVAILABILITY_SETTLE);
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        message: "Ungültige Eingabe",
        details: parsed.error.issues,
      });
    }
    const data = parsed.data;

    const guarantee = await prisma.availabilityGuarantee.findFirst({
      where: { id: data.guaranteeId, tenantId: check.tenantId! },
      select: {
        id: true,
        targetAvailabilityPct: true,
        validFrom: true,
        validTo: true,
        contract: { select: { annualValue: true, title: true } },
      },
    });
    if (!guarantee) {
      return apiError("NOT_FOUND", 404, { message: "Garantie nicht gefunden" });
    }

    const periodStart = new Date(data.periodStart);
    const periodEnd = new Date(data.periodEnd);

    // Ein Zeitraum ausserhalb der Garantielaufzeit ergäbe eine Zahl, für die
    // es keine vertragliche Grundlage gibt. Lieber hier abweisen, als eine
    // unbegründete Forderung im System zu haben.
    if (periodStart < guarantee.validFrom) {
      return apiError("VALIDATION_FAILED", 400, {
        message: "Der Zeitraum beginnt vor der Laufzeit der Garantie",
      });
    }
    if (guarantee.validTo && periodEnd > guarantee.validTo) {
      return apiError("VALIDATION_FAILED", 400, {
        message: "Der Zeitraum endet nach der Laufzeit der Garantie",
      });
    }

    const existing = await prisma.availabilitySettlement.findFirst({
      where: { guaranteeId: data.guaranteeId, periodStart, periodEnd },
      select: { id: true, status: true },
    });
    if (existing) {
      // Nicht stillschweigend überschreiben: ein bestätigter Abgleich ist
      // Grundlage einer Forderung.
      return apiError("ALREADY_EXISTS", 409, {
        message: "Für diesen Zeitraum gibt es bereits einen Abgleich",
        details: { settlementId: existing.id, status: existing.status },
      });
    }

    const result = await computeSettlement({
      tenantId: check.tenantId!,
      guaranteeId: data.guaranteeId,
      periodStart,
      periodEnd,
    });

    // Auch ein nicht berechenbarer Abgleich wird angelegt — als Entwurf mit
    // Begründung. So bleibt sichtbar, dass für den Zeitraum geprüft wurde und
    // warum kein Ergebnis vorliegt, statt dass die Prüfung spurlos bleibt.
    const created = await prisma.availabilitySettlement.create({
      data: {
        tenantId: check.tenantId!,
        guaranteeId: data.guaranteeId,
        periodStart,
        periodEnd,
        actualAvailabilityPct: result.availabilityPct,
        targetAvailabilityPct: guarantee.targetAvailabilityPct,
        basis: result.basis
          ? (result.basis as unknown as object)
          : { reason: result.reason ?? "nicht berechenbar" },
        bonusMalusEur: result.bonusMalusEur,
        annualValueEur: guarantee.contract.annualValue,
        vendorReportedPct: data.vendorReportedPct ?? null,
        vendorReportNotes: data.vendorReportNotes,
        notes: data.notes,
        computedAt: new Date(),
        createdById: check.userId ?? null,
      },
      include: { guarantee: { select: { targetAvailabilityPct: true } } },
    });

    await createAuditLog({
      action: "CREATE",
      entityType: "Contract",
      entityId: data.guaranteeId,
      description: `Verfügbarkeitsabgleich ${periodStart.getFullYear()} zu "${guarantee.contract.title}": ${
        result.availabilityPct !== null ? `${result.availabilityPct} %` : "nicht berechenbar"
      }`,
    });

    return NextResponse.json(
      {
        settlement: created,
        computed: result.availabilityPct !== null,
        reason: result.reason,
        warnings: result.basis?.warnings ?? [],
        // Die Abweichung zur Herstellermeldung ist der Grund für die ganze
        // Funktion — deshalb ausgerechnet und nicht dem Client überlassen.
        vendorDeviation:
          data.vendorReportedPct != null && result.availabilityPct !== null
            ? Math.round((data.vendorReportedPct - result.availabilityPct) * 100) / 100
            : null,
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error({ err: error }, "[Availability] Abgleich fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, { message: "Abgleich konnte nicht gerechnet werden" });
  }
}
