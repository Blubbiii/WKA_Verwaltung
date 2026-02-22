import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const updateLetterheadSchema = z.object({
  name: z.string().min(1).optional(),
  headerImageUrl: z.string().url().optional().nullable(),
  headerHeight: z.number().min(0).max(200).optional(),
  logoPosition: z.enum(["top-left", "top-center", "top-right"]).optional(),
  logoWidth: z.number().min(10).max(100).optional(),
  logoMarginTop: z.number().min(0).max(50).optional(),
  logoMarginLeft: z.number().min(0).max(50).optional(),
  senderAddress: z.string().optional().nullable(),
  companyInfo: z.object({}).passthrough().optional().nullable(),
  footerImageUrl: z.string().url().optional().nullable(),
  footerHeight: z.number().min(0).max(100).optional(),
  footerText: z.string().optional().nullable(),
  marginTop: z.number().min(10).max(100).optional(),
  marginBottom: z.number().min(10).max(100).optional(),
  marginLeft: z.number().min(10).max(50).optional(),
  marginRight: z.number().min(10).max(50).optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
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
      },
    });

    if (!letterhead) {
      return NextResponse.json(
        { error: "Briefpapier nicht gefunden" },
        { status: 404 }
      );
    }

    if (letterhead.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    return NextResponse.json(letterhead);
  } catch (error) {
    logger.error({ err: error }, "Error fetching letterhead");
    return NextResponse.json(
      { error: "Fehler beim Laden des Briefpapiers" },
      { status: 500 }
    );
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
      select: { id: true, tenantId: true, parkId: true },
    });

    if (!letterhead) {
      return NextResponse.json(
        { error: "Briefpapier nicht gefunden" },
        { status: 404 }
      );
    }

    if (letterhead.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    // Wenn isDefault auf true gesetzt, andere Defaults zuruecksetzen
    if (data.isDefault === true) {
      await prisma.letterhead.updateMany({
        where: {
          tenantId: check.tenantId!,
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
      companyInfo: data.companyInfo === null ? Prisma.JsonNull : data.companyInfo,
    };

    const updated = await prisma.letterhead.update({
      where: { id },
      data: updateData,
      include: {
        park: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error updating letterhead");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren des Briefpapiers" },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: "Briefpapier nicht gefunden" },
        { status: 404 }
      );
    }

    if (letterhead.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    // Soft-delete
    await prisma.letterhead.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ message: "Briefpapier geloescht" });
  } catch (error) {
    logger.error({ err: error }, "Error deleting letterhead");
    return NextResponse.json(
      { error: "Fehler beim Loeschen des Briefpapiers" },
      { status: 500 }
    );
  }
}
