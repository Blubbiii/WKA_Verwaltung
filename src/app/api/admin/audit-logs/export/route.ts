import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { generateCsvBuffer, generateExcel, type ColumnDef } from "@/lib/export";
import { generateAuditLogPdf, type AuditLogPdfData } from "@/lib/pdf/generators/auditLogPdf";
import { apiLogger as logger } from "@/lib/logger";

// ============================================================================
// VALIDATION SCHEMA
// ============================================================================

const querySchema = z.object({
  format: z.enum(["csv", "xlsx", "pdf"]),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  entityType: z.string().optional(),
  action: z.string().optional(),
  userId: z.string().uuid().optional(),
});

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_EXPORT_ENTRIES = 10000;

// Action display names for export
const ACTION_LABELS: Record<string, string> = {
  CREATE: "Erstellt",
  UPDATE: "Bearbeitet",
  DELETE: "Gelöscht",
  VIEW: "Angesehen",
  EXPORT: "Exportiert",
  DOCUMENT_DOWNLOAD: "Heruntergeladen",
  LOGIN: "Anmeldung",
  LOGOUT: "Abmeldung",
  IMPERSONATE: "Impersoniert",
};

// Entity display names for export
const ENTITY_LABELS: Record<string, string> = {
  Park: "Windpark",
  Turbine: "Anlage",
  Fund: "Gesellschaft",
  Shareholder: "Gesellschafter",
  Plot: "Flurstueck",
  Lease: "Pachtvertrag",
  Contract: "Vertrag",
  Document: "Dokument",
  Invoice: "Rechnung",
  Vote: "Abstimmung",
  ServiceEvent: "Service-Event",
  News: "Neuigkeit",
  Person: "Person",
  User: "Benutzer",
  Role: "Rolle",
  Tenant: "Mandant",
};

// ============================================================================
// COLUMN DEFINITIONS
// ============================================================================

const auditLogColumns: ColumnDef[] = [
  {
    key: "createdAt",
    header: "Zeitstempel",
    format: "date",
    width: 18,
    transform: (value) => {
      if (!value) return "";
      const date = new Date(value as string);
      return date.toLocaleString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    },
  },
  {
    key: "user",
    header: "Benutzer",
    width: 25,
    transform: (value) => {
      const user = value as { firstName?: string; lastName?: string; email?: string } | null;
      if (!user) return "-";
      if (user.firstName && user.lastName) {
        return `${user.firstName} ${user.lastName}`;
      }
      return user.email || "-";
    },
  },
  {
    key: "user.email",
    header: "E-Mail",
    width: 30,
    transform: (_, row) => {
      const user = row.user as { email?: string } | null;
      return user?.email || "-";
    },
  },
  {
    key: "action",
    header: "Aktion",
    width: 15,
    transform: (value) => ACTION_LABELS[value as string] || (value as string),
  },
  {
    key: "entityType",
    header: "Entitaet",
    width: 15,
    transform: (value) => ENTITY_LABELS[value as string] || (value as string),
  },
  {
    key: "entityId",
    header: "Entitaet-ID",
    width: 38,
    transform: (value) => (value as string) || "-",
  },
  {
    key: "changes",
    header: "Änderungen",
    width: 50,
    transform: (_, row) => {
      const { action, oldValues, newValues } = row as {
        action: string;
        oldValues: Record<string, unknown> | null;
        newValues: Record<string, unknown> | null;
      };

      if (action === "CREATE" && newValues) {
        const keys = Object.keys(newValues).slice(0, 5);
        return keys.length > 0 ? `Neu: ${keys.join(", ")}` : "-";
      }

      if (action === "UPDATE" && newValues && oldValues) {
        const changedKeys = Object.keys(newValues).filter(
          (key) => JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key])
        );
        return changedKeys.length > 0 ? `Geändert: ${changedKeys.slice(0, 5).join(", ")}` : "-";
      }

      if (action === "DELETE") {
        return "Eintrag gelöscht";
      }

      return "-";
    },
  },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Builds the Prisma where clause based on filters
 */
function buildWhereClause(
  params: z.infer<typeof querySchema>,
  tenantId: string | undefined
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any

  const where: any = {};

  // Tenant filter - non-superadmins can only see their tenant's logs
  if (tenantId) {
    where.tenantId = tenantId;
  }

  // Action filter
  if (params.action) {
    where.action = params.action;
  }

  // Entity type filter
  if (params.entityType) {
    where.entityType = params.entityType;
  }

  // User filter
  if (params.userId) {
    where.userId = params.userId;
  }

  // Date range filter
  if (params.from || params.to) {
    where.createdAt = {};
    if (params.from) {
      (where.createdAt as Record<string, Date>).gte = new Date(params.from);
    }
    if (params.to) {
      const endDate = new Date(params.to);
      endDate.setHours(23, 59, 59, 999);
      (where.createdAt as Record<string, Date>).lte = endDate;
    }
  }

  return where;
}

/**
 * Calculate statistics from audit logs
 */
function calculateStatistics(logs: Array<{ action: string }>) {
  const stats = {
    creates: 0,
    updates: 0,
    deletes: 0,
    views: 0,
    exports: 0,
    logins: 0,
    others: 0,
  };

  for (const log of logs) {
    switch (log.action) {
      case "CREATE":
        stats.creates++;
        break;
      case "UPDATE":
        stats.updates++;
        break;
      case "DELETE":
        stats.deletes++;
        break;
      case "VIEW":
        stats.views++;
        break;
      case "EXPORT":
      case "DOCUMENT_DOWNLOAD":
        stats.exports++;
        break;
      case "LOGIN":
      case "LOGOUT":
        stats.logins++;
        break;
      default:
        stats.others++;
    }
  }

  return stats;
}

/**
 * Format filename with timestamp
 */
function formatFilename(format: string): string {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  return `audit-log-export-${timestamp}.${format}`;
}

// ============================================================================
// GET /api/admin/audit-logs/export
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    // Require admin:audit permission
    const check = await requirePermission("admin:audit");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);

    // Parse and validate query parameters
    const parseResult = querySchema.safeParse({
      format: searchParams.get("format") || "csv",
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
      entityType: searchParams.get("entityType") || undefined,
      action: searchParams.get("action") || undefined,
      userId: searchParams.get("userId") || undefined,
    });

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Ungültige Parameter",
          details: parseResult.error.errors,
        },
        { status: 400 }
      );
    }

    const params = parseResult.data;

    // Build where clause
    const where = buildWhereClause(params, check.tenantId);

    // Fetch audit logs with limit
    const auditLogs = await prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        impersonatedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: MAX_EXPORT_ENTRIES,
    });

    // Get total count for info
    const totalCount = await prisma.auditLog.count({ where });

    // Get tenant name for PDF header
    let tenantName = "Alle Mandanten";
    if (check.tenantId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: check.tenantId },
        select: { name: true },
      });
      tenantName = tenant?.name || "Unbekannt";
    }

    // Get user name if userId filter is set
    let userName: string | undefined;
    if (params.userId) {
      const filterUser = await prisma.user.findUnique({
        where: { id: params.userId },
        select: { firstName: true, lastName: true, email: true },
      });
      if (filterUser) {
        userName =
          filterUser.firstName && filterUser.lastName
            ? `${filterUser.firstName} ${filterUser.lastName}`
            : filterUser.email;
      }
    }

    // Generate export based on format
    let buffer: Buffer;
    let contentType: string;
    let filename: string;

    switch (params.format) {
      case "csv": {
        buffer = generateCsvBuffer(
          auditLogs as unknown as Record<string, unknown>[],
          auditLogColumns
        );
        contentType = "text/csv; charset=utf-8";
        filename = formatFilename("csv");
        break;
      }

      case "xlsx": {
        buffer = generateExcel(
          auditLogs as unknown as Record<string, unknown>[],
          auditLogColumns,
          "Audit-Log",
          {
            sheetName: "Audit-Log",
            dateFormat: "DD.MM.YYYY HH:mm:ss",
          }
        );
        contentType =
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        filename = formatFilename("xlsx");
        break;
      }

      case "pdf": {
        // Prepare PDF data
        const pdfData: AuditLogPdfData = {
          generatedAt: new Date().toISOString(),
          tenantId: check.tenantId || "",
          tenantName,
          totalEntries: totalCount,
          filters: {
            from: params.from,
            to: params.to,
            entityType: params.entityType,
            action: params.action,
            userId: params.userId,
            userName,
          },
          logs: auditLogs.map((log) => ({
            id: log.id,
            createdAt: log.createdAt.toISOString(),
            action: log.action,
            entityType: log.entityType,
            entityId: log.entityId,
            oldValues: log.oldValues as Record<string, unknown> | null,
            newValues: log.newValues as Record<string, unknown> | null,
            user: log.user
              ? {
                  firstName: log.user.firstName,
                  lastName: log.user.lastName,
                  email: log.user.email,
                }
              : null,
            impersonatedBy: log.impersonatedBy
              ? {
                  firstName: log.impersonatedBy.firstName,
                  lastName: log.impersonatedBy.lastName,
                  email: log.impersonatedBy.email,
                }
              : null,
          })),
          statistics: calculateStatistics(auditLogs),
        };

        buffer = await generateAuditLogPdf(pdfData);
        contentType = "application/pdf";
        filename = formatFilename("pdf");
        break;
      }

      default:
        return NextResponse.json(
          { error: "Ungültiges Export-Format" },
          { status: 400 }
        );
    }

    // Create response with appropriate headers
    // Convert Buffer to Uint8Array for NextResponse compatibility
    const responseBody = new Uint8Array(buffer);
    const response = new NextResponse(responseBody, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": buffer.length.toString(),
        "X-Total-Count": totalCount.toString(),
        "X-Export-Count": auditLogs.length.toString(),
        "X-Export-Limited": (totalCount > MAX_EXPORT_ENTRIES).toString(),
      },
    });

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Ungültige Parameter", details: error.errors },
        { status: 400 }
      );
    }

    logger.error({ err: error }, "Error exporting audit logs");
    return NextResponse.json(
      { error: "Fehler beim Exportieren der Audit-Logs" },
      { status: 500 }
    );
  }
}
