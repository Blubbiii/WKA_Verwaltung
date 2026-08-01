/**
 * Alter, Garantie und Restnutzungsdauer einer Grosskomponente.
 *
 * B3 (Audit 2026-07): „0 Treffer für Ersatzteil/Komponente." Getriebe,
 * Generator, Rotorblätter und Trafo standen als Freitext im `ServiceEvent`
 * oder im `technicalData`-Json.
 *
 * ## Was „Restnutzungsdauer" hier heisst — und was nicht
 *
 * Die Zahl kommt aus der **Auslegungslebensdauer** des Herstellers, also aus
 * einer Planungsannahme. Sie ist keine Vorhersage: ein Getriebe kann im
 * siebten Jahr ausfallen und im fünfundzwanzigsten noch laufen. Sie taugt für
 * die Investitionsplanung und für die Frage „was steht in den nächsten fünf
 * Jahren an" — nicht für „wann fällt es aus".
 *
 * Deshalb heisst das Feld `plannedRemainingYears` und nicht `remainingLife`,
 * und deshalb liefert diese Datei `null` statt einer Schätzung, wenn die
 * Auslegungsdauer fehlt. Eine erfundene Restlebensdauer landet sonst in einer
 * Rückstellung oder in einem Bankgespräch.
 */

import { DAYS_PER_YEAR_AVERAGE } from "@/lib/constants/time";

export interface ComponentLifetimeInput {
  installedAt: Date | null;
  /** Ausbau. Gesetzt = die Komponente ist historisch. */
  removedAt: Date | null;
  /** Auslegungslebensdauer in Jahren laut Hersteller. */
  designLifeYears: number | null;
  warrantyEndDate: Date | null;
}

export interface ComponentLifetime {
  /** Betriebsalter in Jahren, auf zwei Stellen. `null` ohne Einbaudatum. */
  ageYears: number | null;
  /**
   * Rechnerische Restdauer bis zum Ende der Auslegungslebensdauer.
   * `null`, wenn Einbaudatum oder Auslegungsdauer fehlen — NICHT 0.
   */
  plannedRemainingYears: number | null;
  /** Verbrauchter Anteil der Auslegungsdauer, 0–1+. Kann über 1 liegen. */
  consumedRatio: number | null;
  warranty: "ACTIVE" | "EXPIRED" | "NONE";
  /** Tage bis zum Garantieende. Negativ = abgelaufen. */
  warrantyDaysLeft: number | null;
  /** Ausgebaut — dann sind die übrigen Werte Stand des Ausbaus. */
  isHistorical: boolean;
  /** Hinweise, die in der Ansicht stehen müssen. */
  notes: string[];
}

/** Vorlauf, ab dem ein Garantieablauf gemeldet wird. */
export const WARRANTY_WARN_DAYS = 180;

/**
 * Ab diesem verbrauchten Anteil gilt die Komponente als planungsrelevant.
 * 80 % ist der übliche Punkt, an dem ein Ersatz budgetiert wird — bewusst
 * eine Konstante mit Namen und keine Zahl irgendwo in einer Bedingung.
 */
export const PLANNING_THRESHOLD = 0.8;

// Alter und verbrauchte Lebensdauer sind Zeitraeume ueber viele Jahre — hier
// ist der Mittelwert mit Schaltjahren richtig, siehe @/lib/constants/time.
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_YEAR = DAYS_PER_YEAR_AVERAGE;

export function computeLifetime(
  input: ComponentLifetimeInput,
  referenceDate: Date,
): ComponentLifetime {
  const notes: string[] = [];
  const isHistorical = input.removedAt !== null;

  // Bei einer ausgebauten Komponente zählt der Stand des Ausbaus, nicht heute.
  // Sonst altert ein 2015 getauschtes Getriebe in der Historie weiter.
  const asOf = input.removedAt ?? referenceDate;

  if (!input.installedAt) {
    notes.push("Kein Einbaudatum erfasst — Alter und Restdauer nicht ermittelbar.");
    return {
      ageYears: null,
      plannedRemainingYears: null,
      consumedRatio: null,
      ...warrantyState(input.warrantyEndDate, referenceDate, notes),
      isHistorical,
      notes,
    };
  }

  const ageDays = Math.max(0, (startOfDay(asOf).getTime() - startOfDay(input.installedAt).getTime()) / MS_PER_DAY);
  const ageYears = round2(ageDays / DAYS_PER_YEAR);

  let plannedRemainingYears: number | null = null;
  let consumedRatio: number | null = null;

  if (input.designLifeYears && input.designLifeYears > 0) {
    consumedRatio = round4(ageYears / input.designLifeYears);
    plannedRemainingYears = round2(input.designLifeYears - ageYears);

    if (plannedRemainingYears <= 0 && !isHistorical) {
      notes.push(
        `Die Auslegungslebensdauer von ${input.designLifeYears} Jahren ist rechnerisch erreicht. Das ist eine Planungsgrösse, keine Ausfallprognose — die Komponente kann weiterlaufen.`,
      );
    } else if (consumedRatio >= PLANNING_THRESHOLD && !isHistorical) {
      notes.push(
        `${Math.round(consumedRatio * 100)} % der Auslegungslebensdauer verbraucht — für die Ersatzbeschaffung einplanen.`,
      );
    }
  } else {
    // Kein Schätzwert. Eine erfundene Restlebensdauer landet sonst in einer
    // Rückstellung oder in einem Bankgespräch.
    notes.push(
      "Keine Auslegungslebensdauer hinterlegt — die Restdauer wird nicht geschätzt.",
    );
  }

  return {
    ageYears,
    plannedRemainingYears,
    consumedRatio,
    ...warrantyState(input.warrantyEndDate, referenceDate, notes),
    isHistorical,
    notes,
  };
}

function warrantyState(
  warrantyEndDate: Date | null,
  referenceDate: Date,
  notes: string[],
): Pick<ComponentLifetime, "warranty" | "warrantyDaysLeft"> {
  if (!warrantyEndDate) {
    // Ausdrücklich NONE und nicht EXPIRED: „keine Garantie erfasst" ist etwas
    // anderes als „Garantie abgelaufen", und der Unterschied entscheidet, ob
    // jemand nachschauen muss.
    return { warranty: "NONE", warrantyDaysLeft: null };
  }

  const daysLeft = Math.floor(
    (startOfDay(warrantyEndDate).getTime() - startOfDay(referenceDate).getTime()) / MS_PER_DAY,
  );

  if (daysLeft < 0) {
    return { warranty: "EXPIRED", warrantyDaysLeft: daysLeft };
  }

  if (daysLeft <= WARRANTY_WARN_DAYS) {
    notes.push(
      `Die Gewährleistung läuft in ${daysLeft} Tagen ab. Bekannte Mängel vorher anzeigen — danach trägt sie der Betreiber.`,
    );
  }

  return { warranty: "ACTIVE", warrantyDaysLeft: daysLeft };
}

/**
 * Prüft, ob die Belegung der Positionen stimmig ist.
 *
 * Eine Anlage hat drei Rotorblätter und ein Getriebe. Zwei EINGEBAUTE
 * Komponenten auf derselben Position sind ein Datenfehler — meist eine
 * Ersetzung, bei der der Ausbau des alten Teils vergessen wurde. Das fällt
 * sonst erst auf, wenn die Tauschhistorie zwei Getriebe gleichzeitig zeigt.
 */
export function checkPositions(
  components: readonly {
    type: string;
    position: string | null;
    removedAt: Date | null;
  }[],
): string[] {
  const problems: string[] = [];
  const occupied = new Map<string, number>();

  for (const component of components) {
    if (component.removedAt) continue;
    // Ohne Position zählt der Typ als Position — bei einem Getriebe gibt es
    // ohnehin nur eines.
    const key = `${component.type}::${component.position ?? ""}`;
    occupied.set(key, (occupied.get(key) ?? 0) + 1);
  }

  for (const [key, count] of occupied) {
    if (count > 1) {
      const [type, position] = key.split("::");
      problems.push(
        position
          ? `${count} eingebaute Komponenten vom Typ ${type} auf Position ${position}. Wurde beim Tausch der Ausbau des alten Teils vergessen?`
          : `${count} eingebaute Komponenten vom Typ ${type} ohne Position. Wurde beim Tausch der Ausbau des alten Teils vergessen?`,
      );
    }
  }

  return problems;
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
