/**
 * Gemeindebeteiligung nach § 6 EEG.
 *
 * Betreiber dürfen den Gemeinden im Umkreis von 2.500 Metern um den Turm bis
 * zu 0,2 ct/kWh anbieten. Bemessungsgrundlage ist die **tatsächlich
 * eingespeiste** Menge **zuzüglich der fiktiven Menge bei Abregelung** —
 * beides zusammen, weil eine abgeregelte Anlage die Gemeinde nicht schlechter
 * stellen soll als eine laufende.
 *
 * Anders als bei der Gewerbesteuer-Zerlegung rechnet WPM hier: es ist eine
 * Zahlung, die der Betreiber selbst leistet und selbst abrechnen muss.
 *
 * ## Der Verteilungsschlüssel
 *
 * Fällt der Umkreis in mehrere Gemeinden, wird nach dem Anteil der
 * KREISFLÄCHE verteilt — nicht nach Einwohnerzahl und nicht nach
 * Gemeindefläche. Der Anteil wird erfasst, nicht gerechnet: er ergäbe sich aus
 * der Verschneidung des Kreises mit den Gemeindegrenzen, und die liegen nicht
 * im System. Ein aus Näherungswerten gerechneter Anteil sähe genauso aus wie
 * ein aus dem Vertrag übernommener.
 *
 * ## Was passiert, wenn die Anteile nicht aufgehen
 *
 * Sie werden NICHT hochgerechnet. Summieren die erfassten Gemeinden einer
 * Anlage auf 0,7, wird auf 70 % der Bemessungsgrundlage gezahlt und die Lücke
 * ausgewiesen. Hochzurechnen hiesse, den fehlenden Anteil auf die erfassten
 * Gemeinden zu verteilen — die bekämen dann Geld, das einer nicht erfassten
 * Gemeinde zusteht.
 */

/** Gesetzlicher Höchstsatz, § 6 Abs. 1 EEG. */
export const MAX_RATE_CT_PER_KWH = 0.2;

/** Toleranz für die Summe der Flächenanteile — Rundung auf vier Stellen. */
const SHARE_TOLERANCE = 0.0002;

export interface BenefitAgreement {
  municipalityId: string;
  municipalityName: string;
  /** Anteil der Kreisfläche, 0–1. */
  areaShare: number;
  /** Vereinbarter Satz in ct/kWh. */
  rateCtPerKwh: number;
}

export interface TurbineBenefitInput {
  turbineId: string;
  designation: string;
  parkName: string;
  /** Eingespeiste Menge im Zeitraum. `null` = nicht erfasst, NICHT 0. */
  producedKwh: number | null;
  /**
   * Fiktive Menge aus Abregelung (§ 6 Abs. 1 EEG i. V. m. der Ausfallarbeit).
   * `null` = nicht ermittelt; das ist etwas anderes als „keine Abregelung".
   */
  curtailedKwh: number | null;
  /** Ob im Zeitraum überhaupt Abregelungen vorlagen. */
  hadCurtailment: boolean;
  agreements: BenefitAgreement[];
}

export interface MunicipalityBenefitRow {
  municipalityId: string;
  municipalityName: string;
  amountEur: number;
  turbines: {
    turbineId: string;
    designation: string;
    parkName: string;
    basisKwh: number;
    areaShare: number;
    rateCtPerKwh: number;
    amountEur: number;
  }[];
}

export interface MunicipalityBenefitResult {
  rows: MunicipalityBenefitRow[];
  totalEur: number;
  warnings: string[];
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function computeMunicipalityBenefit(
  turbines: readonly TurbineBenefitInput[],
): MunicipalityBenefitResult {
  const byMunicipality = new Map<string, MunicipalityBenefitRow>();
  const warnings: string[] = [];

  const missingProduction: string[] = [];
  const missingCurtailment: string[] = [];
  const incompleteShares: string[] = [];
  const excessiveRates: string[] = [];

  for (const t of turbines) {
    if (t.agreements.length === 0) continue;

    const label = `${t.parkName} / ${t.designation}`;

    if (t.producedKwh === null) {
      // Ohne Menge lässt sich nichts abrechnen. Mit 0 zu rechnen ergäbe eine
      // Zahlung von 0 EUR, die aussieht wie ein geprüftes Ergebnis.
      missingProduction.push(label);
      continue;
    }

    if (t.hadCurtailment && t.curtailedKwh === null) {
      // Die Abregelung ist bekannt, ihre Ausfallarbeit aber nicht bewertet.
      // Gerechnet wird ohne sie — die Zahlung ist dann zu NIEDRIG.
      missingCurtailment.push(label);
    }

    const basisKwh = t.producedKwh + (t.curtailedKwh ?? 0);

    const shareSum = t.agreements.reduce((s, a) => s + a.areaShare, 0);
    if (Math.abs(shareSum - 1) > SHARE_TOLERANCE) {
      incompleteShares.push(
        `${label} (${(shareSum * 100).toFixed(2).replace(".", ",")} %)`,
      );
    }

    for (const a of t.agreements) {
      if (a.rateCtPerKwh > MAX_RATE_CT_PER_KWH) {
        excessiveRates.push(`${label} → ${a.municipalityName}`);
      }

      // ct/kWh → EUR: Menge × Satz / 100.
      const amountEur = round2((basisKwh * a.rateCtPerKwh * a.areaShare) / 100);

      let row = byMunicipality.get(a.municipalityId);
      if (!row) {
        row = {
          municipalityId: a.municipalityId,
          municipalityName: a.municipalityName,
          amountEur: 0,
          turbines: [],
        };
        byMunicipality.set(a.municipalityId, row);
      }
      row.amountEur = round2(row.amountEur + amountEur);
      row.turbines.push({
        turbineId: t.turbineId,
        designation: t.designation,
        parkName: t.parkName,
        basisKwh,
        areaShare: a.areaShare,
        rateCtPerKwh: a.rateCtPerKwh,
        amountEur,
      });
    }
  }

  if (missingProduction.length > 0) {
    warnings.push(
      `Für ${missingProduction.length} Anlage(n) ist keine Einspeisemenge erfasst: ${missingProduction.join(", ")}. Sie sind NICHT abgerechnet — mit 0 kWh zu rechnen ergäbe eine Zahlung von 0 EUR, die wie ein Ergebnis aussieht.`,
    );
  }
  if (missingCurtailment.length > 0) {
    warnings.push(
      `Bei ${missingCurtailment.length} Anlage(n) lagen Abregelungen vor, deren Ausfallarbeit nicht bewertet ist: ${missingCurtailment.join(", ")}. Die fiktive Menge nach § 6 Abs. 1 EEG fehlt in der Grundlage — die errechnete Zahlung ist insoweit ZU NIEDRIG.`,
    );
  }
  if (incompleteShares.length > 0) {
    warnings.push(
      `Bei ${incompleteShares.length} Anlage(n) ergeben die Flächenanteile nicht 100 %: ${incompleteShares.join(", ")}. Es wurde auf den erfassten Anteil gezahlt und NICHT hochgerechnet — sonst bekäme eine erfasste Gemeinde Geld, das einer nicht erfassten zusteht.`,
    );
  }
  if (excessiveRates.length > 0) {
    warnings.push(
      `Bei ${excessiveRates.length} Vereinbarung(en) liegt der Satz über dem Höchstsatz von ${MAX_RATE_CT_PER_KWH} ct/kWh (§ 6 Abs. 1 EEG): ${excessiveRates.join(", ")}. Der übersteigende Teil ist nicht förderfähig.`,
    );
  }

  const rows = [...byMunicipality.values()].sort((a, b) => b.amountEur - a.amountEur);
  const totalEur = round2(rows.reduce((s, r) => s + r.amountEur, 0));

  return { rows, totalEur, warnings };
}
