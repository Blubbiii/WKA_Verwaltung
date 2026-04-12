import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-utils";
import { apiError } from "@/lib/api-errors";

const createLetterheadSchema = z.object({
  name: z.string().min(1, "Name erforderlich"),
  headerImageUrl: z.url().optional().nullable(),
  headerHeight: z.number().min(0).max(200).optional(),
  logoPosition: z.enum(["top-left", "top-center", "top-right"]).optional(),
  logoWidth: z.number().min(10).max(100).optional(),
  logoMarginTop: z.number().min(0).max(50).optional(),
  logoMarginLeft: z.number().min(0).max(50).optional(),
  senderAddress: z.string().optional().nullable(),
  companyInfo: z.object({}).passthrough().optional().nullable(),
  footerImageUrl: z.url().optional().nullable(),
  footerHeight: z.number().min(0).max(100).optional(),
  footerText: z.string().optional().nullable(),
  marginTop: z.number().min(10).max(100).optional(),
  marginBottom: z.number().min(10).max(100).optional(),
  marginLeft: z.number().min(10).max(50).optional(),
  marginRight: z.number().min(10).max(50).optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  parkId: z.uuid().optional().nullable(),
  fundId: z.uuid().optional().nullable(),
  isDefault: z.boolean().default(false),
  backgroundPdfKey: z.string().optional().nullable(),
  backgroundPdfName: z.string().optional().nullable(),
});

// GET /api/admin/letterheads - Liste aller Briefpapiere
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const parkId = searchParams.get("parkId");
    const fundId = searchParams.get("fundId");

    const where: Prisma.LetterheadWhereInput = {
      tenantId: check.tenantId!,
      isActive: true,
    };

    if (parkId) where.parkId = parkId;
    if (fundId) where.fundId = fundId;

    const letterheads = await prisma.letterhead.findMany({
      where,
      include: {
        park: {
          select: { id: true, name: true },
        },
        fund: {
          select: { id: true, name: true, legalForm: true },
        },
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });

    return NextResponse.json(letterheads);
  } catch (error) {
    logger.error({ err: error }, "Error fetching letterheads");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Briefpapiere" });
  }
}

// POST /api/admin/letterheads - Neues Briefpapier erstellen
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const data = createLetterheadSchema.parse(body);

    // Wenn parkId gesetzt, prüfen ob Park existiert
    if (data.parkId) {
      const park = await prisma.park.findFirst({
        where: { id: data.parkId, tenantId: check.tenantId! },
      });
      if (!park) {
        return apiError("NOT_FOUND", undefined, { message: "Windpark nicht gefunden" });
      }
    }

    // Wenn fundId gesetzt, prüfen ob Fund existiert
    if (data.fundId) {
      const fund = await prisma.fund.findFirst({
        where: { id: data.fundId, tenantId: check.tenantId! },
      });
      if (!fund) {
        return apiError("NOT_FOUND", undefined, { message: "Gesellschaft nicht gefunden" });
      }
    }

    // Wenn isDefault, andere Defaults im gleichen Scope zurücksetzen
    if (data.isDefault) {
      await prisma.letterhead.updateMany({
        where: {
          tenantId: check.tenantId!,
          fundId: data.fundId || null,
          parkId: data.parkId || null,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    const letterhead = await prisma.letterhead.create({
      data: {
        name: data.name,
        headerImageUrl: data.headerImageUrl,
        headerHeight: data.headerHeight,
        logoPosition: data.logoPosition || "top-left",
        logoWidth: data.logoWidth,
        logoMarginTop: data.logoMarginTop,
        logoMarginLeft: data.logoMarginLeft,
        senderAddress: data.senderAddress,
        companyInfo: data.companyInfo === null ? Prisma.JsonNull : data.companyInfo,
        footerImageUrl: data.footerImageUrl,
        footerHeight: data.footerHeight,
        footerText: data.footerText,
        marginTop: data.marginTop || 45,
        marginBottom: data.marginBottom || 30,
        marginLeft: data.marginLeft || 25,
        marginRight: data.marginRight || 20,
        primaryColor: data.primaryColor,
        secondaryColor: data.secondaryColor,
        parkId: data.parkId || null,
        fundId: data.fundId || null,
        isDefault: data.isDefault,
        backgroundPdfKey: data.backgroundPdfKey,
        backgroundPdfName: data.backgroundPdfName,
        tenantId: check.tenantId!,
      },
      include: {
        park: {
          select: { id: true, name: true },
        },
        fund: {
          select: { id: true, name: true, legalForm: true },
        },
      },
    });

    return NextResponse.json(letterhead, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Fehler beim Erstellen des Briefpapiers");
  }
}
