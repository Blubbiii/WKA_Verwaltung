/**
 * Single Mailing Template API
 *
 * GET    /api/mailings/templates/[id] — Get template by ID
 * PUT    /api/mailings/templates/[id] — Update template
 * DELETE /api/mailings/templates/[id] — Delete template
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z.enum(["GV_EINLADUNG", "QUARTALSBERICHT", "JAHRESABSCHLUSS", "MAHNUNG", "INFORMATION", "CUSTOM"]).optional(),
  subject: z.string().min(1).max(500).optional(),
  bodyHtml: z.string().min(1).optional(),
  bodyText: z.string().nullable().optional(),
  variables: z.array(z.object({
    key: z.string(),
    label: z.string(),
    example: z.string(),
  })).optional(),
  isDefault: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const check = await requireAuth();
  if (!check.authorized) return check.error!;
  const { id } = await context.params;

  try {
    const template = await prisma.mailingTemplate.findFirst({
      where: { id, tenantId: check.tenantId! },
    });

    if (!template) {
      return apiError("NOT_FOUND", 404, { message: "Vorlage nicht gefunden" });
    }

    return NextResponse.json({ template });
  } catch (error) {
    logger.error({ err: error }, "[MailingTemplate] GET failed");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden" });
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  const check = await requireAuth();
  if (!check.authorized) return check.error!;
  const { id } = await context.params;

  try {
    const body = await req.json();
    const data = updateSchema.parse(body);

    // Verify ownership
    const existing = await prisma.mailingTemplate.findFirst({
      where: { id, tenantId: check.tenantId! },
    });
    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Vorlage nicht gefunden" });
    }

    const template = await prisma.mailingTemplate.update({
      where: { id, tenantId: check.tenantId! },
      data,
    });

    return NextResponse.json({ template });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültige Eingabe", details: error.issues });
    }
    logger.error({ err: error }, "[MailingTemplate] PUT failed");
    return apiError("UPDATE_FAILED", 500, { message: "Fehler beim Aktualisieren" });
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const check = await requireAuth();
  if (!check.authorized) return check.error!;
  const { id } = await context.params;

  try {
    const existing = await prisma.mailingTemplate.findFirst({
      where: { id, tenantId: check.tenantId! },
    });
    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Vorlage nicht gefunden" });
    }

    await prisma.mailingTemplate.delete({ where: { id, tenantId: check.tenantId! } });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "[MailingTemplate] DELETE failed");
    return apiError("DELETE_FAILED", 500, { message: "Fehler beim Löschen" });
  }
}
