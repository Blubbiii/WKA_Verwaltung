/**
 * AfA & GWG nach §7/§6 EStG — Pure-Funktionen (Phase 14).
 *
 * Kein Prisma-Zugriff hier — die Berechnungslogik ist vollständig testbar
 * und wird vom runDepreciation()-Driver aufgerufen.
 *
 * Methoden:
 *   LINEAR (§7 Abs. 1 EStG)
 *     Monatlich = Anschaffungskosten / Nutzungsdauer (in Monaten).
 *     Pro-rata-temporis: im Anschaffungsmonat voller Monatsbetrag,
 *     im Abgangsmonat kein Betrag. (§7 Abs. 1 S. 4 EStG, R 7.4 EStR)
 *
 *   GWG_SOFORT (§6 Abs. 2 EStG, Schwelle 800 € netto)
 *     Vollabschreibung im Anschaffungsmonat. Folgemonate: 0.
 *
 *   GWG_POOL (§6 Abs. 2a EStG, 250-1.000 € netto, 5 Jahre Pool)
 *     20% des Pool-Volumens pro Jahr (= 1/60 monatlich, oder 1/5 jährlich).
 *     Pool startet im Jahr der Anschaffung und läuft 5 volle Jahre.
 *
 *   DECLINING_BALANCE (§7 Abs. 2 EStG — degressive AfA)
 *     Seit 01.01.2023 für NEUE Anschaffungen NICHT mehr zulässig
 *     (Übergangsregel §52 Abs. 14a EStG). Engine wirft DegressiveNotAllowedError
 *     wenn ein Asset mit Anschaffungsdatum ≥ 2023-01-01 diese Methode hat.
 *     Für Altanlagen wird sie weiter unterstützt.
 *
 * Berechnungs-Konvention:
 *   - Monatsindex ist 1-basiert (1=Januar, 12=Dezember).
 *   - Anschaffungsmonat zählt als voller Monat (auch wenn Anschaffung am Letzten).
 *   - Abgangsmonat zählt NICHT mehr (selbst wenn Abgang am Ersten).
 *   - Rundung auf 2 Nachkommastellen am Ende jeder Monatsberechnung.
 */

import { AfaMethod } from "@prisma/client";
import type { AfaSystemConfig } from "@/lib/system-settings";

/** Wird geworfen, wenn DECLINING_BALANCE auf ein post-2023-Asset angewandt wird. */
export class DegressiveNotAllowedError extends Error {
  constructor(public readonly acquisitionDate: Date) {
    super(
      `Degressive AfA ist seit 2023 für Neuanschaffungen unzulässig (§7 Abs. 2 EStG). Asset wurde ${acquisitionDate.toISOString().slice(0, 10)} angeschafft.`,
    );
    this.name = "DegressiveNotAllowedError";
  }
}

/**
 * Default-Werte (Rechtsstand 01.06.2026). Werden überschrieben durch
 * SystemSetting-Werte sobald Super-Admin sie ändert.
 *
 * @deprecated Verwende loadAfaConfig() aus @/lib/system-settings für aktuelle Werte
 */
export const GWG_SOFORT_THRESHOLD_NET_EUR = 800;
/** @deprecated siehe oben */
export const GWG_POOL_LOWER_NET_EUR = 250;
/** @deprecated siehe oben */
export const GWG_POOL_UPPER_NET_EUR = 1000;
/** @deprecated siehe oben */
export const GWG_POOL_YEARS = 5;
/** @deprecated siehe oben */
export const DEGRESSIVE_CUTOFF = new Date("2023-01-01T00:00:00.000Z");

/** Default-Config für pure-Funktionen — wenn Caller keine SystemConfig übergibt. */
export const DEFAULT_AFA_CONFIG: AfaSystemConfig = {
  gwgSofortThresholdEur: GWG_SOFORT_THRESHOLD_NET_EUR,
  gwgPoolLowerEur: GWG_POOL_LOWER_NET_EUR,
  gwgPoolUpperEur: GWG_POOL_UPPER_NET_EUR,
  gwgPoolYears: GWG_POOL_YEARS,
  degressiveCutoff: DEGRESSIVE_CUTOFF,
};

export interface AfaInput {
  acquisitionDate: Date;
  acquisitionCost: number;
  residualValue: number;
  usefulLifeMonths: number;
  method: AfaMethod;
  /** Optional: bisher angefallene AfA-Summe (zur Buchwert-Berechnung). */
  alreadyDepreciated: number;
  /** Optional: Abgangsdatum (Verkauf/Verschrottung). */
  disposalDate?: Date | null;
}

export interface MonthlyAfaResult {
  /** AfA-Betrag für den Monat (auf 2 NK gerundet, ≥ 0). */
  amount: number;
  /** Buchwert vor dieser Monatsbuchung. */
  bookValueBefore: number;
  /** Buchwert nach dieser Monatsbuchung. */
  bookValueAfter: number;
  /** True wenn dieser Monat die letzte AfA-Periode war (Restwert erreicht oder Pool ausgelaufen). */
  fullyDepreciated: boolean;
}

/**
 * Helper: Anzahl der vollen Monate zwischen zwei Daten, monats-basiert
 * (Tag wird ignoriert). Anschaffung 2024-03-15 → 2024-04 = 1 Monat AFTER.
 */
function monthDiff(from: Date, to: Date): number {
  const yearDiff = to.getUTCFullYear() - from.getUTCFullYear();
  const monthDiff = to.getUTCMonth() - from.getUTCMonth();
  return yearDiff * 12 + monthDiff;
}

/**
 * Gibt zurück, ob (year, month) zeitlich vor dem Anschaffungsmonat liegt.
 * Im Anschaffungsmonat selbst beginnt die AfA → return false.
 */
function isBeforeAcquisition(year: number, month: number, acquisition: Date): boolean {
  const acqYear = acquisition.getUTCFullYear();
  const acqMonth = acquisition.getUTCMonth() + 1;
  return year < acqYear || (year === acqYear && month < acqMonth);
}

/**
 * Gibt zurück, ob (year, month) im oder nach dem Abgangsmonat liegt.
 * Abgangsmonat zählt nicht mehr → wenn disposal-month === month → true.
 */
function isAfterDisposal(
  year: number,
  month: number,
  disposal: Date | null | undefined,
): boolean {
  if (!disposal) return false;
  const disYear = disposal.getUTCFullYear();
  const disMonth = disposal.getUTCMonth() + 1;
  return year > disYear || (year === disYear && month >= disMonth);
}

/**
 * Berechnet die AfA für genau EINEN Monat eines Assets.
 *
 * Logik:
 *  - Vor Anschaffungsmonat / im Abgangsmonat → 0
 *  - GWG_SOFORT im Anschaffungsmonat → kompletter AK-Restwert
 *  - GWG_POOL → AK/5/12 pro Monat über 60 Monate ab Anschaffung
 *  - LINEAR → (AK-Rest)/Nutzungsdauer; cap auf verfügbaren Restwert
 *  - DECLINING_BALANCE → 2×linear-rate, gedeckelt 30%, auf Buchwert
 *
 * Wirft DegressiveNotAllowedError wenn DECLINING_BALANCE + Anschaffung ≥ 2023.
 */
export function calculateMonthlyAfa(
  input: AfaInput,
  year: number,
  month: number, // 1-12
  config: AfaSystemConfig = DEFAULT_AFA_CONFIG,
): MonthlyAfaResult {
  const {
    acquisitionDate,
    acquisitionCost,
    residualValue,
    usefulLifeMonths,
    method,
    alreadyDepreciated,
    disposalDate,
  } = input;

  if (method === AfaMethod.DECLINING_BALANCE && acquisitionDate >= config.degressiveCutoff) {
    throw new DegressiveNotAllowedError(acquisitionDate);
  }

  const bookValueBefore = round2(acquisitionCost - alreadyDepreciated);

  // Vor Anschaffung oder im/nach Abgangsmonat → 0
  if (
    isBeforeAcquisition(year, month, acquisitionDate) ||
    isAfterDisposal(year, month, disposalDate)
  ) {
    return {
      amount: 0,
      bookValueBefore,
      bookValueAfter: bookValueBefore,
      fullyDepreciated: bookValueBefore <= residualValue,
    };
  }

  // Verfügbarer Restbetrag = Buchwert - Restwert
  const available = round2(bookValueBefore - residualValue);
  if (available <= 0) {
    return {
      amount: 0,
      bookValueBefore,
      bookValueAfter: bookValueBefore,
      fullyDepreciated: true,
    };
  }

  let amount = 0;
  switch (method) {
    case AfaMethod.GWG_SOFORT: {
      // Voller Restwert im Anschaffungsmonat.
      const isAcqMonth =
        year === acquisitionDate.getUTCFullYear() &&
        month === acquisitionDate.getUTCMonth() + 1;
      amount = isAcqMonth ? available : 0;
      break;
    }

    case AfaMethod.GWG_POOL: {
      // Sammelposten: AK / (poolYears * 12) pro Monat, läuft N Jahre ab Anschaffung.
      const monthsSinceAcq = monthDiff(acquisitionDate, new Date(Date.UTC(year, month - 1, 1)));
      if (monthsSinceAcq < 0 || monthsSinceAcq >= config.gwgPoolYears * 12) {
        amount = 0;
      } else {
        const monthlyPool = (acquisitionCost - residualValue) / (config.gwgPoolYears * 12);
        amount = Math.min(monthlyPool, available);
      }
      break;
    }

    case AfaMethod.LINEAR: {
      if (usefulLifeMonths <= 0) {
        amount = 0;
      } else {
        const monthly = (acquisitionCost - residualValue) / usefulLifeMonths;
        amount = Math.min(monthly, available);
      }
      break;
    }

    case AfaMethod.DECLINING_BALANCE: {
      if (usefulLifeMonths <= 0) {
        amount = 0;
      } else {
        const linearRate = 12 / usefulLifeMonths; // pro Jahr
        const decliningRate = Math.min(linearRate * 2, 0.3);
        const monthlyAmount = (bookValueBefore * decliningRate) / 12;
        amount = Math.min(monthlyAmount, available);
      }
      break;
    }
  }

  amount = round2(Math.max(0, amount));
  const bookValueAfter = round2(bookValueBefore - amount);
  const fullyDepreciated = bookValueAfter <= residualValue + 0.001;

  return {
    amount,
    bookValueBefore,
    bookValueAfter,
    fullyDepreciated,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Iteriert alle Monate zwischen periodStart und periodEnd (inkl.) und
 * gibt die Liste an MonthlyAfaResult zurück. Akkumuliert alreadyDepreciated
 * Schritt für Schritt.
 *
 * Wird vom runDepreciation()-Driver verwendet um den Schedule für einen
 * Zeitraum aufzubauen.
 */
export function calculateAfaSchedule(
  baseInput: Omit<AfaInput, "alreadyDepreciated"> & { alreadyDepreciated: number },
  periodStart: Date,
  periodEnd: Date,
  config: AfaSystemConfig = DEFAULT_AFA_CONFIG,
): Array<{ year: number; month: number; result: MonthlyAfaResult }> {
  const results: Array<{ year: number; month: number; result: MonthlyAfaResult }> = [];
  let runningDepreciated = baseInput.alreadyDepreciated;

  const startYear = periodStart.getUTCFullYear();
  const startMonth = periodStart.getUTCMonth() + 1;
  const endYear = periodEnd.getUTCFullYear();
  const endMonth = periodEnd.getUTCMonth() + 1;

  let year = startYear;
  let month = startMonth;

  while (year < endYear || (year === endYear && month <= endMonth)) {
    const result = calculateMonthlyAfa(
      { ...baseInput, alreadyDepreciated: runningDepreciated },
      year,
      month,
      config,
    );
    results.push({ year, month, result });
    runningDepreciated = round2(runningDepreciated + result.amount);

    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }

  return results;
}

/**
 * Bestimmt die effektive AfA-Methode aus dem FixedAsset.
 * Backwards-Compat: wenn afaMethod nicht gesetzt, mappt von depreciationMethod.
 */
export function resolveAfaMethod(asset: {
  afaMethod: AfaMethod | null;
  depreciationMethod: "LINEAR" | "DECLINING_BALANCE";
}): AfaMethod {
  if (asset.afaMethod !== null) return asset.afaMethod;
  return asset.depreciationMethod === "DECLINING_BALANCE"
    ? AfaMethod.DECLINING_BALANCE
    : AfaMethod.LINEAR;
}
