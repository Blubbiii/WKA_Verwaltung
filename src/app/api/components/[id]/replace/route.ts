/**
 * POST /api/components/[id]/replace — Grosskomponente tauschen
 *
 * B3 (Audit 2026-07). Der Tausch ist der eigentliche Vorgang: ein Getriebe
 * wird ausgebaut, ein neues eingebaut, und beides gehört zusammen.
 *
 * ## Drei Dinge, die diese Route bewusst so macht
 *
 * **Sie löscht nichts.** Die alte Komponente bekommt `removedAt` und einen
 * Grund. Ohne die Historie wäre „das wievielte Getriebe ist das" nicht
 * beantwortbar — und genau diese Frage stellt der Gutachter beim Verkauf.
 *
 * **Sie vererbt die Gewährleistung NICHT.** Ein Austauschgetriebe hat seine
 * eigene Frist, und sie ist fast nie die des alten. Sie stillschweigend zu
 * übernehmen wäre eine Zusage, die niemand gegeben hat.
 *
 * **Sie läuft in einer Transaktion.** Ein halber Tausch — altes ausgebaut,
 * neues nicht angelegt — hinterliesse eine Anlage ohne Getriebe im Register.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";

const bodySchema = z.object({
  /** Ausbau des alten Teils. Gilt zugleich als Einbau des neuen, wenn dort
   *  nichts anderes steht. */
  removedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  removalReason: z.enum(["SCHEDULED", "FAILURE", "UPGRADE", "PREVENTIVE", "OTHER"]),
  removalNotes: z.string().nullable().optional(),

  /** Das neue Teil. */
  installedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  manufacturer: z.string().trim().max(200).nullable().optional(),
  model: z.string().trim().max(200).nullable().optional(),
  serialNumber: z.string().trim().max(100).nullable().optional(),
  designLifeYears: z.number().int().min(1).max(100).nullable().optional(),
  operatingHoursAtInstall: z.number().int().min(0).nullable().optional(),
  /** Gewährleistung des NEUEN Teils. Wird nicht vom alten übernommen. */
  warrantyEndDate: z.string().nullable().optional(),
  warrantyProvider: z.string().trim().max(200).nullable().optional(),
  costEur: z.number().nonnegative().nullable().optional(),
  vendorId: z.string().uuid().nullable().optional(),
  serviceEventId: z.string().uuid().nullable().optional(),
  faultCaseId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission(PERMISSIONS.TURBINES_UPDATE);
    if (!check.authorized) return check.error;

    const { id } = await params;
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe",
        details: { issues: parsed.error.issues },
      });
    }
    const data = parsed.data;

    const old = await prisma.majorComponent.findFirst({
      where: { id, tenantId: check.tenantId! },
      include: {
        turbine: { select: { id: true, designation: true } },
      },
    });
    if (!old) {
      return apiError("NOT_FOUND", 404, { message: "Komponente nicht gefunden" });
    }

    if (old.removedAt) {
      return apiError("BAD_REQUEST", undefined, {
        message: `Diese Komponente ist bereits am ${old.removedAt.toISOString().slice(0, 10)} ausgebaut worden. Eine bereits ausgebaute Komponente kann nicht noch einmal ersetzt werden.`,
      });
    }

    const removedAt = new Date(`${data.removedAt}T00:00:00.000Z`);
    const installedAt = new Date(`${data.installedAt ?? data.removedAt}T00:00:00.000Z`);

    if (old.installedAt && removedAt < old.installedAt) {
      return apiError("VALIDATION_FAILED", 400, {
        message: "Der Ausbau kann nicht vor dem Einbau liegen.",
      });
    }
    if (installedAt < removedAt) {
      // Sonst überlappten sich beide und die Positionsprüfung schlüge an.
      return apiError("VALIDATION_FAILED", 400, {
        message: "Der Einbau des neuen Teils kann nicht vor dem Ausbau des alten liegen.",
      });
    }

    const replacement = await prisma.$transaction(async (tx) => {
      const created = await tx.majorComponent.create({
        data: {
          tenantId: check.tenantId!,
          turbineId: old.turbineId,
          // Typ und Position kommen vom Vorgänger: ein Getriebe wird durch ein
          // Getriebe ersetzt, Blatt A durch Blatt A.
          type: old.type,
          position: old.position,
          manufacturer: data.manufacturer ?? old.manufacturer,
          model: data.model ?? old.model,
          serialNumber: data.serialNumber || null,
          installedAt,
          // Auslegungsdauer darf vom Vorgänger übernommen werden — sie ist eine
          // Eigenschaft des Bauteiltyps, nicht des einzelnen Stücks.
          designLifeYears: data.designLifeYears ?? old.designLifeYears,
          operatingHoursAtInstall: data.operatingHoursAtInstall ?? null,
          // Die Gewährleistung dagegen NICHT: sie ist eine Zusage zum
          // einzelnen Stück. Fehlt sie, bleibt sie leer.
          warrantyEndDate: data.warrantyEndDate ? new Date(data.warrantyEndDate) : null,
          warrantyProvider: data.warrantyProvider || null,
          costEur: data.costEur ?? null,
          vendorId: data.vendorId || null,
          serviceEventId: data.serviceEventId || null,
          faultCaseId: data.faultCaseId || null,
          notes: data.notes || null,
        },
      });

      await tx.majorComponent.update({
        where: { id: old.id },
        data: {
          removedAt,
          removalReason: data.removalReason,
          removalNotes: data.removalNotes || null,
          // Die Tauschkette: von hier führt der Weg zum Nachfolger.
          replacedById: created.id,
        },
      });

      return created;
    });

    await createAuditLog({
      action: "UPDATE",
      entityType: "Turbine",
      entityId: old.turbineId,
      oldValues: { componentId: old.id, serialNumber: old.serialNumber },
      newValues: {
        componentId: replacement.id,
        serialNumber: data.serialNumber ?? null,
        removalReason: data.removalReason,
      },
      description: `${old.type} an ${old.turbine.designation} getauscht (${data.removalReason})`,
    });

    const warnings: string[] = [];
    if (!data.warrantyEndDate) {
      // Ausdrücklich, weil das Feld leer bleibt und die alte Frist NICHT gilt.
      warnings.push(
        "Für das neue Teil ist keine Gewährleistung erfasst. Die des ausgebauten Teils gilt dafür nicht — sie war eine Zusage zu jenem Stück.",
      );
    }
    if (data.removalReason === "FAILURE" && !data.faultCaseId) {
      warnings.push(
        "Ausfall ohne verknüpften Störungsvorgang. Ein Getriebeschaden ist in der Regel auch ein Gewährleistungs- oder Versicherungsfall.",
      );
    }

    return NextResponse.json({ replacement, replaced: old.id, warnings });
  } catch (error) {
    logger.error({ err: error }, "[Components] Tausch fehlgeschlagen");
    return apiError("UPDATE_FAILED", 500, { message: "Der Tausch konnte nicht gebucht werden" });
  }
}
