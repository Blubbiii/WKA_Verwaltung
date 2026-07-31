/**
 * Vollzug einer Anteilsübertragung.
 *
 * A8 (Audit 2026-07). Der Vollzug ist der einzige Schritt, der den
 * Anteilsverlauf fortschreibt — und er ist genau die Stelle, an der heute
 * überschrieben wird.
 *
 * ## Warum überhaupt ein Vollzug und nicht einfach ein Feld ändern
 *
 * Wird `ownershipPercentage` beim Verkauf überschrieben, ist die
 * Gesellschafterliste zum letzten Bilanzstichtag nicht mehr rekonstruierbar
 * und jede bereits erstellte KapESt-Bescheinigung verliert ihre Grundlage.
 * Der Vollzug schliesst deshalb die alte Zeile ab und öffnet eine neue am
 * Folgetag; gelöscht wird nichts.
 *
 * ## Zustimmung
 *
 * Bei vinkulierten Anteilen ist die Übertragung ohne Zustimmung schwebend
 * unwirksam. Sie trotzdem zu vollziehen hiesse, eine Gesellschafterliste zu
 * führen, die der Gesellschaftsvertrag nicht deckt — deshalb verweigert der
 * Vollzug hier den Dienst, statt zu warnen.
 */

import { Prisma } from "@prisma/client";
import type { prisma as prismaClient } from "@/lib/prisma";
import { addDays, startOfDay } from "@/lib/period-shares/segments";

/**
 * Der erweiterte Client verträgt `Prisma.TransactionClient` nicht — die
 * Extensions fehlen dort im Typ.
 */
type Tx = Omit<
  typeof prismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export interface TransferInput {
  id: string;
  type: "SALE" | "GIFT" | "INHERITANCE" | "REDEMPTION" | "ISSUE";
  effectiveDate: Date;
  sharePercent: number;
  capitalAmount: number | null;
  consentRequired: boolean;
  consentGrantedAt: Date | null;
  fromShareholderId: string | null;
  toShareholderId: string | null;
}

export interface TransferCheck {
  ok: boolean;
  problems: string[];
  warnings: string[];
}

/**
 * Prüft, ob eine Übertragung vollzogen werden darf.
 *
 * Getrennt vom Vollzug, damit die Maske dieselbe Prüfung schon beim Erfassen
 * anzeigen kann.
 */
export function checkTransfer(
  transfer: TransferInput,
  context: {
    /** Quote des Abgebenden am Stichtag. `null` = nicht ermittelbar. */
    fromSharePercent: number | null;
    /** Anteilssumme aller Gesellschafter am Stichtag. */
    totalSharePercent: number | null;
  },
): TransferCheck {
  const problems: string[] = [];
  const warnings: string[] = [];

  if (transfer.sharePercent <= 0) {
    problems.push("Die übertragene Quote muss grösser als 0 sein");
  }
  if (transfer.sharePercent > 100) {
    problems.push("Die übertragene Quote kann nicht über 100 % liegen");
  }

  const needsSource = transfer.type !== "ISSUE";
  if (needsSource && !transfer.fromShareholderId) {
    problems.push("Ohne abgebenden Gesellschafter ist nur eine Neuaufnahme möglich");
  }
  if (transfer.type === "ISSUE" && transfer.fromShareholderId) {
    problems.push("Eine Neuaufnahme hat keinen abgebenden Gesellschafter");
  }

  const needsTarget = transfer.type !== "REDEMPTION";
  if (needsTarget && !transfer.toShareholderId) {
    problems.push("Ohne erwerbenden Gesellschafter ist nur eine Einziehung möglich");
  }
  if (transfer.type === "REDEMPTION" && transfer.toShareholderId) {
    problems.push("Bei einer Einziehung geht der Anteil unter, er wird nicht übertragen");
  }

  if (transfer.fromShareholderId && transfer.fromShareholderId === transfer.toShareholderId) {
    problems.push("Abgebender und erwerbender Gesellschafter sind identisch");
  }

  if (transfer.consentRequired && !transfer.consentGrantedAt) {
    // Kein Hinweis, sondern ein Hindernis: ohne Zustimmung ist die Übertragung
    // schwebend unwirksam.
    problems.push(
      "Die erforderliche Zustimmung fehlt — die Übertragung ist bis dahin schwebend unwirksam",
    );
  }

  if (needsSource && context.fromSharePercent !== null) {
    if (transfer.sharePercent > context.fromSharePercent + 0.011) {
      problems.push(
        `Der abgebende Gesellschafter hält am Stichtag nur ${context.fromSharePercent.toFixed(
          2,
        )} % — mehr kann er nicht übertragen`,
      );
    }
  } else if (needsSource) {
    warnings.push(
      "Die Quote des abgebenden Gesellschafters am Stichtag ist nicht ermittelbar — bitte prüfen.",
    );
  }

  if (transfer.type === "ISSUE" && context.totalSharePercent !== null) {
    const after = context.totalSharePercent + transfer.sharePercent;
    if (after > 100 + 0.011) {
      problems.push(
        `Nach der Aufnahme ergäben die Anteile ${after.toFixed(2)} % — mehr als 100 %`,
      );
    }
  }

  if (transfer.type === "REDEMPTION") {
    warnings.push(
      "Einziehung: der Anteil geht unter. Die Anteilssumme sinkt unter 100 %, der Rest bleibt bei der Gesellschaft und wird bei Ausschüttungen NICHT auf die übrigen verteilt.",
    );
  }

  if (transfer.type === "INHERITANCE") {
    warnings.push(
      "Erbfall: Stichtag ist der Todestag, nicht der Tag der Erfassung — sonst fiele die Zeit dazwischen dem Erblasser zu.",
    );
  }

  return { ok: problems.length === 0, problems, warnings };
}

/**
 * Vollzieht die Übertragung: schliesst die alten Anteilszeilen ab und legt die
 * neuen an.
 *
 * Erwartet einen bereits geprüften Vorgang und läuft in der Transaktion des
 * Aufrufers — die Fortschreibung beider Seiten darf nicht halb passieren.
 */
export async function executeTransfer(
  tx: Tx,
  transfer: TransferInput,
  executedById: string | null,
): Promise<{ closed: number; opened: number }> {
  const effective = startOfDay(transfer.effectiveDate);
  // Der alte Stand gilt bis zum Vortag — der Stichtag selbst gehört bereits
  // dem neuen. Genau diese Konvention setzt `splitIntoSegments` voraus.
  const lastDayBefore = addDays(effective, -1);

  let closed = 0;
  let opened = 0;

  if (transfer.fromShareholderId) {
    const change = await moveShare(tx, {
      shareholderId: transfer.fromShareholderId,
      deltaPercent: -transfer.sharePercent,
      deltaCapital: transfer.capitalAmount === null ? null : -transfer.capitalAmount,
      effective,
      lastDayBefore,
      transferId: transfer.id,
    });
    closed += change.closed;
    opened += change.opened;
  }

  if (transfer.toShareholderId) {
    const change = await moveShare(tx, {
      shareholderId: transfer.toShareholderId,
      deltaPercent: transfer.sharePercent,
      deltaCapital: transfer.capitalAmount,
      effective,
      lastDayBefore,
      transferId: transfer.id,
    });
    closed += change.closed;
    opened += change.opened;
  }

  await tx.shareTransfer.update({
    where: { id: transfer.id },
    data: {
      status: "EXECUTED",
      executedAt: new Date(),
      executedById,
    },
  });

  return { closed, opened };
}

/**
 * Eine Seite der Übertragung fortschreiben.
 *
 * Der erste Aufruf für einen Gesellschafter ohne Verlauf erzeugt zwei Zeilen:
 * den Stand vor dem Stichtag aus den Stammdaten und den Stand danach. Ohne die
 * erste Zeile fiele der Verlauf vor dem Stichtag auf den (dann bereits
 * geänderten) Stammsatz zurück — und der Rückfall in `resolveShareholderShares`
 * greift nur, solange es GAR keinen Verlauf gibt.
 */
async function moveShare(
  tx: Tx,
  input: {
    shareholderId: string;
    deltaPercent: number;
    deltaCapital: number | null;
    effective: Date;
    lastDayBefore: Date;
    transferId: string;
  },
): Promise<{ closed: number; opened: number }> {
  const { shareholderId, deltaPercent, deltaCapital, effective, lastDayBefore, transferId } = input;

  const shareholder = await tx.shareholder.findUniqueOrThrow({
    where: { id: shareholderId },
    select: {
      entryDate: true,
      ownershipPercentage: true,
      distributionPercentage: true,
      capitalContribution: true,
      shareHistory: {
        where: { OR: [{ validTo: null }, { validTo: { gte: effective } }] },
        orderBy: { validFrom: "asc" },
      },
    },
  });

  let closed = 0;
  let opened = 0;
  let currentPercent: number;
  let currentCapital: number | null;

  if (shareholder.shareHistory.length === 0) {
    // Noch kein Verlauf: den bisherigen Stand als abgeschlossene Zeile
    // festhalten, bevor er sich ändert.
    currentPercent =
      Number(shareholder.distributionPercentage) || Number(shareholder.ownershipPercentage) || 0;
    currentCapital =
      shareholder.capitalContribution === null ? null : Number(shareholder.capitalContribution);

    if (currentPercent > 0) {
      await tx.shareholderShare.create({
        data: {
          shareholderId,
          sharePercent: new Prisma.Decimal(currentPercent),
          capitalAmount: currentCapital === null ? null : new Prisma.Decimal(currentCapital),
          validFrom: shareholder.entryDate,
          validTo: lastDayBefore,
          notes: "Stand vor der ersten erfassten Übertragung, aus den Stammdaten übernommen",
        },
      });
      opened += 1;
    }
  } else {
    // Alle am Stichtag geltenden Zeilen abschliessen. Zeilen, die erst NACH
    // dem Stichtag beginnen, bleiben unberührt: sie mit einem früheren
    // `validTo` zu schliessen ergäbe einen umgedrehten Zeitraum. Dass es sie
    // gibt, weist die Route ab — hier wird nicht zurechtgebogen.
    const openRows = shareholder.shareHistory.filter(
      (row) => row.validFrom === null || row.validFrom <= effective,
    );
    currentPercent = openRows.reduce((sum, row) => sum + Number(row.sharePercent), 0);
    currentCapital = openRows.reduce<number | null>(
      (sum, row) =>
        row.capitalAmount === null || sum === null ? null : sum + Number(row.capitalAmount),
      0,
    );

    for (const row of openRows) {
      await tx.shareholderShare.update({
        where: { id: row.id },
        data: { validTo: lastDayBefore },
      });
      closed += 1;
    }
  }

  const nextPercent = roundPercent(currentPercent + deltaPercent);
  const nextCapital =
    currentCapital === null || deltaCapital === null ? null : currentCapital + deltaCapital;

  // Fällt die Quote auf 0, entsteht KEINE neue Zeile — der Gesellschafter ist
  // ausgeschieden. Eine Zeile mit 0 % wäre eine Beteiligung ohne Beteiligung.
  if (nextPercent > 0) {
    await tx.shareholderShare.create({
      data: {
        shareholderId,
        sharePercent: new Prisma.Decimal(nextPercent),
        capitalAmount: nextCapital === null ? null : new Prisma.Decimal(nextCapital),
        validFrom: effective,
        validTo: null,
        transferId,
      },
    });
    opened += 1;
  }

  // Die Stammdaten spiegeln den AKTUELLEN Stand — die Historie steht daneben,
  // sie ersetzt den Stammsatz nicht. Listen und Auswertungen, die weiterhin
  // `ownershipPercentage` lesen, bleiben damit richtig.
  await tx.shareholder.update({
    where: { id: shareholderId },
    data: {
      ownershipPercentage: new Prisma.Decimal(nextPercent),
      capitalContribution: nextCapital === null ? null : new Prisma.Decimal(nextCapital),
      // Nur mitziehen, wenn eine abweichende Gewinnverteilungsquote gepflegt
      // ist — sonst entstünde eine, die vorher bewusst leer war.
      ...(shareholder.distributionPercentage !== null
        ? { distributionPercentage: new Prisma.Decimal(nextPercent) }
        : {}),
      ...(nextPercent <= 0 ? { exitDate: lastDayBefore, status: "INACTIVE" as const } : {}),
    },
  });

  return { closed, opened };
}

function roundPercent(value: number): number {
  return Math.round(value * 100000) / 100000;
}
