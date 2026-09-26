// mandantenübergreifend: der Superadmin verwaltet Zugriffe von Benutzern jedes Mandanten; die Route prüft gegen den Mandanten des Benutzers.
/**
 * Admin API for park access per user (decision E4) — counterpart of
 * /api/admin/users/[id]/fund-access.
 *
 * GET  → allowed parks + all parks of the user's tenant
 * PUT  { parkIds: string[] } → replaces the list. Empty = no restriction,
 *      the user sees every park.
 *
 * Stored as ResourceAccess rows (resourceType PARK, READ); enforced by
 * lib/auth/park-access in the park routes and the dashboard figures.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { verwaltbarerNutzer } from "@/lib/admin/verwaltbarer-nutzer";
import { zodMeldung } from "@/lib/validation/zod-meldung";
import { ACCESS_LEVELS, RESOURCE_TYPES } from "@/lib/auth/resourceAccess";
import { createAuditLog } from "@/lib/audit";

const putSchema = z.object({
  parkIds: z.array(z.string().uuid()),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission("users:update");
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant fehlt" });
    }

    const { id: userId } = await params;
    const user = await verwaltbarerNutzer(userId, check);
    if (!user) {
      return apiError("NOT_FOUND", 404, { message: "User nicht gefunden" });
    }

    const [access, allParks] = await Promise.all([
      prisma.resourceAccess.findMany({
        where: {
          userId,
          resourceType: RESOURCE_TYPES.PARK,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { resourceId: true },
      }),
      prisma.park.findMany({
        where: { tenantId: user.tenantId, deletedAt: null },
        select: { id: true, name: true, shortName: true, status: true },
        orderBy: { name: "asc" },
      }),
    ]);
    const erlaubt = new Set(access.map((a) => a.resourceId));

    return NextResponse.json({
      user: { id: user.id, email: user.email },
      allowedParks: allParks.filter((p) => erlaubt.has(p.id)),
      allParks,
      restricted: access.length > 0,
    });
  } catch (error) {
    logger.error({ err: error }, "ParkAccess GET fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, { message: "Laden fehlgeschlagen" });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission("users:update");
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant fehlt" });
    }

    const { id: userId } = await params;
    const parsed = putSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400, {
        message: zodMeldung(parsed.error, "Ungültige Eingabe"),
      });
    }
    const parkIds = [...new Set(parsed.data.parkIds)];

    const user = await verwaltbarerNutzer(userId, check);
    if (!user) {
      return apiError("NOT_FOUND", 404, { message: "User nicht gefunden" });
    }

    if (parkIds.length > 0) {
      const gueltig = await prisma.park.count({
        where: { id: { in: parkIds }, tenantId: user.tenantId, deletedAt: null },
      });
      if (gueltig !== parkIds.length) {
        return apiError("BAD_REQUEST", 400, {
          message: "Ein oder mehrere Parks ungültig oder nicht im Mandanten",
        });
      }
    }

    await prisma.$transaction([
      prisma.resourceAccess.deleteMany({ where: { userId, resourceType: RESOURCE_TYPES.PARK } }),
      ...(parkIds.length > 0
        ? [
            prisma.resourceAccess.createMany({
              data: parkIds.map((resourceId) => ({
                userId,
                resourceType: RESOURCE_TYPES.PARK,
                resourceId,
                accessLevel: ACCESS_LEVELS.READ,
                createdBy: check.userId,
              })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);

    await createAuditLog({
      action: "UPDATE",
      entityType: "User",
      entityId: userId,
      newValues: { parkAccess: parkIds },
      description: parkIds.length > 0 ? `Park-Zugriff auf ${parkIds.length} Parks beschränkt` : "Park-Zugriff: keine Einschränkung",
    });

    return NextResponse.json({ success: true, restricted: parkIds.length > 0, parkCount: parkIds.length });
  } catch (error) {
    logger.error({ err: error }, "ParkAccess PUT fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, { message: "Speichern fehlgeschlagen" });
  }
}
