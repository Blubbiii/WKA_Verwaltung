import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { DEFAULT_DOCUMENT_LAYOUT } from "@/types/pdf";
import { Prisma } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-utils";
import { apiError } from "@/lib/api-errors";

const createTemplateSchema = z.object({
  name: z.string().min(1, "Name erforderlich"),
  documentType: z.enum(["INVOICE", "CREDIT_NOTE", "CONTRACT", "SETTLEMENT_REPORT"]),
  layout: z.object({}).passthrough().optional(), // Flexible JSON
  customCss: z.string().optional(),
  footerText: z.string().optional(),
  parkId: z.uuid().optional().nullable(),
  isDefault: z.boolean().default(false),
});

// GET /api/admin/document-templates - Liste aller Templates
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const documentType = searchParams.get("documentType");
    const parkId = searchParams.get("parkId");

    const where: Prisma.DocumentTemplateWhereInput = {
      tenantId: check.tenantId!,
      isActive: true,
    };

    if (documentType) where.documentType = documentType as Prisma.EnumDocumentTypeFilter<"DocumentTemplate">;
    if (parkId) where.parkId = parkId;

    const templates = await prisma.documentTemplate.findMany({
      where,
      include: {
        park: {
          select: { id: true, name: true },
        },
      },
      orderBy: [
        { documentType: "asc" },
        { isDefault: "desc" },
        { name: "asc" },
      ],
    });

    return NextResponse.json(templates);
  } catch (error) {
    logger.error({ err: error }, "Error fetching document templates");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Dokumentvorlagen" });
  }
}

// POST /api/admin/document-templates - Neue Vorlage erstellen
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const data = createTemplateSchema.parse(body);

    // Wenn parkId gesetzt, prüfen ob Park existiert
    if (data.parkId) {
      const park = await prisma.park.findFirst({
        where: {
          id: data.parkId,
          tenantId: check.tenantId!,
        },
      });

      if (!park) {
        return apiError("NOT_FOUND", undefined, { message: "Windpark nicht gefunden" });
      }
    }

    // Wenn isDefault, andere Defaults zurücksetzen
    if (data.isDefault) {
      await prisma.documentTemplate.updateMany({
        where: {
          tenantId: check.tenantId!,
          documentType: data.documentType,
          parkId: data.parkId || null,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    // Layout mit Defaults mergen
    const layout = {
      ...DEFAULT_DOCUMENT_LAYOUT,
      ...(data.layout || {}),
    };

    const template = await prisma.documentTemplate.create({
      data: {
        name: data.name,
        documentType: data.documentType,
        layout,
        customCss: data.customCss,
        footerText: data.footerText,
        parkId: data.parkId || null,
        isDefault: data.isDefault,
        tenantId: check.tenantId!,
      },
      include: {
        park: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Fehler beim Erstellen der Vorlage");
  }
}
