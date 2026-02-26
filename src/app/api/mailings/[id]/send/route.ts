/**
 * Mailing Send API
 *
 * POST /api/mailings/[id]/send — Send a mailing to all recipients
 *
 * Supports both TEMPLATE (with placeholder resolution) and FREEFORM content.
 * Respects Person.preferredDeliveryMethod to route email vs post delivery.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { sendEmailSync } from "@/lib/email";
import {
  resolveShareholderPlaceholders,
  applyPlaceholders,
} from "@/lib/mailings/placeholder-service";
import { wrapEmailBody, stripHtml } from "@/lib/mailings/email-wrapper";
import { getFilteredRecipients } from "@/lib/mass-communication/recipient-filter";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, context: RouteContext) {
  const check = await requireAuth();
  if (!check.authorized) return check.error!;
  const { id } = await context.params;

  try {
    // Load mailing with template
    const mailing = await prisma.mailing.findFirst({
      where: { id, tenantId: check.tenantId! },
      include: {
        template: true,
        fund: { select: { id: true, name: true } },
      },
    });

    if (!mailing) {
      return NextResponse.json({ error: "Mailing nicht gefunden" }, { status: 404 });
    }

    if (mailing.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Nur Entwürfe können gesendet werden" },
        { status: 400 }
      );
    }

    const isTemplate = mailing.contentSource === "TEMPLATE" && mailing.template;
    const isFreeform = mailing.contentSource === "FREEFORM";

    if (!isTemplate && !isFreeform) {
      return NextResponse.json(
        { error: "Mailing hat keinen gültigen Inhalt" },
        { status: 400 }
      );
    }

    // Get tenant name for email wrapper
    const tenant = await prisma.tenant.findUnique({
      where: { id: check.tenantId! },
      select: { name: true },
    });
    const tenantName = tenant?.name ?? "WindparkManager";

    // Determine recipients based on filter or legacy fundId
    const recipientFilter = mailing.recipientFilter as { type: string; fundIds?: string[]; parkIds?: string[] } | null;

    let shareholders;
    if (recipientFilter) {
      // New unified filter path
      shareholders = await getShareholdersWithDeliveryInfo(
        check.tenantId!,
        recipientFilter.type,
        recipientFilter.fundIds,
        recipientFilter.parkIds,
      );
    } else {
      // Legacy path: filter by fundId
      shareholders = await getShareholdersWithDeliveryInfo(
        check.tenantId!,
        mailing.fundId ? "BY_FUND" : "ALL",
        mailing.fundId ? [mailing.fundId] : undefined,
      );
    }

    if (shareholders.length === 0) {
      return NextResponse.json(
        { error: "Keine Empfänger gefunden" },
        { status: 400 }
      );
    }

    // Update mailing status to SENDING
    await prisma.mailing.update({
      where: { id },
      data: {
        status: "SENDING",
        recipientCount: shareholders.length,
      },
    });

    let sentCount = 0;
    let failedCount = 0;
    let postCount = 0;

    for (const sh of shareholders) {
      const name = sh.person.firstName && sh.person.lastName
        ? `${sh.person.firstName} ${sh.person.lastName}`
        : sh.person.companyName ?? sh.person.email ?? "Unbekannt";

      const deliveryMethod = sh.person.preferredDeliveryMethod ?? "EMAIL";

      // Resolve content
      let resolvedSubject: string;
      let resolvedHtml: string;
      let resolvedText: string | undefined;

      if (isTemplate && mailing.template) {
        const variables = resolveShareholderPlaceholders(sh, sh.fund);
        resolvedSubject = applyPlaceholders(mailing.template.subject, variables);
        resolvedHtml = applyPlaceholders(mailing.template.bodyHtml, variables);
        resolvedText = mailing.template.bodyText
          ? applyPlaceholders(mailing.template.bodyText, variables)
          : undefined;
      } else {
        // Freeform content
        resolvedSubject = mailing.subject!;
        resolvedHtml = wrapEmailBody(mailing.bodyHtml!, tenantName, false);
        resolvedText = stripHtml(mailing.bodyHtml!);
      }

      // Create recipient record
      const recipient = await prisma.mailingRecipient.create({
        data: {
          mailingId: id,
          shareholderId: sh.id,
          email: sh.person.email ?? null,
          name,
          deliveryMethod,
          variables: isTemplate ? resolveShareholderPlaceholders(sh, sh.fund) : {},
          status: deliveryMethod === "POST" ? "PENDING_POST" : "PENDING",
          // Copy address for post delivery
          ...(deliveryMethod !== "EMAIL" ? {
            street: sh.person.street ?? null,
            postalCode: sh.person.postalCode ?? null,
            city: sh.person.city ?? null,
            country: sh.person.country ?? null,
          } : {}),
        },
      });

      // Send email for EMAIL and BOTH delivery methods
      if (deliveryMethod !== "POST" && sh.person.email) {
        try {
          const result = await sendEmailSync({
            to: sh.person.email,
            subject: resolvedSubject,
            html: resolvedHtml,
            text: resolvedText,
            tenantId: check.tenantId!,
          });

          if (result.success) {
            sentCount++;
            await prisma.mailingRecipient.update({
              where: { id: recipient.id },
              data: { status: deliveryMethod === "BOTH" ? "SENT_EMAIL" : "SENT", sentAt: new Date() },
            });
          } else {
            failedCount++;
            await prisma.mailingRecipient.update({
              where: { id: recipient.id },
              data: { status: "FAILED", error: result.error ?? "Unknown error" },
            });
          }
        } catch (sendError) {
          failedCount++;
          await prisma.mailingRecipient.update({
            where: { id: recipient.id },
            data: {
              status: "FAILED",
              error: sendError instanceof Error ? sendError.message : "Unknown error",
            },
          });
        }
      }

      // Count post recipients
      if (deliveryMethod === "POST" || deliveryMethod === "BOTH") {
        postCount++;
      }
    }

    // Final mailing status
    const finalStatus = failedCount === 0 ? "SENT" : "PARTIALLY_FAILED";

    await prisma.mailing.update({
      where: { id },
      data: {
        status: finalStatus,
        sentCount,
        failedCount,
        postCount,
        sentAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      sentCount,
      failedCount,
      postCount,
      totalRecipients: shareholders.length,
    });
  } catch (error) {
    logger.error({ err: error }, "[Mailing Send] Failed");

    try {
      await prisma.mailing.update({
        where: { id },
        data: { status: "PARTIALLY_FAILED" },
      });
    } catch {
      // Ignore
    }

    return NextResponse.json({ error: "Fehler beim Versand" }, { status: 500 });
  }
}

// =============================================================================
// Helper: Get shareholders with person delivery info
// =============================================================================

async function getShareholdersWithDeliveryInfo(
  tenantId: string,
  filterType: string,
  fundIds?: string[],
  parkIds?: string[],
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baseWhere: any = {
    fund: { tenantId },
    status: "ACTIVE",
    // Include shareholders with email OR with address (for post delivery)
    person: {
      OR: [
        { email: { not: null } },
        { street: { not: null }, city: { not: null } },
      ],
    },
  };

  switch (filterType) {
    case "BY_FUND":
      if (fundIds && fundIds.length > 0) {
        baseWhere.fundId = { in: fundIds };
      }
      break;
    case "BY_PARK":
      if (parkIds && parkIds.length > 0) {
        baseWhere.fund = {
          ...baseWhere.fund,
          fundParks: { some: { parkId: { in: parkIds } } },
        };
      }
      break;
    case "BY_ROLE":
      // Already has status: "ACTIVE"
      break;
    case "ACTIVE_ONLY":
      baseWhere.exitDate = null;
      break;
    // "ALL" - no additional filters
  }

  return prisma.shareholder.findMany({
    where: baseWhere,
    include: {
      person: {
        select: {
          salutation: true,
          firstName: true,
          lastName: true,
          companyName: true,
          email: true,
          street: true,
          houseNumber: true,
          postalCode: true,
          city: true,
          country: true,
          preferredDeliveryMethod: true,
        },
      },
      fund: { select: { name: true } },
    },
  });
}
