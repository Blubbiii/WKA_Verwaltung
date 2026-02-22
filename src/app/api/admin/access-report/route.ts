/**
 * Access Report API Route
 *
 * Generates a report of all users with their effective permissions.
 * Only accessible by Superadmin/Admin.
 *
 * GET /api/admin/access-report
 * Query Parameters:
 * - userId: Filter by specific user ID (optional)
 * - roleId: Filter by specific role ID (optional)
 * - format: 'json' | 'xlsx' | 'csv' (default: 'json')
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { generateExcel } from "@/lib/export/excel";
import { generateCsvBuffer } from "@/lib/export/csv";
import type { ColumnDef } from "@/lib/export/types";
import { apiLogger as logger } from "@/lib/logger";

// Types for the access report
interface UserAccessData {
  id: string;
  email: string;
  name: string;
  status: string;
  roles: {
    id: string;
    name: string;
    isSystem: boolean;
    color: string | null;
    resourceType: string;
    resourceIds: string[];
    resourceNames: string[];
  }[];
  permissions: {
    name: string;
    displayName: string;
    module: string;
    action: string;
  }[];
  permissionCount: number;
  roleCount: number;
}

interface AccessReportResponse {
  generatedAt: string;
  tenantId: string;
  tenantName: string;
  totalUsers: number;
  totalRoles: number;
  totalPermissions: number;
  users: UserAccessData[];
}

/**
 * GET /api/admin/access-report
 * Generate access report
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
    const format = searchParams.get("format") || "json";

    // Validate format
    if (!["json", "xlsx", "csv"].includes(format)) {
      return NextResponse.json(
        { error: `Ungueltiges Format: ${format}. Unterstuetzte Formate: json, xlsx, csv` },
        { status: 400 }
      );
    }

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

    // If filtering by roleId, we need to find users with that role
    let userIdsWithRole: string[] | null = null;
    if (roleId) {
      const roleAssignments = await prisma.userRoleAssignment.findMany({
        where: { roleId },
        select: { userId: true },
      });
      userIdsWithRole = roleAssignments.map((ra) => ra.userId);

      if (userIdsWithRole.length === 0) {
        // No users have this role
        return NextResponse.json({
          generatedAt: new Date().toISOString(),
          tenantId: tenant.id,
          tenantName: tenant.name,
          totalUsers: 0,
          totalRoles: 0,
          totalPermissions: 0,
          users: [],
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
    const usersData: UserAccessData[] = users.map((user) => {
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

    const reportData: AccessReportResponse = {
      generatedAt: new Date().toISOString(),
      tenantId: tenant.id,
      tenantName: tenant.name,
      totalUsers: usersData.length,
      totalRoles: allRoleIds.size,
      totalPermissions: allPermissionNames.size,
      users: usersData,
    };

    // Log access to audit
    try {
      await prisma.auditLog.create({
        data: {
          action: "VIEW",
          entityType: "ACCESS_REPORT",
          userId: check.userId,
          tenantId,
          newValues: {
            format,
            filters: { userId, roleId },
            userCount: usersData.length,
          },
        },
      });
    } catch (auditError) {
      logger.error({ err: auditError }, "Audit log error");
    }

    // Return based on format
    if (format === "json") {
      return NextResponse.json(reportData);
    }

    // For Excel/CSV export, flatten the data
    const flatData = usersData.map((user) => ({
      name: user.name,
      email: user.email,
      status: user.status,
      roleCount: user.roleCount,
      roles: user.roles.map((r) => r.name).join(", "),
      roleDetails: user.roles
        .map((r) => {
          if (r.resourceType === "__global__") {
            return `${r.name} (Global)`;
          }
          return `${r.name} (${r.resourceType}: ${r.resourceNames.join(", ") || r.resourceIds.join(", ")})`;
        })
        .join("; "),
      permissionCount: user.permissionCount,
      permissions: user.permissions.map((p) => p.name).join(", "),
      permissionDisplayNames: user.permissions.map((p) => p.displayName).join(", "),
    }));

    const columns: ColumnDef[] = [
      { key: "name", header: "Name", width: 25 },
      { key: "email", header: "E-Mail", width: 30 },
      { key: "status", header: "Status", width: 12 },
      { key: "roleCount", header: "Anzahl Rollen", width: 15, format: "number" },
      { key: "roles", header: "Rollen", width: 30 },
      { key: "roleDetails", header: "Rollen-Details", width: 50 },
      { key: "permissionCount", header: "Anzahl Berechtigungen", width: 20, format: "number" },
      { key: "permissions", header: "Berechtigungen (Keys)", width: 60 },
      { key: "permissionDisplayNames", header: "Berechtigungen", width: 80 },
    ];

    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `Zugriffsreport_${timestamp}.${format}`;

    let fileBuffer: Buffer;
    let mimeType: string;

    if (format === "xlsx") {
      fileBuffer = generateExcel(flatData, columns, "Zugriffsreport");
      mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    } else {
      fileBuffer = generateCsvBuffer(flatData, columns);
      mimeType = "text/csv; charset=utf-8";
    }

    // Log export action
    try {
      await prisma.auditLog.create({
        data: {
          action: "EXPORT",
          entityType: "ACCESS_REPORT",
          userId: check.userId,
          tenantId,
          newValues: {
            format,
            filters: { userId, roleId },
            userCount: usersData.length,
          },
        },
      });
    } catch (auditError) {
      logger.error({ err: auditError }, "Audit log error");
    }

    const responseBody = new Uint8Array(fileBuffer);
    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(responseBody.length),
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Export-Row-Count": String(flatData.length),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Access report error");

    if (error instanceof Error) {
      return NextResponse.json(
        { error: `Fehler beim Erstellen des Reports: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Fehler beim Erstellen des Reports" },
      { status: 500 }
    );
  }
}
