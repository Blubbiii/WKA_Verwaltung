import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { generateSepaXml } from "@/lib/export/sepa-export";
import { z } from "zod";

const createBatchSchema = z.object({
  executionDate: z.string(),
  debtorName: z.string(),
  debtorIban: z.string(),
  debtorBic: z.string().optional(),
  invoiceIds: z.array(z.uuid()),
});

// GET /api/buchhaltung/sepa — List SEPA batches
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;

    const batches = await prisma.sepaPaymentBatch.findMany({
      where: { tenantId: check.tenantId! },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        _count: { select: { items: true } },
      },
    });

    return NextResponse.json({ data: batches });
  } catch (error) {
    logger.error({ err: error }, "Error listing SEPA batches");
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// POST /api/buchhaltung/sepa — Create SEPA batch from invoices
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:create");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = createBatchSchema.parse(body);

    // Load invoices with recipient payment data
    const invoices = await prisma.invoice.findMany({
      where: {
        id: { in: parsed.invoiceIds },
        tenantId: check.tenantId!,
        status: { in: ["SENT", "PAID"] },
      },
      include: {
        shareholder: {
          select: {
            person: {
              select: { firstName: true, lastName: true, companyName: true, bankIban: true, bankBic: true },
            },
          },
        },
      },
    });

    if (invoices.length === 0) {
      return NextResponse.json({ error: "Keine gültigen Rechnungen gefunden" }, { status: 400 });
    }

    // Generate batch number
    const count = await prisma.sepaPaymentBatch.count({ where: { tenantId: check.tenantId! } });
    const batchNumber = `SEPA-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

    const items = invoices.map((inv) => {
      const person = inv.shareholder?.person;
      const name = person?.companyName || `${person?.firstName || ""} ${person?.lastName || ""}`.trim() || inv.recipientName || "";
      return {
        invoiceId: inv.id,
        creditorName: name.slice(0, 200),
        creditorIban: person?.bankIban || "",
        creditorBic: person?.bankBic || null,
        amount: Number(inv.grossAmount),
        remittanceInfo: `${inv.invoiceNumber}`.slice(0, 140),
        endToEndId: inv.invoiceNumber.slice(0, 35),
      };
    });

    const totalAmount = items.reduce((s, i) => s + i.amount, 0);

    // Generate XML
    const xml = generateSepaXml({
      messageId: batchNumber,
      creationDateTime: new Date().toISOString(),
      debtorName: parsed.debtorName,
      debtorIban: parsed.debtorIban,
      debtorBic: parsed.debtorBic,
      payments: items.map((i) => ({
        endToEndId: i.endToEndId,
        amount: i.amount,
        currency: "EUR",
        creditorName: i.creditorName,
        creditorIban: i.creditorIban,
        creditorBic: i.creditorBic || undefined,
        remittanceInfo: i.remittanceInfo,
        requestedExecutionDate: parsed.executionDate,
      })),
    });

    const batch = await prisma.sepaPaymentBatch.create({
      data: {
        tenantId: check.tenantId!,
        batchNumber,
        executionDate: new Date(parsed.executionDate),
        debtorName: parsed.debtorName,
        debtorIban: parsed.debtorIban,
        debtorBic: parsed.debtorBic,
        status: "DRAFT",
        totalAmount,
        paymentCount: items.length,
        xmlContent: xml,
        createdById: check.userId!,
        items: {
          create: items,
        },
      },
    });

    return NextResponse.json({ data: batch });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validierungsfehler", details: error.issues }, { status: 400 });
    }
    logger.error({ err: error }, "Error creating SEPA batch");
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
