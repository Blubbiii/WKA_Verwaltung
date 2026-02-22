/**
 * Permission Matrix Export Route
 *
 * Exports the permission matrix (roles x permissions) as PDF or Excel.
 *
 * GET /api/admin/permissions/export?format=pdf|xlsx
 * Query Parameters:
 * - format: Export format (pdf or xlsx)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { generatePermissionMatrixPdf } from "@/lib/pdf/generators/permissionMatrixPdf";
import { generateExcel } from "@/lib/export/excel";
import type { PermissionMatrixPdfData } from "@/lib/pdf/templates/PermissionMatrixTemplate";
import type { ColumnDef } from "@/lib/export/types";
import { apiLogger as logger } from "@/lib/logger";

// Module labels for display
const moduleLabels: Record<string, string> = {
  parks: "Windparks",
  turbines: "Anlagen",
  funds: "Beteiligungen",
  shareholders: "Gesellschafter",
  plots: "Flurstücke",
  leases: "Pachtverträge",
  contracts: "Verträge",
  documents: "Dokumente",
  invoices: "Rechnungen",
  votes: "Abstimmungen",
  "service-events": "Service-Events",
  reports: "Berichte",
  settings: "Einstellungen",
  users: "Benutzer",
  roles: "Rollen",
  portal: "Portal",
  admin: "Administration",
};

// Module order for grouping
const moduleOrder = [
  "parks",
  "turbines",
  "funds",
  "shareholders",
  "plots",
  "leases",
  "contracts",
  "documents",
  "invoices",
  "votes",
  "service-events",
  "reports",
  "settings",
  "users",
  "roles",
  "portal",
  "admin",
];

/**
 * GET /api/admin/permissions/export
 * Export permission matrix as PDF or Excel
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
    const format = searchParams.get("format")?.toLowerCase();

    if (!format || !["pdf", "xlsx"].includes(format)) {
      return NextResponse.json(
        { error: "Ungültiges Format. Erlaubt: pdf, xlsx" },
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

    // Fetch all roles (system roles + tenant-specific)
    const roles = await prisma.role.findMany({
      where: {
        OR: [{ isSystem: true }, { tenantId }],
      },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });

    // Fetch all permissions grouped by module
    const permissions = await prisma.permission.findMany({
      orderBy: [{ sortOrder: "asc" }, { module: "asc" }, { action: "asc" }],
    });

    // Group permissions by module
    const grouped: Record<
      string,
      {
        module: string;
        label: string;
        permissions: Array<{
          id: string;
          name: string;
          displayName: string;
          module: string;
          action: string;
        }>;
      }
    > = {};

    for (const perm of permissions) {
      if (!grouped[perm.module]) {
        grouped[perm.module] = {
          module: perm.module,
          label: moduleLabels[perm.module] || perm.module,
          permissions: [],
        };
      }

      grouped[perm.module].permissions.push({
        id: perm.id,
        name: perm.name,
        displayName: perm.displayName,
        module: perm.module,
        action: perm.action,
      });
    }

    // Sort modules by predefined order
    const groupedPermissions = moduleOrder
      .filter((m) => grouped[m])
      .map((m) => grouped[m]);

    // Add any modules not in the predefined order
    for (const [module, data] of Object.entries(grouped)) {
      if (!moduleOrder.includes(module)) {
        groupedPermissions.push(data);
      }
    }

    // Transform roles data
    const rolesData = roles.map((role) => ({
      id: role.id,
      name: role.name,
      isSystem: role.isSystem,
      color: role.color,
      permissionNames: role.permissions.map((rp) => rp.permission.name),
    }));

    // Build permission lookup per role
    const rolePermissionMap = new Map<string, Set<string>>();
    for (const role of rolesData) {
      rolePermissionMap.set(role.id, new Set(role.permissionNames));
    }

    const timestamp = new Date().toISOString().split("T")[0];

    if (format === "pdf") {
      // Generate PDF
      const pdfData: PermissionMatrixPdfData = {
        generatedAt: new Date().toISOString(),
        tenantId: tenant.id,
        tenantName: tenant.name,
        totalRoles: rolesData.length,
        totalPermissions: permissions.length,
        roles: rolesData,
        groupedPermissions,
      };

      const pdfBuffer = await generatePermissionMatrixPdf(pdfData);

      // Log export action
      await logExport(check.userId!, tenantId, "pdf", rolesData.length, permissions.length);

      // Return PDF
      const pdfResponseBody = new Uint8Array(pdfBuffer);
      return new NextResponse(pdfResponseBody, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="Berechtigungs-Matrix_${timestamp}.pdf"`,
          "Content-Length": String(pdfResponseBody.length),
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    } else {
      // Generate Excel
      // Build column definitions: Permission name + one column per role
      const columns: ColumnDef[] = [
        {
          key: "module",
          header: "Modul",
          width: 15,
          format: "text",
        },
        {
          key: "permission",
          header: "Berechtigung",
          width: 25,
          format: "text",
        },
        ...rolesData.map((role) => ({
          key: `role_${role.id}`,
          header: role.name + (role.isSystem ? " (System)" : ""),
          width: 12,
          format: "text" as const,
        })),
      ];

      // Build data rows
      const data: Record<string, unknown>[] = [];

      for (const group of groupedPermissions) {
        // Add module header row
        const moduleRow: Record<string, unknown> = {
          module: moduleLabels[group.module] || group.label,
          permission: "",
          isModuleHeader: true,
        };
        for (const role of rolesData) {
          moduleRow[`role_${role.id}`] = "";
        }
        data.push(moduleRow);

        // Add permission rows
        for (const perm of group.permissions) {
          const row: Record<string, unknown> = {
            module: "",
            permission: perm.displayName,
            isModuleHeader: false,
          };

          for (const role of rolesData) {
            const hasPermission = rolePermissionMap.get(role.id)?.has(perm.name);
            row[`role_${role.id}`] = hasPermission ? "✓" : "";
          }

          data.push(row);
        }
      }

      const excelBuffer = generateExcel(data, columns, "Berechtigungs-Matrix", {
        sheetName: "Matrix",
      });

      // Log export action
      await logExport(check.userId!, tenantId, "xlsx", rolesData.length, permissions.length);

      // Return Excel
      const excelResponseBody = new Uint8Array(excelBuffer);
      return new NextResponse(excelResponseBody, {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="Berechtigungs-Matrix_${timestamp}.xlsx"`,
          "Content-Length": String(excelResponseBody.length),
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }
  } catch (error) {
    logger.error({ err: error }, "Permission matrix export error");

    if (error instanceof Error) {
      return NextResponse.json(
        { error: `Fehler beim Export: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Fehler beim Export der Berechtigungs-Matrix" },
      { status: 500 }
    );
  }
}

/**
 * Log the export action to audit log
 */
async function logExport(
  userId: string,
  tenantId: string,
  format: string,
  roleCount: number,
  permissionCount: number
) {
  try {
    await prisma.auditLog.create({
      data: {
        action: "EXPORT",
        entityType: "PERMISSION_MATRIX",
        userId,
        tenantId,
        newValues: {
          format,
          roleCount,
          permissionCount,
        },
      },
    });
  } catch (auditError) {
    logger.error({ err: auditError }, "Audit log error");
  }
}
