/**
 * Bank-Match Skonto-Toleranz (Phase 18, D10).
 *
 * Vorher: Bank-Matcher verlangte exakte Cent-Übereinstimmung
 * (`Math.round(txAmount * 100) === Math.round(inv.grossAmount * 100)`).
 * Ein Eingang von 98 € auf eine 100 €-Rechnung wurde NICHT gematcht, obwohl
 * 2% Skonto innerhalb der Skonto-Frist galten — der User musste manuell zuordnen.
 *
 * Jetzt: zwei Toleranz-Pfade:
 *  1. Rundungs-Toleranz: Differenz ≤ tenantSettings.bankMatchToleranceEur (default 0.02€)
 *     → Match akzeptiert, matchVariance gespeichert.
 *  2. Skonto-Toleranz: Differenz = Skonto-Betrag UND Zahlung innerhalb Skonto-Frist
 *     → Match akzeptiert, matchedSkontoAmount + matchVariance gespeichert.
 *
 * Die Skonto-Frist ist invoice.skontoDeadline (gesetzt vom Skonto-Modul beim Versand).
 */

/** @deprecated pro Tenant via tenantSettings.bankMatchToleranceEur. */
export const DEFAULT_ROUNDING_TOLERANCE_EUR = 0.02;

export interface SkontoMatchInput {
  /** Zahlungsbetrag aus der Bank-Transaktion. */
  txAmount: number;
  /** Buchungsdatum der Bank-Transaktion. */
  txDate: Date;
  /** Rechnungs-Brutto. */
  grossAmount: number;
  /** Skonto-Frist (null wenn kein Skonto vereinbart). */
  skontoDeadline: Date | null;
  /** Skonto-Betrag (in EUR). null wenn nicht vorberechnet. */
  skontoAmount: number | null;
  /** Skonto-Prozent (für Fallback wenn skontoAmount null). */
  skontoPercent: number | null;
  /** Rundungs-Toleranz (Default 0.02€). */
  toleranceEur?: number;
}

export interface SkontoMatchResult {
  matches: boolean;
  /** Reason für Logs/UI: "exact" | "tolerance" | "skonto" | "no-match" */
  reason: "exact" | "tolerance" | "skonto" | "no-match";
  /** Akzeptierter Skonto-Betrag (0 wenn kein Skonto-Pfad). */
  skontoAmount: number;
  /** Differenz |txAmount − grossAmount|. */
  variance: number;
}

/**
 * Berechnet, ob eine Bank-Transaktion zu einer Rechnung passt — mit
 * Toleranz für Rundung und gültigem Skonto.
 */
export function evaluateSkontoMatch(input: SkontoMatchInput): SkontoMatchResult {
  const tolerance = input.toleranceEur ?? DEFAULT_ROUNDING_TOLERANCE_EUR;

  const variance = round2(Math.abs(input.txAmount - input.grossAmount));

  // Pfad 1: exakter Match
  if (variance < 0.005) {
    return {
      matches: true,
      reason: "exact",
      skontoAmount: 0,
      variance: 0,
    };
  }

  // Pfad 2: innerhalb Rundungs-Toleranz
  if (variance <= tolerance) {
    return {
      matches: true,
      reason: "tolerance",
      skontoAmount: 0,
      variance,
    };
  }

  // Pfad 3: Skonto-Match (nur wenn Frist gewahrt UND Betrag plausibel zu Skonto passt)
  if (input.skontoDeadline && input.txDate <= input.skontoDeadline) {
    // Erlaubter Skonto-Betrag: entweder explizit gesetzt oder über Prozent berechnet.
    let allowedSkonto = input.skontoAmount ?? 0;
    if (allowedSkonto === 0 && input.skontoPercent !== null && input.skontoPercent > 0) {
      allowedSkonto = round2((input.grossAmount * input.skontoPercent) / 100);
    }

    if (allowedSkonto > 0) {
      // Akzeptiere wenn txAmount = gross − allowedSkonto (innerhalb Cent-Toleranz)
      const expectedAfterSkonto = round2(input.grossAmount - allowedSkonto);
      const skontoVariance = round2(Math.abs(input.txAmount - expectedAfterSkonto));
      if (skontoVariance <= tolerance) {
        return {
          matches: true,
          reason: "skonto",
          skontoAmount: allowedSkonto,
          variance,
        };
      }
    }
  }

  return {
    matches: false,
    reason: "no-match",
    skontoAmount: 0,
    variance,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
