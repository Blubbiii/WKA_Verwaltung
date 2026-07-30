/**
 * GET   /api/availability/settlements/[id] — Abgleich laden
 * PATCH /api/availability/settlements/[id] — Abgleich ändern oder bestätigen
 *
 * A2 (Audit 2026-07).
 *
 * Das Bestätigen ist bewusst ein eigenes Recht (`availability:confirm`) und
 * nicht Teil von `availability:settle`: Rechnen darf, wer die Technik kennt;
 * Festschreiben, wer die Forderung verantwortet. Ein bestätigter Abgleich ist
 * die Grundlage einer Gutschrift gegenüber dem Hersteller.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";

const updateSchema = z.object({
  vendorReportedPct: z.number().min(0).max(100).nullable().optional(),
  vendorReportNotes: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(["DRAFT", "CONFIRMED", "INVOICED", "DISPUTED"]).optional(),
  invoiceId: z.string().uuid().nullable().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission(PERMISSIONS.AVAILABILITY_READ);
    if (!check.authorized) return check.error;

    const { id } = await params;

    const settlement = await prisma.availabilitySettlement.findFirst({
      where: { id, tenantId: check.tenantId! },
      include: {
        guarantee: {
          include: {
            tiers: { orderBy: { sortOrder: "asc" } },
            contract: {
              select: {
                id: true,
                title: true,
                contractNumber: true,
                annualValue: true,
                park: { select: { id: true, name: true, shortName: true } },
              },
            },
          },
        },
        invoice: { select: { id: true, invoiceNumber: true, status: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!settlement) {
      return apiError("NOT_FOUND", 404, { message: "Abgleich nicht gefunden" });
    }

    return NextResponse.json(settlement);
  } catch (error) {
    logger.error({ err: error }, "[Availability] Abgleich konnte nicht geladen werden");
    return apiError("FETCH_FAILED", 500, { message: "Abgleich konnte nicht geladen werden" });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        message: "Ungültige Eingabe",
        details: parsed.error.issues,
      });
    }
    const data = parsed.data;

    // Der Statuswechsel auf CONFIRMED verlangt das eigene Recht. Alles andere
    // (Herstellerangabe nachtragen, Notizen) reicht mit settle.
    const wantsConfirm = data.status === "CONFIRMED";
    const check = await requirePermission(
      wantsConfirm ? PERMISSIONS.AVAILABILITY_CONFIRM : PERMISSIONS.AVAILABILITY_SETTLE,
    );
    if (!check.authorized) return check.error;

    const existing = await prisma.availabilitySettlement.findFirst({
      where: { id, tenantId: check.tenantId! },
      select: {
        id: true,
        status: true,
        actualAvailabilityPct: true,
        periodStart: true,
        confirmedAt: true,
      },
    });
    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Abgleich nicht gefunden" });
    }

    // Ein Abgleich ohne Ergebnis lässt sich nicht bestätigen: es gäbe nichts
    // festzuschreiben, und der Status würde eine Aussage vorspiegeln.
    if (wantsConfirm && existing.actualAvailabilityPct === null) {
      return apiError("OPERATION_NOT_ALLOWED", 400, {
        message:
          "Der Abgleich hat kein Ergebnis. Bitte zuerst die Datengrundlage klären oder den Abgleich verwerfen.",
      });
    }

    // Ein abgerechneter Abgleich ist Grundlage einer gestellten Forderung.
    // Ihn zurück auf Entwurf zu setzen würde die Rechnung ohne Grundlage
    // stehen lassen.
    if (existing.status === "INVOICED" && data.status && data.status !== "INVOICED") {
      return apiError("OPERATION_NOT_ALLOWED", 400, {
        message:
          "Der Abgleich ist bereits abgerechnet. Bitte zuerst die zugehörige Rechnung stornieren.",
      });
    }

    if (data.invoiceId) {
      const invoice = await prisma.invoice.findFirst({
        where: { id: data.invoiceId, tenantId: check.tenantId!, deletedAt: null },
        select: { id: true },
      });
      if (!invoice) {
        return apiError("NOT_FOUND", 404, { message: "Rechnung nicht gefunden" });
      }
    }

    const updated = await prisma.availabilitySettlement.update({
      where: { id },
      data: {
        ...(data.vendorReportedPct !== undefined && { vendorReportedPct: data.vendorReportedPct }),
        ...(data.vendorReportNotes !== undefined && { vendorReportNotes: data.vendorReportNotes }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.invoiceId !== undefined && { invoiceId: data.invoiceId }),
        // Nur beim ERSTEN Bestätigen setzen — sonst schiebt jedes weitere
        // Speichern den Zeitpunkt nach vorne und die Historie stimmt nicht.
        ...(wantsConfirm && existing.confirmedAt === null && { confirmedAt: new Date() }),
      },
    });

    await createAuditLog({
      action: "UPDATE",
      entityType: "Contract",
      entityId: id,
      description: wantsConfirm
        ? `Verfügbarkeitsabgleich ${existing.periodStart.getFullYear()} bestätigt`
        : `Verfügbarkeitsabgleich ${existing.periodStart.getFullYear()} geändert`,
    });

    return NextResponse.json(updated);
  } catch (error) {
    logger.error({ err: error }, "[Availability] Abgleich konnte nicht geändert werden");
    return apiError("UPDATE_FAILED", 500, { message: "Abgleich konnte nicht geändert werden" });
  }
}
