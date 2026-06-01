/**
 * USt-Split: Brutto → Netto + Steuer (Phase 11).
 *
 * Pure-Funktion mit Cent-genauer Rundung (Banker's-Style: half-up wie
 * im deutschen Steuerrecht üblich). Wird vom Auto-Posting (P11) und vom
 * UStVA-Generator (P12) verwendet.
 *
 * Rundungs-Konvention: §14 UStG schreibt keinen expliziten Modus vor,
 * aber DATEV verwendet "half-up" (kaufmännisch). Wir folgen dem,
 * weil sonst die Beträge in DATEV-Exports gegen die Original-Rechnung
 * abweichen.
 *
 * Cent-Differenzen durch Rundung können auftreten (z.B. 100 € brutto
 * @ 19% → netto 84,03 + USt 15,97 = 100,00, Summe stimmt). Bei Aufteilung
 * der Differenz auf mehrere Positionen entsteht Restbetrag — der wird
 * NICHT hier gehandhabt, sondern vom Caller (er erhält die exakten Cent-
 * Werte und entscheidet, ob er auf Position-Ebene oder Beleg-Ebene rundet).
 *
 * Reverse-Charge: Bei Kategorien mit reverseCharge=true ist das ausgewiesene
 * Brutto = Netto (kein USt-Ausweis). Die "Steuer" entsteht beim Empfänger
 * als zusätzliche Buchung (Vorsteuer + USt-Schuld parallel). splitGrossAmount
 * gibt für diese Fälle tax=0 zurück + Caller muss separat den
 * Reverse-Charge-Buchungs-Block bilden.
 */

import { TaxCategory } from "@prisma/client";

/** Eingabe-Form: Brutto in Cent-Auflösung (Integer) ODER als Decimal-Number. */
export interface GrossAmount {
  /** Brutto-Betrag in Euro (z.B. 119.00 für 119 €). */
  gross: number;
}

/** Aufgelöster TaxCode (Minimalprojektion). Kommt aus resolveTaxCode (P10). */
export interface TaxSpec {
  rate: number; // 0.19 = 19%
  reverseCharge: boolean;
  category: TaxCategory;
}

/** Ergebnis des Splits. */
export interface SplitResult {
  /** Netto-Anteil in Euro, auf 2 Nachkommastellen gerundet. */
  net: number;
  /** USt-Anteil in Euro, auf 2 Nachkommastellen gerundet. */
  tax: number;
  /** Effektiver Brutto-Betrag (= net + tax). Kann minimal vom Input abweichen
   *  durch Rundung — Caller sollte das prüfen. */
  effectiveGross: number;
  /** True wenn die Buchung als Reverse-Charge gehandhabt werden muss
   *  (Vorsteuer + USt-Schuld separat beim Empfänger). */
  isReverseCharge: boolean;
}

/** Rundet half-up auf 2 Nachkommastellen (Cent). */
function roundCent(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Splittet einen Bruttobetrag anhand des effektiven Steuersatzes.
 *
 * - Bei reverseCharge=true: tax=0, net=gross (Empfänger bucht USt selbst)
 * - Bei rate=0 (EXEMPT, IGL, EXPORT, KLEINUNTERNEHMER, NOT_TAXABLE): tax=0, net=gross
 * - Sonst: net = gross / (1+rate), tax = gross - net (so summiert sich's exakt zum Brutto)
 *
 * Beispiel STANDARD_19, gross=119€:
 *   net = 119 / 1.19 = 100.00
 *   tax = 119 - 100.00 = 19.00
 */
export function splitGrossAmount(
  input: GrossAmount,
  spec: TaxSpec,
): SplitResult {
  const { gross } = input;

  if (spec.reverseCharge) {
    return {
      net: roundCent(gross),
      tax: 0,
      effectiveGross: roundCent(gross),
      isReverseCharge: true,
    };
  }

  if (spec.rate === 0) {
    return {
      net: roundCent(gross),
      tax: 0,
      effectiveGross: roundCent(gross),
      isReverseCharge: false,
    };
  }

  // Standardfall: gross = net * (1 + rate). Wir rechnen via Multiplikation
  // mit dem Brutto-Faktor um die "1" nicht zu verlieren bei rate < 1%.
  const grossCents = Math.round(gross * 100);
  const netCents = Math.round(grossCents / (1 + spec.rate));
  const taxCents = grossCents - netCents;

  return {
    net: netCents / 100,
    tax: taxCents / 100,
    effectiveGross: (netCents + taxCents) / 100,
    isReverseCharge: false,
  };
}

/**
 * Variante: ein Netto-Betrag wird mit dem Satz zu Brutto+USt aufgesplittet.
 * Wird gebraucht wenn der Caller Netto als Basis hat (z.B. aus Rechnungsposition
 * mit explizit angegebenem Netto-Preis).
 */
export function splitNetAmount(
  net: number,
  spec: TaxSpec,
): SplitResult {
  if (spec.reverseCharge || spec.rate === 0) {
    return {
      net: roundCent(net),
      tax: 0,
      effectiveGross: roundCent(net),
      isReverseCharge: spec.reverseCharge,
    };
  }

  const netCents = Math.round(net * 100);
  const taxCents = Math.round(netCents * spec.rate);
  const grossCents = netCents + taxCents;

  return {
    net: netCents / 100,
    tax: taxCents / 100,
    effectiveGross: grossCents / 100,
    isReverseCharge: false,
  };
}
