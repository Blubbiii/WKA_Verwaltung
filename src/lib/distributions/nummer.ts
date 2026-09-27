/**
 * Distribution numbers AS-<year>-<nnn>, unique per tenant.
 *
 * The next number follows the highest one already given in that year —
 * not the count: drafts can be deleted, and "count + 1" would then hand out
 * a number that still exists.
 */

export function naechsteAusschuettungsnummer(jahr: number, vorhandene: string[]): string {
  const muster = new RegExp(`^AS-${jahr}-(\\d+)$`);
  const hoechste = vorhandene.reduce((max, nr) => {
    const m = muster.exec(nr);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `AS-${jahr}-${String(hoechste + 1).padStart(3, "0")}`;
}
