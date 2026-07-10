import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import {
  generateSepaXml,
  checkSepaAwvWarnings,
} from "@/lib/export/sepa-export";
import { PAGE_SIZE_LARGE } from "@/lib/config/pagination";
import { z } from "zod";

// IBAN-Format (kompakt): 2 Länder-Code + 2 Checkdigits + bis 30 Alnum.
// Wir normalisieren Whitespace vor der Validierung — user tippt oft mit
// Leerzeichen.
const ibanRegex = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/;

const createBatchSchema = z.object({
  executionDate: z.string(),
  debtorName: z.string().min(1),
  debtorIban: z
    .string()
    .transform((s) => s.replace(/\s+/g, "").toUpperCase())
    .refine((s) => ibanRegex.test(s), "Ungültige Debtor-IBAN"),
  debtorBic: z.string().optional(),
  invoiceIds: z.array(z.uuid()).min(1),
});

// GET /api/buchhaltung/sepa — List SEPA batches
export async function GET(_request: NextRequest) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;

    const batches = await prisma.sepaPaymentBatch.findMany({
      where: { tenantId: check.tenantId! },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE_LARGE,
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        _count: { select: { items: true } },
      },
    });

    return NextResponse.json({ data: batches });
  } catch (error) {
    logger.error({ err: error }, "Error listing SEPA batches");
    return apiError("INTERNAL_ERROR", 500, { message: "Interner Serverfehler" });
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
    // F12: deletedAt:null Filter — Soft-deleted Rechnungen dürfen nicht in
    // einen SEPA-Lauf einfließen.
    const invoices = await prisma.invoice.findMany({
      where: {
        id: { in: parsed.invoiceIds },
        tenantId: check.tenantId!,
        deletedAt: null,
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
      return apiError("BAD_REQUEST", 400, { message: "Keine gültigen Rechnungen gefunden" });
    }

    const items = invoices.map((inv) => {
      const person = inv.shareholder?.person;
      const name = person?.companyName || `${person?.firstName || ""} ${person?.lastName || ""}`.trim() || inv.recipientName || "";
      return {
        invoiceId: inv.id,
        creditorName: name.slice(0, 200),
        creditorIban: (person?.bankIban || "").replace(/\s+/g, "").toUpperCase(),
        creditorBic: person?.bankBic || null,
        amount: Number(inv.grossAmount),
        remittanceInfo: `${inv.invoiceNumber}`.slice(0, 140),
        endToEndId: inv.invoiceNumber.slice(0, 35),
      };
    });

    // F14: Ohne creditorIban ist der Zahllauf ungültig — würde beim Einreichen
    // von der Bank abgelehnt bzw. eine Payment ohne Empfänger erzeugen.
    const missingIban = items.filter((i) => !ibanRegex.test(i.creditorIban));
    if (missingIban.length > 0) {
      return apiError("BAD_REQUEST", 400, {
        message: `Für ${missingIban.length} Rechnung(en) fehlt eine gültige Creditor-IBAN`,
        details: {
          invoicesWithoutIban: missingIban.map((i) => i.invoiceId),
        },
      });
    }

    const totalAmount = items.reduce((s, i) => s + i.amount, 0);

    // F13: Batch-Nummer + Create in EINER Transaktion. count()+1 vor der TX
    // ist rennend — zwei parallele Requests holen die gleiche Nummer.
    // Innerhalb der TX suchen wir die letzte Batch-Nummer und incrementieren.
    // Bei @@unique auf (tenantId, batchNumber) throws Prisma bei Kollision;
    // wir übersetzen das nicht extra, weil Retry Sache des Clients ist.
    const batch = await prisma.$transaction(async (tx) => {
      const yearPrefix = `SEPA-${new Date().getFullYear()}-`;
      const last = await tx.sepaPaymentBatch.findFirst({
        where: {
          tenantId: check.tenantId!,
          batchNumber: { startsWith: yearPrefix },
        },
        orderBy: { batchNumber: "desc" },
        select: { batchNumber: true },
      });
      const lastSeq = last
        ? parseInt(last.batchNumber.slice(yearPrefix.length), 10) || 0
        : 0;
      const batchNumber = `${yearPrefix}${String(lastSeq + 1).padStart(4, "0")}`;

      // C-2: AWV-Meldepflicht prüfen (§11 AWG, §67 AWV). Warnungen, keine Errors.
      const awvWarnings = checkSepaAwvWarnings(
        items.map((i) => ({
          endToEndId: i.endToEndId,
          amount: i.amount,
          currency: "EUR",
          creditorName: i.creditorName,
          creditorIban: i.creditorIban,
          creditorBic: i.creditorBic || undefined,
          remittanceInfo: i.remittanceInfo,
          requestedExecutionDate: parsed.executionDate,
        })),
      );
      if (awvWarnings.length > 0) {
        logger.warn(
          {
            tenantId: check.tenantId,
            batchNumber,
            awvWarningCount: awvWarnings.length,
            totalReportable: awvWarnings.reduce((s, w) => s + w.amount, 0),
          },
          "AWV-Meldepflicht erkannt im SEPA-Lauf",
        );
      }

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

      const created = await tx.sepaPaymentBatch.create({
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

      return { batch: created, awvWarnings };
    });

    return NextResponse.json({
      data: batch.batch,
      awvWarnings: batch.awvWarnings.map((w) => ({
        endToEndId: w.endToEndId,
        creditorName: w.creditorName,
        amount: w.amount,
        country: w.awv.detectedCountry,
        reason: w.awv.reason,
        reportingForm: w.awv.reportingForm,
      })),
    });
  } catch (error) {
    return handleApiError(error, "Fehler beim Erstellen des SEPA-Batch");
  }
}
