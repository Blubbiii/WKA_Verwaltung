import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const querySchema = z.object({
  action: z.string().optional(),
  entityType: z.string().optional(),
  userId: z.string().optional(),
  search: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(25),
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
      limit: searchParams.get("limit") || 25,
    });

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    const where: any = {};

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

    // Calculate pagination
    const skip = (params.page - 1) * params.limit;

    // Fetch audit logs with user relation
    const [auditLogs, totalCount] = await Promise.all([
      prisma.auditLog.findMany({
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
        skip,
        take: params.limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / params.limit);

    return NextResponse.json({
      data: auditLogs,
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
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Ungueltige Parameter", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error fetching audit logs");
    return NextResponse.json(
      { error: "Fehler beim Laden der Audit-Logs" },
      { status: 500 }
    );
  }
}
