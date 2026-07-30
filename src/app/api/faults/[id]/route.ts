/**
 * GET    /api/faults/[id] — Störungsvorgang laden
 * PATCH  /api/faults/[id] — Störungsvorgang ändern
 * DELETE /api/faults/[id] — Störungsvorgang entfernen
 *
 * A1 (Audit 2026-07).
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
import { valuateLostEnergy } from "@/lib/faults/lost-energy";

const updateSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().nullable().optional(),
    startAt: z.string().optional(),
    endAt: z.string().nullable().optional(),
    status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
    causeCategory: z
      .enum(["MANUFACTURER", "GRID", "WEATHER", "OWN_FAULT", "AUTHORITY", "THIRD_PARTY", "UNKNOWN"])
      .optional(),
    statusCodeId: z.string().uuid().nullable().optional(),

    // Ausfall von Hand setzen — der berechnete Weg läuft über /valuate.
    lostEnergyKwh: z.number().nonnegative().nullable().optional(),
    lostEnergyNotes: z.string().nullable().optional(),
    ratePerKwh: z.number().nonnegative().nullable().optional(),

    claimStatus: z
      .enum(["NONE", "PENDING", "ASSERTED", "ACCEPTED", "REJECTED", "SETTLED", "TIME_BARRED"])
      .optional(),
    claimDeadline: z.string().nullable().optional(),
    claimAmountEur: z.number().nullable().optional(),
    claimNotes: z.string().nullable().optional(),

    followUpAt: z.string().nullable().optional(),
    assignedToId: z.string().uuid().nullable().optional(),
    serviceEventId: z.string().uuid().nullable().optional(),
    operationalTaskId: z.string().uuid().nullable().optional(),
    defectId: z.string().uuid().nullable().optional(),
    resolutionNotes: z.string().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.startAt && data.endAt && new Date(data.endAt) < new Date(data.startAt)) {
      ctx.addIssue({ code: "custom", path: ["endAt"], message: "Ende liegt vor dem Beginn" });
    }
  });

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission(PERMISSIONS.FAULTS_READ);
    if (!check.authorized) return check.error;

    const { id } = await params;

    const faultCase = await prisma.faultCase.findFirst({
      where: { id, tenantId: check.tenantId! },
      include: {
        turbine: {
          select: {
            id: true,
            designation: true,
            ratedPowerKw: true,
            manufacturer: true,
            park: { select: { id: true, name: true, shortName: true } },
          },
        },
        statusCode: true,
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        serviceEvent: { select: { id: true, eventDate: true, eventType: true } },
        operationalTask: { select: { id: true, title: true, status: true } },
        defect: { select: { id: true, title: true, status: true } },
        scadaEvents: { orderBy: { eventTimestamp: "asc" } },
      },
    });

    if (!faultCase) {
      return apiError("NOT_FOUND", 404, { message: "Störungsvorgang nicht gefunden" });
    }

    return NextResponse.json(faultCase);
  } catch (error) {
    logger.error({ err: error }, "[FaultCase] Laden fehlgeschlagen");
    return apiError("FETCH_FAILED", 500, { message: "Störungsvorgang konnte nicht geladen werden" });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission(PERMISSIONS.FAULTS_UPDATE);
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

    const existing = await prisma.faultCase.findFirst({
      where: { id, tenantId: check.tenantId! },
      select: { id: true, caseNumber: true, lostEnergyKwh: true, ratePerKwh: true, status: true },
    });
    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Störungsvorgang nicht gefunden" });
    }

    // Wird der Ausfall von Hand gesetzt, muss das Verfahren mitwandern —
    // sonst behauptet der Datensatz weiterhin, die Zahl käme aus den
    // Referenzanlagen, und die hinterlegte Herleitung passt nicht mehr dazu.
    const manualEnergy = data.lostEnergyKwh !== undefined;

    // Ausfallwert neu bewerten, sobald Menge oder Satz sich ändern. Sonst
    // stünde ein Eurobetrag da, der zu den Feldern daneben nicht passt.
    const nextKwh = data.lostEnergyKwh !== undefined ? data.lostEnergyKwh : toNumber(existing.lostEnergyKwh);
    const nextRate = data.ratePerKwh !== undefined ? data.ratePerKwh : toNumber(existing.ratePerKwh);
    const recomputeRevenue = data.lostEnergyKwh !== undefined || data.ratePerKwh !== undefined;
    const lostRevenueEur =
      nextKwh !== null && nextRate !== null ? valuateLostEnergy(nextKwh, nextRate) : null;

    const becomesResolved =
      (data.status === "RESOLVED" || data.status === "CLOSED") &&
      existing.status !== "RESOLVED" &&
      existing.status !== "CLOSED";

    const updated = await prisma.faultCase.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.startAt !== undefined && { startAt: new Date(data.startAt) }),
        ...(data.endAt !== undefined && { endAt: data.endAt ? new Date(data.endAt) : null }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.causeCategory !== undefined && { causeCategory: data.causeCategory }),
        ...(data.statusCodeId !== undefined && { statusCodeId: data.statusCodeId }),

        ...(manualEnergy && {
          lostEnergyKwh: data.lostEnergyKwh,
          lostEnergyMethod: data.lostEnergyKwh === null ? null : "MANUAL",
          // Die alte Herleitung gehört zu einer Zahl, die es nicht mehr gibt.
          // Prisma.DbNull setzt die Spalte auf SQL NULL. Prisma.JsonNull
          // wuerde stattdessen den JSON-Wert null hineinschreiben — das
          // saehe in der Abfrage aus wie "Herleitung vorhanden, aber leer".
          lostEnergyBasis: Prisma.DbNull,
          lostEnergyComputedAt: data.lostEnergyKwh === null ? null : new Date(),
        }),
        ...(data.lostEnergyNotes !== undefined && { lostEnergyNotes: data.lostEnergyNotes }),
        ...(data.ratePerKwh !== undefined && {
          ratePerKwh: data.ratePerKwh,
          rateSource: data.ratePerKwh === null ? null : "manuell",
        }),
        ...(recomputeRevenue && { lostRevenueEur }),

        ...(data.claimStatus !== undefined && { claimStatus: data.claimStatus }),
        ...(data.claimDeadline !== undefined && {
          claimDeadline: data.claimDeadline ? new Date(data.claimDeadline) : null,
        }),
        ...(data.claimAmountEur !== undefined && { claimAmountEur: data.claimAmountEur }),
        ...(data.claimNotes !== undefined && { claimNotes: data.claimNotes }),

        ...(data.followUpAt !== undefined && {
          followUpAt: data.followUpAt ? new Date(data.followUpAt) : null,
        }),
        ...(data.assignedToId !== undefined && { assignedToId: data.assignedToId }),
        ...(data.serviceEventId !== undefined && { serviceEventId: data.serviceEventId }),
        ...(data.operationalTaskId !== undefined && { operationalTaskId: data.operationalTaskId }),
        ...(data.defectId !== undefined && { defectId: data.defectId }),
        ...(data.resolutionNotes !== undefined && { resolutionNotes: data.resolutionNotes }),

        // Erledigungszeitpunkt einmalig setzen — nicht bei jedem weiteren
        // Speichern nach vorne schieben.
        ...(becomesResolved && { resolvedAt: new Date() }),
      },
    });

    await createAuditLog({
      action: "UPDATE",
      entityType: "FaultCase",
      entityId: id,
      description: `Störungsvorgang ${existing.caseNumber} geändert`,
    });

    return NextResponse.json(updated);
  } catch (error) {
    logger.error({ err: error }, "[FaultCase] Änderung fehlgeschlagen");
    return apiError("UPDATE_FAILED", 500, { message: "Störungsvorgang konnte nicht geändert werden" });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission(PERMISSIONS.FAULTS_DELETE);
    if (!check.authorized) return check.error;

    const { id } = await params;

    const existing = await prisma.faultCase.findFirst({
      where: { id, tenantId: check.tenantId! },
      select: { id: true, caseNumber: true, claimStatus: true },
    });
    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Störungsvorgang nicht gefunden" });
    }

    // Ein geltend gemachter Anspruch ist ein laufender Vorgang gegenüber
    // Dritten. Ihn wegzulöschen würde die Nachvollziehbarkeit zerstören —
    // dafür gibt es den Status TIME_BARRED bzw. REJECTED.
    if (["ASSERTED", "ACCEPTED", "SETTLED"].includes(existing.claimStatus)) {
      return apiError("OPERATION_NOT_ALLOWED", 400, {
        message:
          "Vorgang mit geltend gemachtem Anspruch kann nicht gelöscht werden — bitte den Anspruchsstatus setzen",
      });
    }

    await prisma.faultCase.delete({ where: { id } });

    await createAuditLog({
      action: "DELETE",
      entityType: "FaultCase",
      entityId: id,
      description: `Störungsvorgang ${existing.caseNumber} gelöscht`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "[FaultCase] Löschen fehlgeschlagen");
    return apiError("DELETE_FAILED", 500, { message: "Störungsvorgang konnte nicht gelöscht werden" });
  }
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
