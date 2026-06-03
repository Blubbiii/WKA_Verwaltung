import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { handleApiError } from "@/lib/api-utils";
import { PAGE_SIZE_ADMIN } from "@/lib/config/pagination";
import { getAuditEntityHref } from "@/lib/audit-entity-urls";

const querySchema = z.object({
  action: z.string().optional(),
  entityType: z.string().optional(),
  userId: z.string().optional(),
  search: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(PAGE_SIZE_ADMIN),
  // M-10: optionaler cursor (UUID-String). Wenn gesetzt → cursor-Modus,
  // sonst klassisches skip/take (backward-kompat für bestehende UIs).
  cursor: z.string().optional(),
});

// GET /api/admin/audit-logs - Audit-Logs laden
export async function GET(request: NextRequest) {
  try {
    // Require admin:audit permission
    const check = await requirePermission("admin:audit");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);

    // Parse and validate query parameters
    const params = querySchema.parse({
      action: searchParams.get("action") || undefined,
      entityType: searchParams.get("entityType") || undefined,
      userId: searchParams.get("userId") || undefined,
      search: searchParams.get("search") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
      page: searchParams.get("page") || 1,
      limit: searchParams.get("limit") || PAGE_SIZE_ADMIN,
      cursor: searchParams.get("cursor") || undefined,
    });

    // Build where clause
    const where: Prisma.AuditLogWhereInput = {};

    // Filter by action
    if (params.action && params.action !== "ALL") {
      where.action = params.action;
    }

    // Filter by entity type
    if (params.entityType && params.entityType !== "ALL") {
      where.entityType = params.entityType;
    }

    // Filter by user
    if (params.userId && params.userId !== "ALL") {
      where.userId = params.userId;
    }

    // Filter by search text (searches in entityId, oldValues, newValues as JSON strings)
    if (params.search && params.search.trim()) {
      const searchTerm = params.search.trim();
      where.OR = [
        { entityId: { contains: searchTerm, mode: "insensitive" } },
        { entityType: { contains: searchTerm, mode: "insensitive" } },
        { ipAddress: { contains: searchTerm, mode: "insensitive" } },
        // Search in related user name/email
        {
          user: {
            OR: [
              { firstName: { contains: searchTerm, mode: "insensitive" } },
              { lastName: { contains: searchTerm, mode: "insensitive" } },
              { email: { contains: searchTerm, mode: "insensitive" } },
            ],
          },
        },
      ];
    }

    // Filter by date range
    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) {
        where.createdAt.gte = new Date(params.startDate);
      }
      if (params.endDate) {
        // Include the entire end date by setting time to end of day
        const endDate = new Date(params.endDate);
        endDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDate;
      }
    }

    // Tenant filter - non-superadmins can only see their tenant's logs
    if (check.tenantId) {
      where.tenantId = check.tenantId;
    }

    const include = {
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
    } as const;

    // M-10: cursor-Modus für tiefe Pagination ohne Full-Scan.
    if (params.cursor !== undefined) {
      const rows = await prisma.auditLog.findMany({
        where,
        include,
        // Sekundär-Sort auf id für deterministische Reihenfolge (createdAt nicht unique).
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: params.limit + 1,
        ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      });

      const hasMore = rows.length > params.limit;
      const data = hasMore ? rows.slice(0, params.limit) : rows;
      const nextCursor = hasMore ? data[data.length - 1].id : null;

      // RA-5: Entity-Link pro Eintrag mitliefern
      const dataWithHref = data.map((row) => ({
        ...row,
        href: getAuditEntityHref(row.entityType, row.entityId),
      }));

      return NextResponse.json({
        data: dataWithHref,
        nextCursor,
        pagination: {
          limit: params.limit,
          hasNextPage: hasMore,
        },
      });
    }

    // Backward-Compat: klassisches skip/take + Total-Count.
    const skip = (params.page - 1) * params.limit;

    const [auditLogs, totalCount] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: params.limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    const totalPages = Math.ceil(totalCount / params.limit);

    // RA-5: Entity-Link pro Eintrag mitliefern
    const auditLogsWithHref = auditLogs.map((row) => ({
      ...row,
      href: getAuditEntityHref(row.entityType, row.entityId),
    }));

    return NextResponse.json({
      data: auditLogsWithHref,
      pagination: {
        page: params.page,
        limit: params.limit,
        totalCount,
        totalPages,
        hasNextPage: params.page < totalPages,
        hasPrevPage: params.page > 1,
      },
    });
  } catch (error) {
    return handleApiError(error, "Fehler beim Laden der Audit-Logs");
  }
}
