import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const voteCreateSchema = z.object({
  fundId: z.string().min(1, "Gesellschaft ist erforderlich"),
  title: z.string().min(1, "Titel ist erforderlich"),
  description: z.string().optional(),
  voteType: z.enum(["simple", "multiple"]).default("simple"),
  options: z.array(z.string()).default(["Ja", "Nein", "Enthaltung"]),
  startDate: z.string(),
  endDate: z.string(),
  quorumPercentage: z.number().min(0).max(100).optional(),
  requiresCapitalMajority: z.boolean().default(false),
  status: z.enum(["DRAFT", "ACTIVE", "CLOSED"]).default("DRAFT"),
});

// GET /api/votes - Liste aller Abstimmungen
export async function GET(request: NextRequest) {
  try {
const check = await requirePermission(PERMISSIONS.VOTES_READ);
    if (!check.authorized) return check.error!;

    const { searchParams } = new URL(request.url);
    const fundId = searchParams.get("fundId");
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const where = {
      tenantId: check.tenantId,
      ...(fundId && { fundId }),
      ...(status && { status: status as "DRAFT" | "ACTIVE" | "CLOSED" }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: "insensitive" as const } },
          { description: { contains: search, mode: "insensitive" as const } },
          { fund: { name: { contains: search, mode: "insensitive" as const } } },
        ],
      }),
    };

    const [votes, total] = await Promise.all([
      prisma.vote.findMany({
        where,
        include: {
          fund: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: { responses: true },
          },
          createdBy: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.vote.count({ where }),
    ]);

    // Batch-fetch eligible voter counts for all fund IDs at once (avoids N+1)
    const uniqueFundIds = [...new Set(votes.map((v) => v.fundId))];
    const eligibleVoterCounts = await prisma.shareholder.groupBy({
      by: ["fundId"],
      where: {
        fundId: { in: uniqueFundIds },
        status: "ACTIVE",
      },
      _count: { _all: true },
    });
    const eligibleVotersMap = new Map(
      eligibleVoterCounts.map((row) => [row.fundId, row._count._all])
    );

    const votesWithStats = votes.map((vote) => {
      const eligibleVoters = eligibleVotersMap.get(vote.fundId) ?? 0;

      return {
        id: vote.id,
        title: vote.title,
        description: vote.description,
        voteType: vote.voteType,
        options: vote.options,
        startDate: vote.startDate.toISOString(),
        endDate: vote.endDate.toISOString(),
        quorumPercentage: vote.quorumPercentage?.toNumber(),
        requiresCapitalMajority: vote.requiresCapitalMajority,
        status: vote.status,
        results: vote.results,
        fund: vote.fund,
        createdBy: vote.createdBy
          ? [vote.createdBy.firstName, vote.createdBy.lastName]
              .filter(Boolean)
              .join(" ")
          : null,
        createdAt: vote.createdAt.toISOString(),
        stats: {
          responseCount: vote._count.responses,
          eligibleVoters,
          participationRate:
            eligibleVoters > 0
              ? ((vote._count.responses / eligibleVoters) * 100).toFixed(1)
              : "0",
        },
      };
    });

    return NextResponse.json({
      data: votesWithStats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching votes");
    return NextResponse.json(
      { error: "Fehler beim Laden der Abstimmungen" },
      { status: 500 }
    );
  }
}

// POST /api/votes - Abstimmung erstellen
export async function POST(request: NextRequest) {
  try {
const check = await requirePermission(PERMISSIONS.VOTES_CREATE);
    if (!check.authorized) return check.error!;

    const body = await request.json();
    const validatedData = voteCreateSchema.parse(body);

    // Verify fund belongs to tenant
    const fund = await prisma.fund.findFirst({
      where: {
        id: validatedData.fundId,
        tenantId: check.tenantId,
      },
    });

    if (!fund) {
      return NextResponse.json(
        { error: "Gesellschaft nicht gefunden" },
        { status: 404 }
      );
    }

    const vote = await prisma.vote.create({
      data: {
        title: validatedData.title,
        description: validatedData.description,
        voteType: validatedData.voteType,
        options: validatedData.options,
        startDate: new Date(validatedData.startDate),
        endDate: new Date(validatedData.endDate),
        quorumPercentage: validatedData.quorumPercentage,
        requiresCapitalMajority: validatedData.requiresCapitalMajority,
        status: validatedData.status,
        fundId: validatedData.fundId,
        tenantId: check.tenantId!,
        createdById: check.userId!,
      },
      include: {
        fund: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(vote, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error creating vote");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Abstimmung" },
      { status: 500 }
    );
  }
}
