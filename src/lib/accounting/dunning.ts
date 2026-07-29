/**
 * Dunning (Mahnwesen) — Identifies overdue invoices and creates dunning runs.
 * Supports 3 levels: Zahlungserinnerung, 1. Mahnung, 2. Mahnung
 */

import { prisma } from "@/lib/prisma";
import { getTenantSettings, type TenantSettings } from "@/lib/tenant-settings";
import { MS_PER_DAY } from "@/lib/constants/time";
import { computeSegmentedDefaultInterest } from "./interest";
import { getBaseRateSegments } from "./base-interest-rate";
import { loadVerzugszinsConfig } from "@/lib/system-settings";

export interface DunningCandidate {
  invoiceId: string;
  invoiceNumber: string;
  recipientName: string;
  grossAmount: number;
  /**
   * F19: noch offener Betrag (Brutto − paidAmount). DAS ist die Forderung,
   * die gemahnt wird — grossAmount bleibt nur zur Anzeige erhalten.
   */
  openAmount: number;
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
 *
 * F19 (Zusatz): rechnet auf UTC-MITTERNACHT normalisiert, exakt wie
 * interest.ts:daysSince(). Vorher wurden rohe Millisekunden-Differenzen
 * abgerundet — je nach Uhrzeit von dueDate und `now` wich die Mahnstufen-
 * Entscheidung damit um einen Tag von der Zinsberechnung ab.
 */
export function computeOverdueDays(dueDate: Date, now: Date = new Date()): number {
  const due = Date.UTC(
    dueDate.getUTCFullYear(),
    dueDate.getUTCMonth(),
    dueDate.getUTCDate(),
  );
  const at = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diffDays = Math.floor((at - due) / MS_PER_DAY);
  return Math.max(0, diffDays);
}

/**
 * F18: B2B-Erkennung für §288 BGB.
 *
 * Vorher hing das Flag ausschließlich an `invoice.lease.lessor`. Jede Rechnung
 * ohne Lease-Bezug (Beteiligungs-, Vendor-, Fonds- und Direktrechnungen) galt
 * damit automatisch als Verbrauchergeschäft: 5 statt 9 Prozentpunkte und keine
 * 40-€-Pauschale nach §288 Abs. 5 BGB.
 *
 * Reihenfolge (erste greifende Quelle gewinnt):
 *   1. Lease-Verpächter (Person.isBusinessCustomer / companyName)
 *   2. Gesellschafter-Person (Shareholder → Person)
 *   3. USt-IdNr. auf der Rechnung — wer eine hat, ist Unternehmer
 *   4. recipientType "fund" / "vendor" — juristische Personen, nie Verbraucher
 *   5. Default false (B2C, konservativ: der niedrigere Zinssatz)
 */
export function detectBusinessCustomer(inv: {
  lease?: { lessor?: { isBusinessCustomer?: boolean | null; companyName?: string | null } | null } | null;
  shareholder?: { person?: { isBusinessCustomer?: boolean | null; companyName?: string | null } | null } | null;
  recipientVatId?: string | null;
  recipientType?: string | null;
}): boolean {
  const persons = [inv.lease?.lessor, inv.shareholder?.person];
  for (const p of persons) {
    if (!p) continue;
    if (p.isBusinessCustomer === true) return true;
    if (p.companyName && p.companyName.trim().length > 0) return true;
  }

  if (inv.recipientVatId && inv.recipientVatId.trim().length > 0) return true;

  const t = inv.recipientType?.toLowerCase();
  if (t === "fund" || t === "vendor") return true;

  return false;
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
      // Dunning-Hold: strittige Rechnungen ausschließen (permanent ODER abgelaufener temp-Hold)
      AND: [
        { OR: [{ dunningHold: false }, { dunningHold: null }] },
        { OR: [{ dunningHoldUntil: null }, { dunningHoldUntil: { lt: now } }] },
      ],
    },
    select: {
      id: true,
      invoiceNumber: true,
      recipientName: true,
      grossAmount: true,
      paidAmount: true,
      dueDate: true,
      // F18: B2B-Erkennung braucht mehr als nur den Lease-Verpächter.
      recipientType: true,
      recipientVatId: true,
      lease: {
        select: {
          lessor: { select: { isBusinessCustomer: true, companyName: true } },
        },
      },
      shareholder: {
        select: {
          person: { select: { isBusinessCustomer: true, companyName: true } },
        },
      },
      // 2.1: der zweite Mahnpfad (api/invoices/[id]/send-reminder) schreibt
      // NICHT auf DunningItem, sondern auf Invoice.reminderLevel.
      reminderLevel: true,
      dunningItems: {
        orderBy: { level: "desc" as const },
        take: 1,
        select: { level: true, interestLumpSumEur: true },
      },
    },
  });

  // F17: Basiszinssatz-HISTORIE über den gesamten Verzugszeitraum laden statt
  // nur den heute geltenden Punktwert. §247 BGB ändert sich halbjährlich; ein
  // Verzug über mehrere Halbjahre muss je Zinsperiode gerechnet werden.
  // Einmal für den ältesten Fälligkeitstag aller Kandidaten laden.
  const earliestDue = (overdueInvoices as Array<{ dueDate: Date | null }>).reduce<Date>(
    (min, inv) => (inv.dueDate && inv.dueDate < min ? inv.dueDate : min),
    now,
  );
  const rateSegments = await getBaseRateSegments(earliestDue, now, tx);

  const results: DunningCandidate[] = [];

  for (const inv of overdueInvoices as typeof overdueInvoices) {
    const dueDate = inv.dueDate!;
    const overdueDays = computeOverdueDays(dueDate, now);

    // 2.1: zwei parallele Mahnsysteme. System A führt DunningItem.level,
    // System B (send-reminder-Route) führt Invoice.reminderLevel. Kannten sich
    // bisher nicht → derselbe Mahnlevel konnte zweimal rausgehen. Wir nehmen
    // hier das MAXIMUM beider Quellen als tatsächlich erreichten Stand.
    const dunningItemLevel = inv.dunningItems[0]?.level ?? 0;
    const invoiceReminderLevel = inv.reminderLevel ?? 0;
    const currentLevel = Math.max(dunningItemLevel, invoiceReminderLevel);

    const nextLevel = selectNextDunningLevel(currentLevel, overdueDays, dunningLevels);

    if (!nextLevel) continue;

    // F18: §288 BGB — B2B/B2C über alle verfügbaren Quellen; Default B2C.
    const isBusinessCustomer = detectBusinessCustomer(inv);

    // Offener Betrag = Brutto − bisher gezahlt (P16 Teilzahlungen)
    const openAmount = Math.max(
      0,
      Number(inv.grossAmount) - Number(inv.paidAmount ?? 0),
    );

    // §288 Abs. 5 BGB 40€-Pauschale: nur einmal pro Forderung über alle Stufen.
    const previousLumpSum = inv.dunningItems[0]?.interestLumpSumEur ?? 0;
    const lumpSumAlreadyApplied = Number(previousLumpSum) > 0;

    const interest = computeSegmentedDefaultInterest(
      {
        principal: openAmount,
        dueDate,
        asOf: now,
        baseRateSegments: rateSegments,
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
      openAmount,
      dueDate,
      overdueDays,
      currentLevel,
      suggestedLevel: nextLevel.level,
      feeAmount: nextLevel.fee,
      interestAmount: interest.interestAmount,
      interestRatePercent: interest.effectiveRatePercent,
      interestLumpSumEur: interest.lumpSumEur,
      // Ausgewiesen wird der Satz des LETZTEN (aktuellen) Zinsabschnitts —
      // der ist für den Empfänger der nachvollziehbare "heute gültige" Wert.
      baseRatePercent:
        interest.segments.at(-1)?.baseRatePercent ??
        rateSegments.at(-1)?.ratePercent ??
        0,
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
            // F19: hier stand c.grossAmount. Der offene Betrag wurde zwar
            // korrekt berechnet, aber nur für die Zinsen benutzt — auf der
            // Mahnung selbst stand der volle Bruttobetrag. Nach einer
            // Teilzahlung wurde also mehr angemahnt als geschuldet.
            amount: c.openAmount,
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

    // 2.1: Invoice.reminderLevel mitschreiben. Die zweite Mahnstrecke
    // (api/invoices/[id]/send-reminder) liest ausschließlich dieses Feld —
    // ohne Fortschreibung würde sie nach einem Dunning-Run dieselbe Stufe
    // erneut verschicken. Nur hochsetzen, nie herabstufen.
    for (const c of selected) {
      await tx.invoice.updateMany({
        where: {
          id: c.invoiceId,
          tenantId,
          OR: [{ reminderLevel: null }, { reminderLevel: { lt: c.suggestedLevel } }],
        },
        data: {
          reminderLevel: c.suggestedLevel,
          reminderSentAt: new Date(),
        },
      });
    }

    return { runId: run.id, itemCount: selected.length };
  });
}
