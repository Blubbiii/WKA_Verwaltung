/**
 * Rückbaurückstellung — Handels- und Steuerbilanz.
 *
 * Fehlende Funktion A7 (Audit 2026-07): „Kein einziger Treffer für ‚Rückbau'
 * im gesamten Codebase." Jeder Park hat eine behördlich festgesetzte
 * Rückbausicherheit und eine Rückbaurückstellung, die jährlich fortzuschreiben
 * ist. Heute: Excel beim Steuerberater, Bürgschaft im Aktenordner.
 *
 * ## Warum zwei Rechnungen und nicht eine
 *
 * Handelsbilanz und Steuerbilanz kommen bei derselben Verpflichtung zu
 * **verschiedenen Beträgen**, und beide sind richtig:
 *
 * | | Handelsbilanz (HGB) | Steuerbilanz (EStG) |
 * |---|---|---|
 * | Bewertung | Erfüllungsbetrag — mit erwarteter Kostensteigerung (§ 253 Abs. 1 S. 2) | Wertverhältnisse am Bilanzstichtag, OHNE Steigerung (§ 6 Abs. 1 Nr. 3a lit. f EStG) |
 * | Abzinsung | Durchschnittszins der letzten sieben Jahre (§ 253 Abs. 2 S. 1) | fest 5,5 % (§ 6 Abs. 1 Nr. 3a lit. e EStG) |
 * | Ansammlung | über den Betriebszeitraum (§ 249 Abs. 1) | ebenso (§ 6 Abs. 1 Nr. 3a lit. d EStG) |
 *
 * Diese Datei rechnet beide und weist die Differenz aus — sie ist die
 * Grundlage der latenten Steuern und der häufigste Punkt, an dem eine
 * Handrechnung auseinanderfällt.
 *
 * ## Was hier NICHT passiert
 *
 * Der handelsrechtliche Abzinsungssatz wird nicht berechnet. Ihn veröffentlicht
 * die Bundesbank monatlich; er hängt von der Restlaufzeit ab. Ihn zu schätzen
 * wäre eine erfundene Bilanzgröße. Er ist ein Eingabewert — dieselbe Rolle wie
 * der Basiszinssatz bei den Verzugszinsen.
 */

/** Steuerlicher Abzinsungssatz, § 6 Abs. 1 Nr. 3a lit. e EStG. */
export const TAX_DISCOUNT_RATE_PERCENT = 5.5;

export interface ProvisionInput {
  /** Geschätzte Rückbaukosten in heutigen Preisen (Gutachten). */
  estimatedCostTodayEur: number;
  /** Jahr, für das die Rückstellung ermittelt wird (Bilanzstichtag). */
  balanceSheetYear: number;
  /** Jahr der Inbetriebnahme — Beginn der Ansammlung. */
  commissioningYear: number;
  /** Jahr des geplanten Rückbaus — Ende der Ansammlung. */
  dismantlingYear: number;
  /**
   * Erwartete jährliche Kostensteigerung in Prozent. Nur für die
   * Handelsbilanz; die Steuerbilanz rechnet ohne.
   */
  costInflationPercent: number;
  /**
   * Handelsrechtlicher Abzinsungssatz in Prozent (Bundesbank, laufzeitabhängig).
   * `null` = nicht hinterlegt; dann wird nicht abgezinst und das vermerkt.
   */
  hgbDiscountRatePercent: number | null;
  /** Rückstellung des Vorjahres, für die Ermittlung der Zuführung. */
  previousYearHgbEur?: number | null;
  previousYearTaxEur?: number | null;
}

export interface ProvisionVariant {
  /** Erfüllungsbetrag zum Rückbauzeitpunkt. */
  settlementAmountEur: number;
  /** Ansammlungsgrad zum Bilanzstichtag, 0–1. */
  accrualRatio: number;
  /** Angesammelter Betrag vor Abzinsung. */
  accruedAmountEur: number;
  /** Restlaufzeit in Jahren. */
  remainingYears: number;
  /** Angewandter Abzinsungssatz in Prozent. */
  discountRatePercent: number | null;
  /** Barwert — der Bilanzansatz. */
  provisionEur: number;
  /** Zuführung gegenüber dem Vorjahr. Negativ = Auflösung. */
  additionEur: number | null;
}

export interface ProvisionResult {
  hgb: ProvisionVariant;
  tax: ProvisionVariant;
  /** Handelsbilanz minus Steuerbilanz — Grundlage der latenten Steuern. */
  differenceEur: number;
  warnings: string[];
}

export interface ProvisionFailure {
  hgb: null;
  reason: string;
}

export function computeProvision(input: ProvisionInput): ProvisionResult | ProvisionFailure {
  const {
    estimatedCostTodayEur,
    balanceSheetYear,
    commissioningYear,
    dismantlingYear,
    costInflationPercent,
    hgbDiscountRatePercent,
    previousYearHgbEur,
    previousYearTaxEur,
  } = input;

  const warnings: string[] = [];

  if (dismantlingYear <= commissioningYear) {
    return { hgb: null, reason: "Das Rückbaujahr liegt nicht nach der Inbetriebnahme" };
  }
  if (estimatedCostTodayEur <= 0) {
    return { hgb: null, reason: "Keine geschätzten Rückbaukosten hinterlegt" };
  }
  if (balanceSheetYear < commissioningYear) {
    return {
      hgb: null,
      reason: "Der Bilanzstichtag liegt vor der Inbetriebnahme — es besteht noch keine Verpflichtung",
    };
  }

  const totalYears = dismantlingYear - commissioningYear;
  const elapsedYears = Math.min(balanceSheetYear - commissioningYear, totalYears);
  const remainingYears = Math.max(0, dismantlingYear - balanceSheetYear);

  // Ansammlung linear über den Betriebszeitraum. Nach dem geplanten
  // Rückbaujahr ist die Rückstellung voll angesammelt — sie wächst nicht
  // weiter, nur weil der Rückbau sich verzögert.
  const accrualRatio = totalYears > 0 ? elapsedYears / totalYears : 1;

  if (balanceSheetYear > dismantlingYear) {
    warnings.push(
      "Der Bilanzstichtag liegt nach dem geplanten Rückbaujahr — die Rückstellung ist voll angesammelt. Bitte den Rückbautermin prüfen.",
    );
  }

  // --- Handelsbilanz ----------------------------------------------------
  // § 253 Abs. 1 S. 2 HGB: Ansatz zum ERFÜLLUNGSBETRAG, also mit erwarteter
  // Kostensteigerung bis zum Rückbau. Das wird bei einer Handrechnung am
  // häufigsten vergessen — und macht bei 20 Jahren Restlaufzeit und 2 %
  // Steigerung fast 50 % Unterschied aus.
  const inflationFactor = Math.pow(1 + costInflationPercent / 100, remainingYears);
  const hgbSettlement = estimatedCostTodayEur * inflationFactor;
  const hgbAccrued = hgbSettlement * accrualRatio;

  let hgbProvision = hgbAccrued;
  if (hgbDiscountRatePercent === null) {
    warnings.push(
      "Kein handelsrechtlicher Abzinsungssatz hinterlegt — der Betrag ist NICHT abgezinst und damit zu hoch. Der Satz wird von der Bundesbank laufzeitabhängig veröffentlicht.",
    );
  } else if (remainingYears > 1) {
    // § 253 Abs. 2 S. 1 HGB: Abzinsung nur bei einer Restlaufzeit von mehr
    // als einem Jahr.
    hgbProvision = hgbAccrued / Math.pow(1 + hgbDiscountRatePercent / 100, remainingYears);
  }

  // --- Steuerbilanz -----------------------------------------------------
  // § 6 Abs. 1 Nr. 3a lit. f EStG: Wertverhältnisse am Bilanzstichtag — also
  // OHNE künftige Kostensteigerung. lit. e: Abzinsung fest mit 5,5 %.
  const taxSettlement = estimatedCostTodayEur;
  const taxAccrued = taxSettlement * accrualRatio;
  const taxProvision =
    remainingYears > 1
      ? taxAccrued / Math.pow(1 + TAX_DISCOUNT_RATE_PERCENT / 100, remainingYears)
      : taxAccrued;

  const hgb: ProvisionVariant = {
    settlementAmountEur: round2(hgbSettlement),
    accrualRatio: round4(accrualRatio),
    accruedAmountEur: round2(hgbAccrued),
    remainingYears,
    discountRatePercent: hgbDiscountRatePercent,
    provisionEur: round2(hgbProvision),
    additionEur:
      previousYearHgbEur === null || previousYearHgbEur === undefined
        ? null
        : round2(hgbProvision - previousYearHgbEur),
  };

  const tax: ProvisionVariant = {
    settlementAmountEur: round2(taxSettlement),
    accrualRatio: round4(accrualRatio),
    accruedAmountEur: round2(taxAccrued),
    remainingYears,
    discountRatePercent: TAX_DISCOUNT_RATE_PERCENT,
    provisionEur: round2(taxProvision),
    additionEur:
      previousYearTaxEur === null || previousYearTaxEur === undefined
        ? null
        : round2(taxProvision - previousYearTaxEur),
  };

  if (Math.abs(hgb.provisionEur - tax.provisionEur) > 0.01) {
    warnings.push(
      "Handels- und Steuerbilanz weichen ab — die Differenz ist Grundlage für latente Steuern.",
    );
  }

  return {
    hgb,
    tax,
    differenceEur: round2(hgb.provisionEur - tax.provisionEur),
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Sicherheitsleistung
// ---------------------------------------------------------------------------

export interface SecurityCheckInput {
  /** Behördlich festgesetzte Rückbausicherheit in EUR. */
  requiredSecurityEur: number;
  /** Tatsächlich gestellte Sicherheit (Bürgschaftssumme). */
  providedSecurityEur: number;
  /** Ablauf der Bürgschaft. */
  securityValidTo: Date | null;
  /** Stichtag der Prüfung. */
  referenceDate: Date;
  /** Vorlauf in Tagen, ab dem ein Ablauf gemeldet wird. */
  warnDays: number;
}

export interface SecurityCheckResult {
  /** Fehlbetrag der Sicherheit. 0 = ausreichend. */
  shortfallEur: number;
  /** Tage bis zum Ablauf. Negativ = bereits abgelaufen. */
  daysUntilExpiry: number | null;
  isExpired: boolean;
  expiresSoon: boolean;
  problems: string[];
}

/**
 * Rückbausicherheit prüfen.
 *
 * Eine abgelaufene Bürgschaft ist ein Verstoß gegen die Genehmigungsauflage —
 * und sie läuft still ab, weil niemand den Aktenordner liest. Das ist der
 * eigentliche Grund für diese Funktion.
 */
export function checkSecurity(input: SecurityCheckInput): SecurityCheckResult {
  const { requiredSecurityEur, providedSecurityEur, securityValidTo, referenceDate, warnDays } =
    input;

  const problems: string[] = [];
  const shortfall = Math.max(0, requiredSecurityEur - providedSecurityEur);

  if (shortfall > 0) {
    problems.push(
      `Die gestellte Sicherheit liegt ${shortfall.toLocaleString("de-DE", {
        minimumFractionDigits: 2,
      })} EUR unter der behördlich festgesetzten.`,
    );
  }

  let daysUntilExpiry: number | null = null;
  let isExpired = false;
  let expiresSoon = false;

  if (securityValidTo) {
    const msPerDay = 24 * 60 * 60 * 1000;
    daysUntilExpiry = Math.round(
      (startOfDay(securityValidTo).getTime() - startOfDay(referenceDate).getTime()) / msPerDay,
    );
    isExpired = daysUntilExpiry < 0;
    expiresSoon = !isExpired && daysUntilExpiry <= warnDays;

    if (isExpired) {
      problems.push(
        `Die Bürgschaft ist seit ${Math.abs(daysUntilExpiry)} Tagen abgelaufen — Verstoss gegen die Genehmigungsauflage.`,
      );
    } else if (expiresSoon) {
      problems.push(`Die Bürgschaft läuft in ${daysUntilExpiry} Tagen ab.`);
    }
  } else {
    // Keine Frist erfasst heisst nicht „unbefristet" — es heisst „ungeprüft".
    problems.push("Keine Laufzeit der Bürgschaft erfasst — ein Ablauf kann nicht überwacht werden.");
  }

  return {
    shortfallEur: round2(shortfall),
    daysUntilExpiry,
    isExpired,
    expiresSoon,
    problems,
  };
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
