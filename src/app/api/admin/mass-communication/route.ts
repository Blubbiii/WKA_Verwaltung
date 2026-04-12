/**
 * Mass Communication API
 *
 * POST /api/admin/mass-communication - Send mass communication
 * GET  /api/admin/mass-communication - List past mass communications
 *
 * Note: massCommunication model requires `prisma generate` after migration.
 * Until then, we use type assertions for Prisma calls.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { prisma, getPrismaModel } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/withPermission";
import { auth } from "@/lib/auth";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { parsePaginationParams } from "@/lib/api-utils";
import { createAuditLog } from "@/lib/audit";
import { sendEmailSync } from "@/lib/email";
import { getFilteredRecipients } from "@/lib/mass-communication/recipient-filter";
import { wrapEmailBody, stripHtml } from "@/lib/mailings/email-wrapper";
import { apiError } from "@/lib/api-errors";

// Type-safe accessor for the MassCommunication model
const massCommunicationModel = getPrismaModel("massCommunication");

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
    if (!enabled) return apiError("NOT_FOUND", undefined, { message: "Communication module is not enabled" });

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = parsePaginationParams(searchParams);

    const tenantId = check.tenantId!;

    const [communications, totalCount] = await Promise.all([
      massCommunicationModel.findMany({
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
      }) as unknown as Promise<MassCommunicationRecord[]>,
      massCommunicationModel.count({
        where: { tenantId },
      }),
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
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Kommunikations-Historie" });
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
    if (!enabledPost) return apiError("NOT_FOUND", undefined, { message: "Communication module is not enabled" });

    const body = await request.json();
    const parsed = sendSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", undefined, { message: "Validierungsfehler", details: parsed.error.format() });
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
        return apiError("BAD_REQUEST", undefined, { message: "Keine E-Mail-Adresse für den aktuellen Benutzer gefunden" });
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
        return apiError("INTERNAL_ERROR", undefined, { message: result.error || "Test-E-Mail konnte nicht gesendet werden" });
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
      return apiError("BAD_REQUEST", undefined, { message: "Keine Empfänger gefunden für die gewaehlten Filter-Kriterien" });
    }

    // Create the mass communication record
    const communication = await massCommunicationModel.create({
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
    }) as unknown as MassCommunicationRecord;

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
    await massCommunicationModel.update({
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

    // Audit log (deferred: runs after response is sent)
    const communicationId = communication.id;
    const recipientCount = recipients.length;
    after(async () => {
      await createAuditLog({
        action: "CREATE",
        entityType: "MassCommunication",
        entityId: communicationId,
        newValues: {
          subject,
          recipientFilter,
          recipientCount,
          sentCount,
          errorCount,
        },
        description: `Massen-Kommunikation "${subject}" an ${recipientCount} Empfänger gesendet`,
      });
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
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Senden der Massen-Kommunikation" });
  }
}

// Helper functions moved to src/lib/mailings/email-wrapper.ts
