/**
 * PATCH  /api/municipalities/[id] — Gemeinde ändern
 * DELETE /api/municipalities/[id] — Gemeinde löschen
 *
 * ## Warum das Löschen prüft, ob noch etwas daranhängt
 *
 * Die Fremdschlüssel stehen auf `ON DELETE SET NULL`. Ein Löschen würde also
 * durchgehen und dabei die Standortzuordnung von Anlagen still entfernen — die
 * Zerlegungsgrundlage nach § 29 GewStG wäre danach unvollständig, ohne dass
 * irgendwo etwas fehlschlägt. Deshalb wird hier vorher gefragt.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import { serializePrisma } from "@/lib/serialize";

const OFFICIAL_KEY_PATTERN = /^\d{8}$/;

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  officialKey: z
    .string()
    .trim()
    .regex(OFFICIAL_KEY_PATTERN, "Der amtliche Gemeindeschlüssel hat genau 8 Ziffern")
    .nullable()
    .optional()
    .or(z.literal("")),
  state: z.string().trim().max(50).nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

async function loadOwn(id: string, tenantId: string) {
  return prisma.municipality.findFirst({
    where: { id, tenantId },
    include: { _count: { select: { turbines: true, plots: true } } },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission(PERMISSIONS.TURBINES_UPDATE);
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const { id } = await params;
    const existing = await loadOwn(id, check.tenantId);
    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Gemeinde nicht gefunden" });
    }

    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe",
      });
    }

    const data: Prisma.MunicipalityUpdateInput = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.officialKey !== undefined)
      data.officialKey = parsed.data.officialKey || null;
    if (parsed.data.state !== undefined) data.state = parsed.data.state || null;
    if (parsed.data.notes !== undefined) data.notes = parsed.data.notes || null;

    const updated = await prisma.municipality.update({ where: { id }, data });

    await createAuditLog({
      action: "UPDATE",
      entityType: "Municipality",
      entityId: id,
      oldValues: { name: existing.name, officialKey: existing.officialKey },
      newValues: { name: updated.name, officialKey: updated.officialKey },
    });

    return NextResponse.json({ data: serializePrisma(updated) });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return apiError("VALIDATION_FAILED", 409, {
        message: "Eine Gemeinde mit diesem Namen ist bereits angelegt",
      });
    }
    logger.error({ err: error }, "Gemeinde konnte nicht geändert werden");
    return apiError("PROCESS_FAILED", 500, {
      message: "Gemeinde konnte nicht geändert werden",
    });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission(PERMISSIONS.TURBINES_UPDATE);
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const { id } = await params;
    const existing = await loadOwn(id, check.tenantId);
    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Gemeinde nicht gefunden" });
    }

    // Der Fremdschlüssel würde still auf NULL setzen. Das Löschen einer
    // Gemeinde, an der Anlagen hängen, nähme der Zerlegungsgrundlage
    // kommentarlos ihre Zuordnung.
    const used = existing._count.turbines + existing._count.plots;
    if (used > 0) {
      return apiError("VALIDATION_FAILED", 409, {
        message: `Die Gemeinde ist noch ${existing._count.turbines} Anlage(n) und ${existing._count.plots} Flurstück(en) zugeordnet. Die Zuordnung zuerst ändern — beim Löschen ginge sie kommentarlos verloren.`,
      });
    }

    await prisma.municipality.delete({ where: { id } });

    await createAuditLog({
      action: "DELETE",
      entityType: "Municipality",
      entityId: id,
      oldValues: { name: existing.name, officialKey: existing.officialKey },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Gemeinde konnte nicht gelöscht werden");
    return apiError("PROCESS_FAILED", 500, {
      message: "Gemeinde konnte nicht gelöscht werden",
    });
  }
}
