/**
 * Wie weit die Summe von Anteilsquoten von 100 % abweichen darf.
 *
 * Die Frage stellte sich an drei Stellen und wurde dreimal eigen beantwortet:
 * `lease-lessors/share-split.ts` und `shareholding/distribution-split.ts` mit
 * je 0,011, `billing/rules/distribution.ts` mit 0,01.
 *
 * ## Der Unterschied war nicht kosmetisch
 *
 * Alle drei vergleichen `Math.abs(summe - 100) > TOLERANZ`. Bei einer
 * Drittelung — 33,33 + 33,33 + 33,33 = 99,99 — beträgt die Abweichung in
 * Fließkomma-Arithmetik knapp MEHR als 0,01. Dieselbe Aufteilung wurde in der
 * Ausschüttung angenommen und in der Abrechnungsregel zurückgewiesen.
 *
 * ## Warum ein fester Wert grundsätzlich nicht reicht
 *
 * Auch 0,011 löst das nur für drei Beteiligte. Bei sechs gleichen Anteilen
 * (16,67 × 6 = 100,02) und bei sieben (14,29 × 7 = 100,03) scheiterten ALLE
 * drei Prüfungen — an einer Eingabe, die rechnerisch nicht besser geht.
 *
 * Der zulässige Spielraum hängt an der Zahl der Anteile: wird jede Quote auf
 * zwei Nachkommastellen gerundet, kann jede um bis zu 0,005 danebenliegen, bei
 * n Quoten also die Summe um bis zu n × 0,005. Alles darüber ist keine
 * Rundung mehr, sondern eine echte Lücke.
 *
 * Dieses Prinzip stand in `allocateByPercentage()` bereits (`0.005 *
 * amounts.length`) — nur eben nicht in der Prüfung der Quotensumme.
 */

/**
 * Halber Schritt der letzten dargestellten Nachkommastelle.
 *
 * Quoten werden mit zwei Nachkommastellen geführt (`toFixed(2)` in allen
 * Meldungen), der größtmögliche Rundungsfehler je Quote ist damit 0,005.
 */
export const SHARE_ROUNDING_STEP = 0.005;

/**
 * Fließkomma-Zugabe.
 *
 * Ohne sie liegt eine Abweichung, die exakt auf der Grenze liegt, je nach
 * Bitmuster mal knapp darüber und mal knapp darunter — genau der Effekt, der
 * den ursprünglichen Unterschied zwischen 0,01 und 0,011 ausgemacht hat.
 */
const FLOAT_EPSILON = 1e-9;

/**
 * Zulässige Abweichung der Quotensumme von 100, in Prozentpunkten.
 *
 * @param shareCount Anzahl der Quoten, die aufsummiert wurden.
 *
 * Beispiele: 3 Anteile → 0,015 (deckt 99,99 ab) · 6 Anteile → 0,03 (deckt
 * 100,02 ab) · 7 Anteile → 0,035 (deckt 100,03 ab). Eine echte Lücke von
 * 5 Prozentpunkten fällt in jedem Fall durch.
 */
export function shareSumTolerance(shareCount: number): number {
  const count = Math.max(1, Math.floor(shareCount));
  return count * SHARE_ROUNDING_STEP + FLOAT_EPSILON;
}

/**
 * Ergeben die Quoten zusammen 100 %, im Rahmen der Rundung?
 *
 * @param sumPercent Summe der Quoten.
 * @param shareCount Anzahl der aufsummierten Quoten.
 */
export function shareSumIsComplete(sumPercent: number, shareCount: number): boolean {
  return Math.abs(sumPercent - 100) <= shareSumTolerance(shareCount);
}
