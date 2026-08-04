import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSuperadmin } from "@/lib/auth/withPermission";
import { invalidateUser } from "@/lib/auth/permissionCache";
import { getUserHighestHierarchy, ROLE_HIERARCHY } from "@/lib/auth/permissions";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-utils";
import { apiError } from "@/lib/api-errors";

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
      return apiError("NOT_FOUND", undefined, { message: "Benutzer nicht gefunden" });
    }

    // Check tenant access
    if (user.tenantId !== check.tenantId!) {
      const superadminCheck = await requireSuperadmin();
      if (!superadminCheck.authorized) {
        return apiError("FORBIDDEN", undefined, { message: "Keine Berechtigung für diesen Benutzer" });
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
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Benutzer-Rollen" });
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
      return apiError("NOT_FOUND", undefined, { message: "Benutzer nicht gefunden" });
    }

    // Check tenant access
    if (user.tenantId !== check.tenantId!) {
      const superadminCheck = await requireSuperadmin();
      if (!superadminCheck.authorized) {
        return apiError("FORBIDDEN", undefined, { message: "Keine Berechtigung für diesen Benutzer" });
      }
    }

    // Check if role exists and is accessible
    const role = await prisma.role.findUnique({
      where: { id: validatedData.roleId },
    });

    if (!role) {
      return apiError("NOT_FOUND", undefined, { message: "Rolle nicht gefunden" });
    }

    // Non-system roles must belong to same tenant
    if (!role.isSystem && role.tenantId !== check.tenantId!) {
      const superadminCheck = await requireSuperadmin();
      if (!superadminCheck.authorized) {
        return apiError("FORBIDDEN", undefined, { message: "Keine Berechtigung für diese Rolle" });
      }
    }

    // FIX 1 (SECURITY): Role-Escalation verhindern.
    // Caller darf keine Rolle zuweisen deren hierarchy >= eigener hierarchy.
    // Ausnahme: Superadmin (hierarchy >= 100) darf jede Rolle zuweisen.
    const callerHierarchy = await getUserHighestHierarchy(check.userId!);
    const isCallerSuperadmin = callerHierarchy >= ROLE_HIERARCHY.SUPERADMIN;
    if (!isCallerSuperadmin && role.hierarchy >= callerHierarchy) {
      return apiError("FORBIDDEN", 403, {
        message:
          "Rolle mit gleich hoher oder höherer Berechtigung kann nicht zugewiesen werden",
      });
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
      return apiError("BAD_REQUEST", undefined, { message: "Diese Rolle ist dem Benutzer bereits zugewiesen" });
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

    // Cache invalidieren da sich die Permissions des Users geändert haben
    invalidateUser(id);

    return NextResponse.json(assignment, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Fehler beim Zuweisen der Rolle");
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
      return apiError("MISSING_FIELD", undefined, { message: "roleId ist erforderlich" });
    }

    // Check if user exists and belongs to same tenant
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, tenantId: true },
    });

    if (!user) {
      return apiError("NOT_FOUND", undefined, { message: "Benutzer nicht gefunden" });
    }

    // Check tenant access
    if (user.tenantId !== check.tenantId!) {
      const superadminCheck = await requireSuperadmin();
      if (!superadminCheck.authorized) {
        return apiError("FORBIDDEN", undefined, { message: "Keine Berechtigung für diesen Benutzer" });
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
      return apiError("NOT_FOUND", undefined, { message: "Rollenzuweisung nicht gefunden" });
    }

    // Loeschen ueber die Kennung allein — NICHT zusaetzlich ueber tenantId.
    //
    // Hier stand `where: { id: assignment.id, tenantId: check.tenantId! }`,
    // mit einem TODO daneben, das den Fehler bereits beschrieb. Er ist echt:
    // `tenantId` auf UserRoleAssignment ist nullbar, und eine GLOBALE
    // Zuweisung (resourceType "__global__") hat dort null. Der Filter traf
    // damit nichts, Prisma warf P2025, und die Route meldete HTTP 500.
    //
    // Wirkung: **eine global zugewiesene Rolle liess sich ueberhaupt nicht
    // entziehen.** Der Administrator klickt auf Entfernen, bekommt "Fehler
    // beim Entfernen der Rolle" — und der Benutzer behaelt seine Rechte. Bei
    // Rechten ist das der schlimmste denkbare Ausgang: sie sind das einzige,
    // was jemanden von etwas abhaelt.
    //
    // Ueber die Kennung allein zu loeschen ist sicher, weil die Berechtigung
    // vorher schon geprueft wurde: der Benutzer muss zum eigenen Mandanten
    // gehoeren, sonst braucht es Superadmin-Rechte (siehe oben). Und
    // `assignment` stammt aus einem findFirst, das auf genau diesen Benutzer
    // eingeschraenkt war.
    await prisma.userRoleAssignment.delete({
      where: { id: assignment.id },
    });

    // Cache invalidieren da sich die Permissions des Users geändert haben
    invalidateUser(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error removing role");
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Entfernen der Rolle" });
  }
}
