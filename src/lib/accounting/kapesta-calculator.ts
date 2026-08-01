/**
 * F-3 Sprint 4: Kapitalertragsteuer-Berechnung (§44a EStG).
 *
 * Bei Ausschüttungen einer Kapitalgesellschaft (GmbH) an natürliche
 * Personen ist Kapitalertragsteuer (25%) + Solidaritätszuschlag (5,5%
 * davon) + ggf. Kirchensteuer einzubehalten und mit Kapitalertragsteuer-
 * Anmeldung (§45a EStG) an das Finanzamt abzuführen.
 *
 * Freistellungsauftrag: 1.000 EUR pro Single, 2.000 EUR pro Verheiratet
 * (Stand 2023+, vorher 801 EUR / 1.602 EUR).
 *
 * Dieses Modul stellt ein BEIBLATT bereit — keine automatische
 * Einbehaltung. Die Buchung erfolgt manuell durch den Buchhalter.
 */

export interface KapEStInput {
  grossAmount: number;
  /** Freibetrag (Freistellungsauftrag) — wird auf das Brutto angerechnet. */
  freibetragRemaining?: number;
  /** Kirchensteuer-Satz (0.08 = Bayern/BW, 0.09 = alle anderen) oder 0 falls nicht KiSt-pflichtig. */
  kirchensteuerRate?: number;
  /**
   * Kapitalertragsteuersatz (§43a Abs. 1 Nr. 1 EStG).
   *
   * Bewusst als Eingabe statt als Konstante in diesem Modul: der Wert liegt in
   * den System-Einstellungen und wird dort gepflegt. Diese Funktion bleibt
   * dadurch rein und synchron — sie rechnet, sie lädt nicht.
   *
   * Ohne Angabe gilt der Rechtsstand vom 01.06.2026 (siehe DEFAULT_KAPEST_RATE).
   */
  kapestRate?: number;
  /** Solidaritätszuschlag auf die Kapitalertragsteuer (§4 SolZG). Siehe `kapestRate`. */
  soliRate?: number;
}

export interface KapEStResult {
  grossAmount: number;
  freibetragApplied: number;
  taxableAmount: number;
  kapestRate: number;
  kapestAmount: number;
  soliRate: number;
  soliAmount: number;
  kirchensteuerRate: number;
  kirchensteuerAmount: number;
  totalDeducted: number;
  netPayout: number;
}

/**
 * Rückfallwerte, Rechtsstand 01.06.2026.
 *
 * Die maßgeblichen Werte stehen in den System-Einstellungen (`KAPEST_RATE`,
 * `SOLI_RATE`) und werden von den Aufrufern übergeben. Diese Konstanten greifen
 * nur, wenn keine übergeben wurden — damit ein Aufruf ohne Einstellungen nicht
 * mit 0 % rechnet und dabei wie ein gültiges Ergebnis aussieht.
 */
export const DEFAULT_KAPEST_RATE = 0.25;
export const DEFAULT_SOLI_RATE = 0.055; // 5,5 % auf die KapESt, nicht auf den Ertrag

/**
 * Berechnet KapESt + SolZ + ggf. KiSt pro Ausschüttung an einen Gesellschafter.
 *
 * @example
 *   computeKapESt({ grossAmount: 5000, freibetragRemaining: 1000 })
 *   // → KapESt auf 4000 → 1000 KapESt, 55 SolZ, 945 Netto-Ersparnis vs 1000
 */
export function computeKapESt(input: KapEStInput): KapEStResult {
  const gross = Math.max(0, input.grossAmount);
  const freibetragRemaining = Math.max(0, input.freibetragRemaining ?? 0);
  const kirchensteuerRate = Math.max(0, Math.min(input.kirchensteuerRate ?? 0, 0.09));

  const kapestRate = input.kapestRate ?? DEFAULT_KAPEST_RATE;
  const soliRate = input.soliRate ?? DEFAULT_SOLI_RATE;

  const freibetragApplied = Math.min(gross, freibetragRemaining);
  const taxableAmount = Math.max(0, gross - freibetragApplied);

  const kapestAmount = roundCent(taxableAmount * kapestRate);
  const soliAmount = roundCent(kapestAmount * soliRate);
  const kirchensteuerAmount = roundCent(kapestAmount * kirchensteuerRate);

  const totalDeducted = roundCent(kapestAmount + soliAmount + kirchensteuerAmount);
  const netPayout = roundCent(gross - totalDeducted);

  return {
    grossAmount: gross,
    freibetragApplied,
    taxableAmount,
    kapestRate,
    kapestAmount,
    soliRate,
    soliAmount,
    kirchensteuerRate,
    kirchensteuerAmount,
    totalDeducted,
    netPayout,
  };
}

function roundCent(v: number): number {
  return Math.round(v * 100) / 100;
}

export interface KapEStLeafletRow {
  shareholderName: string;
  shareholderId: string;
  grossAmount: number;
  kapest: KapEStResult;
}

/**
 * Bildet das vollständige Beiblatt pro Distribution: pro Gesellschafter
 * eine Zeile mit KapESt + SolZ + KiSt-Berechnung.
 */
export function buildKapEStLeaflet(rows: KapEStLeafletRow[]): {
  rows: KapEStLeafletRow[];
  totals: {
    grossTotal: number;
    kapestTotal: number;
    soliTotal: number;
    kirchensteuerTotal: number;
    totalDeducted: number;
    netPayoutTotal: number;
  };
} {
  let grossTotal = 0;
  let kapestTotal = 0;
  let soliTotal = 0;
  let kirchensteuerTotal = 0;
  let totalDeducted = 0;
  let netPayoutTotal = 0;

  for (const r of rows) {
    grossTotal += r.kapest.grossAmount;
    kapestTotal += r.kapest.kapestAmount;
    soliTotal += r.kapest.soliAmount;
    kirchensteuerTotal += r.kapest.kirchensteuerAmount;
    totalDeducted += r.kapest.totalDeducted;
    netPayoutTotal += r.kapest.netPayout;
  }

  return {
    rows,
    totals: {
      grossTotal: roundCent(grossTotal),
      kapestTotal: roundCent(kapestTotal),
      soliTotal: roundCent(soliTotal),
      kirchensteuerTotal: roundCent(kirchensteuerTotal),
      totalDeducted: roundCent(totalDeducted),
      netPayoutTotal: roundCent(netPayoutTotal),
    },
  };
}
