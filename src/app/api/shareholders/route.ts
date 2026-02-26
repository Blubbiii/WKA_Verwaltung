import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const shareholderCreateSchema = z.object({
  fundId: z.string().uuid("Ungültige Gesellschafts-ID"),
  personId: z.string().uuid("Ungültige Personen-ID"),
  shareholderNumber: z.string().optional().nullable(),
  entryDate: z.string().optional().nullable(),
  capitalContribution: z.number().optional().nullable(),
  liabilityAmount: z.number().optional().nullable(),
  ownershipPercentage: z.number().min(0).max(100).optional().nullable(),
  votingRightsPercentage: z.number().min(0).max(100).optional().nullable(),
  distributionPercentage: z.number().min(0).max(100).optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
  notes: z.string().optional().nullable(),
});

// Helper function to recalculate all ownership percentages in a fund
// Accepts optional transaction client for atomic operations
async function recalculateFundShares(fundId: string, txClient?: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) {
  const db = txClient || prisma;

  // Get the fund's registered capital (Stammkapital)
  const fund = await db.fund.findUnique({
    where: { id: fundId },
    select: { totalCapital: true },
  });

  // Get all active shareholders in this fund
  const shareholders = await db.shareholder.findMany({
    where: {
      fundId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      capitalContribution: true,
    },
  });

  // Use fund's Stammkapital as denominator; fall back to sum of contributions
  const stammkapital = Number(fund?.totalCapital) || 0;
  const totalContributions = shareholders.reduce(
    (sum, sh) => sum + (Number(sh.capitalContribution) || 0),
    0
  );
  const denominator = stammkapital > 0 ? stammkapital : totalContributions;

  // Update each shareholder's ownership percentage
  if (denominator > 0) {
    for (const sh of shareholders) {
      const contribution = Number(sh.capitalContribution) || 0;
      const percentage = Math.round((contribution / denominator) * 100 * 100) / 100;
      await db.shareholder.update({
        where: { id: sh.id },
        data: {
          ownershipPercentage: percentage,
          votingRightsPercentage: percentage,
          distributionPercentage: percentage,
        },
      });
    }
  }
}

// GET /api/shareholders
export async function GET(request: NextRequest) {
  try {
const check = await requirePermission(PERMISSIONS.SHAREHOLDERS_READ);
    if (!check.authorized) return check.error!;

    const { searchParams } = new URL(request.url);
    const fundId = searchParams.get("fundId");
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const where = {
      fund: {
        tenantId: check.tenantId,
      },
      ...(fundId && { fundId }),
      ...(status && { status: status as "ACTIVE" | "INACTIVE" | "ARCHIVED" }),
      ...(search && {
        person: {
          OR: [
            { firstName: { contains: search, mode: "insensitive" as const } },
            { lastName: { contains: search, mode: "insensitive" as const } },
            { companyName: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        },
      }),
    };

    const [shareholders, total] = await Promise.all([
      prisma.shareholder.findMany({
        where,
        include: {
          person: {
            select: {
              id: true,
              personType: true,
              firstName: true,
              lastName: true,
              companyName: true,
              email: true,
              phone: true,
              city: true,
            },
          },
          fund: {
            select: {
              id: true,
              name: true,
              legalForm: true,
            },
          },
          _count: {
            select: { voteResponses: true, documents: true },
          },
        },
        orderBy: [{ status: "asc" }, { ownershipPercentage: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.shareholder.count({ where }),
    ]);

    return NextResponse.json({
      data: shareholders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching shareholders");
    return NextResponse.json(
      { error: "Fehler beim Laden der Gesellschafter" },
      { status: 500 }
    );
  }
}

// POST /api/shareholders
export async function POST(request: NextRequest) {
  try {
const check = await requirePermission(PERMISSIONS.SHAREHOLDERS_CREATE);
    if (!check.authorized) return check.error!;

    const body = await request.json();
    const validatedData = shareholderCreateSchema.parse(body);

    // Prüfe ob Gesellschaft und Person zum Tenant gehören
    const [fund, person] = await Promise.all([
      prisma.fund.findFirst({
        where: {
          id: validatedData.fundId,
          tenantId: check.tenantId,
        },
      }),
      prisma.person.findFirst({
        where: {
          id: validatedData.personId,
          tenantId: check.tenantId,
        },
      }),
    ]);

    if (!fund) {
      return NextResponse.json(
        { error: "Gesellschaft nicht gefunden" },
        { status: 404 }
      );
    }

    if (!person) {
      return NextResponse.json(
        { error: "Person nicht gefunden" },
        { status: 404 }
      );
    }

    // Prüfe ob Kombination bereits existiert
    const existing = await prisma.shareholder.findFirst({
      where: {
        fundId: validatedData.fundId,
        personId: validatedData.personId,
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Diese Person ist bereits Gesellschafter in dieser Gesellschaft" },
        { status: 400 }
      );
    }

    // Create shareholder + recalculate fund shares atomar in einer Transaktion
    const updatedShareholder = await prisma.$transaction(async (tx) => {
      const shareholder = await tx.shareholder.create({
        data: {
          ...validatedData,
          entryDate: validatedData.entryDate
            ? new Date(validatedData.entryDate)
            : null,
        },
      });

      // Recalculate all ownership percentages in this fund
      await recalculateFundShares(validatedData.fundId, tx);

      // Fetch updated shareholder with new percentages
      return tx.shareholder.findUnique({
        where: { id: shareholder.id },
        include: {
          person: true,
          fund: { select: { id: true, name: true } },
        },
      });
    });

    return NextResponse.json(updatedShareholder, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error creating shareholder");
    return NextResponse.json(
      { error: "Fehler beim Erstellen des Gesellschafters" },
      { status: 500 }
    );
  }
}
