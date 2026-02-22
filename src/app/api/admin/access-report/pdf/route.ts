/**
 * Access Report PDF Export Route
 *
 * Generates a PDF version of the access report.
 *
 * GET /api/admin/access-report/pdf
 * Query Parameters:
 * - userId: Filter by specific user ID (optional)
 * - roleId: Filter by specific role ID (optional)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { generateAccessReportPdf } from "@/lib/pdf/generators/accessReportPdf";
import type { AccessReportPdfData } from "@/lib/pdf/templates/AccessReportTemplate";
import { apiLogger as logger } from "@/lib/logger";

/**
 * GET /api/admin/access-report/pdf
 * Generate PDF access report
 */
export async function GET(request: NextRequest) {
  // Check admin permission
  const check = await requireAdmin();
  if (!check.authorized) return check.error;

  const { tenantId } = check;

  if (!tenantId) {
    return NextResponse.json(
      { error: "Kein Mandant zugeordnet" },
      { status: 400 }
    );
  }

  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const roleId = searchParams.get("roleId");

    // Get tenant info
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });

    if (!tenant) {
      return NextResponse.json(
        { error: "Mandant nicht gefunden" },
        { status: 404 }
      );
    }

    // Build user filter
    const userFilter: Record<string, unknown> = {
      tenantId,
      status: "ACTIVE",
    };

    if (userId) {
      userFilter.id = userId;
    }

    // If filtering by roleId, find users with that role
    if (roleId) {
      const roleAssignments = await prisma.userRoleAssignment.findMany({
        where: { roleId },
        select: { userId: true },
      });
      const userIdsWithRole = roleAssignments.map((ra) => ra.userId);

      if (userIdsWithRole.length === 0) {
        // No users have this role - return empty PDF
        const emptyData: AccessReportPdfData = {
          generatedAt: new Date().toISOString(),
          tenantId: tenant.id,
          tenantName: tenant.name,
          totalUsers: 0,
          totalRoles: 0,
          totalPermissions: 0,
          users: [],
        };

        const pdfBuffer = await generateAccessReportPdf(emptyData);
        const responseBody = new Uint8Array(pdfBuffer);
        return new NextResponse(responseBody, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="Zugriffsreport_${new Date().toISOString().split("T")[0]}.pdf"`,
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        });
      }

      userFilter.id = { in: userIdsWithRole };
    }

    // Fetch all users with their role assignments
    const users = await prisma.user.findMany({
      where: userFilter,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        roleAssignments: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    // Get all park and fund names for resource resolution
    const [parks, funds] = await Promise.all([
      prisma.park.findMany({
        where: { tenantId },
        select: { id: true, name: true },
      }),
      prisma.fund.findMany({
        where: { tenantId },
        select: { id: true, name: true },
      }),
    ]);

    const parkMap = new Map(parks.map((p) => [p.id, p.name]));
    const fundMap = new Map(funds.map((f) => [f.id, f.name]));

    // Transform user data
    const usersData = users.map((user) => {
      // Collect all unique permissions from all roles
      const permissionsSet = new Map<
        string,
        { name: string; displayName: string; module: string; action: string }
      >();

      const roles = user.roleAssignments.map((assignment) => {
        // Add permissions from this role
        for (const rp of assignment.role.permissions) {
          if (!permissionsSet.has(rp.permission.name)) {
            permissionsSet.set(rp.permission.name, {
              name: rp.permission.name,
              displayName: rp.permission.displayName,
              module: rp.permission.module,
              action: rp.permission.action,
            });
          }
        }

        // Resolve resource names
        const resourceNames: string[] = [];
        if (assignment.resourceType === "Park") {
          for (const resId of assignment.resourceIds) {
            const name = parkMap.get(resId);
            if (name) resourceNames.push(name);
          }
        } else if (assignment.resourceType === "Fund") {
          for (const resId of assignment.resourceIds) {
            const name = fundMap.get(resId);
            if (name) resourceNames.push(name);
          }
        }

        return {
          id: assignment.role.id,
          name: assignment.role.name,
          isSystem: assignment.role.isSystem,
          color: assignment.role.color,
          resourceType: assignment.resourceType,
          resourceIds: assignment.resourceIds,
          resourceNames,
        };
      });

      const permissions = Array.from(permissionsSet.values()).sort((a, b) =>
        a.module.localeCompare(b.module) || a.action.localeCompare(b.action)
      );

      return {
        id: user.id,
        email: user.email,
        name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
        status: user.status,
        roles,
        permissions,
        permissionCount: permissions.length,
        roleCount: roles.length,
      };
    });

    // Calculate totals
    const allRoleIds = new Set<string>();
    const allPermissionNames = new Set<string>();
    for (const user of usersData) {
      for (const role of user.roles) {
        allRoleIds.add(role.id);
      }
      for (const perm of user.permissions) {
        allPermissionNames.add(perm.name);
      }
    }

    const reportData: AccessReportPdfData = {
      generatedAt: new Date().toISOString(),
      tenantId: tenant.id,
      tenantName: tenant.name,
      totalUsers: usersData.length,
      totalRoles: allRoleIds.size,
      totalPermissions: allPermissionNames.size,
      users: usersData,
    };

    // Generate PDF
    const pdfBuffer = await generateAccessReportPdf(reportData);

    // Log export action
    try {
      await prisma.auditLog.create({
        data: {
          action: "EXPORT",
          entityType: "ACCESS_REPORT",
          userId: check.userId,
          tenantId,
          newValues: {
            format: "pdf",
            filters: { userId, roleId },
            userCount: usersData.length,
          },
        },
      });
    } catch (auditError) {
      logger.error({ err: auditError }, "Audit log error");
    }

    // Return PDF
    const timestamp = new Date().toISOString().split("T")[0];
    const pdfResponseBody = new Uint8Array(pdfBuffer);
    return new NextResponse(pdfResponseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Zugriffsreport_${timestamp}.pdf"`,
        "Content-Length": String(pdfResponseBody.length),
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Access report PDF error");

    if (error instanceof Error) {
      return NextResponse.json(
        { error: `Fehler beim Erstellen des PDF: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Fehler beim Erstellen des PDF" },
      { status: 500 }
    );
  }
}
