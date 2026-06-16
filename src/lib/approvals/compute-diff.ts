/**
 * Feature B7: Diff-Vorschau für ApprovalRequests.
 *
 * Vor jeder 4-Augen-Freigabe sieht der Decider strukturiert *was sich
 * verändern wird*. Bisher: nur "Max will SEPA-Lauf X freigeben" — ohne
 * Details. Jetzt: konkrete Vorher/Nachher-Werte pro Action-Type.
 *
 * Die computeApprovalDiff-Funktion lädt die referenzierte Entity (SEPA-
 * Batch, JournalEntry, SettlementPeriod, IncomingInvoice) und stellt die
 * Änderung als ApprovalDiff-Struktur zusammen. Die UI rendert das als
 * Tabelle mit tone-basiertem Color-Coding.
 *
 * Fallback: für Action-Types ohne dedizierten Computer (TENANT_SETTINGS_
 * UPDATE, USER_ROLE_ASSIGN, neue Actions) liefern wir einen Default-Diff
 * mit summary="Keine Diff-Vorschau verfügbar". So bleibt die UI stabil
 * auch wenn ein neuer Action-Type noch keinen Computer hat.
 */

import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import type { ApprovalAction } from "@prisma/client";

export interface ApprovalDiffChange {
  /** Label der Zeile, z.B. "Saldo Bank X" oder "Konto 8400" */
  label: string;
  /** Vorher-Wert (formatted), z.B. "50.412,30 €" — optional für reine Listen */
  before?: string;
  /** Nachher-Wert (formatted) */
  after?: string;
  /** Optionale Differenz, z.B. "−38.113,59 €" oder "+4 Zahlungen" */
  delta?: string;
  /** Tone-Hint für UI: default | warning | destructive */
  tone?: "default" | "warning" | "destructive";
}

export interface ApprovalDiff {
  /** User-friendly title, z.B. "SEPA-Lauf 2026-06" */
  title: string;
  /** Strukturierte Änderungen */
  changes: ApprovalDiffChange[];
  /** Optionaler Summary-Text unter den Changes */
  summary?: string;
}

/** Formatiert einen Delta-Wert mit Vorzeichen (z.B. "−38.113,59 €" / "+4,00 €"). */
function formatDelta(delta: number): string {
  const sign = delta < 0 ? "−" : "+";
  return `${sign}${formatCurrency(Math.abs(delta))}`;
}

/** Defensive Number-Conversion für Prisma Decimal | number | string. */
function toNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  // Prisma.Decimal toString() → numeric string
  if (typeof (value as { toString?: () => string }).toString === "function") {
    return Number((value as { toString: () => string }).toString()) || 0;
  }
  return 0;
}

// =============================================================================
// Action-spezifische Diff-Computer
// =============================================================================

async function diffSepaRun(approvalId: string, tenantId: string, entityId: string): Promise<ApprovalDiff | null> {
  const batch = await prisma.sepaPaymentBatch.findFirst({
    where: { id: entityId, tenantId },
    include: { items: true },
  });
  if (!batch) {
    return {
      title: "SEPA-Lauf",
      changes: [],
      summary: "Referenz nicht mehr verfügbar",
    };
  }

  // Bank-Account via IBAN suchen (debtorIban des Batches)
  const bankAccount = await prisma.bankAccount.findFirst({
    where: { tenantId, iban: batch.debtorIban },
    select: { name: true, currentBalance: true, iban: true },
  });

  const total = toNum(batch.totalAmount);
  const balanceBefore = bankAccount ? toNum(bankAccount.currentBalance) : null;
  const balanceAfter = balanceBefore !== null ? balanceBefore - total : null;

  const changes: ApprovalDiffChange[] = [];

  // Saldo-Vorschau wenn Bank-Account bekannt
  if (bankAccount && balanceBefore !== null && balanceAfter !== null) {
    changes.push({
      label: `Saldo ${bankAccount.name}`,
      before: formatCurrency(balanceBefore),
      after: formatCurrency(balanceAfter),
      delta: formatDelta(balanceAfter - balanceBefore),
      tone: balanceAfter < 0 ? "destructive" : "warning",
    });
  }

  // Zahlungsanzahl + Gesamtsumme
  changes.push({
    label: "Zahlungen",
    after: `${batch.paymentCount} Stück`,
    delta: formatCurrency(total),
    tone: "default",
  });

  // Top-5 Items als Vorschau (zu lange Listen würden das UI sprengen)
  const previewItems = batch.items.slice(0, 5);
  for (const item of previewItems) {
    changes.push({
      label: item.creditorName,
      after: formatCurrency(toNum(item.amount)),
      tone: "default",
    });
  }

  const summary = batch.items.length > previewItems.length
    ? `+ ${batch.items.length - previewItems.length} weitere Zahlungen — Gesamt ${formatCurrency(total)}`
    : `Gesamt ${formatCurrency(total)} an ${batch.items.length} Empfänger`;

  // Use approvalId in debug-friendly title so future logging can correlate
  void approvalId;

  return {
    title: `SEPA-Lauf ${batch.batchNumber}`,
    changes,
    summary,
  };
}

async function diffSettlementFinalize(_approvalId: string, tenantId: string, entityId: string): Promise<ApprovalDiff | null> {
  const period = await prisma.leaseSettlementPeriod.findFirst({
    where: { id: entityId, tenantId },
    include: { park: { select: { name: true } } },
  });
  if (!period) {
    return {
      title: "Settlement-Finalisierung",
      changes: [],
      summary: "Referenz nicht mehr verfügbar",
    };
  }

  const monthLabel = period.month ? `${String(period.month).padStart(2, "0")}/${period.year}` : `${period.year}`;
  const total = toNum(period.totalActualRent ?? period.totalMinimumRent ?? period.totalRevenue);

  const changes: ApprovalDiffChange[] = [
    {
      label: "Periode",
      before: period.status,
      after: "APPROVED",
      tone: "warning",
    },
    {
      label: "Park",
      after: period.park?.name ?? "—",
      tone: "default",
    },
    {
      label: "Zeitraum",
      after: monthLabel,
      tone: "default",
    },
  ];

  if (total > 0) {
    changes.push({
      label: "Settlement-Summe",
      after: formatCurrency(total),
      tone: "default",
    });
  }

  return {
    title: `Settlement ${monthLabel}${period.park?.name ? ` · ${period.park.name}` : ""}`,
    changes,
    summary: "Nach Finalisierung sind für diese Periode keine weiteren Buchungen mehr möglich.",
  };
}

async function diffJournalReverse(_approvalId: string, tenantId: string, entityId: string): Promise<ApprovalDiff | null> {
  const entry = await prisma.journalEntry.findFirst({
    where: { id: entityId, tenantId, deletedAt: null },
    include: { lines: { orderBy: { lineNumber: "asc" } } },
  });
  if (!entry) {
    return {
      title: "Buchung stornieren",
      changes: [],
      summary: "Referenz nicht mehr verfügbar",
    };
  }

  // Bei Storno werden alle Debit/Credit-Werte invertiert
  const changes: ApprovalDiffChange[] = entry.lines.map((line) => {
    const debit = toNum(line.debitAmount);
    const credit = toNum(line.creditAmount);
    const originalAmount = debit - credit;
    const reversedAmount = -originalAmount;
    return {
      label: `Konto ${line.account}${line.accountName ? ` · ${line.accountName}` : ""}`,
      before: formatCurrency(originalAmount),
      after: formatCurrency(reversedAmount),
      delta: formatDelta(reversedAmount - originalAmount),
      tone: "destructive",
    };
  });

  return {
    title: `Storno: ${entry.description}`,
    changes,
    summary: `Generalumkehr der Buchung vom ${entry.entryDate.toLocaleDateString("de-DE")}. Original-Buchung bleibt erhalten, eine neue Buchung mit invertierten Vorzeichen wird erzeugt.`,
  };
}

async function diffJournalPost(_approvalId: string, tenantId: string, entityId: string): Promise<ApprovalDiff | null> {
  const entry = await prisma.journalEntry.findFirst({
    where: { id: entityId, tenantId, deletedAt: null },
    include: { lines: { orderBy: { lineNumber: "asc" } } },
  });
  if (!entry) {
    return {
      title: "Buchung festschreiben",
      changes: [],
      summary: "Referenz nicht mehr verfügbar",
    };
  }

  const changes: ApprovalDiffChange[] = [
    {
      label: "Status",
      before: entry.status,
      after: "POSTED",
      tone: "warning",
    },
  ];

  for (const line of entry.lines) {
    const debit = toNum(line.debitAmount);
    const credit = toNum(line.creditAmount);
    const amount = debit > 0 ? debit : -credit;
    changes.push({
      label: `Konto ${line.account}${line.accountName ? ` · ${line.accountName}` : ""}`,
      after: formatDelta(amount),
      tone: "default",
    });
  }

  return {
    title: `Buchung: ${entry.description}`,
    changes,
    summary: `Buchungsdatum ${entry.entryDate.toLocaleDateString("de-DE")} — nach Festschreibung nur noch via Generalumkehr änderbar.`,
  };
}

async function diffIncomingInvoiceApprove(_approvalId: string, tenantId: string, entityId: string): Promise<ApprovalDiff | null> {
  const invoice = await prisma.incomingInvoice.findFirst({
    where: { id: entityId, tenantId, deletedAt: null },
    include: { vendor: { select: { name: true } } },
  });
  if (!invoice) {
    return {
      title: "Eingangsrechnung freigeben",
      changes: [],
      summary: "Referenz nicht mehr verfügbar",
    };
  }

  const changes: ApprovalDiffChange[] = [
    {
      label: "Status",
      before: invoice.status,
      after: "APPROVED",
      tone: "warning",
    },
    {
      label: "Lieferant",
      after: invoice.vendor?.name ?? invoice.vendorNameFallback ?? "—",
    },
    {
      label: "Rechnungsnummer",
      after: invoice.invoiceNumber ?? "—",
    },
  ];

  if (invoice.grossAmount) {
    changes.push({
      label: "Brutto-Betrag",
      after: formatCurrency(toNum(invoice.grossAmount)),
      tone: "default",
    });
  }

  return {
    title: `Eingangsrechnung ${invoice.invoiceNumber ?? invoice.id.slice(0, 8)}`,
    changes,
    summary: "Nach Freigabe ist die Rechnung zahlungsbereit und kann in den SEPA-Lauf aufgenommen werden.",
  };
}

// =============================================================================
// Dispatcher
// =============================================================================

type DiffComputer = (
  approvalId: string,
  tenantId: string,
  entityId: string,
) => Promise<ApprovalDiff | null>;

const COMPUTERS: Partial<Record<ApprovalAction, DiffComputer>> = {
  SEPA_RUN: diffSepaRun,
  SETTLEMENT_FINALIZE: diffSettlementFinalize,
  JOURNAL_REVERSE: diffJournalReverse,
  JOURNAL_POST: diffJournalPost,
  INCOMING_INVOICE_APPROVE: diffIncomingInvoiceApprove,
};

/**
 * Berechnet die Diff-Vorschau für einen ApprovalRequest.
 *
 * Returns:
 *  - ApprovalDiff mit Title + Changes + Summary, wenn Action unterstützt wird
 *  - Fallback-Diff mit "Keine Diff-Vorschau verfügbar" für unbekannte Actions
 *  - null wenn ApprovalRequest nicht (mehr) existiert
 */
export async function computeApprovalDiff(
  approvalId: string,
  tenantId: string,
): Promise<ApprovalDiff | null> {
  const approval = await prisma.approvalRequest.findFirst({
    where: { id: approvalId, tenantId },
    select: { id: true, action: true, entityId: true, entityType: true },
  });
  if (!approval) return null;

  const computer = COMPUTERS[approval.action];
  if (!computer) {
    return {
      title: approval.action,
      changes: [],
      summary: "Keine Diff-Vorschau verfügbar",
    };
  }

  try {
    return await computer(approvalId, tenantId, approval.entityId);
  } catch {
    return {
      title: approval.action,
      changes: [],
      summary: "Keine Diff-Vorschau verfügbar",
    };
  }
}
