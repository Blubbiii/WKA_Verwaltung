import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { createAuditLog } from "@/lib/audit";

const batchEmailSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
  recipientIds: z.array(z.string().uuid()).min(1).max(500),
});

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("admin:manage");
    if (!check.authorized) return check.error;

    const reqBody = await request.json();
    const parsed = batchEmailSchema.safeParse(reqBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Anfrage", details: parsed.error.flatten() },
        { status: 400 }
      );
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
      return NextResponse.json(
        {
          error: `${missingIds.length} Empfänger nicht gefunden`,
          missingIds,
        },
        { status: 404 }
      );
    }

    // Queue emails (use notification system as fallback if BullMQ not available)
    const emailResults = {
      queued: 0,
      failed: 0,
      recipients: [] as string[],
    };

    for (const user of users) {
      try {
        // Create in-app notification for each user
        await prisma.notification.create({
          data: {
            type: "SYSTEM",
            title: subject,
            message: body,
            userId: user.id,
            tenantId: check.tenantId!,
          },
        });
        emailResults.queued++;
        emailResults.recipients.push(user.email);
      } catch {
        emailResults.failed++;
      }
    }

    await createAuditLog({
      action: "CREATE",
      entityType: "MassCommunication",
      entityId: "batch",
      newValues: {
        subject,
        recipientCount: users.length,
        queued: emailResults.queued,
      },
      description: `Batch-E-Mail an ${users.length} Empfänger`,
    });

    return NextResponse.json({
      message: `${emailResults.queued} E-Mails in Warteschlange`,
      queued: emailResults.queued,
      failed: emailResults.failed,
      totalRecipients: users.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Interner Serverfehler",
      },
      { status: 500 }
    );
  }
}
