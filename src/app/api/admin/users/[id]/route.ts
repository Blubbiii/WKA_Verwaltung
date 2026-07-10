import { NextRequest, NextResponse } from "next/server";
import { requirePermission, requireSuperadmin } from "@/lib/auth/withPermission";
import { PERMISSIONS, getUserHighestHierarchy, ROLE_HIERARCHY } from "@/lib/auth/permissions";
import { invalidateUser } from "@/lib/auth/permissionCache";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { apiLogger as logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-utils";
import { AUTH_CONFIG } from "@/lib/config/auth-config";
import { apiError } from "@/lib/api-errors";

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

    const body = await request.json();
    const validatedData = userUpdateSchema.parse(body);

    // FIX 2 (SECURITY) + FIX 14: Memberships validieren.
    //  - Whitelist: Non-Superadmins dürfen nur Memberships zum eigenen Tenant setzen.
    //  - Max EINE primary Membership; keine → erste wird zu primary (Fallback).
    if (validatedData.memberships !== undefined) {
      const callerHierarchy = await getUserHighestHierarchy(check.userId!);
      const isCallerSuperadmin = callerHierarchy >= ROLE_HIERARCHY.SUPERADMIN;

      for (const m of validatedData.memberships) {
        if (!isCallerSuperadmin && m.tenantId !== check.tenantId) {
          return apiError("FORBIDDEN", 403, {
            message:
              "Memberships zu anderen Mandanten können nur von Superadmins gesetzt werden",
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

      // Upsert all incoming memberships
      for (const m of validatedData.memberships) {
        await prisma.userTenantMembership.upsert({
          where: { userId_tenantId: { userId: id, tenantId: m.tenantId } },
          create: { userId: id, tenantId: m.tenantId, isPrimary: m.isPrimary },
          update: { isPrimary: m.isPrimary, status: "ACTIVE" },
        });
      }

      // Remove memberships no longer in the list (but never remove the primary/home tenant)
      await prisma.userTenantMembership.deleteMany({
        where: {
          userId: id,
          tenantId: { notIn: Array.from(incomingTenantIds) },
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
