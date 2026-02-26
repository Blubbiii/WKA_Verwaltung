/**
 * Mailing Preview API
 *
 * POST /api/mailings/[id]/preview — Preview a mailing with resolved placeholders
 *
 * Supports both TEMPLATE and FREEFORM content sources.
 * Returns rendered preview + recipient count breakdown by delivery method.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import {
  resolveShareholderPlaceholders,
  applyPlaceholders,
} from "@/lib/mailings/placeholder-service";
import { wrapEmailBody } from "@/lib/mailings/email-wrapper";

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

    const isTemplate = mailing.contentSource === "TEMPLATE" && mailing.template;

    // Build recipient filter
    const recipientFilter = mailing.recipientFilter as { type: string; fundIds?: string[]; parkIds?: string[] } | null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recipientWhere: any = {
      fund: { tenantId: check.tenantId! },
      status: "ACTIVE",
      OR: [
        { person: { email: { not: null } } },
        { person: { street: { not: null }, city: { not: null } } },
      ],
    };

    if (recipientFilter) {
      switch (recipientFilter.type) {
        case "BY_FUND":
          if (recipientFilter.fundIds?.length) {
            recipientWhere.fundId = { in: recipientFilter.fundIds };
          }
          break;
        case "BY_PARK":
          if (recipientFilter.parkIds?.length) {
            recipientWhere.fund = {
              ...recipientWhere.fund,
              fundParks: { some: { parkId: { in: recipientFilter.parkIds } } },
            };
          }
          break;
        case "BY_ROLE":
          break;
        case "ACTIVE_ONLY":
          recipientWhere.exitDate = null;
          break;
      }
    } else if (mailing.fundId) {
      recipientWhere.fundId = mailing.fundId;
    }

    // Find a shareholder for preview
    const shareholder = await prisma.shareholder.findFirst({
      where: {
        ...(shareholderId ? { id: shareholderId } : {}),
        ...recipientWhere,
      },
      include: {
        person: {
          select: {
            salutation: true,
            firstName: true,
            lastName: true,
            companyName: true,
            email: true,
            preferredDeliveryMethod: true,
          },
        },
        fund: { select: { name: true } },
      },
    });

    if (!shareholder) {
      return NextResponse.json(
        { error: "Kein Empfänger für die Vorschau gefunden" },
        { status: 404 }
      );
    }

    // Get tenant name for email wrapper
    const tenant = await prisma.tenant.findUnique({
      where: { id: check.tenantId! },
      select: { name: true },
    });
    const tenantName = tenant?.name ?? "WindparkManager";

    // Resolve content
    let resolvedSubject: string;
    let resolvedHtml: string;

    if (isTemplate && mailing.template) {
      const variables = resolveShareholderPlaceholders(shareholder, shareholder.fund);
      resolvedSubject = applyPlaceholders(mailing.template.subject, variables);
      resolvedHtml = applyPlaceholders(mailing.template.bodyHtml, variables);
    } else {
      resolvedSubject = mailing.subject ?? "";
      resolvedHtml = wrapEmailBody(mailing.bodyHtml ?? "", tenantName, false);
    }

    // Count total recipients + delivery method breakdown
    const allRecipients = await prisma.shareholder.findMany({
      where: recipientWhere,
      select: {
        person: {
          select: { preferredDeliveryMethod: true },
        },
      },
    });

    let emailCount = 0;
    let postCount = 0;
    for (const r of allRecipients) {
      const method = r.person.preferredDeliveryMethod ?? "EMAIL";
      if (method === "EMAIL") emailCount++;
      else if (method === "POST") postCount++;
      else { emailCount++; postCount++; } // BOTH
    }

    return NextResponse.json({
      preview: {
        subject: resolvedSubject,
        bodyHtml: resolvedHtml,
        recipientName: `${shareholder.person.firstName ?? ""} ${shareholder.person.lastName ?? shareholder.person.companyName ?? ""}`.trim(),
        recipientEmail: shareholder.person.email,
      },
      recipientCount: allRecipients.length,
      deliveryBreakdown: {
        email: emailCount,
        post: postCount,
        total: allRecipients.length,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[Mailing Preview] Failed");
    return NextResponse.json({ error: "Fehler bei der Vorschau" }, { status: 500 });
  }
}
