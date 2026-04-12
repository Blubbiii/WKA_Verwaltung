import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-utils";
import { apiError } from "@/lib/api-errors";

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  layout: z.object({}).passthrough().optional(),
  headerHtml: z.string().optional().nullable(),
  footerHtml: z.string().optional().nullable(),
  styles: z.record(z.string(), z.unknown()).optional().nullable(),
  variables: z.record(z.string(), z.unknown()).optional().nullable(),
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
      return apiError("NOT_FOUND", undefined, { message: "Rechnungsvorlage nicht gefunden" });
    }

    return NextResponse.json(template);
  } catch (error) {
    logger.error({ err: error }, "Error fetching invoice template");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Rechnungsvorlage" });
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
      return apiError("NOT_FOUND", undefined, { message: "Rechnungsvorlage nicht gefunden" });
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
    return handleApiError(error, "Fehler beim Aktualisieren der Rechnungsvorlage");
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
      return apiError("NOT_FOUND", undefined, { message: "Rechnungsvorlage nicht gefunden" });
    }

    // Prevent deleting the default template
    if (existing.isDefault) {
      return apiError("OPERATION_NOT_ALLOWED", 400, { message: "Die Standard-Vorlage kann nicht gelöscht werden. Setzen Sie zuerst eine andere Vorlage als Standard." });
    }

    await prisma.invoiceTemplate.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting invoice template");
    return apiError("DELETE_FAILED", undefined, { message: "Fehler beim Löschen der Rechnungsvorlage" });
  }
}
