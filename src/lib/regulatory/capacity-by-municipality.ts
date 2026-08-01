/**
 * Installierte Leistung je Gemeinde und Jahr.
 *
 * Grundlage für die Zerlegung des Gewerbesteuermessbetrags nach § 29 Abs. 1
 * Nr. 2 GewStG. Seit 2021 wird der Messbetrag bei Windparks zu 90 % nach der
 * installierten Leistung und zu 10 % nach den Arbeitslöhnen auf die
 * Standortgemeinden verteilt.
 *
 * ## Was diese Auswertung tut — und was ausdrücklich nicht
 *
 * Sie liefert die **Leistungskomponente**: welche Anlagen standen im
 * Erhebungszeitraum in welcher Gemeinde, und mit welcher Nennleistung.
 *
 * Sie rechnet **keine Steuer**. Weder den Messbetrag noch den
 * Zerlegungsanteil, weder Hebesatz noch Steuermesszahl. Das ist eine
 * Festlegung, keine Lücke: die Zerlegung macht der Steuerberater (Entscheidung
 * vom 01.08.2026). Die Arbeitslohn-Komponente steht ohnehin nicht im System.
 *
 * Ein Blatt, das eine Steuer ausweist, wird als Steuerberechnung gelesen. Ein
 * Blatt, das Leistung je Gemeinde ausweist, wird als das gelesen, was es ist.
 *
 * ## Warum Lücken ausgewiesen und nicht übersprungen werden
 *
 * Eine Anlage ohne Standortgemeinde einfach wegzulassen, ergäbe eine Summe,
 * die aufgeht und trotzdem falsch ist — die Anteile der übrigen Gemeinden
 * wären zu hoch. Fehlt die Zuordnung oder die Nennleistung, steht das Ergebnis
 * deshalb unter Vorbehalt und nennt die betroffenen Anlagen.
 */

/** Eine Anlage, so wie die Auswertung sie braucht. */
export interface TurbineForSplit {
  id: string;
  designation: string;
  parkName: string;
  /** Nennleistung in kW. `null`, wenn nicht erfasst. */
  ratedPowerKw: number | null;
  /** Standortgemeinde. `null`, wenn nicht zugeordnet. */
  municipalityId: string | null;
  municipalityName: string | null;
  officialKey: string | null;
  commissioningDate: Date | null;
  /**
   * Ist die Anlage aktuell in Betrieb?
   *
   * Ein Stilllegungs-DATUM gibt es im Datenmodell nicht — nur den Status. Bei
   * einer nicht mehr aktiven Anlage lässt sich deshalb nicht sagen, ob sie im
   * ausgewerteten Jahr noch stand. Für das laufende Jahr ist das folgenlos,
   * für einen zurückliegenden Erhebungszeitraum nicht.
   */
  isActive: boolean;
}

export interface MunicipalityCapacityRow {
  municipalityId: string;
  municipalityName: string;
  officialKey: string | null;
  turbineCount: number;
  totalRatedPowerKw: number;
  /** Anteil an der Gesamtleistung, 0–1. Nur über die ZUGEORDNETEN Anlagen. */
  shareOfAssigned: number;
  turbines: { id: string; designation: string; parkName: string; ratedPowerKw: number }[];
}

export interface CapacityByMunicipalityResult {
  year: number;
  rows: MunicipalityCapacityRow[];
  /** Summe der Nennleistung aller zugeordneten Anlagen mit erfasster Leistung. */
  assignedRatedPowerKw: number;
  /** Anlagen ohne Standortgemeinde — sie fehlen in JEDER Zeile oben. */
  withoutMunicipality: { id: string; designation: string; parkName: string }[];
  /** Anlagen ohne erfasste Nennleistung — sie zählen mit 0 kW. */
  withoutRatedPower: { id: string; designation: string; parkName: string }[];
  /**
   * Nicht mehr aktive Anlagen ohne Stilllegungsdatum.
   *
   * Sie sind mitgezählt, weil ihr Ausscheiden nicht datiert ist. Für das
   * laufende Jahr ist das folgenlos, für einen zurückliegenden
   * Erhebungszeitraum eine echte Unsicherheit.
   */
  inactiveWithoutDate: { id: string; designation: string; parkName: string }[];
  warnings: string[];
}

/**
 * War die Anlage im Erhebungsjahr in Betrieb?
 *
 * Maßgeblich ist die Betriebsstätte im Erhebungszeitraum. Eine im November in
 * Betrieb genommene Anlage begründet die Betriebsstätte für dieses Jahr. Der
 * Zeitanteil bleibt hier aussen vor — das ist Sache der Zerlegung selbst und
 * damit des Steuerberaters.
 *
 * Ausgeschlossen wird nur, was sicher ausgeschlossen ist: eine Anlage, die
 * nach dem Jahresende in Betrieb ging. Ohne Inbetriebnahmedatum bleibt sie
 * drin und taucht als Lücke auf, statt still zu verschwinden.
 */
export function wasOperatingInYear(turbine: TurbineForSplit, year: number): boolean {
  const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  if (turbine.commissioningDate && turbine.commissioningDate > yearEnd) return false;
  return true;
}

export function capacityByMunicipality(
  turbines: readonly TurbineForSplit[],
  year: number,
): CapacityByMunicipalityResult {
  const operating = turbines.filter((t) => wasOperatingInYear(t, year));

  const withoutMunicipality = operating
    .filter((t) => t.municipalityId === null)
    .map((t) => ({ id: t.id, designation: t.designation, parkName: t.parkName }));

  const withoutRatedPower = operating
    .filter((t) => t.municipalityId !== null && t.ratedPowerKw === null)
    .map((t) => ({ id: t.id, designation: t.designation, parkName: t.parkName }));

  const inactiveWithoutDate = operating
    .filter((t) => !t.isActive)
    .map((t) => ({ id: t.id, designation: t.designation, parkName: t.parkName }));

  const grouped = new Map<string, MunicipalityCapacityRow>();

  for (const t of operating) {
    if (t.municipalityId === null) continue;
    const power = t.ratedPowerKw ?? 0;

    let row = grouped.get(t.municipalityId);
    if (!row) {
      row = {
        municipalityId: t.municipalityId,
        municipalityName: t.municipalityName ?? "—",
        officialKey: t.officialKey,
        turbineCount: 0,
        totalRatedPowerKw: 0,
        shareOfAssigned: 0,
        turbines: [],
      };
      grouped.set(t.municipalityId, row);
    }
    row.turbineCount += 1;
    row.totalRatedPowerKw += power;
    row.turbines.push({
      id: t.id,
      designation: t.designation,
      parkName: t.parkName,
      ratedPowerKw: power,
    });
  }

  const assignedRatedPowerKw = [...grouped.values()].reduce(
    (sum, r) => sum + r.totalRatedPowerKw,
    0,
  );

  const rows = [...grouped.values()]
    .map((r) => ({
      ...r,
      totalRatedPowerKw: round2(r.totalRatedPowerKw),
      // Der Anteil bezieht sich ausdrücklich auf die ZUGEORDNETEN Anlagen.
      // Gäbe es nicht zugeordnete, wäre jeder hier ausgewiesene Anteil zu hoch
      // — die Warnung darunter sagt das.
      shareOfAssigned:
        assignedRatedPowerKw > 0 ? r.totalRatedPowerKw / assignedRatedPowerKw : 0,
    }))
    .sort((a, b) => b.totalRatedPowerKw - a.totalRatedPowerKw);

  const warnings: string[] = [];
  if (withoutMunicipality.length > 0) {
    warnings.push(
      `${withoutMunicipality.length} Anlage(n) ohne Standortgemeinde: ${withoutMunicipality
        .map((t) => `${t.parkName} / ${t.designation}`)
        .join(", ")}. Sie fehlen in jeder Zeile — die ausgewiesenen Anteile sind damit ZU HOCH und als Zerlegungsgrundlage nicht verwendbar, solange die Zuordnung fehlt.`,
    );
  }
  if (withoutRatedPower.length > 0) {
    warnings.push(
      `${withoutRatedPower.length} Anlage(n) ohne erfasste Nennleistung: ${withoutRatedPower
        .map((t) => `${t.parkName} / ${t.designation}`)
        .join(", ")}. Sie zählen mit 0 kW und mindern damit den Anteil ihrer Gemeinde.`,
    );
  }
  if (inactiveWithoutDate.length > 0) {
    warnings.push(
      `${inactiveWithoutDate.length} Anlage(n) sind nicht mehr aktiv, ein Stilllegungsdatum wird aber nicht geführt: ${inactiveWithoutDate
        .map((t) => `${t.parkName} / ${t.designation}`)
        .join(", ")}. Sie sind mitgezählt, weil sich nicht feststellen lässt, ob sie ${year} noch standen.`,
    );
  }
  if (rows.length === 0) {
    warnings.push(
      `Für ${year} ist keine Anlage einer Gemeinde zugeordnet. Es gibt nichts auszuwerten — das ist kein Ergebnis von null, sondern ein fehlender Datenbestand.`,
    );
  }

  return {
    year,
    rows,
    assignedRatedPowerKw: round2(assignedRatedPowerKw),
    withoutMunicipality,
    withoutRatedPower,
    inactiveWithoutDate,
    warnings,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
