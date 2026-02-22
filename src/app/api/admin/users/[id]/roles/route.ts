import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSuperadmin } from "@/lib/auth/withPermission";
import { invalidateUser } from "@/lib/auth/permissionCache";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const roleAssignSchema = z.object({
  roleId: z.string().uuid("Ungültige Rollen-ID"),
  resourceType: z.string().default("__global__"),
  resourceIds: z.array(z.string()).default([]),
});

// GET /api/admin/users/[id]/roles - Rollen eines Users laden
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("users:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Check if user exists and belongs to same tenant
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, tenantId: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Benutzer nicht gefunden" },
        { status: 404 }
      );
    }

    // Check tenant access
    if (user.tenantId !== check.tenantId!) {
      const superadminCheck = await requireSuperadmin();
      if (!superadminCheck.authorized) {
        return NextResponse.json(
          { error: "Keine Berechtigung für diesen Benutzer" },
          { status: 403 }
        );
      }
    }

    const roleAssignments = await prisma.userRoleAssignment.findMany({
      where: { userId: id },
      include: {
        role: {
          include: {
            _count: {
              select: { permissions: true },
            },
          },
        },
      },
    });

    return NextResponse.json(roleAssignments);
  } catch (error) {
    logger.error({ err: error }, "Error fetching user roles");
    return NextResponse.json(
      { error: "Fehler beim Laden der Benutzer-Rollen" },
      { status: 500 }
    );
  }
}

// POST /api/admin/users/[id]/roles - Rolle einem User zuweisen
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("roles:assign");
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();
    const validatedData = roleAssignSchema.parse(body);

    // Check if user exists and belongs to same tenant
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, tenantId: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Benutzer nicht gefunden" },
        { status: 404 }
      );
    }

    // Check tenant access
    if (user.tenantId !== check.tenantId!) {
      const superadminCheck = await requireSuperadmin();
      if (!superadminCheck.authorized) {
        return NextResponse.json(
          { error: "Keine Berechtigung für diesen Benutzer" },
          { status: 403 }
        );
      }
    }

    // Check if role exists and is accessible
    const role = await prisma.role.findUnique({
      where: { id: validatedData.roleId },
    });

    if (!role) {
      return NextResponse.json(
        { error: "Rolle nicht gefunden" },
        { status: 404 }
      );
    }

    // Non-system roles must belong to same tenant
    if (!role.isSystem && role.tenantId !== check.tenantId!) {
      const superadminCheck = await requireSuperadmin();
      if (!superadminCheck.authorized) {
        return NextResponse.json(
          { error: "Keine Berechtigung für diese Rolle" },
          { status: 403 }
        );
      }
    }

    // Check if assignment already exists
    const existingAssignment = await prisma.userRoleAssignment.findFirst({
      where: {
        userId: id,
        roleId: validatedData.roleId,
        resourceType: validatedData.resourceType,
      },
    });

    if (existingAssignment) {
      return NextResponse.json(
        { error: "Diese Rolle ist dem Benutzer bereits zugewiesen" },
        { status: 400 }
      );
    }

    // Create assignment
    const assignment = await prisma.userRoleAssignment.create({
      data: {
        userId: id,
        roleId: validatedData.roleId,
        resourceType: validatedData.resourceType,
        resourceIds: validatedData.resourceIds,
        createdBy: check.userId,
      },
      include: {
        role: {
          include: {
            _count: {
              select: { permissions: true },
            },
          },
        },
      },
    });

    // Cache invalidieren da sich die Permissions des Users geaendert haben
    invalidateUser(id);

    return NextResponse.json(assignment, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error assigning role");
    return NextResponse.json(
      { error: "Fehler beim Zuweisen der Rolle" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/users/[id]/roles - Rolle von User entfernen (mit roleId als Query-Param)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("roles:assign");
    if (!check.authorized) return check.error;

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const roleId = searchParams.get("roleId");
    const resourceType = searchParams.get("resourceType") || "__global__";

    if (!roleId) {
      return NextResponse.json(
        { error: "roleId ist erforderlich" },
        { status: 400 }
      );
    }

    // Check if user exists and belongs to same tenant
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, tenantId: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Benutzer nicht gefunden" },
        { status: 404 }
      );
    }

    // Check tenant access
    if (user.tenantId !== check.tenantId!) {
      const superadminCheck = await requireSuperadmin();
      if (!superadminCheck.authorized) {
        return NextResponse.json(
          { error: "Keine Berechtigung für diesen Benutzer" },
          { status: 403 }
        );
      }
    }

    // Find and delete assignment
    const assignment = await prisma.userRoleAssignment.findFirst({
      where: {
        userId: id,
        roleId,
        resourceType,
      },
    });

    if (!assignment) {
      return NextResponse.json(
        { error: "Rollenzuweisung nicht gefunden" },
        { status: 404 }
      );
    }

    await prisma.userRoleAssignment.delete({
      where: { id: assignment.id },
    });

    // Cache invalidieren da sich die Permissions des Users geaendert haben
    invalidateUser(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error removing role");
    return NextResponse.json(
      { error: "Fehler beim Entfernen der Rolle" },
      { status: 500 }
    );
  }
}
