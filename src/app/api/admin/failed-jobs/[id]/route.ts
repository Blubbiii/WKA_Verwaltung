/**
 * Dead-Letter-Queue: Resolution-Workflow.
 *
 * PATCH /api/admin/failed-jobs/[id] → als erledigt / wieder offen markieren
 *
 * F18: Das Schema modelliert resolved/resolvedAt/resolvedBy/resolutionNote,
 * benutzt hat es nie jemand. Ohne diesen Endpunkt bliebe die Liste eine
 * Sammlung, die nur wachsen kann.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/withPermission";
import { isSuperadmin } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";

const patchSchema = z.object({
  resolved: z.boolean(),
  resolutionNote: z.string().max(2000).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission("system:health");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        message: parsed.error.issues[0]?.message || "Ungültige Eingabe",
      });
    }

    const existing = await prisma.failedJob.findUnique({
      where: { id },
      select: { id: true, tenantId: true },
    });
    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Eintrag nicht gefunden" });
    }

    // Mandantentrennung — gleiche Antwort wie bei unbekannter ID, damit die
    // Existenz eines fremden Eintrags nicht bestaetigt wird.
    const crossTenant = await isSuperadmin(check.userId!);
    if (!crossTenant && existing.tenantId !== check.tenantId) {
      return apiError("NOT_FOUND", 404, { message: "Eintrag nicht gefunden" });
    }

    const { resolved, resolutionNote } = parsed.data;

    const updated = await prisma.failedJob.update({
      where: { id },
      data: {
        resolved,
        // Beim Wiedereroeffnen die Spuren der alten Erledigung entfernen,
        // sonst behauptet der Eintrag weiter, jemand haette ihn abgehakt.
        resolvedAt: resolved ? new Date() : null,
        resolvedBy: resolved ? check.userId : null,
        resolutionNote: resolved ? (resolutionNote ?? null) : null,
      },
    });

    logger.info(
      { failedJobId: id, resolved, userId: check.userId },
      "[API:admin/failed-jobs] Resolution state changed",
    );

    return NextResponse.json({
      id: updated.id,
      resolved: updated.resolved,
      resolvedAt: updated.resolvedAt?.toISOString() ?? null,
      resolvedBy: updated.resolvedBy,
      resolutionNote: updated.resolutionNote,
    });
  } catch (error) {
    logger.error({ err: error }, "[API:admin/failed-jobs/[id]] PATCH error");
    return apiError("UPDATE_FAILED", 500, {
      message: "Status konnte nicht geändert werden",
    });
  }
}
