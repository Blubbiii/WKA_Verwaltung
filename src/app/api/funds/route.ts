import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { parsePaginationParams } from "@/lib/api-utils";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import { invalidate } from "@/lib/cache/invalidation";

const fundCreateSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  legalForm: z.string().optional().nullable(),
  fundCategoryId: z.string().uuid().optional().nullable(),
  registrationNumber: z.string().optional().nullable(),
  registrationCourt: z.string().optional().nullable(),
  foundingDate: z.string().optional().nullable(),
  fiscalYearEnd: z.string().default("12-31"),
  totalCapital: z.number().optional().nullable(),
  managingDirector: z.string().optional().nullable(),
  street: z.string().optional().nullable(),
  houseNumber: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  bankDetails: z.object({
    iban: z.string().optional(),
    bic: z.string().optional(),
    bankName: z.string().optional(),
  }).optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
});

// GET /api/funds - Liste aller Gesellschaften
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.FUNDS_READ);
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const { page, limit, skip } = parsePaginationParams(searchParams, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const where = {
      tenantId: check.tenantId!,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { legalForm: { contains: search, mode: "insensitive" as const } },
        ],
      }),
      ...(status && { status: status as "ACTIVE" | "INACTIVE" | "ARCHIVED" }),
    };

    const [funds, total] = await Promise.all([
      prisma.fund.findMany({
        where,
        include: {
          fundCategory: {
            select: { id: true, name: true, code: true, color: true },
          },
          shareholders: {
            where: { status: "ACTIVE" },
            select: {
              id: true,
              capitalContribution: true,
              ownershipPercentage: true,
            },
          },
          fundParks: {
            include: {
              park: {
                select: { id: true, name: true, shortName: true },
              },
            },
          },
          _count: {
            select: {
              shareholders: true,
              votes: true,
              documents: true,
            },
          },
        },
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
      prisma.fund.count({ where }),
    ]);

    // Berechne aggregierte Werte
    const fundsWithStats = funds.map((fund) => {
      const totalContributions = fund.shareholders.reduce(
        (sum, s) => sum + (Number(s.capitalContribution) || 0),
        0
      );

      return {
        ...fund,
        shareholders: undefined,
        stats: {
          shareholderCount: fund._count.shareholders,
          activeShareholderCount: fund.shareholders.length,
          totalContributions,
          voteCount: fund._count.votes,
          documentCount: fund._count.documents,
          parkCount: fund.fundParks.length,
        },
      };
    });

    return NextResponse.json({
      data: fundsWithStats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching funds");
    return NextResponse.json(
      { error: "Fehler beim Laden der Gesellschaften" },
      { status: 500 }
    );
  }
}

// POST /api/funds - Gesellschaft erstellen
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.FUNDS_CREATE);
    if (!check.authorized) return check.error;

    const body = await request.json();
    const validatedData = fundCreateSchema.parse(body);

    const fund = await prisma.fund.create({
      data: {
        ...validatedData,
        foundingDate: validatedData.foundingDate
          ? new Date(validatedData.foundingDate)
          : null,
        bankDetails: validatedData.bankDetails || {},
        tenantId: check.tenantId!,
      },
    });

    // Invalidate dashboard caches after fund creation
    invalidate.onFundChange(check.tenantId!, fund.id, 'create').catch((err) => {
      logger.warn({ err }, '[Funds] Cache invalidation error after create');
    });

    return NextResponse.json(fund, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error creating fund");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Gesellschaft" },
      { status: 500 }
    );
  }
}
