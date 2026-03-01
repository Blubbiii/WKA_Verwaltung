import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

// ============================================================================
// GET /api/invoices/reminders
// Returns all SENT invoices with a past due date (overdue).
// ============================================================================

export async function GET() {
  try {
    const check = await requirePermission("invoices:read");
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return NextResponse.json({ error: "Mandant nicht gefunden" }, { status: 400 });
    }

    const now = new Date();

    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId: check.tenantId,
        status: "SENT",
        dueDate: { lt: now },
        deletedAt: null,
      },
      select: {
        id: true,
        invoiceNumber: true,
        grossAmount: true,
        dueDate: true,
        reminderLevel: true,
        reminderSentAt: true,
        emailedTo: true,
        fund: { select: { id: true, name: true } },
        shareholder: {
          include: {
            person: { select: { firstName: true, lastName: true, email: true } },
          },
        },
        lease: {
          select: { lessor: { select: { email: true, firstName: true, lastName: true } } },
        },
        park: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: "asc" },
    });

    const result = invoices.map((inv) => {
      const daysOverdue = inv.dueDate
        ? Math.floor((now.getTime() - inv.dueDate.getTime()) / 86_400_000)
        : 0;

      const nextReminderLevel = Math.min((inv.reminderLevel ?? 0) + 1, 3) as 1 | 2 | 3;

      // Resolve recipient name
      const recipientName = inv.shareholder?.person
        ? `${inv.shareholder.person.firstName} ${inv.shareholder.person.lastName}`.trim()
        : inv.lease?.lessor
        ? `${inv.lease.lessor.firstName} ${inv.lease.lessor.lastName}`.trim()
        : null;

      const recipientEmail =
        inv.shareholder?.person?.email ||
        inv.lease?.lessor?.email ||
        inv.emailedTo ||
        null;

      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        grossAmount: inv.grossAmount,
        dueDate: inv.dueDate,
        daysOverdue,
        reminderLevel: inv.reminderLevel,
        reminderSentAt: inv.reminderSentAt,
        nextReminderLevel,
        recipientName,
        recipientEmail,
        fund: inv.fund,
        park: inv.park,
      };
    });

    return NextResponse.json(serializePrisma(result));
  } catch (error) {
    logger.error({ err: error }, "Error fetching overdue invoices");
    return NextResponse.json(
      { error: "Fehler beim Laden der überfälligen Rechnungen" },
      { status: 500 }
    );
  }
}
