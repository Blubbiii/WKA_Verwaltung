import { NextRequest, NextResponse, after } from "next/server";
import { apiError } from "@/lib/api-errors";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { createAuditLog } from "@/lib/audit";

const batchEmailSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
  recipientIds: z.array(z.uuid()).min(1).max(500),
});

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("admin:manage");
    if (!check.authorized) return check.error;

    const reqBody = await request.json();
    const parsed = batchEmailSchema.safeParse(reqBody);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültige Anfrage", details: parsed.error.flatten() });
    }

    const { subject, body, recipientIds } = parsed.data;

    // Verify recipients exist and belong to tenant
    const users = await prisma.user.findMany({
      where: { id: { in: recipientIds }, tenantId: check.tenantId },
      select: { id: true, email: true },
    });

    const foundIds = new Set(users.map((u) => u.id));
    const missingIds = recipientIds.filter((id) => !foundIds.has(id));

    if (missingIds.length > 0) {
      return apiError("NOT_FOUND", 404, { message: `${missingIds.length} Empfänger nicht gefunden` });
    }

    // Queue emails (use notification system as fallback if BullMQ not available)
    const emailResults = {
      queued: 0,
      failed: 0,
      recipients: [] as string[],
    };

    try {
      // Batch-create notifications (1 query instead of N)
      const result = await prisma.notification.createMany({
        data: users.map((user) => ({
          type: "SYSTEM" as const,
          title: subject,
          message: body,
          userId: user.id,
          tenantId: check.tenantId!,
        })),
      });
      emailResults.queued = result.count;
      emailResults.recipients = users.map((u) => u.email);
    } catch {
      emailResults.failed = users.length;
    }

    // Audit log (deferred: runs after response is sent)
    const recipientCount = users.length;
    const queuedCount = emailResults.queued;
    after(async () => {
      await createAuditLog({
        action: "CREATE",
        entityType: "MassCommunication",
        entityId: "batch",
        newValues: {
          subject,
          recipientCount,
          queued: queuedCount,
        },
        description: `Batch-E-Mail an ${recipientCount} Empfänger`,
      });
    });

    return NextResponse.json({
      message: `${emailResults.queued} E-Mails in Warteschlange`,
      queued: emailResults.queued,
      failed: emailResults.failed,
      totalRecipients: users.length,
    });
  } catch (error) {
    return apiError("INTERNAL_ERROR", 500, { message: error instanceof Error ? error.message : "Interner Serverfehler" });
  }
}
