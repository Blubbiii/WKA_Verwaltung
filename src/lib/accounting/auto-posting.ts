/**
 * Auto-Posting: Creates JournalEntry records automatically when invoice status changes.
 * Maps invoice items to SKR03/SKR04 accounts from tenant settings.
 *
 * P11: Zwei Engines parallel verfügbar.
 *  - Alt (2-Lines): Brutto auf Erlös-/Aufwand-Konto, Brutto auf Gegenkonto.
 *    USt wird NICHT separat ausgewiesen → UStVA strukturell unbrauchbar.
 *  - Neu (3-Lines): Netto auf Erlös-/Aufwand-Konto, USt separat auf
 *    1776/1771 (Output) bzw. 1576/1571 (Input), Brutto auf Gegenkonto.
 *
 * Umschaltung via TenantSettings.useTaxSplit (Default: false). Sanfter
 * Rollout — Tenants opten ein, nach Validierung wird der Default geflippt.
 *
 * Bei Kleinunternehmer (§19 UStG, settings.kleinunternehmer=true) oder
 * tax=0 fällt die USt-Line weg (es gibt nichts zu splitten).
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getTenantSettings, type TenantSettings } from "@/lib/tenant-settings";
import type { Prisma } from "@prisma/client";
import { assertPeriodOpen, PeriodLockedError } from "./period-lock";
import { invalidateReportsCache } from "@/lib/cache/reports";

interface AutoPostingResult {
  success: boolean;
  journalEntryId?: string;
  error?: string;
  /** Set when the failure was due to a locked accounting period. */
  periodLocked?: { year: number; month: number };
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
 * Wählt das USt-Konto für eine Item-Line abhängig von der Buchungsrichtung
 * (Output USt = Verkäufer schuldet, Input Vorsteuer = Käufer kann ziehen)
 * und vom Steuersatz (19% oder 7%).
 *
 * Buchungsrichtung wird heuristisch über die Position des Forderungs-Kontos
 * erkannt: liegt es auf debit → Standard Outgoing (Tenant verkauft);
 *          liegt es auf credit → Incoming-Form (z.B. LEASE: Tenant zahlt Pacht).
 *
 * @returns USt-Kontonummer ODER null wenn kein Standard-Satz erkannt
 */
function pickTaxAccount(
  s: TenantSettings,
  taxRate: number,
  debitAccount: string,
  creditAccount: string,
): { account: string; side: "debit" | "credit" } | null {
  // Toleranz für Decimal-Rundung
  const isStandard = Math.abs(taxRate - 19) < 0.01;
  const isReduced = Math.abs(taxRate - 7) < 0.01;

  if (!isStandard && !isReduced) return null;

  const isOutgoing = debitAccount === s.datevAccountReceivables;
  const isIncoming = creditAccount === s.datevAccountReceivables;

  if (isOutgoing) {
    return {
      account: isStandard ? s.datevAccountOutputTax19 : s.datevAccountOutputTax7,
      side: "credit", // USt-Schuld → Haben
    };
  }
  if (isIncoming) {
    return {
      account: isStandard ? s.datevAccountInputTax19 : s.datevAccountInputTax7,
      side: "debit", // Vorsteuer → Soll
    };
  }
  return null;
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
    // M-9 Perf: existing-Check + invoice-Load + tenant-Settings parallelisieren
    // (vorher 3 sequenzielle awaits). Kosten bei early-exit (existing!=null):
    // 2 unnötige Queries — Optimierung nur wenn der Normalfall ist, dass kein
    // auto-entry existiert, was hier zutrifft (erste Postings beim Send-Flow).
    const [existing, invoice, settings] = await Promise.all([
      prisma.journalEntry.findFirst({
        where: {
          tenantId,
          referenceType: "Invoice",
          referenceId: invoiceId,
          source: "AUTO",
        },
      }),
      prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          items: true,
          fund: { select: { name: true } },
        },
      }),
      getTenantSettings(tenantId),
    ]);

    if (existing) {
      return { success: true, journalEntryId: existing.id };
    }

    if (!invoice) {
      return { success: false, error: "Invoice not found" };
    }

    const accountMap = buildAccountMap(settings);

    // Build journal entry lines from invoice items
    const lines: Prisma.JournalEntryLineCreateWithoutJournalEntryInput[] = [];
    let lineNumber = 1;

    // P11: Flag entscheidet zwischen alter 2-Lines und neuer 3-Lines Engine.
    // Bei Kleinunternehmer fällt die USt-Logik weg → alte Engine reicht.
    const useTaxSplit = settings.useTaxSplit && !settings.kleinunternehmer;

    for (const item of invoice.items) {
      const mapping = accountMap[item.referenceType || ""] || accountMap.ENERGY;
      const debitAccount = item.datevKonto || mapping.debit;
      const creditAccount = item.datevGegenkonto || mapping.credit;
      const gross = item.grossAmount;
      const net = item.netAmount;
      const tax = item.taxAmount;

      if (useTaxSplit && Number(tax) > 0) {
        // ---------- 3-Lines-Engine (Netto + USt + Gegenkonto) ----------
        const taxRate = Number(item.taxRate);
        const taxAcct = pickTaxAccount(settings, taxRate, debitAccount, creditAccount);

        // Forderung/Aufwand-Konto (Soll): Brutto
        lines.push({
          lineNumber: lineNumber++,
          account: debitAccount,
          description: item.description || invoice.invoiceNumber || "",
          debitAmount: gross,
          creditAmount: null,
          costCenter: item.datevKostenstelle || null,
        });

        // Erlös/Aufwand-Gegenkonto (Haben): Netto
        lines.push({
          lineNumber: lineNumber++,
          account: creditAccount,
          description: item.description || invoice.invoiceNumber || "",
          debitAmount: null,
          creditAmount: net,
          costCenter: item.datevKostenstelle || null,
        });

        // USt-Konto: Haben bei Outgoing (Schuld) / Soll bei Incoming (Vorsteuer)
        if (taxAcct && taxAcct.account) {
          lines.push({
            lineNumber: lineNumber++,
            account: taxAcct.account,
            description: `USt ${taxRate.toFixed(0)}% — ${item.description || invoice.invoiceNumber || ""}`.slice(0, 200),
            debitAmount: taxAcct.side === "debit" ? tax : null,
            creditAmount: taxAcct.side === "credit" ? tax : null,
            costCenter: null,
          });
        } else {
          // Kein USt-Konto erkennbar (Sonderfall) — Fallback auf 2-Lines.
          // Buchung bleibt ausgeglichen, aber USt landet implizit im Gegenkonto.
          // Korrigieren wir, indem wir die Netto-Line auf Brutto erhöhen.
          // Statt das nachträglich zu fixen: wir loggen + benutzen Brutto auf
          // dem Gegenkonto.
          lines.pop(); // letzte Netto-Line entfernen
          lines.push({
            lineNumber: lineNumber - 1,
            account: creditAccount,
            description: item.description || invoice.invoiceNumber || "",
            debitAmount: null,
            creditAmount: gross,
            costCenter: item.datevKostenstelle || null,
          });
          logger.warn(
            { invoiceId, itemId: item.id, debitAccount, creditAccount, taxRate },
            "Auto-posting tax-split fallback: USt-Konto nicht erkennbar — Brutto auf Gegenkonto",
          );
        }
      } else {
        // ---------- 2-Lines-Engine (Brutto/Brutto — bewährtes Verhalten) ----------
        lines.push({
          lineNumber: lineNumber++,
          account: debitAccount,
          description: item.description || invoice.invoiceNumber || "",
          debitAmount: gross,
          creditAmount: null,
          costCenter: item.datevKostenstelle || null,
        });
        lines.push({
          lineNumber: lineNumber++,
          account: creditAccount,
          description: item.description || invoice.invoiceNumber || "",
          debitAmount: null,
          creditAmount: gross,
          costCenter: item.datevKostenstelle || null,
        });
      }
    }

    if (lines.length === 0) {
      return { success: false, error: "No invoice items to post" };
    }

    // P9: GoBD §146 AO Period-Gate. Wenn der Buchungs-Monat (= invoice.invoiceDate)
    // gesperrt ist, darf das Auto-Posting NICHT laufen. Caller (invoice send-Flow)
    // muss damit umgehen — z.B. Rechnung in offener Periode neu datieren.
    try {
      await assertPeriodOpen(invoice.tenantId, invoice.invoiceDate);
    } catch (err) {
      if (err instanceof PeriodLockedError) {
        return {
          success: false,
          error: err.message,
          periodLocked: { year: err.periodYear, month: err.periodMonth },
        };
      }
      throw err;
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

    // K-1-Fix: Reports-Cache invalidieren — neue POSTED-Buchung ändert Saldi
    // (Bilanz/GuV/BWA/SuSa/UStVA). Fire-and-forget, damit Caller nicht blockt.
    invalidateReportsCache(invoice.tenantId).catch((err) => {
      logger.warn(
        { err, invoiceId },
        "[Reports-Cache] Invalidation failed after auto-posting create",
      );
    });

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
    // M-9 Perf: original + existingReversal parallel (waren 2 sequenzielle Queries)
    const [original, existingReversal] = await Promise.all([
      prisma.journalEntry.findFirst({
        where: {
          tenantId,
          referenceType: "Invoice",
          referenceId: invoiceId,
          source: "AUTO",
          deletedAt: null,
        },
        include: { lines: true },
      }),
      prisma.journalEntry.findFirst({
        where: {
          tenantId,
          referenceType: "InvoiceReversal",
          referenceId: invoiceId,
          source: "AUTO",
        },
      }),
    ]);

    if (!original) {
      return { success: true }; // Nothing to reverse
    }

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

    // P9: Storno bucht in den AKTUELLEN Monat (new Date()), nicht in die
    // Original-Periode. Wenn auch der aktuelle Monat gesperrt ist (Jahresende
    // im neuen Jahr), kann das Storno nicht laufen → Caller bekommt Fehler.
    const reversalDate = new Date();
    try {
      await assertPeriodOpen(original.tenantId, reversalDate);
    } catch (err) {
      if (err instanceof PeriodLockedError) {
        return {
          success: false,
          error: err.message,
          periodLocked: { year: err.periodYear, month: err.periodMonth },
        };
      }
      throw err;
    }

    const reversal = await prisma.journalEntry.create({
      data: {
        tenantId: original.tenantId,
        entryDate: reversalDate,
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

    // K-1-Fix: Reports-Cache invalidieren — Storno ändert Saldi genauso wie
    // die Original-Buchung. Fire-and-forget, damit Caller nicht blockt.
    invalidateReportsCache(original.tenantId).catch((err) => {
      logger.warn(
        { err, invoiceId },
        "[Reports-Cache] Invalidation failed after auto-posting reverse",
      );
    });

    return { success: true, journalEntryId: reversal.id };
  } catch (error) {
    logger.error({ err: error, invoiceId }, "Auto-posting reversal failed");
    return { success: false, error: String(error) };
  }
}
