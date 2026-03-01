import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { generateSepaXml, type SepaPayment } from "@/lib/export/sepa-export";

const bodySchema = z.object({
  invoiceIds: z.array(z.string().uuid()).min(1),
  executionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// POST /api/inbox/export/sepa
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("inbox:export");
    if (!check.authorized) return check.error;
    if (!await getConfigBoolean("inbox.enabled", check.tenantId!, false)) {
      return NextResponse.json({ error: "Inbox nicht aktiviert" }, { status: 404 });
    }

    const raw = await request.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? "Ungültige Eingabe" },
        { status: 400 }
      );
    }

    const tenantId = check.tenantId!;
    const { invoiceIds, executionDate } = parsed.data;

    // Load tenant IBAN for debtor
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, iban: true, bic: true },
    });

    if (!tenant?.iban) {
      return NextResponse.json(
        { error: "Mandanten-IBAN nicht konfiguriert (Einstellungen → Bankverbindung)" },
        { status: 422 }
      );
    }

    // Load invoices
    const invoices = await prisma.incomingInvoice.findMany({
      where: {
        id: { in: invoiceIds },
        tenantId,
        deletedAt: null,
        status: "APPROVED",
      },
      include: {
        vendor: { select: { name: true, iban: true, bic: true } },
      },
    });

    if (invoices.length === 0) {
      return NextResponse.json(
        { error: "Keine genehmigten Rechnungen gefunden" },
        { status: 404 }
      );
    }

    const payments: SepaPayment[] = [];
    const skipped: string[] = [];

    for (const inv of invoices) {
      const creditorIban = inv.iban ?? inv.vendor?.iban;
      const creditorName = inv.vendor?.name ?? inv.vendorNameFallback ?? "Unbekannt";
      const amount = inv.grossAmount ? Number(inv.grossAmount) : null;

      if (!creditorIban || !amount) {
        skipped.push(inv.id);
        continue;
      }

      const execDate =
        executionDate ??
        (inv.dueDate
          ? inv.dueDate.toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10));

      payments.push({
        endToEndId: `INV-${inv.id.slice(0, 30)}`,
        amount,
        currency: inv.currency,
        creditorName,
        creditorIban,
        creditorBic: inv.bic ?? inv.vendor?.bic ?? undefined,
        remittanceInfo:
          inv.paymentReference ??
          inv.invoiceNumber ??
          `Eingangsrechnung ${inv.id.slice(0, 8)}`,
        requestedExecutionDate: execDate,
      });
    }

    if (payments.length === 0) {
      return NextResponse.json(
        { error: "Keine Rechnungen mit IBAN und Betrag für SEPA-Export gefunden", skipped },
        { status: 422 }
      );
    }

    const now = new Date();
    const messageId = `WPM-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${Date.now()}`;

    const xml = generateSepaXml({
      messageId,
      creationDateTime: now.toISOString().replace(/\.\d{3}Z$/, ""),
      debtorName: tenant.name,
      debtorIban: tenant.iban,
      debtorBic: tenant.bic ?? undefined,
      payments,
    });

    // Mark as SEPA exported
    await prisma.incomingInvoice.updateMany({
      where: { id: { in: payments.map((_, i) => invoices[i]?.id).filter(Boolean) as string[] } },
      data: { sepaExportedAt: now },
    });

    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml",
        "Content-Disposition": `attachment; filename="sepa-${messageId}.xml"`,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error generating SEPA export");
    return NextResponse.json({ error: "Fehler beim SEPA-Export" }, { status: 500 });
  }
}
