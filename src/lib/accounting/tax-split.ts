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
import { Decimal } from "@prisma/client-runtime-utils";
import { splitGross, combineNet, round2 } from "./money";

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

/**
 * Splittet einen Bruttobetrag anhand des effektiven Steuersatzes.
 *
 * - Bei reverseCharge=true: tax=0, net=gross (Empfänger bucht USt selbst)
 * - Bei rate=0 (EXEMPT, IGL, EXPORT, KLEINUNTERNEHMER, NOT_TAXABLE): tax=0, net=gross
 * - Sonst: net = gross / (1+rate), tax = gross - net (so summiert sich's exakt zum Brutto)
 *
 * Delegiert an `splitGross` in `./money.ts` (Single Source für Tax-Split).
 * Diese Wrapper-Fassade bewahrt die bestehende number-basierte API + das
 * SplitResult-Format (inkl. isReverseCharge-Flag) für alle Bestandscaller.
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
      net: round2(gross),
      tax: 0,
      effectiveGross: round2(gross),
      isReverseCharge: true,
    };
  }

  // rate=0 wird von splitGross intern behandelt (net=gross, tax=0).
  const { net, tax } = splitGross(new Decimal(gross), spec.rate);
  const netNum = net.toNumber();
  const taxNum = tax.toNumber();

  return {
    net: netNum,
    tax: taxNum,
    effectiveGross: round2(netNum + taxNum),
    isReverseCharge: false,
  };
}

/**
 * Variante: ein Netto-Betrag wird mit dem Satz zu Brutto+USt aufgesplittet.
 * Wird gebraucht wenn der Caller Netto als Basis hat (z.B. aus Rechnungsposition
 * mit explizit angegebenem Netto-Preis).
 *
 * Delegiert an `combineNet` in `./money.ts`.
 */
export function splitNetAmount(
  net: number,
  spec: TaxSpec,
): SplitResult {
  if (spec.reverseCharge) {
    return {
      net: round2(net),
      tax: 0,
      effectiveGross: round2(net),
      isReverseCharge: true,
    };
  }

  const { gross, tax } = combineNet(new Decimal(net), spec.rate);
  const netNum = round2(net);
  const taxNum = tax.toNumber();
  const grossNum = gross.toNumber();

  return {
    net: netNum,
    tax: taxNum,
    effectiveGross: grossNum,
    isReverseCharge: false,
  };
}
