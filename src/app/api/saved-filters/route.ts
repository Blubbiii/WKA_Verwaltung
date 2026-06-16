/**
 * API Route: /api/saved-filters
 *
 * B6: Saved Filters in Tabellen
 *
 * GET    /api/saved-filters?surface=<name>  — list current user's saved filters for surface
 * POST   /api/saved-filters                  — create a new saved filter
 *
 * Strict tenant scope: users only see/manage their own filters within their active tenant.
 * isDefault-Logic: setting isDefault=true unsets isDefault on all other filters of the same
 * (userId, surface) tuple in the same transaction.
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { handleApiError } from "@/lib/api-utils";
import { apiLogger as logger } from "@/lib/logger";

const createSchema = z.object({
  surface: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  filters: z.record(z.string(), z.unknown()),
  isDefault: z.boolean().optional().default(false),
});

// GET /api/saved-filters?surface=<name>
export async function GET(request: NextRequest) {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error!;

    const { searchParams } = new URL(request.url);
    const surface = searchParams.get("surface");
    if (!surface) {
      return apiError("MISSING_FIELD", 400, { message: "Query-Parameter 'surface' fehlt" });
    }

    const filters = await prisma.userSavedFilter.findMany({
      where: {
        userId: check.userId!,
        tenantId: check.tenantId!,
        surface,
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ data: filters });
  } catch (error) {
    logger.error({ err: error }, "[API] Error fetching saved filters");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden der gespeicherten Filter" });
  }
}

// POST /api/saved-filters
export async function POST(request: NextRequest) {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error!;

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const created = await prisma.$transaction(async (tx) => {
      if (parsed.isDefault) {
        // Unset isDefault on all other filters of this (userId, surface)
        await tx.userSavedFilter.updateMany({
          where: {
            userId: check.userId!,
            surface: parsed.surface,
            isDefault: true,
          },
          data: { isDefault: false },
        });
      }

      return tx.userSavedFilter.create({
        data: {
          tenantId: check.tenantId!,
          userId: check.userId!,
          surface: parsed.surface,
          name: parsed.name,
          filters: parsed.filters as Prisma.InputJsonValue,
          isDefault: parsed.isDefault ?? false,
        },
      });
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Fehler beim Speichern des Filters");
  }
}
