/**
 * Dunning (Mahnwesen) — Identifies overdue invoices and creates dunning runs.
 * Supports 3 levels: Zahlungserinnerung, 1. Mahnung, 2. Mahnung
 */

import { prisma } from "@/lib/prisma";
import { getTenantSettings, type TenantSettings } from "@/lib/tenant-settings";
import { MS_PER_DAY } from "@/lib/constants/time";
import { computeDefaultInterest } from "./interest";
import { getBaseRateAt } from "./base-interest-rate";
import { loadVerzugszinsConfig } from "@/lib/system-settings";

export interface DunningCandidate {
  invoiceId: string;
  invoiceNumber: string;
  recipientName: string;
  grossAmount: number;
  dueDate: Date;
  overdueDays: number;
  currentLevel: number; // 0 = never dunned, 1-3 = last dunning level
  suggestedLevel: number;
  feeAmount: number;
  // P25: §288 BGB Verzugszinsen — pro Kandidat berechnet
  interestAmount: number;
  interestRatePercent: number;
  // §288 Abs. 5 — 40€ Pauschale B2B, einmalig pro Forderung
  interestLumpSumEur: number;
  // Berechnungs-Diagnose für UI
  baseRatePercent: number;
  isBusinessCustomer: boolean;
}

export interface DunningLevel {
  level: number;
  minDays: number;
  fee: number;
}

/** Build dunning levels from tenant settings */
export function getDunningLevels(s: TenantSettings): DunningLevel[] {
  return [
    { level: 1, minDays: s.reminderDays1, fee: s.reminderFee1 },
    { level: 2, minDays: s.reminderDays2, fee: s.reminderFee2 },
    { level: 3, minDays: s.reminderDays3, fee: s.reminderFee3 },
  ];
}

/**
 * Pure function: given the current dunning level and overdue days,
 * return the next eligible dunning level (or null if none).
 *
 * - Skips levels at or below the current level (no demoting)
 * - Returns the FIRST level whose minDays threshold is met
 * - Levels are evaluated in order — assumes input is sorted by level ascending
 */
export function selectNextDunningLevel(
  currentLevel: number,
  overdueDays: number,
  levels: DunningLevel[],
): DunningLevel | null {
  return (
    levels.find((l) => l.level > currentLevel && overdueDays >= l.minDays) ??
    null
  );
}

/**
 * Pure function: compute days overdue for an invoice.
 * Returns 0 if dueDate is in the future or invalid.
 */
export function computeOverdueDays(dueDate: Date, now: Date = new Date()): number {
  const diffMs = now.getTime() - dueDate.getTime();
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / MS_PER_DAY);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaTransactionClient = any;

/**
 * Internal: find candidates using a given Prisma client (supports transactions).
 */
async function findDunningCandidatesWithTx(tx: PrismaTransactionClient, tenantId: string, dunningLevels: ReturnType<typeof getDunningLevels>): Promise<DunningCandidate[]> {
  const now = new Date();

  // P25: §288 BGB-Konfiguration laden (Aufschläge + Pauschale).
  const verzugConfig = await loadVerzugszinsConfig();

  const overdueInvoices = await tx.invoice.findMany({
    where: {
      tenantId,
      status: { in: ["SENT", "PARTIALLY_PAID"] },
      deletedAt: null,
      dueDate: { lt: now },
    },
    select: {
      id: true,
      invoiceNumber: true,
      recipientName: true,
      grossAmount: true,
      paidAmount: true,
      dueDate: true,
      // P25: B2B/B2C-Erkennung via Recipient (Lease → lessor Person)
      lease: {
        select: {
          lessor: { select: { isBusinessCustomer: true, companyName: true } },
        },
      },
      dunningItems: {
        orderBy: { level: "desc" as const },
        take: 1,
        select: { level: true, interestLumpSumEur: true },
      },
    },
  });

  // Basiszinssatz zum Stichtag NOW einmal laden (gilt für alle Kandidaten heute).
  const baseRatePercent = await getBaseRateAt(now);

  const results: DunningCandidate[] = [];

  for (const inv of overdueInvoices as typeof overdueInvoices) {
    const dueDate = inv.dueDate!;
    const overdueDays = computeOverdueDays(dueDate, now);
    const currentLevel = inv.dunningItems[0]?.level ?? 0;
    const nextLevel = selectNextDunningLevel(currentLevel, overdueDays, dunningLevels);

    if (!nextLevel) continue;

    // P25: §288 BGB — B2B/B2C aus Person; Default B2C (konservativ)
    const isBusinessCustomer = inv.lease?.lessor?.isBusinessCustomer
      ?? Boolean(inv.lease?.lessor?.companyName)
      ?? false;

    // Offener Betrag = Brutto − bisher gezahlt (P16 Teilzahlungen)
    const openAmount = Math.max(
      0,
      Number(inv.grossAmount) - Number(inv.paidAmount ?? 0),
    );

    // §288 Abs. 5 BGB 40€-Pauschale: nur einmal pro Forderung über alle Stufen.
    const previousLumpSum = inv.dunningItems[0]?.interestLumpSumEur ?? 0;
    const lumpSumAlreadyApplied = Number(previousLumpSum) > 0;

    const interest = computeDefaultInterest(
      {
        principal: openAmount,
        dueDate,
        asOf: now,
        baseRatePercent,
        isBusinessCustomer,
        lumpSumAlreadyApplied,
      },
      verzugConfig,
    );

    results.push({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      recipientName: inv.recipientName,
      grossAmount: Number(inv.grossAmount),
      dueDate,
      overdueDays,
      currentLevel,
      suggestedLevel: nextLevel.level,
      feeAmount: nextLevel.fee,
      interestAmount: interest.interestAmount,
      interestRatePercent: interest.effectiveRatePercent,
      interestLumpSumEur: interest.lumpSumEur,
      baseRatePercent,
      isBusinessCustomer,
    });
  }

  return results;
}

/**
 * Find all overdue invoices that are candidates for dunning.
 */
export async function findDunningCandidates(tenantId: string): Promise<DunningCandidate[]> {
  const settings = await getTenantSettings(tenantId);
  if (!settings.reminderEnabled) return [];
  const dunningLevels = getDunningLevels(settings);

  return findDunningCandidatesWithTx(prisma, tenantId, dunningLevels);
}

/**
 * Execute a dunning run: creates DunningRun + DunningItems for selected candidates.
 */
export async function executeDunningRun(
  tenantId: string,
  userId: string,
  candidateInvoiceIds: string[]
): Promise<{ runId: string; itemCount: number }> {
  const settings = await getTenantSettings(tenantId);
  const dunningLevels = getDunningLevels(settings);

  return prisma.$transaction(async (tx) => {
    // Re-validate candidates inside transaction to prevent race conditions
    const candidates = await findDunningCandidatesWithTx(tx, tenantId, dunningLevels);
    const selected = candidates.filter((c) => candidateInvoiceIds.includes(c.invoiceId));

    if (selected.length === 0) {
      throw new Error("Keine gültigen Mahnkandidaten ausgewählt");
    }

    const run = await tx.dunningRun.create({
      data: {
        tenantId,
        createdById: userId,
        status: "EXECUTED",
        items: {
          create: selected.map((c) => ({
            invoiceId: c.invoiceId,
            level: c.suggestedLevel,
            overdueDays: c.overdueDays,
            amount: c.grossAmount,
            feeAmount: c.feeAmount,
            // P25: §288 BGB-Felder auf DunningItem persistieren
            interestAmount: c.interestAmount,
            interestRatePercent: c.interestRatePercent,
            interestDaysOverdue: c.overdueDays,
            interestLumpSumEur: c.interestLumpSumEur,
          })),
        },
      },
    });

    return { runId: run.id, itemCount: selected.length };
  });
}
