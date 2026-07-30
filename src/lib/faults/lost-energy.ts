/**
 * Bewerteter Ertragsausfall einer Störung.
 *
 * Fehlende Funktion A1 (Audit 2026-07): Die Störungs*daten* sind vollständig da
 * (`ScadaStateEvent`, `ScadaStatusCode`, `ScadaAvailability` mit t1–t6), die
 * Aus*wertung* auch. Es fehlt der **Vorgang** — und darin vor allem der
 * bezifferte Ausfall. Heute wird er geschätzt oder gar nicht beziffert, und
 * damit verjähren Ansprüche gegen den Hersteller unbemerkt.
 *
 * ## Verfahren: Referenzanlagen
 *
 * Der Ertragsausfall einer Anlage lässt sich nicht messen — er ist die Differenz
 * zu dem, was sie ohne Störung produziert hätte. Diese Datei bildet das
 * branchenübliche Referenzanlagen-Verfahren ab:
 *
 *   1. Andere Anlagen desselben Parks im selben Zeitfenster heranziehen.
 *   2. Deren spezifische Produktion bilden (kWh je kW Nennleistung).
 *   3. Mit der Nennleistung der gestörten Anlage hochrechnen — das ist die
 *      Erwartung.
 *   4. Ausfall = Erwartung − tatsächliche Produktion der gestörten Anlage.
 *
 * Der Windpark steht im selben Wind; die Nennleistung normiert unterschiedliche
 * Anlagengrößen. Für einen Anspruch gegen den Hersteller ist das die Rechnung,
 * die er nachvollziehen kann.
 *
 * ## Was diese Datei bewusst NICHT tut
 *
 * **Sie rät nicht.** Gibt es keine brauchbare Referenz, liefert sie `null` mit
 * Begründung statt einer Zahl. Ein erfundener Ausfall in einer Forderung gegen
 * den Hersteller ist schlimmer als gar keiner: er fällt beim ersten
 * Nachrechnen auf und beschädigt die Verhandlungsposition.
 *
 * **Sie glättet nicht.** Referenzanlagen, die im selben Fenster selbst gestört
 * oder abgeregelt waren, müssen der Aufrufer ausschliessen. Nähme man sie mit,
 * fiele die Erwartung zu niedrig aus und der Ausfall würde **zu klein**
 * ausgewiesen — der Fehler ginge also immer zu Lasten des Anspruchstellers.
 */

/** Ein 10-Minuten-Wert, wie ihn ScadaMeasurement liefert. */
export interface PowerSample {
  timestamp: Date;
  /** Mittlere Leistung des Intervalls in Watt. `null` = keine Messung. */
  powerW: number | null;
}

export interface TurbineSeries {
  turbineId: string;
  /** Nennleistung in kW. Ohne sie lässt sich nicht normieren. */
  ratedPowerKw: number;
  samples: PowerSample[];
}

export type LostEnergyMethod = "REFERENCE_TURBINE" | "MANUAL";

export interface LostEnergyResult {
  method: LostEnergyMethod;
  /** Ausfall in kWh. Nie negativ — siehe Kommentar unten. */
  lostKwh: number;
  /** Was die Anlage ohne Störung produziert hätte. */
  expectedKwh: number;
  /** Was sie tatsächlich produziert hat. */
  actualKwh: number;
  referenceTurbineIds: string[];
  /** Wie viele Intervalle in die Rechnung eingegangen sind. */
  intervalCount: number;
  /**
   * Hinweise, die den Wert nicht ungültig machen, aber die Belastbarkeit
   * einschränken — gehören in die Akte und vor die Augen des Bearbeiters.
   */
  warnings: string[];
}

export interface LostEnergyFailure {
  method: null;
  /** Warum sich nichts berechnen ließ. Kein Ersatzwert. */
  reason: string;
}

/** Wie viele Intervalle mindestens vorliegen müssen, damit die Zahl etwas taugt. */
const MIN_INTERVALS = 3;

/**
 * Anteil der Intervalle, den eine Referenzanlage mindestens abdecken muss.
 * Eine Anlage mit drei Messwerten in einem Ausfall von zwei Tagen verzerrt
 * den Mittelwert, statt ihn zu stützen.
 */
const MIN_REFERENCE_COVERAGE = 0.5;

export function computeLostEnergy(input: {
  affected: TurbineSeries;
  references: TurbineSeries[];
  /** Länge eines Messintervalls in Minuten. SCADA liefert 10. */
  intervalMinutes: number;
}): LostEnergyResult | LostEnergyFailure {
  const { affected, references, intervalMinutes } = input;

  if (intervalMinutes <= 0) {
    return { method: null, reason: "Ungültige Intervalllänge" };
  }
  if (!(affected.ratedPowerKw > 0)) {
    return {
      method: null,
      reason: "Nennleistung der gestörten Anlage fehlt — ohne sie lässt sich nicht hochrechnen",
    };
  }

  const affectedIntervals = affected.samples.filter((s) => s.powerW !== null).length;
  if (affectedIntervals < MIN_INTERVALS) {
    return {
      method: null,
      reason: `Zu wenige Messwerte der gestörten Anlage (${affectedIntervals})`,
    };
  }

  const warnings: string[] = [];

  // Referenzen aussortieren, die nichts beitragen können.
  const usable: TurbineSeries[] = [];
  for (const reference of references) {
    if (!(reference.ratedPowerKw > 0)) {
      warnings.push(`Referenz ${reference.turbineId} ohne Nennleistung — nicht verwendet`);
      continue;
    }
    const measured = reference.samples.filter((s) => s.powerW !== null).length;
    if (measured / affectedIntervals < MIN_REFERENCE_COVERAGE) {
      warnings.push(
        `Referenz ${reference.turbineId} deckt nur ${measured} von ${affectedIntervals} Intervallen ab — nicht verwendet`,
      );
      continue;
    }
    usable.push(reference);
  }

  if (usable.length === 0) {
    return {
      method: null,
      reason:
        "Keine verwendbare Referenzanlage im Zeitraum — Ausfall bitte manuell beziffern und begründen",
    };
  }
  if (usable.length === 1) {
    // Eine einzelne Referenz trägt jeden ihrer eigenen Sondereffekte voll in
    // das Ergebnis. Das ist kein Ausschlussgrund, aber der Bearbeiter soll es
    // wissen, bevor er die Zahl an den Hersteller schickt.
    warnings.push("Nur eine Referenzanlage verfügbar — Ergebnis entsprechend unsicher");
  }

  const actualKwh = integrate(affected.samples, intervalMinutes);

  // Spezifische Produktion je Referenz, dann Mittel über die Referenzen.
  // Bewusst NICHT die Summe aller Referenzenergie durch die Summe aller
  // Nennleistungen: dann bestimmte die größte Anlage das Ergebnis fast allein.
  const specificYields = usable.map(
    (reference) => integrate(reference.samples, intervalMinutes) / reference.ratedPowerKw,
  );
  const meanSpecificYield =
    specificYields.reduce((sum, value) => sum + value, 0) / specificYields.length;

  const expectedKwh = meanSpecificYield * affected.ratedPowerKw;

  // Negative Differenz heisst: die gestörte Anlage lief besser als der Park.
  // Dann gab es in diesem Fenster keinen Ausfall — eine negative Forderung
  // wäre Unsinn. Der Fall ist real (Teilstörung, oder das Fenster ist zu weit
  // gewählt) und wird als Hinweis sichtbar gemacht statt weggerundet.
  const difference = expectedKwh - actualKwh;
  if (difference < 0) {
    warnings.push(
      "Die betroffene Anlage lag über dem Parkmittel — im gewählten Zeitraum kein Ausfall nachweisbar",
    );
  }

  return {
    method: "REFERENCE_TURBINE",
    lostKwh: round3(Math.max(0, difference)),
    expectedKwh: round3(expectedKwh),
    actualKwh: round3(actualKwh),
    referenceTurbineIds: usable.map((reference) => reference.turbineId),
    intervalCount: affectedIntervals,
    warnings,
  };
}

/**
 * Zehnminuten-Leistungswerte zu Energie aufsummieren.
 *
 * SCADA liefert die MITTLERE Leistung des Intervalls — die Energie ist damit
 * Leistung × Intervalldauer. Fehlende Werte zählen als 0 und nicht als
 * „übersprungen": ein Intervall ohne Messung ist bei einer stehenden Anlage
 * genau das, ein Intervall ohne Ertrag.
 */
function integrate(samples: PowerSample[], intervalMinutes: number): number {
  const hours = intervalMinutes / 60;
  let wattHours = 0;
  for (const sample of samples) {
    if (sample.powerW === null) continue;
    // Negative Leistung (Eigenverbrauch bei Stillstand) mitzählen: sie ist real
    // und mindert den Ertrag.
    wattHours += sample.powerW * hours;
  }
  return wattHours / 1000;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Ausfall in Euro bewerten.
 *
 * Bewusst getrennt von der kWh-Rechnung: der Mengenausfall ist eine technische
 * Feststellung, die Bewertung eine kaufmännische. Ändert sich der Satz, ändert
 * sich nicht die Feststellung.
 */
export function valuateLostEnergy(lostKwh: number, ratePerKwh: number): number {
  return Math.round(lostKwh * ratePerKwh * 100) / 100;
}
