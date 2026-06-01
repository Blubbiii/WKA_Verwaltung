/**
 * §288 BGB Verzugszinsen-Berechnung (Phase 16).
 *
 * Rechtliche Grundlage:
 *   §288 Abs. 1 BGB — Verzugszinsen bei Geldforderungen
 *     "Eine Geldschuld ist während des Verzugs zu verzinsen."
 *   §288 Abs. 1 S. 2 — Zinssatz für VERBRAUCHER (B2C):
 *     "Der Verzugszinssatz beträgt für das Jahr fünf Prozentpunkte
 *      über dem Basiszinssatz."
 *   §288 Abs. 2 — Zinssatz bei Rechtsgeschäften, an denen ein
 *     VERBRAUCHER NICHT beteiligt ist (B2B):
 *     "Bei Rechtsgeschäften, an denen ein Verbraucher nicht beteiligt
 *      ist, beträgt der Zinssatz für Entgeltforderungen neun Prozent-
 *      punkte über dem Basiszinssatz."
 *   §288 Abs. 5 — 40€-Pauschale (B2B):
 *     "Der Gläubiger einer Entgeltforderung hat […] einen Anspruch auf
 *      Zahlung eines Pauschalbetrags von 40 Euro."
 *
 * Basiszinssatz §247 BGB: wird halbjährlich von der Deutschen Bundesbank
 * festgelegt (zum 1. Januar und 1. Juli). Aktuelle und historische Werte
 * werden in der BaseInterestRate-Tabelle gehalten.
 *
 * Berechnung der Tage (§187/188 BGB):
 *   Erster Verzugstag = Tag NACH Fälligkeit. Tag der Zahlung wird mitgezählt.
 *   Bei Zinsen rechnen wir mit dem deutschen Bankjahr (360 Tage,
 *   Verbraucher-streit: 365). Wir nehmen 365 (kalendergenau) — das ist
 *   die Praxis bei Verzugszinsen (§§247, 288 BGB sind unspezifisch).
 */

export interface ComputeInterestInput {
  /** Brutto-Forderungsbetrag in EUR (für Zinsberechnung). */
  principal: number;
  /** Fälligkeitsdatum der Forderung. */
  dueDate: Date;
  /** Tag bis zu dem die Zinsen berechnet werden (z.B. Zahlungseingang oder Stichtag). */
  asOf: Date;
  /** Basiszinssatz in % p.a. (z.B. 3.62 für 3.62%). */
  baseRatePercent: number;
  /**
   * B2B (true) oder B2C (false).
   *   B2B → Basis + 9 %-Pkt + 40€ Pauschale
   *   B2C → Basis + 5 %-Pkt, KEINE Pauschale
   */
  isBusinessCustomer: boolean;
  /**
   * Wurde die 40€-Pauschale bereits einmal abgerechnet? Wenn ja: 0.
   * (§288 Abs. 5 — Pauschale ist EINMALIG pro Forderung.)
   */
  lumpSumAlreadyApplied?: boolean;
}

export interface ComputeInterestResult {
  /** Anzahl Verzugstage (≥ 0). */
  daysOverdue: number;
  /** Effektiver Zinssatz in % p.a. */
  effectiveRatePercent: number;
  /** Zinsbetrag in EUR (auf Cent gerundet). */
  interestAmount: number;
  /** 40€-Pauschale bei B2B, sonst 0. Wird einmalig fällig. */
  lumpSumEur: number;
  /** Summe aus Zinsen + Pauschale. */
  totalEur: number;
  /** True wenn die Zahlung am oder vor Fälligkeit erfolgte (kein Verzug). */
  noDefault: boolean;
}

const MS_PER_DAY_LOCAL = 24 * 60 * 60 * 1000;
const B2B_LUMP_SUM_EUR = 40;
const B2B_SURCHARGE_POINTS = 9;
const B2C_SURCHARGE_POINTS = 5;

/**
 * Berechnet Tage zwischen Fälligkeit und Stichtag (kalendergenau).
 * Erster Verzugstag = Tag nach Fälligkeit (§187 BGB). Tag der Zahlung
 * wird mitgezählt → bei asOf=dueDate+1 → 1 Tag.
 */
function daysSince(dueDate: Date, asOf: Date): number {
  // Auf UTC-Mitternacht normalisieren, damit Zeitzonen/DST keinen Mist machen.
  const due = Date.UTC(
    dueDate.getUTCFullYear(),
    dueDate.getUTCMonth(),
    dueDate.getUTCDate(),
  );
  const at = Date.UTC(
    asOf.getUTCFullYear(),
    asOf.getUTCMonth(),
    asOf.getUTCDate(),
  );
  const diffDays = Math.floor((at - due) / MS_PER_DAY_LOCAL);
  return Math.max(0, diffDays);
}

/**
 * Hauptfunktion: berechnet Verzugszinsen nach §288 BGB.
 *
 * Annahmen:
 *  - 365-Tage-Bankjahr (kalendergenau, nicht das Bankjahr 30/360)
 *  - Verzugsbeginn am Tag nach Fälligkeit (§187 BGB Berechnung)
 *  - Bei B2B: 40€-Pauschale EINMALIG (nicht pro Mahnstufe)
 */
export function computeDefaultInterest(
  input: ComputeInterestInput,
): ComputeInterestResult {
  const daysOverdue = daysSince(input.dueDate, input.asOf);

  if (daysOverdue === 0 || input.principal <= 0) {
    return {
      daysOverdue: 0,
      effectiveRatePercent: 0,
      interestAmount: 0,
      lumpSumEur: 0,
      totalEur: 0,
      noDefault: true,
    };
  }

  const surcharge = input.isBusinessCustomer
    ? B2B_SURCHARGE_POINTS
    : B2C_SURCHARGE_POINTS;
  const effectiveRatePercent = round3(input.baseRatePercent + surcharge);

  // Zinsen = Hauptforderung × Satz/100 × Tage/365
  const interest = (input.principal * effectiveRatePercent * daysOverdue) / 100 / 365;
  const interestAmount = round2(interest);

  const lumpSumEur =
    input.isBusinessCustomer && !input.lumpSumAlreadyApplied ? B2B_LUMP_SUM_EUR : 0;

  return {
    daysOverdue,
    effectiveRatePercent,
    interestAmount,
    lumpSumEur,
    totalEur: round2(interestAmount + lumpSumEur),
    noDefault: false,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
