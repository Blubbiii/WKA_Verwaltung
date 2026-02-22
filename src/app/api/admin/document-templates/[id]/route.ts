import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  layout: z.object({}).passthrough().optional(),
  customCss: z.string().optional().nullable(),
  footerText: z.string().optional().nullable(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

// GET /api/admin/document-templates/[id] - Einzelne Vorlage
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const template = await prisma.documentTemplate.findUnique({
      where: { id },
      include: {
        park: {
          select: { id: true, name: true },
        },
      },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Vorlage nicht gefunden" },
        { status: 404 }
      );
    }

    if (template.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    return NextResponse.json(template);
  } catch (error) {
    logger.error({ err: error }, "Error fetching document template");
    return NextResponse.json(
      { error: "Fehler beim Laden der Vorlage" },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/document-templates/[id] - Vorlage aktualisieren
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();
    const data = updateTemplateSchema.parse(body);

    const template = await prisma.documentTemplate.findUnique({
      where: { id },
      select: { id: true, tenantId: true, documentType: true, parkId: true },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Vorlage nicht gefunden" },
        { status: 404 }
      );
    }

    if (template.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    // Wenn isDefault auf true gesetzt, andere Defaults zuruecksetzen
    if (data.isDefault === true) {
      await prisma.documentTemplate.updateMany({
        where: {
          tenantId: check.tenantId!,
          documentType: template.documentType,
          parkId: template.parkId,
          isDefault: true,
          id: { not: id },
        },
        data: { isDefault: false },
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any


    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.layout !== undefined) updateData.layout = data.layout;
    if (data.customCss !== undefined) updateData.customCss = data.customCss;
    if (data.footerText !== undefined) updateData.footerText = data.footerText;
    if (data.isDefault !== undefined) updateData.isDefault = data.isDefault;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const updated = await prisma.documentTemplate.update({
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
    logger.error({ err: error }, "Error updating document template");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der Vorlage" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/document-templates/[id] - Vorlage loeschen
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const template = await prisma.documentTemplate.findUnique({
      where: { id },
      select: { id: true, tenantId: true },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Vorlage nicht gefunden" },
        { status: 404 }
      );
    }

    if (template.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    // Soft-delete: nur isActive auf false setzen
    await prisma.documentTemplate.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ message: "Vorlage geloescht" });
  } catch (error) {
    logger.error({ err: error }, "Error deleting document template");
    return NextResponse.json(
      { error: "Fehler beim Loeschen der Vorlage" },
      { status: 500 }
    );
  }
}
