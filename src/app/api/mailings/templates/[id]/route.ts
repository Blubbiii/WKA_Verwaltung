/**
 * Single Mailing Template API
 *
 * GET    /api/mailings/templates/[id] — Get template by ID
 * PUT    /api/mailings/templates/[id] — Update template
 * DELETE /api/mailings/templates/[id] — Delete template
 */

import { NextRequest, NextResponse } from "next/server";
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
      return NextResponse.json({ error: "Vorlage nicht gefunden" }, { status: 404 });
    }

    return NextResponse.json({ template });
  } catch (error) {
    logger.error({ err: error }, "[MailingTemplate] GET failed");
    return NextResponse.json({ error: "Fehler beim Laden" }, { status: 500 });
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
      return NextResponse.json({ error: "Vorlage nicht gefunden" }, { status: 404 });
    }

    const template = await prisma.mailingTemplate.update({
      where: { id },
      data,
    });

    return NextResponse.json({ template });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Ungültige Eingabe", details: error.errors }, { status: 400 });
    }
    logger.error({ err: error }, "[MailingTemplate] PUT failed");
    return NextResponse.json({ error: "Fehler beim Aktualisieren" }, { status: 500 });
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
      return NextResponse.json({ error: "Vorlage nicht gefunden" }, { status: 404 });
    }

    await prisma.mailingTemplate.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "[MailingTemplate] DELETE failed");
    return NextResponse.json({ error: "Fehler beim Löschen" }, { status: 500 });
  }
}
