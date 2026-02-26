/**
 * Mailing Templates API
 *
 * GET  /api/mailings/templates — List all mailing templates
 * POST /api/mailings/templates — Create a new mailing template
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(["GV_EINLADUNG", "QUARTALSBERICHT", "JAHRESABSCHLUSS", "MAHNUNG", "INFORMATION", "CUSTOM"]),
  subject: z.string().min(1).max(500),
  bodyHtml: z.string().min(1),
  bodyText: z.string().nullable().optional(),
  variables: z.array(z.object({
    key: z.string(),
    label: z.string(),
    example: z.string(),
  })).optional(),
  isDefault: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const check = await requireAuth();
  if (!check.authorized) return check.error!;

  const enabled = await getConfigBoolean("communication.enabled", check.tenantId, false);
  if (!enabled) return NextResponse.json({ error: "Communication module is not enabled" }, { status: 404 });

  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");

    const templates = await prisma.mailingTemplate.findMany({
      where: {
        tenantId: check.tenantId!,
        ...(category ? { category: category as never } : {}),
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ templates });
  } catch (error) {
    logger.error({ err: error }, "[MailingTemplates] GET failed");
    return NextResponse.json({ error: "Fehler beim Laden der Vorlagen" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const check = await requireAuth();
  if (!check.authorized) return check.error!;

  const enabledPost = await getConfigBoolean("communication.enabled", check.tenantId, false);
  if (!enabledPost) return NextResponse.json({ error: "Communication module is not enabled" }, { status: 404 });

  try {
    const body = await req.json();
    const data = createSchema.parse(body);

    const template = await prisma.mailingTemplate.create({
      data: {
        tenantId: check.tenantId!,
        name: data.name,
        category: data.category,
        subject: data.subject,
        bodyHtml: data.bodyHtml,
        bodyText: data.bodyText ?? null,
        variables: data.variables ?? [],
        isDefault: data.isDefault ?? false,
      },
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Ungültige Eingabe", details: error.errors }, { status: 400 });
    }
    logger.error({ err: error }, "[MailingTemplates] POST failed");
    return NextResponse.json({ error: "Fehler beim Erstellen der Vorlage" }, { status: 500 });
  }
}
