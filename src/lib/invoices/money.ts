/**
 * Money — zentrale Rounding- und Tax-Split-Utilities (Single Source of Truth).
 *
 * Vorher gab es 4+ Kopien der gleichen Berechnung in verschiedenen Files:
 *   - tax-split.ts::splitGrossAmount (Brutto → Netto, Cent-Genauigkeit)
 *   - numberGenerator.ts::calculateTaxAmounts (Netto → Brutto)
 *   - pdf/utils/formatters.ts::calculateTotals (Items → Totals)
 *   - invoices/invoice-correction.ts::calculateItemAmounts (4. Kopie)
 *   - plus 15 lokale `function round2()` Copies quer durch den Codebase
 *
 * Rundungs-Konvention: half-up auf 2 Nachkommastellen (Cent), wie DATEV und
 * der Rest des Codebase es verwenden. NICHT ändern ohne bewusste Migration
 * (das würde alle Beträge in DATEV-Exports gegen Original-Rechnungen abweichen
 * lassen). Details in tax-split.ts oben.
 *
 * Bug-Kompatibilität: Die Funktionen splitGross / combineNet reproduzieren
 * *exakt* das bisherige Verhalten der individuellen Kopien für alle bisher
 * abgesicherten Testfälle (siehe tax-split.test.ts Goldmaster). Das Cent-
 * basierte Rechnen via `.mul(100).round()` ist strukturgleich zu
 * `Math.round(x * 100)` und erzeugt identische Ergebnisse für die üblichen
 * DE-Steuersätze (0/7/19). Bei Steuersätzen mit vielen Nachkommastellen
 * kann Decimal-Präzision minimal von JS-Float abweichen — für neue Nutzer
 * ist Decimal die richtige Wahl.
 *
 * Cent-Differenzen durch Rundung können auftreten (Klassiker: 100€ brutto
 * @ 19% → 84,03 netto + 15,97 USt = 100,00). Bei Aufteilung mehrerer
 * Positionen entstehen Restbeträge — der Caller entscheidet, ob auf
 * Position- oder Beleg-Ebene gerundet wird.
 */

import { Decimal } from "@prisma/client-runtime-utils";

/**
 * Rundet konsistent half-up auf 2 Nachkommastellen (Cent).
 * Bug-kompatibel mit `Math.round(v * 100) / 100`, welches im ganzen
 * Codebase als lokale `round2()`-Kopie mehrfach dupliziert existiert.
 *
 * Akzeptiert number ODER Prisma.Decimal — gibt immer number zurück,
 * da alle bisherigen Caller number erwarten.
 */
export function round2(value: number | Decimal): number {
  const num = typeof value === "number" ? value : value.toNumber();
  return Math.round(num * 100) / 100;
}

/**
 * Rundet auf 2 Nachkommastellen und gibt Decimal zurück (für Prisma-Writes).
 */
export function round2Decimal(value: number | Decimal): Decimal {
  const dec = typeof value === "number" ? new Decimal(value) : value;
  return dec.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Splittet einen Brutto-Betrag in Netto + USt.
 *
 * Cent-genau: gross = net + tax (exakt auf den Cent, siehe Rundungs-Invariante
 * im tax-split Goldmaster-Test). Bei rate=0 ist tax=0 und net=gross.
 *
 * @param gross Brutto in Euro (Decimal, kann Nachkommastellen haben)
 * @param taxRate Steuersatz als Fraktion (0.19 für 19%, NICHT 19)
 *
 * @example splitGross(new Decimal(119), 0.19) → { net: 100, tax: 19 }
 * @example splitGross(new Decimal(100), 0.19) → { net: 84.03, tax: 15.97 }
 */
export function splitGross(
  gross: Decimal,
  taxRate: number,
): { net: Decimal; tax: Decimal } {
  if (taxRate === 0) {
    const rounded = gross.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    return { net: rounded, tax: new Decimal(0) };
  }

  // Cent-Basis: identisch zu tax-split.ts's Math.round-Logik, nur via
  // Decimal für Präzision bei sehr großen Beträgen.
  //   grossCents = round(gross * 100)
  //   netCents   = round(grossCents / (1+rate))
  //   taxCents   = grossCents - netCents   ← so summiert es sich exakt
  const grossCents = gross.mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const netCents = grossCents
    .div(new Decimal(1).plus(taxRate))
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const taxCents = grossCents.minus(netCents);

  return { net: netCents.div(100), tax: taxCents.div(100) };
}

/**
 * Kombiniert einen Netto-Betrag zu Brutto + USt.
 *
 * Bei rate=0 ist tax=0 und gross=net.
 *
 * @param net Netto in Euro (Decimal)
 * @param taxRate Steuersatz als Fraktion (0.19 für 19%, NICHT 19)
 *
 * @example combineNet(new Decimal(100), 0.19) → { gross: 119, tax: 19 }
 */
export function combineNet(
  net: Decimal,
  taxRate: number,
): { gross: Decimal; tax: Decimal } {
  if (taxRate === 0) {
    const rounded = net.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    return { gross: rounded, tax: new Decimal(0) };
  }

  // Bug-kompatibel zu numberGenerator::calculateTaxAmounts und
  // invoice-correction::calculateItemAmounts (Math.round basierte Rundung).
  const netCents = net.mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const taxCents = netCents
    .mul(taxRate)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const grossCents = netCents.plus(taxCents);

  return { gross: grossCents.div(100), tax: taxCents.div(100) };
}

/**
 * Summiert Line-Items zu Beleg-Totals (Netto/Tax/Brutto).
 *
 * Alle Werte werden auf 2 Nachkommastellen gerundet ausgegeben.
 * Falls Line-Items bereits gerundet sind (der Regelfall), bleibt die
 * Summe auch nach Rundung unverändert.
 */
export function sumItems<
  T extends { net: Decimal; tax: Decimal; gross: Decimal },
>(items: T[]): { totalNet: Decimal; totalTax: Decimal; totalGross: Decimal } {
  const zero = new Decimal(0);
  const totalNet = items
    .reduce((s, i) => s.plus(i.net), zero)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const totalTax = items
    .reduce((s, i) => s.plus(i.tax), zero)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const totalGross = items
    .reduce((s, i) => s.plus(i.gross), zero)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return { totalNet, totalTax, totalGross };
}
