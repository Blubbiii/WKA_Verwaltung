/**
 * Eigentümer und Bewirtschafter eines Flurstücks — wer gilt wann.
 *
 * ## Die zwei Rollen
 *
 * **Eigentümer** ist eine Eigenschaft des Flurstücks. Sie gilt auch ohne
 * Nutzungsvertrag — in der Akquise etwa, wo man wissen muss, mit wem man
 * verhandelt.
 *
 * **Bewirtschafter** ist, wer die Fläche tatsächlich bestellt. Das kann der
 * Eigentümer selbst sein oder ein Landwirt, der von ihm gepachtet hat. Ihn
 * treffen Bauarbeiten, Zuwegung und Flurschäden — bis jetzt kam er im System
 * nicht vor.
 *
 * ## Und der Verpächter?
 *
 * Der steht am **Vertrag** (`Lease.lessor` / `LeaseLessor`) und bleibt dort.
 * Er ist eine dritte Tatsache: wer unterschrieben hat und wer bezahlt wird.
 *
 * Meistens sind Eigentümer und Verpächter dieselbe Person. Sie können aber
 * auseinanderfallen, und das ist kein Fehler: ein Nießbraucher unterschreibt,
 * ohne Eigentümer zu sein; ein Grundstück wird verkauft, während der Vertrag
 * weiterläuft.
 *
 * Deshalb wird hier nichts erzwungen und nichts abgeleitet. Weicht das eine
 * vom anderen ab, ist das ein **Hinweis** (`abweichungen`), kein Fehler —
 * entweder ist die Eigentümerangabe veraltet oder der Vertrag steht auf dem
 * falschen Namen. Beides gehört einem Menschen vorgelegt.
 *
 * ## Zeiträume
 *
 * Ein Wechsel wird durch Abgrenzen und Neuanlegen abgebildet, nicht durch
 * Überschreiben: der alte Eintrag bekommt ein `validTo`, der neue beginnt am
 * Folgetag. Sonst verlöre eine bereits abgerechnete Periode ihre Grundlage —
 * und nach einem Flurschaden wüsste niemand mehr, wer damals auf der Fläche
 * war.
 */

/** Ein zeitlich begrenzter Eintrag — Eigentum oder Bewirtschaftung. */
export interface ZeitraumEintrag {
  personId: string;
  validFrom: Date | null;
  validTo: Date | null;
}

/**
 * Gilt der Eintrag am Stichtag?
 *
 * `validFrom: null` heisst „seit jeher bekannt", `validTo: null` heisst
 * „offen". `validTo` ist **einschliesslich** — der letzte Tag zählt noch dazu,
 * wie in `LeaseLessor`. Verglichen wird deshalb auf Kalendertage und nicht auf
 * Zeitstempel: sonst fiele ein Eintrag, dessen `validTo` auf Mitternacht
 * steht, an seinem letzten Tag bereits heraus.
 */
export function giltAm(eintrag: ZeitraumEintrag, stichtag: Date): boolean {
  const tag = tagesbeginn(stichtag);
  if (eintrag.validFrom && tagesbeginn(eintrag.validFrom) > tag) return false;
  if (eintrag.validTo && tagesbeginn(eintrag.validTo) < tag) return false;
  return true;
}

function tagesbeginn(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Die am Stichtag gültigen Einträge. */
export function gueltigeAm<T extends ZeitraumEintrag>(
  eintraege: T[],
  stichtag: Date = new Date(),
): T[] {
  return eintraege.filter((e) => giltAm(e, stichtag));
}

export interface Quotenpruefung {
  summe: number;
  stimmt: boolean;
  /** Klartext, falls sie nicht stimmt. Sonst `null`. */
  hinweis: string | null;
}

/**
 * Ergeben die Miteigentumsquoten am Stichtag 100 Prozent?
 *
 * Bewusst ein **Hinweis** und kein Fehler. Ein Grundbuch wird oft
 * stückweise erfasst; wer die Eingabe blockiert, solange die Summe nicht
 * stimmt, erzwingt entweder erfundene Quoten oder Notizfelder. Beides ist
 * schlechter als eine sichtbare Lücke.
 *
 * Eine leere Liste ergibt keinen Hinweis: „nichts erfasst" ist etwas anderes
 * als „falsch erfasst", und eine Warnung an jedem Flurstück ohne Angaben
 * würde nach einer Woche niemand mehr lesen.
 */
export function pruefeQuoten(
  eigentuemer: (ZeitraumEintrag & { sharePercent: number })[],
  stichtag: Date = new Date(),
): Quotenpruefung {
  const gueltige = gueltigeAm(eigentuemer, stichtag);
  if (gueltige.length === 0) {
    return { summe: 0, stimmt: true, hinweis: null };
  }

  const summe = gueltige.reduce((s, e) => s + e.sharePercent, 0);
  // Auf vier Nachkommastellen, wie die Spalte. Ohne Toleranz meldete
  // 33,3333 + 33,3333 + 33,3334 eine Abweichung.
  const stimmt = Math.abs(summe - 100) < 0.0001;

  return {
    summe,
    stimmt,
    hinweis: stimmt
      ? null
      : `Die Miteigentumsquoten ergeben ${summe.toFixed(4).replace(/\.?0+$/, "")} % ` +
        `statt 100 %. Solange das so ist, lässt sich aus dem Flurstück nicht ` +
        `ableiten, wem welcher Anteil einer Zahlung zusteht.`,
  };
}

export interface Abweichung {
  art: "nur-eigentuemer" | "nur-verpaechter";
  personId: string;
  name: string;
  erklaerung: string;
}

/**
 * Wo weichen die eingetragenen Eigentümer von den Verpächtern der Verträge
 * ab, die dieses Flurstück umfassen?
 *
 * Gibt eine leere Liste zurück, wenn eine der beiden Seiten gar nicht erfasst
 * ist. Das ist Absicht: ein Flurstück ohne Eigentümerangabe ist nicht
 * „widersprüchlich", sondern unvollständig — und ein Hinweis, der auf jedem
 * zweiten Flurstück steht, wird nicht mehr gelesen.
 */
export function findeAbweichungen(
  eigentuemer: { personId: string; name: string }[],
  verpaechter: { personId: string; name: string }[],
): Abweichung[] {
  if (eigentuemer.length === 0 || verpaechter.length === 0) return [];

  const eigentuemerIds = new Set(eigentuemer.map((e) => e.personId));
  const verpaechterIds = new Set(verpaechter.map((v) => v.personId));

  const abweichungen: Abweichung[] = [];

  for (const e of eigentuemer) {
    if (!verpaechterIds.has(e.personId)) {
      abweichungen.push({
        art: "nur-eigentuemer",
        personId: e.personId,
        name: e.name,
        erklaerung:
          `${e.name} ist als Eigentümer eingetragen, steht aber in keinem ` +
          `Vertrag zu diesem Flurstück. Entweder fehlt eine Unterschrift ` +
          `oder die Eigentümerangabe ist veraltet.`,
      });
    }
  }

  for (const v of verpaechter) {
    if (!eigentuemerIds.has(v.personId)) {
      abweichungen.push({
        art: "nur-verpaechter",
        personId: v.personId,
        name: v.name,
        erklaerung:
          `${v.name} verpachtet dieses Flurstück, ist aber nicht als ` +
          `Eigentümer eingetragen. Das kann richtig sein — etwa bei einem ` +
          `Nießbraucher — oder die Eigentümerangabe ist unvollständig.`,
      });
    }
  }

  return abweichungen;
}
