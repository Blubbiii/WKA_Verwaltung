/**
 * Mass Communication API
 *
 * POST /api/admin/mass-communication - Send mass communication
 * GET  /api/admin/mass-communication - List past mass communications
 *
 * Note: massCommunication model requires `prisma generate` after migration.
 * Until then, we use type assertions for Prisma calls.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/withPermission";
import { auth } from "@/lib/auth";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import { sendEmailSync } from "@/lib/email";
import { getFilteredRecipients } from "@/lib/mass-communication/recipient-filter";

// Type assertion for Prisma client with new MassCommunication model
// Will be properly typed after running `prisma generate`
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// =============================================================================
// Types (will be auto-generated after prisma generate)
// =============================================================================

interface MassCommunicationRecord {
  id: string;
  subject: string;
  body: string;
  recipientFilter: string;
  recipientCount: number;
  status: string;
  sentAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  tenantId: string;
  createdById: string;
  createdBy: {
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
}

// =============================================================================
// Validation
// =============================================================================

const sendSchema = z.object({
  subject: z.string().min(1, "Betreff ist erforderlich").max(200),
  body: z.string().min(1, "Nachricht ist erforderlich"),
  recipientFilter: z.enum(["ALL", "BY_FUND", "BY_PARK", "BY_ROLE", "ACTIVE_ONLY"]),
  fundIds: z.array(z.string()).optional(),
  parkIds: z.array(z.string()).optional(),
  sendTest: z.boolean().optional().default(false),
});

// =============================================================================
// GET /api/admin/mass-communication - List past mass communications
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const enabled = await getConfigBoolean("communication.enabled", check.tenantId, false);
    if (!enabled) return NextResponse.json({ error: "Communication module is not enabled" }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const skip = (page - 1) * limit;

    const tenantId = check.tenantId!;

    const [communications, totalCount] = await Promise.all([
      db.massCommunication.findMany({
        where: { tenantId },
        include: {
          createdBy: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }) as Promise<MassCommunicationRecord[]>,
      db.massCommunication.count({
        where: { tenantId },
      }) as Promise<number>,
    ]);

    return NextResponse.json({
      communications: communications.map((c: MassCommunicationRecord) => ({
        id: c.id,
        subject: c.subject,
        recipientFilter: c.recipientFilter,
        recipientCount: c.recipientCount,
        status: c.status,
        sentAt: c.sentAt,
        createdAt: c.createdAt,
        createdBy: c.createdBy.firstName && c.createdBy.lastName
          ? `${c.createdBy.firstName} ${c.createdBy.lastName}`
          : c.createdBy.email,
      })),
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (error) {
    logger.error({ err: error }, "[Mass Communication] GET Error");
    return NextResponse.json(
      { error: "Fehler beim Laden der Kommunikations-Historie" },
      { status: 500 }
    );
  }
}

// =============================================================================
// POST /api/admin/mass-communication - Send mass communication
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const enabledPost = await getConfigBoolean("communication.enabled", check.tenantId, false);
    if (!enabledPost) return NextResponse.json({ error: "Communication module is not enabled" }, { status: 404 });

    const body = await request.json();
    const parsed = sendSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { subject, body: emailBody, recipientFilter, fundIds, parkIds, sendTest } = parsed.data;
    const tenantId = check.tenantId!;
    const userId = check.userId!;

    // Get tenant info for email sender
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    const tenantName = tenant?.name || "WindparkManager";

    // Test mode: send only to current user
    if (sendTest) {
      const session = await auth();
      const userEmail = session?.user?.email;

      if (!userEmail) {
        return NextResponse.json(
          { error: "Keine E-Mail-Adresse für den aktuellen Benutzer gefunden" },
          { status: 400 }
        );
      }

      const result = await sendEmailSync({
        to: userEmail,
        subject: `[TEST] ${subject}`,
        html: wrapEmailBody(emailBody, tenantName, true),
        text: stripHtml(emailBody),
        tenantId,
      });

      if (result.success) {
        return NextResponse.json({
          recipientCount: 1,
          status: "sent",
          message: `Test-E-Mail wurde an ${userEmail} gesendet.`,
        });
      } else {
        return NextResponse.json(
          { error: result.error || "Test-E-Mail konnte nicht gesendet werden" },
          { status: 500 }
        );
      }
    }

    // Production mode: send to all filtered recipients
    const recipients = await getFilteredRecipients(
      tenantId,
      recipientFilter,
      fundIds,
      parkIds
    );

    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "Keine Empfänger gefunden für die gewaehlten Filter-Kriterien" },
        { status: 400 }
      );
    }

    // Create the mass communication record
    const communication = await db.massCommunication.create({
      data: {
        subject,
        body: emailBody,
        recipientFilter: JSON.stringify({
          type: recipientFilter,
          fundIds: fundIds || [],
          parkIds: parkIds || [],
        }),
        recipientCount: recipients.length,
        status: "SENDING",
        tenantId,
        createdById: userId,
      },
    }) as MassCommunicationRecord;

    // Send emails to all recipients
    // Using direct send since mass communication is custom HTML, not a template
    let sentCount = 0;
    let errorCount = 0;

    for (const recipient of recipients) {
      try {
        await sendEmailSync({
          to: recipient.email,
          subject,
          html: wrapEmailBody(emailBody, tenantName, false),
          text: stripHtml(emailBody),
          tenantId,
        });
        sentCount++;
      } catch (error) {
        logger.error(
          { err: error, recipientEmail: recipient.email },
          "[Mass Communication] Failed to send to recipient"
        );
        errorCount++;
      }
    }

    // Update communication status
    const finalStatus = errorCount === recipients.length ? "FAILED" : "SENT";
    await db.massCommunication.update({
      where: { id: communication.id },
      data: {
        status: finalStatus,
        sentAt: new Date(),
        errorMessage:
          errorCount > 0
            ? `${errorCount} von ${recipients.length} E-Mails fehlgeschlagen`
            : null,
      },
    });

    // Audit log
    await createAuditLog({
      action: "CREATE",
      entityType: "MassCommunication",
      entityId: communication.id,
      newValues: {
        subject,
        recipientFilter,
        recipientCount: recipients.length,
        sentCount,
        errorCount,
      },
      description: `Massen-Kommunikation "${subject}" an ${recipients.length} Empfänger gesendet`,
    });

    return NextResponse.json({
      id: communication.id,
      recipientCount: recipients.length,
      sentCount,
      errorCount,
      status: finalStatus.toLowerCase(),
      message:
        errorCount > 0
          ? `${sentCount} von ${recipients.length} E-Mails erfolgreich gesendet. ${errorCount} fehlgeschlagen.`
          : `${sentCount} E-Mails erfolgreich gesendet.`,
    });
  } catch (error) {
    logger.error({ err: error }, "[Mass Communication] POST Error");
    return NextResponse.json(
      { error: "Fehler beim Senden der Massen-Kommunikation" },
      { status: 500 }
    );
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Wrap the user-provided HTML body in an email layout
 */
function wrapEmailBody(body: string, tenantName: string, isTest: boolean): string {
  const testBanner = isTest
    ? `<div style="background-color: #f59e0b; color: #000; padding: 12px; text-align: center; font-weight: bold; font-size: 14px;">
        Dies ist eine Test-E-Mail. Sie wird nur an Sie gesendet.
      </div>`
    : "";

  return `
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5;">
      ${testBanner}
      <div style="max-width: 600px; margin: 0 auto; padding: 24px;">
        <div style="background-color: #ffffff; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          ${body}
        </div>
        <div style="text-align: center; padding: 24px 0; color: #71717a; font-size: 12px;">
          <p>Gesendet von ${tenantName}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Strip HTML tags for plain text email version
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<li>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
