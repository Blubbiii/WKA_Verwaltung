/**
 * Mailing Send API
 *
 * POST /api/mailings/[id]/send — Send a mailing to all recipients
 *
 * Resolves placeholders per shareholder, creates MailingRecipient records,
 * and sends emails via sendEmailSync.
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

    // Get shareholders for the selected fund (or all if no fund selected)
    const shareholders = await prisma.shareholder.findMany({
      where: {
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

    if (shareholders.length === 0) {
      return NextResponse.json(
        { error: "Keine Gesellschafter mit E-Mail-Adresse gefunden" },
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

    // Create recipient records and send emails
    let sentCount = 0;
    let failedCount = 0;

    for (const sh of shareholders) {
      const email = sh.person.email!;
      const name = sh.person.firstName && sh.person.lastName
        ? `${sh.person.firstName} ${sh.person.lastName}`
        : sh.person.companyName ?? email;

      // Resolve placeholders
      const variables = resolveShareholderPlaceholders(sh, sh.fund);
      const resolvedSubject = applyPlaceholders(mailing.template.subject, variables);
      const resolvedHtml = applyPlaceholders(mailing.template.bodyHtml, variables);
      const resolvedText = mailing.template.bodyText
        ? applyPlaceholders(mailing.template.bodyText, variables)
        : undefined;

      // Create recipient record
      const recipient = await prisma.mailingRecipient.create({
        data: {
          mailingId: id,
          shareholderId: sh.id,
          email,
          name,
          variables,
          status: "PENDING",
        },
      });

      // Send email
      try {
        const result = await sendEmailSync({
          to: email,
          subject: resolvedSubject,
          html: resolvedHtml,
          text: resolvedText,
          tenantId: check.tenantId!,
        });

        if (result.success) {
          sentCount++;
          await prisma.mailingRecipient.update({
            where: { id: recipient.id },
            data: { status: "SENT", sentAt: new Date() },
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

    // Update final mailing status
    const finalStatus = failedCount === 0
      ? "SENT"
      : sentCount === 0
        ? "PARTIALLY_FAILED"
        : "PARTIALLY_FAILED";

    await prisma.mailing.update({
      where: { id },
      data: {
        status: finalStatus,
        sentCount,
        failedCount,
        sentAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      sentCount,
      failedCount,
      totalRecipients: shareholders.length,
    });
  } catch (error) {
    logger.error({ err: error }, "[Mailing Send] Failed");

    // Try to mark mailing as failed
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
