/**
 * Mailings API
 *
 * GET  /api/mailings — List all mailings
 * POST /api/mailings — Create a new mailing from a template
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

const createSchema = z.object({
  templateId: z.string().min(1),
  fundId: z.string().optional(),
  title: z.string().min(1).max(300),
});

export async function GET(req: NextRequest) {
  const check = await requireAuth();
  if (!check.authorized) return check.error!;

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 20));

    const [mailings, total] = await Promise.all([
      prisma.mailing.findMany({
        where: { tenantId: check.tenantId! },
        include: {
          template: { select: { name: true, category: true } },
          fund: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.mailing.count({ where: { tenantId: check.tenantId! } }),
    ]);

    return NextResponse.json({
      mailings,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error({ err: error }, "[Mailings] GET failed");
    return NextResponse.json({ error: "Fehler beim Laden der Mailings" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const check = await requireAuth();
  if (!check.authorized) return check.error!;

  try {
    const body = await req.json();
    const data = createSchema.parse(body);

    // Verify template belongs to tenant
    const template = await prisma.mailingTemplate.findFirst({
      where: { id: data.templateId, tenantId: check.tenantId! },
    });
    if (!template) {
      return NextResponse.json({ error: "Vorlage nicht gefunden" }, { status: 404 });
    }

    // Verify fund belongs to tenant (if provided)
    if (data.fundId) {
      const fund = await prisma.fund.findFirst({
        where: { id: data.fundId, tenantId: check.tenantId! },
      });
      if (!fund) {
        return NextResponse.json({ error: "Gesellschaft nicht gefunden" }, { status: 404 });
      }
    }

    const mailing = await prisma.mailing.create({
      data: {
        tenantId: check.tenantId!,
        templateId: data.templateId,
        fundId: data.fundId ?? null,
        title: data.title,
        status: "DRAFT",
        createdBy: check.userId,
      },
      include: {
        template: { select: { name: true, category: true } },
        fund: { select: { name: true } },
      },
    });

    return NextResponse.json({ mailing }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Ungültige Eingabe", details: error.errors }, { status: 400 });
    }
    logger.error({ err: error }, "[Mailings] POST failed");
    return NextResponse.json({ error: "Fehler beim Erstellen" }, { status: 500 });
  }
}
