import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { parsePaginationParams } from "@/lib/api-utils";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { withMonitoring } from "@/lib/monitoring";
import { apiLogger as logger } from "@/lib/logger";

const contractCreateSchema = z.object({
  contractType: z.enum([
    "LEASE",
    "SERVICE",
    "INSURANCE",
    "GRID_CONNECTION",
    "MARKETING",
    "OTHER",
  ]),
  contractNumber: z.string().optional(),
  title: z.string().min(1),
  startDate: z.string().transform((s) => new Date(s)),
  endDate: z
    .string()
    .optional()
    .transform((s) => (s ? new Date(s) : undefined)),
  noticePeriodMonths: z.number().int().positive().optional(),
  noticeDeadline: z
    .string()
    .optional()
    .transform((s) => (s ? new Date(s) : undefined)),
  autoRenewal: z.boolean().default(false),
  renewalPeriodMonths: z.number().int().positive().optional(),
  annualValue: z.number().positive().optional(),
  paymentTerms: z.string().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "EXPIRING", "EXPIRED", "TERMINATED"]).default("ACTIVE"),
  documentUrl: z.string().url().optional(),
  reminderDays: z.array(z.number().int().positive()).optional(),
  notes: z.string().optional(),
  parkId: z.string().uuid().optional().nullable(),
  turbineId: z.string().uuid().optional().nullable(),
  fundId: z.string().uuid().optional().nullable(),
  partnerId: z.string().uuid().optional().nullable(),
});

// GET /api/contracts - List contracts with filtering
async function getHandler(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.CONTRACTS_READ);
    if (!check.authorized) return check.error!;

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = parsePaginationParams(searchParams, {
      defaultLimit: 20,
      maxLimit: 100,
    });
    const search = searchParams.get("search") || "";
    const contractType = searchParams.get("contractType");
    const status = searchParams.get("status");
    const parkId = searchParams.get("parkId");
    const fundId = searchParams.get("fundId");
    const expiringWithinDays = searchParams.get("expiringWithinDays");
    const endDateBefore = searchParams.get("endDateBefore");
    const endDateAfter = searchParams.get("endDateAfter");

    // Build where clause with proper Prisma types
    const where: Prisma.ContractWhereInput = {
      tenantId: check.tenantId,
    };

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { contractNumber: { contains: search, mode: "insensitive" } },
        { notes: { contains: search, mode: "insensitive" } },
      ];
    }

    if (contractType) {
      where.contractType = contractType as Prisma.EnumContractTypeFilter["equals"];
    }

    if (status) {
      where.status = status as Prisma.EnumContractStatusFilter["equals"];
    }

    if (parkId) {
      where.parkId = parkId;
    }

    if (fundId) {
      where.fundId = fundId;
    }

    // Find contracts expiring within N days
    if (expiringWithinDays) {
      const days = parseInt(expiringWithinDays, 10);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);
      where.endDate = {
        lte: futureDate,
        gte: new Date(),
      };
      where.status = { in: ["ACTIVE", "EXPIRING"] };
    }

    // Filter by endDate range (for dashboard widget)
    if (!expiringWithinDays && (endDateBefore || endDateAfter)) {
      where.endDate = {
        ...(endDateBefore && { lte: new Date(endDateBefore) }),
        ...(endDateAfter ? { gte: new Date(endDateAfter) } : (endDateBefore ? { gte: new Date() } : {})),
      };
    }

    const [contracts, total] = await Promise.all([
      prisma.contract.findMany({
        where,
        include: {
          park: {
            select: { id: true, name: true, shortName: true },
          },
          fund: {
            select: { id: true, name: true },
          },
          turbine: {
            select: { id: true, designation: true },
          },
          partner: {
            select: { id: true, firstName: true, lastName: true, companyName: true, personType: true },
          },
          _count: {
            select: { documents: true },
          },
        },
        orderBy: [{ status: "asc" }, { endDate: "asc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.contract.count({ where }),
    ]);

    // Get statistics
    const stats = await prisma.contract.groupBy({
      by: ["status"],
      where: { tenantId: check.tenantId },
      _count: true,
    });

    // Count contracts expiring in 30 days
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringCount = await prisma.contract.count({
      where: {
        tenantId: check.tenantId,
        status: { in: ["ACTIVE", "EXPIRING"] },
        endDate: {
          lte: thirtyDaysFromNow,
          gte: new Date(),
        },
      },
    });

    return NextResponse.json({
      data: contracts.map((c) => ({
        id: c.id,
        contractType: c.contractType,
        contractNumber: c.contractNumber,
        title: c.title,
        startDate: c.startDate.toISOString(),
        endDate: c.endDate?.toISOString() || null,
        noticePeriodMonths: c.noticePeriodMonths,
        noticeDeadline: c.noticeDeadline?.toISOString() || null,
        autoRenewal: c.autoRenewal,
        annualValue: c.annualValue ? Number(c.annualValue) : null,
        status: c.status,
        park: c.park,
        fund: c.fund,
        turbine: c.turbine,
        partner: c.partner ? {
          id: c.partner.id,
          name: c.partner.personType === "legal"
            ? c.partner.companyName
            : `${c.partner.firstName || ""} ${c.partner.lastName || ""}`.trim(),
        } : null,
        documentCount: c._count.documents,
        createdAt: c.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        byStatus: stats.reduce(
          (acc, s) => ({ ...acc, [s.status]: s._count }),
          {} as Record<string, number>
        ),
        expiringIn30Days: expiringCount,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching contracts");
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

export const GET = withMonitoring(getHandler);

// POST /api/contracts - Create contract
async function postHandler(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.CONTRACTS_CREATE);
    if (!check.authorized) return check.error!;

    const body = await request.json();
    const validatedData = contractCreateSchema.parse(body);

    // Calculate notice deadline if not provided
    let noticeDeadline = validatedData.noticeDeadline;
    if (
      !noticeDeadline &&
      validatedData.endDate &&
      validatedData.noticePeriodMonths
    ) {
      noticeDeadline = new Date(validatedData.endDate);
      noticeDeadline.setMonth(
        noticeDeadline.getMonth() - validatedData.noticePeriodMonths
      );
    }

    const contract = await prisma.contract.create({
      data: {
        contractType: validatedData.contractType,
        contractNumber: validatedData.contractNumber,
        title: validatedData.title,
        startDate: validatedData.startDate,
        endDate: validatedData.endDate,
        noticePeriodMonths: validatedData.noticePeriodMonths,
        noticeDeadline: noticeDeadline,
        autoRenewal: validatedData.autoRenewal,
        renewalPeriodMonths: validatedData.renewalPeriodMonths,
        annualValue: validatedData.annualValue,
        paymentTerms: validatedData.paymentTerms,
        status: validatedData.status,
        documentUrl: validatedData.documentUrl,
        reminderDays: validatedData.reminderDays || [90, 30],
        notes: validatedData.notes,
        parkId: validatedData.parkId || null,
        turbineId: validatedData.turbineId || null,
        fundId: validatedData.fundId || null,
        partnerId: validatedData.partnerId || null,
        tenantId: check.tenantId!,
      },
      include: {
        park: { select: { id: true, name: true } },
        fund: { select: { id: true, name: true } },
        partner: { select: { id: true, firstName: true, lastName: true, companyName: true, personType: true } },
      },
    });

    // Transform partner to include name
    const response = {
      ...contract,
      partner: contract.partner ? {
        id: contract.partner.id,
        name: contract.partner.personType === "legal"
          ? contract.partner.companyName
          : `${contract.partner.firstName || ""} ${contract.partner.lastName || ""}`.trim(),
      } : null,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Ungültige Daten", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error creating contract");
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

export const POST = withMonitoring(postHandler);
