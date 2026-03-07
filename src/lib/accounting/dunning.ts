/**
 * Dunning (Mahnwesen) — Identifies overdue invoices and creates dunning runs.
 * Supports 3 levels: Zahlungserinnerung, 1. Mahnung, 2. Mahnung
 */

import { prisma } from "@/lib/prisma";

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

// Dunning level thresholds (days overdue)
const DUNNING_LEVELS = [
  { level: 1, minDays: 14, fee: 0 },     // Zahlungserinnerung
  { level: 2, minDays: 28, fee: 5 },      // 1. Mahnung
  { level: 3, minDays: 42, fee: 10 },     // 2. Mahnung
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaTransactionClient = any;

/**
 * Internal: find candidates using a given Prisma client (supports transactions).
 */
async function findDunningCandidatesWithTx(tx: PrismaTransactionClient, tenantId: string): Promise<DunningCandidate[]> {
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
      const overdueDays = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const currentLevel = inv.dunningItems[0]?.level ?? 0;

      const nextLevel = DUNNING_LEVELS.find(
        (l) => l.level > currentLevel && overdueDays >= l.minDays
      );

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
  const now = new Date();

  const overdueInvoices = await prisma.invoice.findMany({
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
        orderBy: { level: "desc" },
        take: 1,
        select: { level: true },
      },
    },
  });

  return overdueInvoices
    .map((inv) => {
      const dueDate = inv.dueDate!;
      const overdueDays = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const currentLevel = inv.dunningItems[0]?.level ?? 0;

      // Find the next applicable dunning level
      const nextLevel = DUNNING_LEVELS.find(
        (l) => l.level > currentLevel && overdueDays >= l.minDays
      );

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
    .filter((c): c is DunningCandidate => c !== null);
}

/**
 * Execute a dunning run: creates DunningRun + DunningItems for selected candidates.
 */
export async function executeDunningRun(
  tenantId: string,
  userId: string,
  candidateInvoiceIds: string[]
): Promise<{ runId: string; itemCount: number }> {
  return prisma.$transaction(async (tx) => {
    // Re-validate candidates inside transaction to prevent race conditions
    const candidates = await findDunningCandidatesWithTx(tx, tenantId);
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
