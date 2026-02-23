import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";

import { getNextInvoiceNumbers } from "@/lib/invoices/numberGenerator";
import { getTenantSettings } from "@/lib/tenant-settings";
import { apiLogger as logger } from "@/lib/logger";

// Hilfsfunktion: Formatiere Empfaengername
function formatRecipientName(person: {
  personType: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
}): string {
  if (person.personType === "legal" && person.companyName) {
    return person.companyName;
  }
  return [person.firstName, person.lastName].filter(Boolean).join(" ");
}

// Hilfsfunktion: Formatiere Adresse
function formatAddress(person: {
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
}): string {
  const parts = [];
  if (person.street) parts.push(person.street + (person.houseNumber ? ' ' + person.houseNumber : ''));
  if (person.postalCode || person.city) {
    parts.push([person.postalCode, person.city].filter(Boolean).join(" "));
  }
  return parts.join("\n");
}

// POST /api/funds/[id]/distributions/[distributionId]/execute - Ausschuettung ausfuehren
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; distributionId: string }> }
) {
  try {
    const check = await requirePermission("invoices:create");
    if (!check.authorized) return check.error;

    const { id, distributionId } = await params;

    // Distribution mit allen Daten laden
    const distribution = await prisma.distribution.findFirst({
      where: {
        id: distributionId,
        fundId: id,
        tenantId: check.tenantId!,
      },
      include: {
        fund: true,
        items: {
          include: {
            shareholder: {
              include: {
                person: true,
              },
            },
          },
        },
      },
    });

    if (!distribution) {
      return NextResponse.json(
        { error: "Ausschuettung nicht gefunden" },
        { status: 404 }
      );
    }

    if (distribution.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Ausschuettung wurde bereits ausgefuehrt" },
        { status: 400 }
      );
    }

    // Load tenant settings for payment term
    const tenantSettings = await getTenantSettings(check.tenantId!);
    const paymentTermDays = tenantSettings.paymentTermDays;

    // Pre-generate all credit note numbers in a single atomic operation (avoids N+1)
    const { numbers: creditNoteNumbers } = await getNextInvoiceNumbers(
      check.tenantId!,
      "CREDIT_NOTE",
      distribution.items.length
    );

    // Alle Gutschriften in einer Transaktion erstellen
    const result = await prisma.$transaction(async (tx) => {
      const createdInvoices: string[] = [];

      for (let idx = 0; idx < distribution.items.length; idx++) {
        const item = distribution.items[idx];
        // Gutschriftsnummer aus vorab generiertem Pool verwenden
        const invoiceNumber = creditNoteNumbers[idx];

        // Gutschrift erstellen
        const invoice = await tx.invoice.create({
          data: {
            invoiceType: "CREDIT_NOTE",
            invoiceNumber,
            invoiceDate: distribution.distributionDate,
            dueDate: new Date(
              distribution.distributionDate.getTime() + paymentTermDays * 24 * 60 * 60 * 1000
            ),
            recipientType: "shareholder",
            recipientName: formatRecipientName(item.shareholder.person),
            recipientAddress: formatAddress(item.shareholder.person),
            netAmount: item.amount,
            taxRate: 0, // Ausschuettungen sind steuerfrei
            taxAmount: 0,
            grossAmount: item.amount,
            status: "DRAFT",
            notes: `Ausschuettung ${distribution.distributionNumber}: ${distribution.description || ""}`.trim(),
            internalReference: distribution.distributionNumber,
            tenantId: check.tenantId!,
            fundId: distribution.fundId,
            shareholderId: item.shareholderId,
            createdById: check.userId,
          },
        });

        // Invoice Item erstellen
        await tx.invoiceItem.create({
          data: {
            invoiceId: invoice.id,
            position: 1,
            description: `Gewinnausschuettung ${distribution.fund.name} - ${distribution.description || new Date(distribution.distributionDate).getFullYear()}`,
            quantity: 1,
            unit: "pauschal",
            unitPrice: item.amount,
            netAmount: item.amount,
            taxRate: 0,
            taxAmount: 0,
            grossAmount: item.amount,
          },
        });

        // Distribution Item mit Invoice verknuepfen
        await tx.distributionItem.update({
          where: { id: item.id },
          data: { invoiceId: invoice.id },
        });

        createdInvoices.push(invoice.id);
      }

      // Distribution auf EXECUTED setzen
      await tx.distribution.update({
        where: { id: distributionId },
        data: {
          status: "EXECUTED",
          executedAt: new Date(),
        },
      });

      return createdInvoices;
    });

    // Aktualisierte Distribution laden
    const updatedDistribution = await prisma.distribution.findUnique({
      where: { id: distributionId },
      include: {
        items: {
          include: {
            shareholder: {
              include: {
                person: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    companyName: true,
                    personType: true,
                  },
                },
              },
            },
            invoice: {
              select: {
                id: true,
                invoiceNumber: true,
                status: true,
                grossAmount: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      distribution: updatedDistribution,
      createdInvoices: result.length,
      invoiceIds: result,
    });
  } catch (error) {
    logger.error({ err: error }, "Error executing distribution");
    return NextResponse.json(
      { error: "Fehler beim Ausfuehren der Ausschuettung" },
      { status: 500 }
    );
  }
}
