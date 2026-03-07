/**
 * Auto-Posting: Creates JournalEntry records automatically when invoice status changes.
 * Maps invoice items to SKR03 accounts from the LedgerAccount table.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getTenantSettings, type TenantSettings } from "@/lib/tenant-settings";
import type { Prisma } from "@prisma/client";

interface AutoPostingResult {
  success: boolean;
  journalEntryId?: string;
  error?: string;
}

/** Build account map from tenant settings (no more hardcoded accounts) */
function buildAccountMap(s: TenantSettings): Record<string, { debit: string; credit: string }> {
  return {
    ENERGY: { debit: s.datevAccountReceivables, credit: s.datevAccountEinspeisung },
    ENERGY_DIRECT: { debit: s.datevAccountReceivables, credit: s.datevAccountDirektvermarktung },
    LEASE: { debit: s.datevAccountPachtAufwand, credit: s.datevAccountReceivables },
    SERVICE: { debit: s.datevAccountWartung, credit: s.datevAccountReceivables },
    MANAGEMENT_FEE: { debit: s.datevAccountBF, credit: s.datevAccountReceivables },
  };
}

/**
 * Create a JournalEntry when an invoice is finalized (status → SENT).
 * Only creates if no auto-entry for this invoice already exists.
 */
export async function createAutoPosting(
  invoiceId: string,
  userId: string,
  tenantId: string
): Promise<AutoPostingResult> {
  try {
    // Check if auto-entry already exists
    const existing = await prisma.journalEntry.findFirst({
      where: {
        tenantId,
        referenceType: "Invoice",
        referenceId: invoiceId,
        source: "AUTO",
      },
    });

    if (existing) {
      return { success: true, journalEntryId: existing.id };
    }

    // Load invoice with items
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: true,
        fund: { select: { name: true } },
      },
    });

    if (!invoice) {
      return { success: false, error: "Invoice not found" };
    }

    // Load tenant-specific account mappings
    const settings = await getTenantSettings(tenantId);
    const accountMap = buildAccountMap(settings);

    // Build journal entry lines from invoice items
    const lines: Prisma.JournalEntryLineCreateWithoutJournalEntryInput[] = [];
    let lineNumber = 1;

    for (const item of invoice.items) {
      const mapping = accountMap[item.referenceType || ""] || accountMap.ENERGY;
      const debitAccount = item.datevKonto || mapping.debit;
      const creditAccount = item.datevGegenkonto || mapping.credit;
      const amount = item.grossAmount;

      // Debit line
      lines.push({
        lineNumber: lineNumber++,
        account: debitAccount,
        description: item.description || invoice.invoiceNumber || "",
        debitAmount: amount,
        creditAmount: null,
        costCenter: item.datevKostenstelle || null,
      });

      // Credit line
      lines.push({
        lineNumber: lineNumber++,
        account: creditAccount,
        description: item.description || invoice.invoiceNumber || "",
        debitAmount: null,
        creditAmount: amount,
        costCenter: item.datevKostenstelle || null,
      });
    }

    if (lines.length === 0) {
      return { success: false, error: "No invoice items to post" };
    }

    // Create the journal entry
    const entry = await prisma.journalEntry.create({
      data: {
        tenantId: invoice.tenantId,
        entryDate: invoice.invoiceDate,
        description: `Auto: ${invoice.invoiceNumber} - ${invoice.fund?.name || ""}`.slice(0, 200),
        reference: invoice.invoiceNumber,
        status: "POSTED",
        source: "AUTO",
        referenceType: "Invoice",
        referenceId: invoiceId,
        createdById: userId,
        lines: {
          create: lines,
        },
      },
    });

    logger.info(
      { invoiceId, journalEntryId: entry.id },
      "Auto-posting created for invoice"
    );

    return { success: true, journalEntryId: entry.id };
  } catch (error) {
    logger.error({ err: error, invoiceId }, "Auto-posting failed");
    return { success: false, error: String(error) };
  }
}

/**
 * Reverse an auto-posting (e.g., when invoice is cancelled).
 * Creates a reversal entry (Storno) rather than deleting the original.
 */
export async function reverseAutoPosting(
  invoiceId: string,
  userId: string,
  tenantId: string
): Promise<AutoPostingResult> {
  try {
    const original = await prisma.journalEntry.findFirst({
      where: {
        tenantId,
        referenceType: "Invoice",
        referenceId: invoiceId,
        source: "AUTO",
        deletedAt: null,
      },
      include: { lines: true },
    });

    if (!original) {
      return { success: true }; // Nothing to reverse
    }

    // Check if reversal already exists
    const existingReversal = await prisma.journalEntry.findFirst({
      where: {
        tenantId,
        referenceType: "InvoiceReversal",
        referenceId: invoiceId,
        source: "AUTO",
      },
    });

    if (existingReversal) {
      return { success: true, journalEntryId: existingReversal.id };
    }

    // Create reversal: swap debit/credit
    const reversalLines = original.lines.map((line, idx) => ({
      lineNumber: idx + 1,
      account: line.account,
      description: `Storno: ${line.description || ""}`,
      debitAmount: line.creditAmount,
      creditAmount: line.debitAmount,
      costCenter: line.costCenter,
    }));

    const reversal = await prisma.journalEntry.create({
      data: {
        tenantId: original.tenantId,
        entryDate: new Date(),
        description: `Storno: ${original.description}`.slice(0, 200),
        reference: `ST-${original.reference || ""}`,
        status: "POSTED",
        source: "AUTO",
        referenceType: "InvoiceReversal",
        referenceId: invoiceId,
        createdById: userId,
        lines: {
          create: reversalLines,
        },
      },
    });

    logger.info(
      { invoiceId, journalEntryId: reversal.id },
      "Auto-posting reversal created"
    );

    return { success: true, journalEntryId: reversal.id };
  } catch (error) {
    logger.error({ err: error, invoiceId }, "Auto-posting reversal failed");
    return { success: false, error: String(error) };
  }
}
