/**
 * Ausschüttung auf Gesellschafter verteilen — stichtagsgenau.
 *
 * Fehlende Funktion A8 (Audit 2026-07): `Shareholder` hat `entryDate` und
 * `exitDate`, `Distribution` rechnet aber mit dem **aktuellen** Stand.
 *
 * ## Der aktive Fehler, den das behebt (Finding 4.1)
 *
 * Heute filtert die Ausschüttung auf `status: "ACTIVE"` und normalisiert
 * anschliessend:
 *
 *     normalizedPercentage = (percentage / totalPercentage) * 100
 *
 * Szenario aus dem Audit: A hält 10 % und tritt zum 31.03. aus. Ausschüttung im
 * Dezember → A erhält 0 €, **und die verbleibenden 90 % werden auf 100 %
 * hochnormalisiert**. Die anderen bekommen A's vollen Jahresanteil geschenkt.
 * Wer im November eintritt, erhält den vollen Jahresanteil.
 *
 * Folge: falsche Ausschüttungsbeträge **und falsche KapESt-Bescheinigungen** —
 * die Bescheinigung gibt es bereits, sie wird nur falsch.
 *
 * ## Die Regel hier
 *
 * Verteilt wird nach tatsächlicher Beteiligungsdauer und tatsächlicher Quote.
 * **Nicht normalisiert.** Ergeben die Quoten in einem Abschnitt weniger als
 * 100 %, bleibt der Rest beim Fonds und wird als solcher ausgewiesen — das ist
 * der Fall eines eingezogenen Anteils. Ihn auf die übrigen zu verteilen wäre
 * genau der Fehler, den A8 beheben soll.
 *
 * Die Zerlegung in Zeitabschnitte teilt sich diese Datei mit der
 * Verpächteraufteilung (A5); dort ist eine Lücke dagegen unzulässig, weil ein
 * Pachtbetrag immer vollständig jemandem zusteht.
 */

import {
  splitIntoSegments,
  formatDay,
  roundCents,
  type TimedShare,
} from "@/lib/period-shares/segments";
import { shareSumTolerance } from "@/lib/config/share-tolerance";

export interface ShareholderShare extends TimedShare {
  shareholderId: string;
  /** Beitritt. `null` = seit Gründung. */
  validFrom: Date | null;
  /** Austritt (einschliesslich). `null` = weiterhin beteiligt. */
  validTo: Date | null;
}

export interface DistributionAllocation {
  shareholderId: string;
  amountEur: number;
  /** Tage der Beteiligung im Zeitraum. */
  days: number;
  /** Wirksamer Anteil in Prozent — Quote mal Zeitanteil. */
  effectiveSharePercent: number;
}

export interface DistributionSplitResult {
  allocations: DistributionAllocation[];
  /** Verteilter Betrag. */
  distributedEur: number;
  /**
   * Nicht verteilter Rest — eigene Anteile des Fonds oder eingezogene Anteile.
   * Er wird ausgewiesen und NICHT auf die übrigen verteilt.
   */
  undistributedEur: number;
  segmentCount: number;
  warnings: string[];
}

export interface DistributionSplitFailure {
  allocations: null;
  reason: string;
}

// Die Toleranz der Quotensumme kommt aus @/lib/config/share-tolerance und
// richtet sich nach der Zahl der Gesellschafter — siehe dort, warum ein fester
// Wert bei sechs gleichen Anteilen nicht mehr trägt.

export function splitDistribution(input: {
  shares: readonly ShareholderShare[];
  /** Zeitraum, auf den sich die Ausschüttung bezieht — meist ein Geschäftsjahr. */
  periodStart: Date;
  periodEnd: Date;
  totalAmountEur: number;
}): DistributionSplitResult | DistributionSplitFailure {
  const { shares, periodStart, periodEnd, totalAmountEur } = input;

  if (periodEnd < periodStart) {
    return { allocations: null, reason: "Das Ende des Zeitraums liegt vor dem Beginn" };
  }
  if (shares.length === 0) {
    return { allocations: null, reason: "Keine Gesellschafter im Zeitraum" };
  }

  const warnings: string[] = [];
  const segments = splitIntoSegments(shares, periodStart, periodEnd);

  if (segments.length === 0) {
    return { allocations: null, reason: "Zeitraum umfasst keine Tage" };
  }

  const byShareholder = new Map<string, { amountEur: number; days: number; effective: number }>();
  let undistributed = 0;

  for (const segment of segments) {
    if (segment.sumPercent > 100 + shareSumTolerance(segment.active.length)) {
      // Über 100 % ist immer ein Fehler — anders als darunter gibt es dafür
      // keine zulässige Auslegung.
      return {
        allocations: null,
        reason: `Die Anteile im Abschnitt ${formatDay(segment.start)}–${formatDay(
          segment.end,
        )} ergeben ${segment.sumPercent.toFixed(2)} % — mehr als 100 %`,
      };
    }

    const segmentAmount = totalAmountEur * segment.timeShare;

    for (const share of segment.active) {
      const entry = byShareholder.get(share.shareholderId) ?? {
        amountEur: 0,
        days: 0,
        effective: 0,
      };
      const effective = (share.sharePercent / 100) * segment.timeShare;
      entry.amountEur += totalAmountEur * effective;
      entry.days += segment.days;
      entry.effective += effective * 100;
      byShareholder.set(share.shareholderId, entry);
    }

    // Der Teil des Abschnitts, der keinem Gesellschafter zugeordnet ist.
    // NICHT auf die übrigen verteilen — das ist Finding 4.1.
    const unassignedPercent = Math.max(0, 100 - segment.sumPercent);
    // Unterhalb der Rundungstoleranz ist der Rest kein eigener Anteil, sondern
    // die Ungenauigkeit der Quoten selbst. Er wird dann weder ausgewiesen noch
    // verteilt — das Geld bleibt in beiden Fällen liegen, es wird nur nicht
    // als Fehlbetrag gemeldet.
    if (unassignedPercent > shareSumTolerance(segment.active.length)) {
      undistributed += (segmentAmount * unassignedPercent) / 100;
      warnings.push(
        `Im Abschnitt ${formatDay(segment.start)}–${formatDay(segment.end)} sind nur ${segment.sumPercent.toFixed(
          2,
        )} % der Anteile zugeordnet — der Rest bleibt bei der Gesellschaft und wird NICHT auf die übrigen verteilt.`,
      );
    }
  }

  if (segments.length > 1) {
    warnings.push(
      `Gesellschafterwechsel im Zeitraum — die Ausschüttung ist auf ${segments.length} Abschnitte zeitanteilig verteilt.`,
    );
  }

  const allocations: DistributionAllocation[] = [...byShareholder.entries()].map(
    ([shareholderId, value]) => ({
      shareholderId,
      amountEur: roundCents(value.amountEur),
      days: value.days,
      effectiveSharePercent: Math.round(value.effective * 10000) / 10000,
    }),
  );

  if (allocations.length === 0) {
    return {
      allocations: null,
      reason: "Im Zeitraum war kein Gesellschafter beteiligt",
    };
  }

  // Rundungsrest ausgleichen — aber nur innerhalb des VERTEILTEN Betrags.
  // Den nicht verteilten Rest hier mit auszugleichen würde ihn heimlich doch
  // ausschütten.
  const targetDistributed = roundCents(totalAmountEur - undistributed);
  const distributed = roundCents(allocations.reduce((sum, a) => sum + a.amountEur, 0));
  const difference = roundCents(targetDistributed - distributed);

  if (difference !== 0) {
    const largest = allocations.reduce((best, current) =>
      Math.abs(current.amountEur) > Math.abs(best.amountEur) ? current : best,
    );
    largest.amountEur = roundCents(largest.amountEur + difference);
  }

  return {
    allocations,
    distributedEur: targetDistributed,
    undistributedEur: roundCents(undistributed),
    segmentCount: segments.length,
    warnings,
  };
}

/**
 * Gesellschafterliste zu einem Stichtag — die fortgeschriebene Fassung.
 *
 * Für die Nachweispflicht: „wer war am 31.12. beteiligt und mit welcher
 * Quote". Heute werden die Stammdaten überschrieben und die Historie geht
 * verloren.
 */
export function shareRegisterAt(
  shares: readonly ShareholderShare[],
  date: Date,
): { shareholderId: string; sharePercent: number }[] {
  const segments = splitIntoSegments(shares, date, date);
  if (segments.length === 0) return [];
  return segments[0].active.map((share) => ({
    shareholderId: share.shareholderId,
    sharePercent: share.sharePercent,
  }));
}
