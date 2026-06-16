/**
 * API Route: /api/saved-filters/[id]
 *
 * B6: Saved Filters in Tabellen
 *
 * PATCH  /api/saved-filters/[id]  — update name/filters/isDefault/sortOrder
 * DELETE /api/saved-filters/[id]  — hard-delete a saved filter
 *
 * Strict tenant + user scope.
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { handleApiError } from "@/lib/api-utils";
import { apiLogger as logger } from "@/lib/logger";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

// PATCH /api/saved-filters/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error!;

    const { id } = await params;
    const body = await request.json();
    const parsed = patchSchema.parse(body);

    const existing = await prisma.userSavedFilter.findUnique({
      where: { id },
      select: { id: true, userId: true, tenantId: true, surface: true },
    });
    if (!existing || existing.userId !== check.userId || existing.tenantId !== check.tenantId) {
      return apiError("NOT_FOUND", 404, { message: "Gespeicherter Filter nicht gefunden" });
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (parsed.isDefault === true) {
        // Unset isDefault on all other filters of this (userId, surface)
        await tx.userSavedFilter.updateMany({
          where: {
            userId: check.userId!,
            surface: existing.surface,
            isDefault: true,
            NOT: { id },
          },
          data: { isDefault: false },
        });
      }

      return tx.userSavedFilter.update({
        where: { id },
        data: {
          ...(parsed.name !== undefined && { name: parsed.name }),
          ...(parsed.filters !== undefined && {
            filters: parsed.filters as Prisma.InputJsonValue,
          }),
          ...(parsed.isDefault !== undefined && { isDefault: parsed.isDefault }),
          ...(parsed.sortOrder !== undefined && { sortOrder: parsed.sortOrder }),
        },
      });
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return handleApiError(error, "Fehler beim Aktualisieren des Filters");
  }
}

// DELETE /api/saved-filters/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error!;

    const { id } = await params;

    const existing = await prisma.userSavedFilter.findUnique({
      where: { id },
      select: { id: true, userId: true, tenantId: true },
    });
    if (!existing || existing.userId !== check.userId || existing.tenantId !== check.tenantId) {
      return apiError("NOT_FOUND", 404, { message: "Gespeicherter Filter nicht gefunden" });
    }

    await prisma.userSavedFilter.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "[API] Error deleting saved filter");
    return apiError("DELETE_FAILED", 500, { message: "Fehler beim Löschen des Filters" });
  }
}
