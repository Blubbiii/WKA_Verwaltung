import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-utils";
import { apiError } from "@/lib/api-errors";

const updateLetterheadSchema = z.object({
  name: z.string().min(1).optional(),
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
  fundId: z.uuid().optional().nullable(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  backgroundPdfKey: z.string().optional().nullable(),
  backgroundPdfName: z.string().optional().nullable(),
});

// GET /api/admin/letterheads/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const letterhead = await prisma.letterhead.findUnique({
      where: { id },
      include: {
        park: {
          select: { id: true, name: true },
        },
        fund: {
          select: { id: true, name: true, legalForm: true },
        },
      },
    });

    if (!letterhead) {
      return apiError("NOT_FOUND", undefined, { message: "Briefpapier nicht gefunden" });
    }

    if (letterhead.tenantId !== check.tenantId!) {
      return apiError("FORBIDDEN", undefined, { message: "Keine Berechtigung" });
    }

    return NextResponse.json(letterhead);
  } catch (error) {
    logger.error({ err: error }, "Error fetching letterhead");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden des Briefpapiers" });
  }
}

// PATCH /api/admin/letterheads/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();
    const data = updateLetterheadSchema.parse(body);

    const letterhead = await prisma.letterhead.findUnique({
      where: { id },
      select: { id: true, tenantId: true, parkId: true, fundId: true },
    });

    if (!letterhead) {
      return apiError("NOT_FOUND", undefined, { message: "Briefpapier nicht gefunden" });
    }

    if (letterhead.tenantId !== check.tenantId!) {
      return apiError("FORBIDDEN", undefined, { message: "Keine Berechtigung" });
    }

    // Wenn isDefault auf true gesetzt, andere Defaults im gleichen Scope zurücksetzen
    if (data.isDefault === true) {
      await prisma.letterhead.updateMany({
        where: {
          tenantId: check.tenantId!,
          fundId: letterhead.fundId,
          parkId: letterhead.parkId,
          isDefault: true,
          id: { not: id },
        },
        data: { isDefault: false },
      });
    }

    // Handle null values for JSON fields
    const updateData: Prisma.LetterheadUpdateInput = {
      ...data,
      companyInfo: data.companyInfo === null ? Prisma.JsonNull : (data.companyInfo as Prisma.InputJsonValue | undefined),
    };

    const updated = await prisma.letterhead.update({
      where: { id },
      data: updateData,
      include: {
        park: {
          select: { id: true, name: true },
        },
        fund: {
          select: { id: true, name: true, legalForm: true },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, "Fehler beim Aktualisieren des Briefpapiers");
  }
}

// DELETE /api/admin/letterheads/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const letterhead = await prisma.letterhead.findUnique({
      where: { id },
      select: { id: true, tenantId: true },
    });

    if (!letterhead) {
      return apiError("NOT_FOUND", undefined, { message: "Briefpapier nicht gefunden" });
    }

    if (letterhead.tenantId !== check.tenantId!) {
      return apiError("FORBIDDEN", undefined, { message: "Keine Berechtigung" });
    }

    // Soft-delete
    await prisma.letterhead.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ message: "Briefpapier gelöscht" });
  } catch (error) {
    logger.error({ err: error }, "Error deleting letterhead");
    return apiError("DELETE_FAILED", undefined, { message: "Fehler beim Löschen des Briefpapiers" });
  }
}
