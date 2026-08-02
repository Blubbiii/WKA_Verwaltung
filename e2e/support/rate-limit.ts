/**
 * Die Ratengrenze der API respektieren — an einer Stelle für alle.
 *
 * ## Warum es das gibt
 *
 * Die API begrenzt auf **100 Anfragen je Minute und Nutzer**. Das ist kein
 * Fehler, den man wegretryen müsste, sondern eine Eigenschaft, die ein Client
 * zu respektieren hat.
 *
 * Solange die Suite gegen eine langsame Instanz lief, fiel das nie auf: jeder
 * Seitenaufruf dauerte lange genug, dass sich die Last von selbst verteilte.
 * Gegen einen lokalen Produktionsbuild laufen 92 Tests in dreieinhalb Minuten
 * — rund 26 Tests je Minute mit je mehreren Anfragen. Vier Tests scheiterten
 * daraufhin mit `RATE_LIMITED`, und keiner davon hatte etwas mit seinem
 * eigentlichen Gegenstand zu tun.
 *
 * `WpmApi` hatte den Rückzieher längst. Die Tests, die `page.request` direkt
 * benutzen — 59 Aufrufe in elf Dateien — hatten ihn nicht. Zwei Wege zur
 * selben API, einer davon höflich: genau die Sorte Doppelung, die
 * auseinanderläuft.
 *
 * Deshalb steht die Regel hier und wird von beiden Seiten benutzt.
 *
 * ## Wie lange gewartet wird
 *
 * So lange, wie die API sagt. Sie schickt bei 429 einen `Retry-After`-Header;
 * vorher standen an einer Stelle fest verdrahtete 20 Sekunden — geraten, und
 * zu kurz für ein Fenster von einer Minute.
 */

/** Das Wenige, was von einer Antwort gebraucht wird. */
interface Antwortartig {
  status(): number;
  headers(): Record<string, string>;
}

/** Obergrenze der Wartezeit, falls ein Server eine unsinnige Angabe schickt. */
const HOECHSTWARTEZEIT_S = 90;

/**
 * Führt die Anfrage aus und wiederholt sie **einmal**, falls die Grenze
 * greift.
 *
 * Genau einmal: bleibt es bei 429, ist etwas anderes los als eine kurze
 * Spitze, und dann soll der Test scheitern statt die Ursache zu verschleiern.
 */
export async function mitRatengrenze<T extends Antwortartig>(
  ausfuehren: () => Promise<T>,
): Promise<T> {
  const erste = await ausfuehren();
  if (erste.status() !== 429) return erste;

  const angabe = Number(erste.headers()["retry-after"]);
  const sekunden = Number.isFinite(angabe) && angabe > 0 ? angabe : 60;

  await new Promise((r) =>
    setTimeout(r, Math.min(sekunden + 1, HOECHSTWARTEZEIT_S) * 1000),
  );
  return ausfuehren();
}
