import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { logDeletion } from "@/lib/audit";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const NewsCategoryEnum = z.enum(["GENERAL", "FINANCIAL", "TECHNICAL", "LEGAL"]);

const newsUpdateSchema = z.object({
  title: z.string().min(1, "Titel ist erforderlich").optional(),
  content: z.string().min(1, "Inhalt ist erforderlich").optional(),
  category: NewsCategoryEnum.optional(),
  fundId: z.string().uuid().optional().nullable(),
  isPublished: z.boolean().optional(),
  publishedAt: z.string().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
});

// GET /api/news/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requireAuth();
    if (!check.authorized) return check.error!;

    const { id } = await params;

    const news = await prisma.news.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
      include: {
        fund: {
          select: {
            id: true,
            name: true,
            legalForm: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!news) {
      return NextResponse.json(
        { error: "Meldung nicht gefunden" },
        { status: 404 }
      );
    }

    return NextResponse.json(news);
  } catch (error) {
    logger.error({ err: error }, "Error fetching news");
    return NextResponse.json(
      { error: "Fehler beim Laden der Meldung" },
      { status: 500 }
    );
  }
}

// PATCH /api/news/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.ADMIN_MANAGE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    const existingNews = await prisma.news.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
    });

    if (!existingNews) {
      return NextResponse.json(
        { error: "Meldung nicht gefunden" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validatedData = newsUpdateSchema.parse(body);

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

    // Handle publishing logic
    let publishedAt = existingNews.publishedAt;
    if (validatedData.isPublished !== undefined) {
      if (validatedData.isPublished && !existingNews.isPublished) {
        // Publishing for the first time
        publishedAt = validatedData.publishedAt
          ? new Date(validatedData.publishedAt)
          : new Date();
      } else if (!validatedData.isPublished) {
        // Unpublishing
        publishedAt = null;
      }
    }

    const news = await prisma.news.update({
      where: { id },
      data: {
        ...(validatedData.title && { title: validatedData.title }),
        ...(validatedData.content && { content: validatedData.content }),
        ...(validatedData.category && { category: validatedData.category }),
        ...(validatedData.fundId !== undefined && {
          fundId: validatedData.fundId || null,
        }),
        ...(validatedData.isPublished !== undefined && {
          isPublished: validatedData.isPublished,
        }),
        publishedAt,
        ...(validatedData.expiresAt !== undefined && {
          expiresAt: validatedData.expiresAt
            ? new Date(validatedData.expiresAt)
            : null,
        }),
      },
      include: {
        fund: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return NextResponse.json(news);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error updating news");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der Meldung" },
      { status: 500 }
    );
  }
}

// DELETE /api/news/[id] - Meldung unwiderruflich löschen (nur ADMIN/SUPERADMIN)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.ADMIN_MANAGE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    const existingNews = await prisma.news.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
    });

    if (!existingNews) {
      return NextResponse.json(
        { error: "Meldung nicht gefunden" },
        { status: 404 }
      );
    }

    // Hard-delete: Meldung unwiderruflich löschen
    await prisma.news.delete({ where: { id } });

    // Log deletion for audit trail
    await logDeletion("News", id, existingNews);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting news");
    return NextResponse.json(
      { error: "Fehler beim Löschen der Meldung" },
      { status: 500 }
    );
  }
}
