import { NextRequest, NextResponse } from "next/server";
import { requirePermission, requireSuperadmin } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { apiLogger as logger } from "@/lib/logger";

const userUpdateSchema = z.object({
  email: z.string().email("Ungültige E-Mail-Adresse").optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  password: z.string().min(8).optional(),
  tenantId: z.string().uuid().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  memberships: z
    .array(
      z.object({
        tenantId: z.string().uuid(),
        isPrimary: z.boolean().default(false),
      })
    )
    .optional(),
});

/** Check if current user is SUPERADMIN using the authoritative hierarchy check */
async function isSuperadmin(): Promise<boolean> {
  const result = await requireSuperadmin();
  return result.authorized;
}

// GET /api/admin/users/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.USERS_READ);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
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
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Benutzer nicht gefunden" },
        { status: 404 }
      );
    }

    // Tenant isolation: non-SUPERADMIN can only view users from their own tenant
    if (!(await isSuperadmin()) && user.tenantId !== check.tenantId) {
      return NextResponse.json(
        { error: "Benutzer nicht gefunden" },
        { status: 404 }
      );
    }

    return NextResponse.json(user);
  } catch (error) {
    logger.error({ err: error }, "Error fetching user");
    return NextResponse.json(
      { error: "Fehler beim Laden des Benutzers" },
      { status: 500 }
    );
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

    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return NextResponse.json(
        { error: "Benutzer nicht gefunden" },
        { status: 404 }
      );
    }

    // Tenant isolation: non-SUPERADMIN can only modify users from their own tenant
    if (!(await isSuperadmin()) && existingUser.tenantId !== check.tenantId) {
      return NextResponse.json(
        { error: "Benutzer nicht gefunden" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validatedData = userUpdateSchema.parse(body);

    // Prüfen ob neue E-Mail bereits existiert
    if (validatedData.email && validatedData.email !== existingUser.email) {
      const emailExists = await prisma.user.findUnique({
        where: { email: validatedData.email },
      });

      if (emailExists) {
        return NextResponse.json(
          { error: "Ein Benutzer mit dieser E-Mail existiert bereits" },
          { status: 400 }
        );
      }
    }

    // Prüfen ob Mandant existiert
    if (validatedData.tenantId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: validatedData.tenantId },
      });

      if (!tenant) {
        return NextResponse.json(
          { error: "Mandant nicht gefunden" },
          { status: 404 }
        );
      }
    }

    // Passwort hashen falls angegeben
    let passwordHash: string | undefined;
    if (validatedData.password) {
      passwordHash = await bcrypt.hash(validatedData.password, 12);
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

    return NextResponse.json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error updating user");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren des Benutzers" },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: "Sie können sich nicht selbst deaktivieren" },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return NextResponse.json(
        { error: "Benutzer nicht gefunden" },
        { status: 404 }
      );
    }

    // Tenant isolation: non-SUPERADMIN can only deactivate users from their own tenant
    if (!(await isSuperadmin()) && existingUser.tenantId !== check.tenantId) {
      return NextResponse.json(
        { error: "Benutzer nicht gefunden" },
        { status: 404 }
      );
    }

    // Benutzer deaktivieren statt löschen
    await prisma.user.update({
      where: { id },
      data: { status: "INACTIVE" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting user");
    return NextResponse.json(
      { error: "Fehler beim Deaktivieren des Benutzers" },
      { status: 500 }
    );
  }
}
