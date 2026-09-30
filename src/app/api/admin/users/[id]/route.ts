// mandantenübergreifend: Benutzer und Rollen gehören über Mitgliedschaften mehreren Mandanten an; die Routen filtern selbst.
import { NextRequest, NextResponse } from "next/server";
import { lizenzPruefen } from "@/lib/lizenz/lizenz-db";
import { requirePermission, requireSuperadmin } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { superadminLage, sichtbareMandanten, superadminSiehtMandant, verwalteteMandanten } from "@/lib/admin/benutzer-sicht";
import { invalidateUser } from "@/lib/auth/permissionCache";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { apiLogger as logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-utils";
import { AUTH_CONFIG } from "@/lib/config/auth-config";
import { apiError } from "@/lib/api-errors";

const KEINE_FREIGABE = () =>
  apiError("FORBIDDEN", 403, {
    message: "Benutzer anderer Mandanten nur mit Support-Freigabe des Kunden (Einstellungen → Externe Zugriffe).",
  });

/**
 * Platform operator: users of a tenant he may not see (no support access)
 * stay closed — except his own account (support phase 2, 2026-09).
 */
async function superadminSiehtBenutzer(check: { tenantId?: string; userId?: string }, nutzer: { id: string; tenantId: string }) {
  if (nutzer.id === check.userId) return true;
  return superadminSiehtMandant(nutzer.tenantId, await superadminLage(check.tenantId!));
}

const userUpdateSchema = z.object({
  email: z.string().email("Ungültige E-Mail-Adresse").optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  password: z.string().min(8).optional(),
  tenantId: z.uuid().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  memberships: z
    .array(
      z.object({
        tenantId: z.uuid(),
        isPrimary: z.boolean().default(false),
      })
    )
    .optional(),
});

// GET /api/admin/users/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.USERS_READ);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    const isSA = (await requireSuperadmin()).authorized;
    const userSelect = {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
      tenantId: true,
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      shareholder: {
        select: {
          id: true,
          fund: {
            select: { id: true, name: true },
          },
        },
      },
      userTenantMemberships: {
        select: {
          tenantId: true,
          isPrimary: true,
          status: true,
          tenant: { select: { id: true, name: true } },
        },
        orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }],
      },
    };

    // Superadmins can view any user; regular admins are restricted to their own tenant
    const user = isSA
      ? await prisma.user.findUnique({ where: { id }, select: userSelect })
      : await prisma.user.findFirst({ where: { id, tenantId: check.tenantId! }, select: userSelect });

    if (!user) {
      return apiError("NOT_FOUND", undefined, { message: "Benutzer nicht gefunden" });
    }
    if (isSA && !(await superadminSiehtBenutzer(check, user))) return KEINE_FREIGABE();

    return NextResponse.json(user);
  } catch (error) {
    logger.error({ err: error }, "Error fetching user");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden des Benutzers" });
  }
}

// PATCH /api/admin/users/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.USERS_UPDATE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    const isSA = (await requireSuperadmin()).authorized;
    // Superadmins can modify any user; regular admins are restricted to their own tenant
    const existingUser = isSA
      ? await prisma.user.findUnique({ where: { id }, omit: { passwordHash: true } })
      : await prisma.user.findFirst({ where: { id, tenantId: check.tenantId! }, omit: { passwordHash: true } });

    if (!existingUser) {
      return apiError("NOT_FOUND", undefined, { message: "Benutzer nicht gefunden" });
    }
    if (isSA && !(await superadminSiehtBenutzer(check, existingUser))) return KEINE_FREIGABE();

    const body = await request.json();
    const validatedData = userUpdateSchema.parse(body);

    // Licence: reactivating a user makes them count again.
    if (validatedData.status === "ACTIVE" && existingUser.status !== "ACTIVE") {
      const lizenz = await lizenzPruefen(existingUser.tenantId, "benutzer");
      if (lizenz) return lizenz;
    }

    // FIX 2 (SECURITY) + FIX 14: Memberships validieren.
    //  - Whitelist (2026-09): a membership may be set for a tenant the caller
    //    may manage — customer admin: the active tenant and every tenant where
    //    he is administrator; platform operator: tenants he may see. A
    //    membership the user already has may stay in the list untouched.
    //  - The platform operator never gives himself a customer membership:
    //    that is what support access is for.
    //  - Max EINE primary Membership; keine → erste wird zu primary (Fallback).
    let erlaubteMandanten: Set<string> | null = null;
    if (validatedData.memberships !== undefined) {
      if (isSA && id === check.userId && validatedData.memberships.some((m) => m.tenantId !== existingUser.tenantId)) {
        return apiError("FORBIDDEN", 403, {
          message: "Für Kundenmandanten gibt es den Support-Zugriff — keine eigene Mitgliedschaft.",
        });
      }
      erlaubteMandanten = isSA
        ? new Set(sichtbareMandanten(await superadminLage(check.tenantId!)))
        : await verwalteteMandanten(check.userId!, check.tenantId!);
      const bisher = new Set(
        (await prisma.userTenantMembership.findMany({ where: { userId: id }, select: { tenantId: true } })).map((m) => m.tenantId),
      );
      for (const m of validatedData.memberships) {
        if (!erlaubteMandanten.has(m.tenantId) && !bisher.has(m.tenantId)) {
          return apiError("FORBIDDEN", 403, {
            message: "Mitgliedschaften nur für Mandanten, die Sie selbst verwalten",
          });
        }
      }

      const primaryCount = validatedData.memberships.filter(
        (m) => m.isPrimary,
      ).length;
      if (primaryCount > 1) {
        return apiError("VALIDATION_FAILED", 400, {
          message: "Maximal eine primäre Mitgliedschaft erlaubt",
        });
      }
      if (primaryCount === 0 && validatedData.memberships.length > 0) {
        validatedData.memberships[0].isPrimary = true;
      }
    }

    // Prüfen ob neue E-Mail bereits existiert
    if (validatedData.email && validatedData.email !== existingUser.email) {
      const emailExists = await prisma.user.findUnique({
        where: { email: validatedData.email },
        select: { id: true },
      });

      if (emailExists) {
        return apiError("ALREADY_EXISTS", 400, { message: "Ein Benutzer mit dieser E-Mail existiert bereits" });
      }
    }

    // Moving a user: only into a tenant the caller may see.
    if (validatedData.tenantId && isSA && !superadminSiehtMandant(validatedData.tenantId, await superadminLage(check.tenantId!))) {
      return KEINE_FREIGABE();
    }

    // Prüfen ob Mandant existiert
    if (validatedData.tenantId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: validatedData.tenantId },
      });

      if (!tenant) {
        return apiError("NOT_FOUND", undefined, { message: "Mandant nicht gefunden" });
      }
    }

    // Passwort hashen falls angegeben
    let passwordHash: string | undefined;
    if (validatedData.password) {
      passwordHash = await bcrypt.hash(validatedData.password, AUTH_CONFIG.bcryptSaltRounds);
    }

    // FIX 4: Bei tenantId-Wechsel automatisch Primary-Membership synchronisieren.
    // Alte Primary → false, neue (upsert) → true. Vor user.update, damit im
    // Fehlerfall kein User ohne matching Primary-Membership zurück bleibt.
    if (
      validatedData.tenantId &&
      validatedData.tenantId !== existingUser.tenantId
    ) {
      await prisma.$transaction([
        prisma.userTenantMembership.updateMany({
          where: { userId: id, isPrimary: true },
          data: { isPrimary: false },
        }),
        prisma.userTenantMembership.upsert({
          where: {
            userId_tenantId: { userId: id, tenantId: validatedData.tenantId },
          },
          create: {
            userId: id,
            tenantId: validatedData.tenantId,
            isPrimary: true,
          },
          update: { isPrimary: true, status: "ACTIVE" },
        }),
      ]);
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(validatedData.email && { email: validatedData.email }),
        ...(validatedData.firstName && { firstName: validatedData.firstName }),
        ...(validatedData.lastName && { lastName: validatedData.lastName }),
        ...(passwordHash && { passwordHash }),
        ...(validatedData.tenantId && { tenantId: validatedData.tenantId }),
        ...(validatedData.status && { status: validatedData.status }),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        tenantId: true,
        tenant: { select: { id: true, name: true } },
        userRoleAssignments: {
          select: {
            role: { select: { id: true, name: true, color: true, hierarchy: true } },
          },
        },
        userTenantMemberships: {
          select: {
            tenantId: true,
            isPrimary: true,
            status: true,
            tenant: { select: { id: true, name: true } },
          },
        },
      },
    });

    // Sync tenant memberships if provided
    if (validatedData.memberships !== undefined) {
      const incomingTenantIds = new Set(validatedData.memberships.map((m) => m.tenantId));

      // P24: Upserts parallel (Promise.all) statt sequentiell.
      await Promise.all(
        validatedData.memberships.map((m) =>
          prisma.userTenantMembership.upsert({
            where: { userId_tenantId: { userId: id, tenantId: m.tenantId } },
            create: { userId: id, tenantId: m.tenantId, isPrimary: m.isPrimary },
            update: { isPrimary: m.isPrimary, status: "ACTIVE" },
          }),
        ),
      );

      // Remove memberships no longer in the list — only of tenants the caller
      // manages, and never the primary/home tenant.
      await prisma.userTenantMembership.deleteMany({
        where: {
          userId: id,
          tenantId: { notIn: Array.from(incomingTenantIds), in: Array.from(erlaubteMandanten ?? []) },
          isPrimary: false,
        },
      });
    }

    // FIX 5 (SECURITY, sekundär): Falls Status/Rollen/Tenant sich geändert haben,
    // Permission-Cache + JWT-Version bumpen, damit alte Sessions neu authen.
    if (
      validatedData.status !== undefined ||
      validatedData.tenantId !== undefined ||
      validatedData.memberships !== undefined
    ) {
      await invalidateUser(id);
    }

    return NextResponse.json(user);
  } catch (error) {
    return handleApiError(error, "Fehler beim Aktualisieren des Benutzers");
  }
}

// DELETE /api/admin/users/[id] - Deaktiviert den Benutzer
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.USERS_DELETE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Verhindern, dass man sich selbst deaktiviert
    if (id === check.userId) {
      return apiError("BAD_REQUEST", undefined, { message: "Sie können sich nicht selbst deaktivieren" });
    }

    const isSA = (await requireSuperadmin()).authorized;
    // Superadmins can deactivate any user; regular admins are restricted to their own tenant
    const existingUser = isSA
      ? await prisma.user.findUnique({ where: { id }, select: { id: true, tenantId: true } })
      : await prisma.user.findFirst({ where: { id, tenantId: check.tenantId! }, select: { id: true, tenantId: true } });

    if (!existingUser) {
      return apiError("NOT_FOUND", undefined, { message: "Benutzer nicht gefunden" });
    }
    if (isSA && !(await superadminSiehtBenutzer(check, existingUser))) return KEINE_FREIGABE();

    // Benutzer deaktivieren statt löschen
    await prisma.user.update({
      where: { id },
      data: { status: "INACTIVE" },
    });

    // FIX 5 (SECURITY): Session invalidieren — bestehende JWTs des deaktivierten
    // Users sollen nicht mehr valide sein. invalidateUser() leert den Permission-
    // Cache und bumpt die permissions-version, sodass beim nächsten JWT-Refresh
    // eine Re-Auth erzwungen wird (dann greift der status=INACTIVE-Check).
    await invalidateUser(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting user");
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Deaktivieren des Benutzers" });
  }
}
