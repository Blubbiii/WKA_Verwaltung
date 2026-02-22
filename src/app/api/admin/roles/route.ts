import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSuperadmin } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const roleCreateSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Ungültiges Farbformat").optional(),
  permissions: z.array(z.string()).default([]),
});

// GET /api/admin/roles - Alle Rollen laden
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("roles:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const includeSystem = searchParams.get("includeSystem") === "true";

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    const where: any = {};

    // Non-superadmins can only see tenant-specific roles + system roles (excluding Superadmin role)
    const superadminCheck = await requireSuperadmin();
    if (!superadminCheck.authorized) {
      // Regular admin - show system roles (except Superadmin) + own tenant roles
      where.OR = [
        { isSystem: true, hierarchy: { lt: 100 } },
        { tenantId: check.tenantId! },
      ];
    } else if (!includeSystem) {
      // Superadmin but not requesting system roles
      where.isSystem = false;
    }

    const roles = await prisma.role.findMany({
      where,
      include: {
        _count: {
          select: {
            permissions: true,
            userAssignments: true,
          },
        },
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [
        { isSystem: "desc" },
        { name: "asc" },
      ],
    });

    return NextResponse.json(roles);
  } catch (error) {
    logger.error({ err: error }, "Error fetching roles");
    return NextResponse.json(
      { error: "Fehler beim Laden der Rollen" },
      { status: 500 }
    );
  }
}

// POST /api/admin/roles - Neue Rolle erstellen
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("roles:create");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const validatedData = roleCreateSchema.parse(body);

    // Non-superadmins cannot assign system:* permissions
    const superadminCheck = await requireSuperadmin();
    if (!superadminCheck.authorized) {
      const hasSystemPerms = validatedData.permissions.some((p: string) => p.startsWith("system:"));
      if (hasSystemPerms) {
        return NextResponse.json(
          { error: "System-Berechtigungen können nur von Superadmins zugewiesen werden" },
          { status: 403 }
        );
      }
    }

    // Check if role name already exists for this tenant
    const existingRole = await prisma.role.findFirst({
      where: {
        name: validatedData.name,
        tenantId: check.tenantId!,
      },
    });

    if (existingRole) {
      return NextResponse.json(
        { error: "Eine Rolle mit diesem Namen existiert bereits" },
        { status: 400 }
      );
    }

    // Batch-validate all permissions in a single query (avoids N+1)
    let permissionCreateData: { permissionId: string }[] = [];
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
      permissionCreateData = foundPermissions.map((p) => ({ permissionId: p.id }));
    }

    // Create role with permissions
    const role = await prisma.role.create({
      data: {
        name: validatedData.name,
        description: validatedData.description,
        color: validatedData.color,
        isSystem: false, // User-created roles are never system roles
        tenantId: check.tenantId!,
        permissions: {
          create: permissionCreateData,
        },
      },
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

    return NextResponse.json(role, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error creating role");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Rolle" },
      { status: 500 }
    );
  }
}
