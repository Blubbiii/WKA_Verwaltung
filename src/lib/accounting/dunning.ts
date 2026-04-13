/**
 * Dunning (Mahnwesen) — Identifies overdue invoices and creates dunning runs.
 * Supports 3 levels: Zahlungserinnerung, 1. Mahnung, 2. Mahnung
 */

import { prisma } from "@/lib/prisma";
import { getTenantSettings, type TenantSettings } from "@/lib/tenant-settings";

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
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaTransactionClient = any;

/**
 * Internal: find candidates using a given Prisma client (supports transactions).
 */
async function findDunningCandidatesWithTx(tx: PrismaTransactionClient, tenantId: string, dunningLevels: ReturnType<typeof getDunningLevels>): Promise<DunningCandidate[]> {
  const now = new Date();

  const overdueInvoices = await tx.invoice.findMany({
    where: {
      tenantId,
      status: "SENT",
      deletedAt: null,
      dueDate: { lt: now },
    },
    select: {
      id: true,
      invoiceNumber: true,
      recipientName: true,
      grossAmount: true,
      dueDate: true,
      dunningItems: {
        orderBy: { level: "desc" as const },
        take: 1,
        select: { level: true },
      },
    },
  });

  return overdueInvoices
    .map((inv: typeof overdueInvoices[0]) => {
      const dueDate = inv.dueDate!;
      const overdueDays = computeOverdueDays(dueDate, now);
      const currentLevel = inv.dunningItems[0]?.level ?? 0;
      const nextLevel = selectNextDunningLevel(currentLevel, overdueDays, dunningLevels);

      if (!nextLevel) return null;

      return {
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        recipientName: inv.recipientName,
        grossAmount: Number(inv.grossAmount),
        dueDate,
        overdueDays,
        currentLevel,
        suggestedLevel: nextLevel.level,
        feeAmount: nextLevel.fee,
      };
    })
    .filter((c: DunningCandidate | null): c is DunningCandidate => c !== null);
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
          })),
        },
      },
    });

    return { runId: run.id, itemCount: selected.length };
  });
}
