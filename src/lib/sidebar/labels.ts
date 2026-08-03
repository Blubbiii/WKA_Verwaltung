/**
 * Beschriftungen für Navigationsziele — an einer Stelle.
 *
 * ## Warum das eine eigene Datei ist
 *
 * Die Auflösung „Adresse → Beschriftung" wird an drei Orten gebraucht: in der
 * Favoritenliste der Seitenleiste, in der Favoritenverwaltung und bei den
 * zuletzt besuchten Seiten. Ich hatte sie beim ersten Anlauf zweimal
 * hingeschrieben — genau der Fehler, den ich in diesem Produkt schon bei der
 * Abstimmungsauszählung, der Zeichensatz-Reparatur und den Kennzahlen
 * gefunden habe. Also: einmal.
 *
 * ## Warum Unterpunkte ihren Oberpunkt mitbringen
 *
 * Beim ersten Versuch hiessen drei Favoriten alle „Übersicht" — für
 * Windparks, Rechnungen und Dokumente heisst der jeweils erste Unterpunkt
 * gleich. Drei Zeilen mit demselben Wort, und keine sagt, wohin sie führt.
 *
 * Ein Favorit muss erkennbar sein, und erkennbar ist er über seinen Platz im
 * Menü. Deshalb `Oberpunkt · Unterpunkt`. Das ist länger als nötig, wo der
 * Unterpunkt schon eindeutig wäre — aber eine Regel, die immer greift, ist
 * besser als eine, die rät, wann ein Wort mehrdeutig ist.
 */

import { navGroups } from "@/config/nav-config";

/** Wie next-intl übersetzt: Schlüssel rein, Text raus. */
export type Uebersetzer = (schluessel: string) => string;

function beschriftung(
  eintrag: { title: string; titleKey?: string },
  t: Uebersetzer,
): string {
  return eintrag.titleKey ? t(`nav.${eintrag.titleKey}`) : eintrag.title;
}

/**
 * Alle Navigationsziele mit ihrer Beschriftung.
 *
 * Enthält nur, was in der Navigation steht. Eine Adresse, die dort nicht
 * vorkommt, fehlt in der Karte — der Aufrufer entscheidet dann, was er damit
 * macht. Ein Favorit auf eine verschwundene Seite wird **nicht** stillschweigend
 * gelöscht: der Nutzer soll sehen, dass da etwas war.
 */
export function zielBeschriftungen(t: Uebersetzer): Map<string, string> {
  const karte = new Map<string, string>();

  for (const gruppe of navGroups) {
    for (const item of gruppe.items) {
      const oben = beschriftung(item, t);
      karte.set(item.href, oben);

      for (const child of item.children ?? []) {
        karte.set(child.href, `${oben} · ${beschriftung(child, t)}`);
      }
    }
  }

  return karte;
}
