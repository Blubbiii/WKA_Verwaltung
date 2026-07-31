/**
 * GET   /api/curtailment/[id] — Ereignis laden
 * PATCH /api/curtailment/[id] — Ereignis ändern, Zahlung erfassen
 * POST  /api/curtailment/[id] — Ausfallarbeit und Forderung berechnen
 *
 * A4 (Audit 2026-07).
 *
 * Das Berechnen ist ein eigener Vorgang (POST) und kein Nebeneffekt des
 * Speicherns: es liest Zeitreihen aller betroffenen Anlagen, und an ein
 * Formular-Speichern gehängt würde jede Notizänderung die gestellte Forderung
 * unbemerkt verschieben.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import { computeCurtailmentEvent } from "@/lib/curtailment/event-service";

const updateSchema = z
  .object({
    endAt: z.string().nullable().optional(),
    legalBasis: z.enum(["EEG_15", "ENWG_13A", "OTHER"]).optional(),
    gridOperator: z.string().max(200).nullable().optional(),
    gridOperatorReference: z.string().max(100).nullable().optional(),
    reason: z.string().max(200).nullable().optional(),
    description: z.string().nullable().optional(),
    additionalExpensesEur: z.number().nullable().optional(),
    savedExpensesEur: z.number().nullable().optional(),
    claimStatus: z
      .enum(["OPEN", "SUBMITTED", "ACKNOWLEDGED", "PARTIALLY_PAID", "PAID", "REJECTED", "TIME_BARRED"])
      .optional(),
    claimSubmittedAt: z.string().nullable().optional(),
    claimDeadline: z.string().nullable().optional(),
    claimNotes: z.string().nullable().optional(),
    compensationPaidEur: z.number().nonnegative().nullable().optional(),
    compensationPaidAt: z.string().nullable().optional(),
    gridOperatorReportedKwh: z.number().nonnegative().nullable().optional(),
    followUpAt: z.string().nullable().optional(),
    lostWorkNotes: z.string().nullable().optional(),
  })
  .strict();

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission(PERMISSIONS.CURTAILMENT_READ);
    if (!check.authorized) return check.error;

    const { id } = await params;

    const event = await prisma.curtailmentEvent.findFirst({
      where: { id, tenantId: check.tenantId! },
      include: {
        park: { select: { id: true, name: true, shortName: true } },
        turbine: { select: { id: true, designation: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!event) {
      return apiError("NOT_FOUND", 404, { message: "Ereignis nicht gefunden" });
    }

    return NextResponse.json(event);
  } catch (error) {
    logger.error({ err: error }, "[Curtailment] Laden fehlgeschlagen");
    return apiError("FETCH_FAILED", 500, { message: "Ereignis konnte nicht geladen werden" });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission(PERMISSIONS.CURTAILMENT_MANAGE);
    if (!check.authorized) return check.error;

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

    const existing = await prisma.curtailmentEvent.findFirst({
      where: { id, tenantId: check.tenantId! },
      select: {
        id: true,
        eventNumber: true,
        startAt: true,
        claimEur: true,
        compensationPaidEur: true,
        claimStatus: true,
      },
    });
    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Ereignis nicht gefunden" });
    }

    if (data.endAt && new Date(data.endAt) < existing.startAt) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ende liegt vor dem Beginn" });
    }

    // Zahlungsstand ableiten, wenn ein Betrag erfasst wird und der Status
    // nicht ausdrücklich mitgesetzt wird. Ohne das bleibt eine teilweise
    // gezahlte Forderung auf "gestellt" stehen und faellt aus der
    // Nachverfolgung.
    let derivedStatus: typeof existing.claimStatus | undefined;
    if (data.compensationPaidEur !== undefined && data.claimStatus === undefined) {
      const paid = data.compensationPaidEur ?? 0;
      const claim = toNumber(existing.claimEur) ?? 0;
      if (paid <= 0) {
        derivedStatus = undefined;
      } else if (claim > 0 && paid + 0.01 < claim) {
        derivedStatus = "PARTIALLY_PAID";
      } else {
        derivedStatus = "PAID";
      }
    }

    const updated = await prisma.curtailmentEvent.update({
      where: { id },
      data: {
        ...(data.endAt !== undefined && { endAt: data.endAt ? new Date(data.endAt) : null }),
        ...(data.legalBasis !== undefined && { legalBasis: data.legalBasis }),
        ...(data.gridOperator !== undefined && { gridOperator: data.gridOperator }),
        ...(data.gridOperatorReference !== undefined && {
          gridOperatorReference: data.gridOperatorReference,
        }),
        ...(data.reason !== undefined && { reason: data.reason }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.additionalExpensesEur !== undefined && {
          additionalExpensesEur: data.additionalExpensesEur,
        }),
        ...(data.savedExpensesEur !== undefined && { savedExpensesEur: data.savedExpensesEur }),
        ...(data.claimStatus !== undefined && { claimStatus: data.claimStatus }),
        ...(derivedStatus !== undefined && { claimStatus: derivedStatus }),
        ...(data.claimSubmittedAt !== undefined && {
          claimSubmittedAt: data.claimSubmittedAt ? new Date(data.claimSubmittedAt) : null,
        }),
        ...(data.claimDeadline !== undefined && {
          claimDeadline: data.claimDeadline ? new Date(data.claimDeadline) : null,
        }),
        ...(data.claimNotes !== undefined && { claimNotes: data.claimNotes }),
        ...(data.compensationPaidEur !== undefined && {
          compensationPaidEur: data.compensationPaidEur,
        }),
        ...(data.compensationPaidAt !== undefined && {
          compensationPaidAt: data.compensationPaidAt ? new Date(data.compensationPaidAt) : null,
        }),
        ...(data.gridOperatorReportedKwh !== undefined && {
          gridOperatorReportedKwh: data.gridOperatorReportedKwh,
        }),
        ...(data.followUpAt !== undefined && {
          followUpAt: data.followUpAt ? new Date(data.followUpAt) : null,
        }),
        ...(data.lostWorkNotes !== undefined && { lostWorkNotes: data.lostWorkNotes }),
      },
    });

    await createAuditLog({
      action: "UPDATE",
      entityType: "Park",
      entityId: id,
      description: `Abregelungsereignis ${existing.eventNumber} geändert`,
    });

    return NextResponse.json(updated);
  } catch (error) {
    logger.error({ err: error }, "[Curtailment] Änderung fehlgeschlagen");
    return apiError("UPDATE_FAILED", 500, { message: "Ereignis konnte nicht geändert werden" });
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission(PERMISSIONS.CURTAILMENT_COMPUTE);
    if (!check.authorized) return check.error;

    const { id } = await params;

    const existing = await prisma.curtailmentEvent.findFirst({
      where: { id, tenantId: check.tenantId! },
      select: { id: true, eventNumber: true, claimStatus: true },
    });
    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Ereignis nicht gefunden" });
    }

    // Eine bereits gestellte oder bezahlte Forderung neu zu berechnen würde
    // die Grundlage dessen ändern, was der Netzbetreiber vorliegen hat.
    if (["SUBMITTED", "ACKNOWLEDGED", "PARTIALLY_PAID", "PAID"].includes(existing.claimStatus)) {
      return apiError("OPERATION_NOT_ALLOWED", 400, {
        message:
          "Die Forderung ist bereits gestellt. Eine Neuberechnung würde die Grundlage ändern — bitte zuerst den Anspruchsstand zurücksetzen.",
      });
    }

    const result = await computeCurtailmentEvent({ tenantId: check.tenantId!, eventId: id });

    if (result.lostWorkKwh === null) {
      // Nichts schreiben. Ein Ereignis ohne Bezifferung ist ehrlicher als eines
      // mit einer erfundenen.
      return NextResponse.json({ computed: false, reason: result.reason }, { status: 200 });
    }

    const updated = await prisma.curtailmentEvent.update({
      where: { id },
      data: {
        lostWorkKwh: result.lostWorkKwh,
        lostWorkMethod: result.lostWorkMethod,
        lostWorkBasis: (result.lostWorkBasis as Prisma.InputJsonValue) ?? Prisma.DbNull,
        ratePerKwh: result.ratePerKwh,
        rateSource: result.rateSource,
        lostRevenueEur: result.lostRevenueEur,
        portionAt95Eur: result.portionAt95Eur,
        portionAt100Eur: result.portionAt100Eur,
        claimEur: result.claimEur,
        annualRevenueBasisEur: result.annualRevenueBasisEur,
        priorLostRevenueInYearEur: result.priorLostRevenueInYearEur,
        computedAt: new Date(),
      },
    });

    await createAuditLog({
      action: "UPDATE",
      entityType: "Park",
      entityId: id,
      description: `Ausfallarbeit für ${existing.eventNumber} ermittelt: ${result.lostWorkKwh} kWh`,
    });

    return NextResponse.json({
      computed: true,
      event: updated,
      // Die Hinweise gehören vor die Augen des Bearbeiters, bevor er die
      // Forderung stellt — vor allem der zur unbekannten Jahreseinnahme.
      warnings: result.warnings,
      rateFound: result.ratePerKwh !== null,
    });
  } catch (error) {
    logger.error({ err: error }, "[Curtailment] Berechnung fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, { message: "Berechnung fehlgeschlagen" });
  }
}

function toNumber(value: Prisma.Decimal | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
