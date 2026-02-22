import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { createDefaultLayout } from "@/lib/invoice-templates/default-template";
import { apiLogger as logger } from "@/lib/logger";

const createTemplateSchema = z.object({
  name: z.string().min(1, "Name erforderlich"),
  layout: z.object({}).passthrough().optional(),
  headerHtml: z.string().optional().nullable(),
  footerHtml: z.string().optional().nullable(),
  styles: z.record(z.unknown()).optional().nullable(),
  variables: z.record(z.unknown()).optional().nullable(),
  isDefault: z.boolean().default(false),
});

// GET /api/admin/invoice-templates - List all invoice templates
export async function GET() {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error;

    const templates = await prisma.invoiceTemplate.findMany({
      where: {
        tenantId: check.tenantId!,
      },
      orderBy: [
        { isDefault: "desc" },
        { name: "asc" },
      ],
    });

    return NextResponse.json(templates);
  } catch (error) {
    logger.error({ err: error }, "Error fetching invoice templates");
    return NextResponse.json(
      { error: "Fehler beim Laden der Rechnungsvorlagen" },
      { status: 500 }
    );
  }
}

// POST /api/admin/invoice-templates - Create new template
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const data = createTemplateSchema.parse(body);

    // If isDefault, unset other defaults for this tenant
    if (data.isDefault) {
      await prisma.invoiceTemplate.updateMany({
        where: {
          tenantId: check.tenantId!,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    // Merge provided layout with defaults
    const defaultLayout = createDefaultLayout();
    const layout = data.layout
      ? { ...defaultLayout, ...data.layout }
      : defaultLayout;

    const template = await prisma.invoiceTemplate.create({
      data: {
        name: data.name,
        layout,
        headerHtml: data.headerHtml || null,
        footerHtml: data.footerHtml || null,
        styles: (data.styles as Record<string, string>) || undefined,
        variables: (data.variables as Record<string, string>) || undefined,
        isDefault: data.isDefault,
        tenantId: check.tenantId!,
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error creating invoice template");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Rechnungsvorlage" },
      { status: 500 }
    );
  }
}
