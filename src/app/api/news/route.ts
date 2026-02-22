import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { parsePaginationParams } from "@/lib/api-utils";
import { NewsCategory } from "@prisma/client";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const NewsCategoryEnum = z.enum(["GENERAL", "FINANCIAL", "TECHNICAL", "LEGAL"]);

const newsCreateSchema = z.object({
  title: z.string().min(1, "Titel ist erforderlich"),
  content: z.string().min(1, "Inhalt ist erforderlich"),
  category: NewsCategoryEnum.default("GENERAL"),
  fundId: z.string().uuid().optional().nullable(),
  isPublished: z.boolean().default(false),
  publishedAt: z.string().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
});

// GET /api/news
export async function GET(request: NextRequest) {
  try {
const check = await requireAuth();
    if (!check.authorized) return check.error!;

    const { searchParams } = new URL(request.url);
    const fundId = searchParams.get("fundId");
    const search = searchParams.get("search") || "";
    const published = searchParams.get("published");
    const category = searchParams.get("category");
    const { page, limit, skip } = parsePaginationParams(searchParams, {
      defaultLimit: 20,
      maxLimit: 50,
    });

    const where = {
      tenantId: check.tenantId,
      ...(fundId && fundId !== "_all" && { fundId }),
      ...(published === "true" && { isPublished: true }),
      ...(published === "false" && { isPublished: false }),
      ...(category && category !== "_all" && { category: category as NewsCategory }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: "insensitive" as const } },
          { content: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [news, total] = await Promise.all([
      prisma.news.findMany({
        where,
        include: {
          fund: {
            select: {
              id: true,
              name: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: [{ isPublished: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.news.count({ where }),
    ]);

    return NextResponse.json({
      data: news,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching news");
    return NextResponse.json(
      { error: "Fehler beim Laden der Meldungen" },
      { status: 500 }
    );
  }
}

// POST /api/news
export async function POST(request: NextRequest) {
  try {
const check = await requirePermission(PERMISSIONS.ADMIN_MANAGE);
    if (!check.authorized) return check.error!;

    const body = await request.json();
    const validatedData = newsCreateSchema.parse(body);

    // Check fund belongs to tenant if provided
    if (validatedData.fundId) {
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
    }

    const news = await prisma.news.create({
      data: {
        title: validatedData.title,
        content: validatedData.content,
        category: validatedData.category,
        fundId: validatedData.fundId || null,
        isPublished: validatedData.isPublished,
        publishedAt: validatedData.isPublished
          ? validatedData.publishedAt
            ? new Date(validatedData.publishedAt)
            : new Date()
          : null,
        expiresAt: validatedData.expiresAt
          ? new Date(validatedData.expiresAt)
          : null,
        tenantId: check.tenantId!,
        createdById: check.userId!,
      },
      include: {
        fund: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return NextResponse.json(news, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error creating news");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Meldung" },
      { status: 500 }
    );
  }
}
