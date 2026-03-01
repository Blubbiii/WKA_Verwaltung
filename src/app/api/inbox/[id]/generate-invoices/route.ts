import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import { getNextInvoiceNumber } from "@/lib/invoices/numberGenerator";

// POST /api/inbox/[id]/generate-invoices
// Creates outgoing invoices for each split that doesn't have one yet
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("inbox:approve");
    if (!check.authorized) return check.error;
    if (!await getConfigBoolean("inbox.enabled", check.tenantId!, false)) {
      return NextResponse.json({ error: "Inbox nicht aktiviert" }, { status: 404 });
    }
    const { id } = await params;

    const invoice = await prisma.incomingInvoice.findFirst({
      where: { id, tenantId: check.tenantId!, deletedAt: null },
      include: {
        vendor: { select: { name: true } },
        splits: {
          where: { outgoingInvoiceId: null },
          include: { fund: { select: { id: true, name: true } } },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Rechnung nicht gefunden" }, { status: 404 });
    }

    if (invoice.splits.length === 0) {
      return NextResponse.json(
        { error: "Keine offenen Splits vorhanden (alle haben bereits Ausgangsrechnungen)" },
        { status: 409 }
      );
    }

    const tenantId = check.tenantId!;
    const createdInvoices: { splitId: string; invoiceId: string; invoiceNumber: string }[] = [];

    for (const split of invoice.splits) {
      // Calculate amount for this split
      const grossAmount =
        split.splitAmount !== null
          ? Number(split.splitAmount)
          : split.splitPercent !== null && invoice.grossAmount !== null
          ? Math.round((Number(invoice.grossAmount) * Number(split.splitPercent)) / 100 * 100) / 100
          : null;

      if (grossAmount === null) {
        logger.warn({ splitId: split.id }, "Split has no amount or percent — skipping");
        continue;
      }

      const { number: invoiceNumber } = await getNextInvoiceNumber(tenantId, "INVOICE");

      const vendorName = invoice.vendor?.name ?? invoice.vendorNameFallback ?? "Lieferant";
      const description =
        split.description ??
        `Kostenanteil ${split.fund.name} — ${vendorName}${invoice.invoiceNumber ? ` Re. ${invoice.invoiceNumber}` : ""}`;

      const outgoing = await prisma.invoice.create({
        data: {
          invoiceType: "INVOICE",
          invoiceNumber,
          invoiceDate: new Date(),
          dueDate: invoice.dueDate ?? null,
          recipientType: "FUND",
          recipientName: split.fund.name,
          recipientAddress: null,
          netAmount: grossAmount, // simplified: treat gross as net for now
          taxRate: 0,
          taxAmount: 0,
          grossAmount,
          notes: description,
          status: "DRAFT",
          tenantId,
          createdById: check.userId!,
          fundId: split.fund.id,
          items: {
            create: [
              {
                description,
                quantity: 1,
                unitPrice: grossAmount,
                netAmount: grossAmount,
                taxRate: 0,
                taxAmount: 0,
                grossAmount,
                position: 1,
                ...(split.datevAccount && { datevAccountCode: split.datevAccount }),
              },
            ],
          },
        },
      });

      // Link split → outgoing invoice
      await prisma.incomingInvoiceSplit.update({
        where: { id: split.id },
        data: { outgoingInvoiceId: outgoing.id },
      });

      createdInvoices.push({
        splitId: split.id,
        invoiceId: outgoing.id,
        invoiceNumber: outgoing.invoiceNumber,
      });
    }

    return NextResponse.json(serializePrisma({ created: createdInvoices }));
  } catch (error) {
    logger.error({ err: error }, "Error generating outgoing invoices from inbox splits");
    return NextResponse.json({ error: "Fehler beim Erzeugen der Ausgangsrechnungen" }, { status: 500 });
  }
}
