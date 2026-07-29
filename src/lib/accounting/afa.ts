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
 *     AK über der Schwelle → GwgThresholdViolationError.
 *
 *   GWG_POOL (§6 Abs. 2a EStG, 250-1.000 € netto, 5 Jahre Pool)
 *     1/5 des Pool-Volumens im Jahr der Bildung UND in den folgenden vier
 *     Jahren — OHNE zeitanteilige Kürzung im Bildungsjahr. Die Engine bucht
 *     monatlich, verteilt den Jahresfünftel im Bildungsjahr deshalb auf die
 *     Monate ab Anschaffung. AK außerhalb 250–1.000 € → GwgThresholdViolationError.
 *
 *   DECLINING_BALANCE (§7 Abs. 2 EStG — degressive AfA)
 *     JAHRES-AfA auf den Buchwert zu Beginn des Wirtschaftsjahres, im
 *     Anschaffungsjahr zeitanteilig. Satz = min(linear × Vervielfältiger,
 *     Höchstsatz) — beides hängt vom Anschaffungsdatum ab, siehe
 *     DEGRESSIVE_RATE_PERIODS. Pflichtübergang zur linearen AfA nach
 *     §7 Abs. 3 EStG ist implementiert.
 *     Zusätzlich gilt eine konfigurierbare Sperre (config.degressiveCutoff,
 *     default 01.01.2023): Assets ab diesem Datum werfen
 *     DegressiveNotAllowedError. ACHTUNG: die Sperre ist strenger als das
 *     Gesetz — §7 Abs. 2 EStG wurde für 04–12/2024 und 07/2025–12/2027 wieder
 *     geöffnet. Wer diese Fenster nutzen will, muss DEGRESSIVE_AFA_CUTOFF in
 *     den SystemSettings hochsetzen.
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
 * F15: Anschaffungskosten passen nicht zur gewählten GWG-Methode.
 *
 * §6 Abs. 2 / 2a EStG knüpfen beide an betragsmäßige Grenzen. Ein Asset mit
 * 50.000 € AK darf nicht als GWG_SOFORT im Anschaffungsmonat voll abgeschrieben
 * werden. Der Driver (depreciation.ts) fängt den Fehler ab, überspringt das
 * Asset und meldet es als Warnung — silent falsch rechnen wäre schlimmer.
 */
export class GwgThresholdViolationError extends Error {
  constructor(
    public readonly method: AfaMethod,
    public readonly acquisitionCost: number,
    public readonly limitDescription: string,
  ) {
    super(
      `Anschaffungskosten ${acquisitionCost.toFixed(2)} € sind für AfA-Methode ` +
        `${method} unzulässig (${limitDescription}). Bitte AfA-Methode korrigieren.`,
    );
    this.name = "GwgThresholdViolationError";
  }
}

// ---------------------------------------------------------------------------
// F13: Degressive AfA-Sätze — §7 Abs. 2 EStG in seinen Zeitfassungen
// ---------------------------------------------------------------------------

/**
 * Ein gesetzliches Zeitfenster für die degressive AfA.
 *
 * §7 Abs. 2 EStG wurde mehrfach befristet ein- und wieder ausgeschaltet, mit
 * jeweils EIGENEM Vervielfältiger und Höchstsatz. Es gibt keine Fassung mit
 * "2× linear, max. 30 %" — genau das stand aber bis Finding F13 im Code.
 *
 * Die Tabelle ist bewusst DATEN und kein Ausdruck: bei der nächsten
 * Gesetzesänderung wird hier eine Zeile ergänzt, nicht Logik angefasst.
 * Caller können über den `periods`-Parameter von resolveDegressiveRate()
 * eine abweichende Tabelle übergeben (Tests, Mandanten-Sonderfälle).
 *
 * `from`/`to` beziehen sich auf das ANSCHAFFUNGSDATUM (inklusiv, ISO yyyy-mm-dd).
 */
export interface DegressiveRatePeriod {
  from: string;
  to: string;
  /** Vervielfältiger des linearen AfA-Satzes. */
  factor: number;
  /** Höchstsatz p.a. als Dezimalzahl (0.25 = 25 %). */
  maxRate: number;
  /** Fundstelle zur Nachvollziehbarkeit. */
  source: string;
}

export const DEGRESSIVE_RATE_PERIODS: ReadonlyArray<DegressiveRatePeriod> = [
  {
    from: "2006-01-01",
    to: "2007-12-31",
    factor: 3.0,
    maxRate: 0.3,
    source: "§7 Abs. 2 EStG i.d.F. Gesetz zur steuerlichen Förderung von Wachstum und Beschäftigung",
  },
  {
    from: "2009-01-01",
    to: "2010-12-31",
    factor: 2.5,
    maxRate: 0.25,
    source: "§7 Abs. 2 EStG i.d.F. Konjunkturpaket I",
  },
  {
    from: "2020-01-01",
    to: "2022-12-31",
    factor: 2.5,
    maxRate: 0.25,
    source: "§7 Abs. 2 EStG i.d.F. Zweites Corona-Steuerhilfegesetz",
  },
  {
    from: "2024-04-01",
    to: "2024-12-31",
    factor: 2.0,
    maxRate: 0.2,
    source: "§7 Abs. 2 EStG i.d.F. Wachstumschancengesetz",
  },
  {
    from: "2025-07-01",
    to: "2027-12-31",
    factor: 3.0,
    maxRate: 0.3,
    source: "§7 Abs. 2 EStG i.d.F. Investitionssofortprogramm 2025",
  },
];

/**
 * Fallback, wenn das Anschaffungsdatum in KEIN gesetzliches Zeitfenster fällt
 * (z.B. Altbestand 2011–2019 oder Datenfehler). Bewusst die mildeste moderne
 * Fassung — lieber zu wenig degressiv als eine unzulässig hohe Abschreibung.
 * Ein Hard-Fail wäre hier falsch, weil Altbestände sonst unbuchbar würden.
 */
export const DEGRESSIVE_FALLBACK: Pick<
  DegressiveRatePeriod,
  "factor" | "maxRate" | "source"
> = {
  factor: 2.0,
  maxRate: 0.2,
  source: "Fallback — Anschaffungsdatum trifft kein gesetzliches Zeitfenster",
};

export interface ResolvedDegressiveRate {
  /** Effektiver Jahres-AfA-Satz als Dezimalzahl (0.25 = 25 % p.a.). */
  rate: number;
  factor: number;
  maxRate: number;
  source: string;
  /** False = Fallback wurde benutzt. */
  matched: boolean;
}

/**
 * Ermittelt den degressiven Jahres-AfA-Satz für ein Anschaffungsdatum.
 * Satz = min(linearer Satz × Vervielfältiger, Höchstsatz).
 */
export function resolveDegressiveRate(
  acquisitionDate: Date,
  usefulLifeMonths: number,
  periods: ReadonlyArray<DegressiveRatePeriod> = DEGRESSIVE_RATE_PERIODS,
): ResolvedDegressiveRate {
  const iso = acquisitionDate.toISOString().slice(0, 10);
  const hit = periods.find((p) => iso >= p.from && iso <= p.to);
  const { factor, maxRate, source } = hit ?? DEGRESSIVE_FALLBACK;

  const linearRate = usefulLifeMonths > 0 ? 12 / usefulLifeMonths : 0;
  return {
    rate: Math.min(linearRate * factor, maxRate),
    factor,
    maxRate,
    source,
    matched: Boolean(hit),
  };
}

/**
 * GWG-Schwellen (Geringwertige Wirtschaftsgüter) — §6 Abs. 2 + 2a EStG.
 *
 * FIXED BY LAW: alle Werte gesetzlich fix bzw. zeitgebunden (DEGRESSIVE_CUTOFF).
 * Nicht pro Tenant konfigurierbar. Bei EStG-Änderung: Werte hier anpassen.
 *
 *   800 €   = Sofortabschreibungsgrenze
 *   250 €   = Untergrenze für Pool-Abschreibung (Sammelposten)
 *   1000 €  = Obergrenze Pool
 *   5 Jahre = Pool-Abschreibungsdauer (linear)
 *
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
 *  - GWG_POOL → Jahresfünftel, im Bildungsjahr auf die Monate ab Anschaffung
 *  - LINEAR → (AK-Rest)/Nutzungsdauer, terminiert exakt nach usefulLifeMonths
 *  - DECLINING_BALANCE → Jahressatz auf Buchwert zum Jahresbeginn, /12
 *
 * Wirft DegressiveNotAllowedError wenn DECLINING_BALANCE + Anschaffung ≥ Cutoff.
 * Wirft GwgThresholdViolationError wenn AK nicht zur GWG-Methode passen.
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

  const acqYear = acquisitionDate.getUTCFullYear();
  const acqMonth = acquisitionDate.getUTCMonth() + 1;

  let amount = 0;
  switch (method) {
    case AfaMethod.GWG_SOFORT: {
      // F15: §6 Abs. 2 EStG gilt nur bis zur Sofortabschreibungsgrenze.
      // Ohne diese Prüfung wurde ein 50.000-€-Asset im Anschaffungsmonat
      // zu 100 % abgeschrieben.
      if (acquisitionCost > config.gwgSofortThresholdEur) {
        throw new GwgThresholdViolationError(
          method,
          acquisitionCost,
          `§6 Abs. 2 EStG: höchstens ${config.gwgSofortThresholdEur.toFixed(2)} € netto`,
        );
      }
      // Voller Restwert im Anschaffungsmonat.
      const isAcqMonth = year === acqYear && month === acqMonth;
      amount = isAcqMonth ? available : 0;
      break;
    }

    case AfaMethod.GWG_POOL: {
      // F15: §6 Abs. 2a EStG — Sammelposten nur für AK > Untergrenze und
      // <= Obergrenze. Alles darüber/darunter gehört in eine andere Methode.
      if (
        acquisitionCost <= config.gwgPoolLowerEur ||
        acquisitionCost > config.gwgPoolUpperEur
      ) {
        throw new GwgThresholdViolationError(
          method,
          acquisitionCost,
          `§6 Abs. 2a EStG: über ${config.gwgPoolLowerEur.toFixed(2)} € und ` +
            `höchstens ${config.gwgPoolUpperEur.toFixed(2)} € netto`,
        );
      }

      // F14: §6 Abs. 2a EStG schreibt "im Wirtschaftsjahr der Bildung und den
      // folgenden vier Wirtschaftsjahren mit jeweils einem Fünftel" vor —
      // OHNE zeitanteilige Kürzung im Jahr der Anschaffung.
      //
      // Vorher wurde AK/(5×12) ab dem Anschaffungsmonat gerechnet. Ein am
      // 20.11.2025 gebildeter 900-€-Posten brachte damit nur 30 € statt der
      // gesetzlichen 180 € in 2025 und lief bis in ein sechstes Jahr (2030).
      //
      // Die Engine bucht monatlich, deshalb wird der Jahresfünftel auf die
      // Monate des jeweiligen Jahres verteilt — im Bildungsjahr auf die
      // Monate ab Anschaffung, danach auf volle 12. Jahressumme bleibt AK/5.
      const yearIndex = year - acqYear;
      if (yearIndex < 0 || yearIndex >= config.gwgPoolYears) {
        amount = 0;
      } else {
        const annualFifth =
          (acquisitionCost - residualValue) / config.gwgPoolYears;
        const monthsInYear = yearIndex === 0 ? 13 - acqMonth : 12;
        amount = Math.min(annualFifth / monthsInYear, available);
      }
      break;
    }

    case AfaMethod.LINEAR: {
      if (usefulLifeMonths <= 0) {
        amount = 0;
        break;
      }
      // F16: die Nutzungsdauer war nie terminierend. Der Monatsbetrag wird auf
      // 2 NK gerundet, die Summe über n Monate trifft den Restwert deshalb nur
      // zufällig — bei 10.000 € / 120 Monaten blieben nach Monat 120 noch
      // 0,40 € stehen und Monat 121 erzeugte eine weitere Buchung.
      //
      // Fix: (a) harte Grenze bei usefulLifeMonths, (b) im LETZTEN Monat der
      // Nutzungsdauer den kompletten Restbetrag buchen (Ausgleichs-Cent).
      const elapsed = monthDiff(
        acquisitionDate,
        new Date(Date.UTC(year, month - 1, 1)),
      );
      if (elapsed >= usefulLifeMonths) {
        amount = 0;
        break;
      }
      const isLastMonth = elapsed === usefulLifeMonths - 1;
      if (isLastMonth) {
        amount = available;
      } else {
        const monthly = (acquisitionCost - residualValue) / usefulLifeMonths;
        amount = Math.min(monthly, available);
      }
      break;
    }

    case AfaMethod.DECLINING_BALANCE: {
      if (usefulLifeMonths <= 0) {
        amount = 0;
        break;
      }
      // F13: degressive AfA ist eine JAHRES-AfA auf den Buchwert zum Beginn
      // des Wirtschaftsjahres (§7 Abs. 2 S. 1 EStG), keine Monats-AfA auf den
      // laufend sinkenden Buchwert. Der alte Code erzeugte eine geometrische
      // Degression INNERHALB des Jahres und damit systematisch zu wenig AfA.
      // Zusätzlich fehlte der Pflichtübergang zur linearen AfA (§7 Abs. 3).
      const elapsed = monthDiff(
        acquisitionDate,
        new Date(Date.UTC(year, month - 1, 1)),
      );
      if (elapsed >= usefulLifeMonths) {
        amount = 0;
        break;
      }
      // Wie bei LINEAR (F16): im letzten Monat der Nutzungsdauer den
      // kompletten Restbetrag buchen, damit die auf 2 NK gerundeten
      // Monatsbeträge exakt auf den Restwert auslaufen.
      if (elapsed === usefulLifeMonths - 1) {
        amount = available;
        break;
      }
      const { rate } = resolveDegressiveRate(acquisitionDate, usefulLifeMonths);
      amount = Math.min(
        decliningMonthlyForYear(
          acquisitionDate,
          acquisitionCost,
          residualValue,
          usefulLifeMonths,
          rate,
          year,
        ),
        available,
      );
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
 * F13: Monatsbetrag der degressiven AfA für ein bestimmtes Kalenderjahr.
 *
 * Rechenmodell (§7 Abs. 2 EStG):
 *  - Bemessungsgrundlage ist der Buchwert zu BEGINN des Wirtschaftsjahres,
 *    nicht der laufend sinkende Buchwert. Innerhalb eines Jahres ist der
 *    Monatsbetrag deshalb konstant (= Jahresbetrag / 12).
 *  - Im Anschaffungsjahr wird zeitanteilig gekürzt (§7 Abs. 2 S. 3 i.V.m.
 *    Abs. 1 S. 4): der volle Jahresbetrag / 12 wird nur für die Monate ab
 *    Anschaffung gebucht.
 *  - §7 Abs. 3 EStG: sobald die lineare AfA auf den Restbuchwert über die
 *    Restnutzungsdauer mindestens so hoch ist wie die degressive, wird
 *    zwingend und dauerhaft linear weiter abgeschrieben. Ohne diesen
 *    Übergang erreicht das Asset rechnerisch nie den Restwert.
 *
 * Der Buchwert wird deterministisch aus AK + Anschaffungsdatum + Satz
 * rekonstruiert und NICHT aus `alreadyDepreciated` abgeleitet — sonst würden
 * sich Rundungsdifferenzen der bereits gebuchten Monate in den Satz
 * fortpflanzen. `alreadyDepreciated` wirkt beim Caller weiterhin als Deckel.
 *
 * @returns Monatsbetrag (ungerundet) für targetYear; 0 wenn außerhalb.
 */
function decliningMonthlyForYear(
  acquisitionDate: Date,
  acquisitionCost: number,
  residualValue: number,
  usefulLifeMonths: number,
  annualRate: number,
  targetYear: number,
): number {
  const acqYear = acquisitionDate.getUTCFullYear();
  const acqMonth = acquisitionDate.getUTCMonth() + 1;
  if (targetYear < acqYear) return 0;

  let bookValue = acquisitionCost;
  let remainingMonths = usefulLifeMonths;
  let switchedToLinear = false;

  for (let y = acqYear; y <= targetYear; y++) {
    if (remainingMonths <= 0) return 0;

    const depreciable = bookValue - residualValue;
    if (depreciable <= 0) return 0;

    // Monate, die in DIESEM Jahr abgeschrieben werden.
    const monthsThisYear = Math.min(
      y === acqYear ? 13 - acqMonth : 12,
      remainingMonths,
    );

    // §7 Abs. 3: Vergleich degressiv vs. linear auf Restbuchwert/Restlaufzeit.
    const linearAnnual = (depreciable / remainingMonths) * 12;
    const degressiveAnnual = bookValue * annualRate;
    if (!switchedToLinear && linearAnnual >= degressiveAnnual) {
      switchedToLinear = true;
    }

    const annual = switchedToLinear ? linearAnnual : degressiveAnnual;
    // Deckel: nie mehr als der noch abschreibbare Betrag dieses Jahres.
    const monthly = Math.min(annual / 12, depreciable / monthsThisYear);

    if (y === targetYear) return monthly;

    bookValue -= monthly * monthsThisYear;
    remainingMonths -= monthsThisYear;
  }

  return 0;
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
