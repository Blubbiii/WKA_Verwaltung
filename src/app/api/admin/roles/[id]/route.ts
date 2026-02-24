import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSuperadmin } from "@/lib/auth/withPermission";
import { invalidateAll } from "@/lib/auth/permissionCache";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const roleUpdateSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich").optional(),
  description: z.string().optional().nullable(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Ungültiges Farbformat").optional().nullable(),
  permissions: z.array(z.string()).optional(),
});

// GET /api/admin/roles/[id] - Einzelne Rolle laden
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("roles:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const role = await prisma.role.findUnique({
      where: { id },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
        userAssignments: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!role) {
      return NextResponse.json(
        { error: "Rolle nicht gefunden" },
        { status: 404 }
      );
    }

    // Check access: system roles visible to all, tenant roles only to same tenant
    if (!role.isSystem && role.tenantId !== check.tenantId!) {
      const superadminCheck = await requireSuperadmin();
      if (!superadminCheck.authorized) {
        return NextResponse.json(
          { error: "Keine Berechtigung für diese Rolle" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(role);
  } catch (error) {
    logger.error({ err: error }, "Error fetching role");
    return NextResponse.json(
      { error: "Fehler beim Laden der Rolle" },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/roles/[id] - Rolle bearbeiten
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("roles:update");
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();
    const validatedData = roleUpdateSchema.parse(body);

    // Find the role first
    const existingRole = await prisma.role.findUnique({
      where: { id },
    });

    if (!existingRole) {
      return NextResponse.json(
        { error: "Rolle nicht gefunden" },
        { status: 404 }
      );
    }

    // System roles can only be edited by superadmins
    if (existingRole.isSystem) {
      const superadminCheck = await requireSuperadmin();
      if (!superadminCheck.authorized) {
        return NextResponse.json(
          { error: "System-Rollen können nur von Superadmins bearbeitet werden" },
          { status: 403 }
        );
      }
    }

    // Check tenant access for non-system roles
    if (!existingRole.isSystem && existingRole.tenantId !== check.tenantId!) {
      const superadminCheck = await requireSuperadmin();
      if (!superadminCheck.authorized) {
        return NextResponse.json(
          { error: "Keine Berechtigung für diese Rolle" },
          { status: 403 }
        );
      }
    }

    // Check if name is already taken (if changing name)
    if (validatedData.name && validatedData.name !== existingRole.name) {
      const duplicateName = await prisma.role.findFirst({
        where: {
          name: validatedData.name,
          tenantId: existingRole.tenantId,
          id: { not: id },
        },
      });

      if (duplicateName) {
        return NextResponse.json(
          { error: "Eine Rolle mit diesem Namen existiert bereits" },
          { status: 400 }
        );
      }
    }

    // Update role
    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    const updateData: any = {};
    if (validatedData.name !== undefined) updateData.name = validatedData.name;
    if (validatedData.description !== undefined) updateData.description = validatedData.description;
    if (validatedData.color !== undefined) updateData.color = validatedData.color;

    // Flag um zu tracken ob Permissions geändert wurden
    let permissionsChanged = false;

    // Update permissions if provided
    if (validatedData.permissions) {
      // Non-superadmins cannot assign system:* permissions
      const isSuperadmin = (await requireSuperadmin()).authorized;
      if (!isSuperadmin) {
        const hasSystemPerms = validatedData.permissions.some((p: string) => p.startsWith("system:"));
        if (hasSystemPerms) {
          return NextResponse.json(
            { error: "System-Berechtigungen können nur von Superadmins zugewiesen werden" },
            { status: 403 }
          );
        }
      }

      // Batch-validate all permissions in a single query (avoids N+1)
      let permissionRecords: { roleId: string; permissionId: string }[] = [];
      if (validatedData.permissions.length > 0) {
        const foundPermissions = await prisma.permission.findMany({
          where: { name: { in: validatedData.permissions } },
          select: { id: true, name: true },
        });
        const foundNames = new Set(foundPermissions.map((p) => p.name));
        const missing = validatedData.permissions.filter((n) => !foundNames.has(n));
        if (missing.length > 0) {
          return NextResponse.json(
            { error: `Permissions nicht gefunden: ${missing.join(", ")}` },
            { status: 400 }
          );
        }
        permissionRecords = foundPermissions.map((p) => ({
          roleId: id,
          permissionId: p.id,
        }));
      }

      // Delete existing permissions
      await prisma.rolePermission.deleteMany({
        where: { roleId: id },
      });

      // Add new permissions
      if (permissionRecords.length > 0) {
        await prisma.rolePermission.createMany({
          data: permissionRecords,
        });
      }

      permissionsChanged = true;
    }

    const role = await prisma.role.update({
      where: { id },
      data: updateData,
      include: {
        _count: {
          select: {
            permissions: true,
            userAssignments: true,
          },
        },
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    // Wenn Permissions geändert wurden, gesamten Cache invalidieren
    // da alle User mit dieser Rolle betroffen sind
    if (permissionsChanged) {
      invalidateAll();
    }

    return NextResponse.json(role);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error updating role");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der Rolle" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/roles/[id] - Rolle löschen
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("roles:delete");
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Find the role first
    const existingRole = await prisma.role.findUnique({
      where: { id },
      include: {
        _count: {
          select: { userAssignments: true },
        },
      },
    });

    if (!existingRole) {
      return NextResponse.json(
        { error: "Rolle nicht gefunden" },
        { status: 404 }
      );
    }

    // System roles cannot be deleted
    if (existingRole.isSystem) {
      return NextResponse.json(
        { error: "System-Rollen können nicht gelöscht werden" },
        { status: 400 }
      );
    }

    // Check tenant access
    if (existingRole.tenantId !== check.tenantId!) {
      const superadminCheck = await requireSuperadmin();
      if (!superadminCheck.authorized) {
        return NextResponse.json(
          { error: "Keine Berechtigung für diese Rolle" },
          { status: 403 }
        );
      }
    }

    // Check if role is still assigned to users
    if (existingRole._count.userAssignments > 0) {
      return NextResponse.json(
        { error: `Rolle ist noch ${existingRole._count.userAssignments} Benutzern zugewiesen` },
        { status: 400 }
      );
    }

    // Delete role (cascade deletes RolePermissions)
    await prisma.role.delete({
      where: { id },
    });

    // Gesamten Cache invalidieren da die Rolle gelöscht wurde
    // (auch wenn keine User mehr zugewiesen sind, sicherheitshalber)
    invalidateAll();

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting role");
    return NextResponse.json(
      { error: "Fehler beim Löschen der Rolle" },
      { status: 500 }
    );
  }
}
