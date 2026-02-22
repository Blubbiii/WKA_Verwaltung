import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  layout: z.object({}).passthrough().optional(),
  headerHtml: z.string().optional().nullable(),
  footerHtml: z.string().optional().nullable(),
  styles: z.record(z.unknown()).optional().nullable(),
  variables: z.record(z.unknown()).optional().nullable(),
  isDefault: z.boolean().optional(),
});

// GET /api/admin/invoice-templates/[id] - Get single template
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const template = await prisma.invoiceTemplate.findFirst({
      where: {
        id,
        tenantId: check.tenantId!,
      },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Rechnungsvorlage nicht gefunden" },
        { status: 404 }
      );
    }

    return NextResponse.json(template);
  } catch (error) {
    logger.error({ err: error }, "Error fetching invoice template");
    return NextResponse.json(
      { error: "Fehler beim Laden der Rechnungsvorlage" },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/invoice-templates/[id] - Update template
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

    // Verify template exists and belongs to tenant
    const existing = await prisma.invoiceTemplate.findFirst({
      where: {
        id,
        tenantId: check.tenantId!,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Rechnungsvorlage nicht gefunden" },
        { status: 404 }
      );
    }

    // If setting as default, unset other defaults
    if (data.isDefault) {
      await prisma.invoiceTemplate.updateMany({
        where: {
          tenantId: check.tenantId!,
          isDefault: true,
          NOT: { id },
        },
        data: { isDefault: false },
      });
    }

    const template = await prisma.invoiceTemplate.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.layout !== undefined && { layout: data.layout }),
        ...(data.headerHtml !== undefined && { headerHtml: data.headerHtml }),
        ...(data.footerHtml !== undefined && { footerHtml: data.footerHtml }),
        ...(data.styles !== undefined && { styles: data.styles as Record<string, string> }),
        ...(data.variables !== undefined && { variables: data.variables as Record<string, string> }),
        ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
      },
    });

    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error updating invoice template");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der Rechnungsvorlage" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/invoice-templates/[id] - Delete template
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Verify template exists and belongs to tenant
    const existing = await prisma.invoiceTemplate.findFirst({
      where: {
        id,
        tenantId: check.tenantId!,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Rechnungsvorlage nicht gefunden" },
        { status: 404 }
      );
    }

    // Prevent deleting the default template
    if (existing.isDefault) {
      return NextResponse.json(
        { error: "Die Standard-Vorlage kann nicht geloescht werden. Setzen Sie zuerst eine andere Vorlage als Standard." },
        { status: 400 }
      );
    }

    await prisma.invoiceTemplate.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting invoice template");
    return NextResponse.json(
      { error: "Fehler beim Loeschen der Rechnungsvorlage" },
      { status: 500 }
    );
  }
}
