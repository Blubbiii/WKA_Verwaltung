/**
 * Mailing Preview API
 *
 * POST /api/mailings/[id]/preview — Preview a mailing with resolved placeholders
 *
 * Returns the rendered subject + body for the first shareholder (or a specified one).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import {
  resolveShareholderPlaceholders,
  applyPlaceholders,
} from "@/lib/mailings/placeholder-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  const check = await requireAuth();
  if (!check.authorized) return check.error!;
  const { id } = await context.params;

  try {
    const body = await req.json().catch(() => ({}));
    const shareholderId = (body as { shareholderId?: string }).shareholderId;

    // Load mailing with template
    const mailing = await prisma.mailing.findFirst({
      where: { id, tenantId: check.tenantId! },
      include: { template: true },
    });

    if (!mailing) {
      return NextResponse.json({ error: "Mailing nicht gefunden" }, { status: 404 });
    }

    // Find a shareholder for preview
    const shareholder = await prisma.shareholder.findFirst({
      where: {
        ...(shareholderId ? { id: shareholderId } : {}),
        fund: { tenantId: check.tenantId! },
        ...(mailing.fundId ? { fundId: mailing.fundId } : {}),
        status: "ACTIVE",
        person: { email: { not: null } },
      },
      include: {
        person: {
          select: {
            salutation: true,
            firstName: true,
            lastName: true,
            companyName: true,
            email: true,
          },
        },
        fund: { select: { name: true } },
      },
    });

    if (!shareholder) {
      return NextResponse.json(
        { error: "Kein Gesellschafter für die Vorschau gefunden" },
        { status: 404 }
      );
    }

    // Resolve placeholders
    const variables = resolveShareholderPlaceholders(shareholder, shareholder.fund);
    const resolvedSubject = applyPlaceholders(mailing.template.subject, variables);
    const resolvedHtml = applyPlaceholders(mailing.template.bodyHtml, variables);

    // Count total recipients
    const recipientCount = await prisma.shareholder.count({
      where: {
        fund: { tenantId: check.tenantId! },
        ...(mailing.fundId ? { fundId: mailing.fundId } : {}),
        status: "ACTIVE",
        person: { email: { not: null } },
      },
    });

    return NextResponse.json({
      preview: {
        subject: resolvedSubject,
        bodyHtml: resolvedHtml,
        recipientName: `${shareholder.person.firstName ?? ""} ${shareholder.person.lastName ?? shareholder.person.companyName ?? ""}`.trim(),
        recipientEmail: shareholder.person.email,
      },
      variables,
      recipientCount,
    });
  } catch (error) {
    logger.error({ err: error }, "[Mailing Preview] Failed");
    return NextResponse.json({ error: "Fehler bei der Vorschau" }, { status: 500 });
  }
}
