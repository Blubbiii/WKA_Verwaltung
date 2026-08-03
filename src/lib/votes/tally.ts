/**
 * Auszählung einer Gesellschafterabstimmung — die eine Stelle, an der die
 * Regel steht.
 *
 * ## Warum diese Datei entstanden ist
 *
 * Die Auszählung gab es **zweimal**, in zwei Dateien, mit zwei verschiedenen
 * Regeln:
 *
 *  - `api/portal/my-votes` — der Gesellschafter sieht das Ergebnis.
 *    Enthaltungen zählen **nicht** zur Mehrheitsgrundlage.
 *  - `api/votes/[id]` — die Verwaltung sieht das Ergebnis.
 *    Enthaltungen zählten **mit**.
 *
 * Dieselbe Abstimmung kam damit zu zwei Ergebnissen. Bei 45 % Ja, 40 % Nein
 * und 15 % Enthaltung sah der Gesellschafter „angenommen" (45 von 85), die
 * Verwaltung „abgelehnt" (45 von 100). Ein Gesellschafterbeschluss ist keine
 * Ansichtssache — die beiden Seiten müssen dieselbe Zahl sehen.
 *
 * ## Welche Regel gilt
 *
 * Enthaltungen zählen für das **Quorum**, nicht für die **Mehrheit**. Das ist
 * der Regelfall des deutschen Gesellschaftsrechts (§ 47 GmbHG spricht von der
 * Mehrheit der *abgegebenen* Stimmen; die Enthaltung ist keine Stimme für
 * oder gegen den Antrag) und steht so auch in den üblichen
 * Gesellschaftsverträgen.
 *
 * Weicht ein Gesellschaftsvertrag davon ab, gehört das als Feld an die
 * Abstimmung — nicht als stille Abweichung in eine von zwei Dateien.
 *
 * ## Was mit eigenen Optionen passiert
 *
 * Der Assistent lässt zu, die Antwortmöglichkeiten frei zu setzen; „Ja",
 * „Nein" und „Enthaltung" sind nur die Voreinstellung. Die Verwaltungsansicht
 * suchte den Zustimmungsanteil aber über den **Text „Ja"**. Bei Optionen wie
 * „Zustimmung" / „Ablehnung" kam dort immer 0 heraus — eine solche Abstimmung
 * konnte niemals angenommen werden, egal wie alle stimmten. Und sie wurde als
 * „abgelehnt" angezeigt.
 *
 * Deshalb unterscheidet dieses Modul zwei Dinge:
 *
 *  - **Auszählung** — funktioniert immer, für jede Option, nach Köpfen und
 *    nach Kapital.
 *  - **Beschlussfassung** — nur wenn die Optionen als Zustimmung/Ablehnung
 *    erkennbar sind. Sonst `null`: „nicht bestimmbar". Nicht `false`, denn
 *    das hiesse „abgelehnt", und das wäre eine Falschaussage über einen
 *    Beschluss.
 */

/** Antwort einer Person mit ihrem Stimmgewicht. */
export interface Stimme {
  selectedOption: string;
  /**
   * Stimmrechtsanteil in Prozent. `null` bedeutet „nicht gesetzt" — dann
   * zählt der Kapitalanteil. **0 bedeutet: kein Stimmrecht**, und das ist
   * etwas anderes.
   */
  votingRightsPercentage: number | null;
  ownershipPercentage: number | null;
}

export interface Stimmberechtigter {
  votingRightsPercentage: number | null;
  ownershipPercentage: number | null;
}

export interface AuszaehlungEingabe {
  stimmen: Stimme[];
  stimmberechtigte: Stimmberechtigter[];
  /** Antwortmöglichkeiten der Abstimmung, in ihrer Reihenfolge. */
  optionen: string[];
  /** Mindestbeteiligung in Prozent des Kapitals. `null` = kein Quorum. */
  quorumProzent: number | null;
  /** Mehrheit nach Kapitalanteil statt nach Köpfen. */
  kapitalmehrheit: boolean;
}

export interface OptionErgebnis {
  option: string;
  /** Anzahl der Stimmen für diese Option. */
  anzahl: number;
  /** Anteil an allen abgegebenen Stimmen, in Prozent. */
  anteilKoepfe: number;
  /** Summe der Stimmgewichte, in Prozentpunkten. */
  kapital: number;
  /** Anteil am abgegebenen Kapital, in Prozent. */
  anteilKapital: number;
}

export interface Auszaehlung {
  optionen: OptionErgebnis[];
  /** Abgegebene Stimmen insgesamt. */
  stimmenGesamt: number;
  /** Summe der Stimmgewichte aller Abgegebenen, in Prozentpunkten. */
  kapitalAbgegeben: number;
  /** Summe der Stimmgewichte aller Stimmberechtigten. */
  kapitalGesamt: number;
  /** Erreichte Beteiligung in Prozent des stimmberechtigten Kapitals. */
  beteiligungProzent: number;
  quorumErreicht: boolean;
  /**
   * `true` angenommen, `false` abgelehnt, `null` **nicht bestimmbar** — weil
   * die Antwortmöglichkeiten keine Zustimmung/Ablehnung erkennen lassen.
   */
  angenommen: boolean | null;
  /** Begründung im Klartext, auch für den Fall `null`. */
  begruendung: string;
}

/**
 * Das Stimmgewicht einer Person.
 *
 * `??`, nicht `||` — und das ist der ganze Punkt. Beide Auszählungen nutzten
 * `||`, und damit fiel eine **ausdrücklich auf 0 gesetzte** Stimmrechtsquote
 * auf den Kapitalanteil zurück: wer stimmrechtslose Anteile hält, stimmte mit
 * vollem Gewicht mit. `null` heisst „nicht gesetzt", `0` heisst „kein
 * Stimmrecht" — das ist nicht dasselbe.
 */
export function stimmgewicht(p: {
  votingRightsPercentage: number | null;
  ownershipPercentage: number | null;
}): number {
  return p.votingRightsPercentage ?? p.ownershipPercentage ?? 0;
}

const JA = ["ja", "yes", "zustimmung", "dafür", "dafuer", "annahme"];
const NEIN = ["nein", "no", "ablehnung", "dagegen"];
const ENTHALTUNG = ["enthaltung", "abstain", "enthalte mich"];

function passt(option: string, liste: string[]): boolean {
  return liste.includes(option.trim().toLowerCase());
}

export const istJa = (o: string) => passt(o, JA);
export const istNein = (o: string) => passt(o, NEIN);
export const istEnthaltung = (o: string) => passt(o, ENTHALTUNG);

/**
 * Lässt sich über diese Antwortmöglichkeiten ein Beschluss fassen?
 *
 * Es braucht beides: eine Zustimmung UND eine Ablehnung. Eine Abstimmung über
 * „Variante A" / „Variante B" ist eine Auswahl, kein Beschluss — sie hat kein
 * Ergebnis im Sinne von angenommen oder abgelehnt.
 */
export function beschlussfaehigeOptionen(optionen: string[]): boolean {
  return optionen.some(istJa) && optionen.some(istNein);
}

export function zaehleAus(eingabe: AuszaehlungEingabe): Auszaehlung {
  const { stimmen, stimmberechtigte, optionen, quorumProzent, kapitalmehrheit } =
    eingabe;

  const proOption = new Map<string, { anzahl: number; kapital: number }>();
  for (const o of optionen) proOption.set(o, { anzahl: 0, kapital: 0 });

  let kapitalAbgegeben = 0;
  let stimmenGesamt = 0;

  for (const stimme of stimmen) {
    const eintrag = proOption.get(stimme.selectedOption);
    // Eine Stimme auf eine Option, die es nicht (mehr) gibt — etwa weil die
    // Optionen nach Beginn geändert wurden. Sie wird NICHT stillschweigend
    // mitgezählt: sonst summierten sich die Anteile nicht auf 100 %, und
    // niemand sähe, warum.
    if (!eintrag) continue;

    const gewicht = stimmgewicht(stimme);
    eintrag.anzahl += 1;
    eintrag.kapital += gewicht;
    kapitalAbgegeben += gewicht;
    stimmenGesamt += 1;
  }

  const kapitalGesamt = stimmberechtigte.reduce(
    (summe, s) => summe + stimmgewicht(s),
    0,
  );

  const ergebnisse: OptionErgebnis[] = optionen.map((option) => {
    const e = proOption.get(option)!;
    return {
      option,
      anzahl: e.anzahl,
      anteilKoepfe: stimmenGesamt > 0 ? (e.anzahl / stimmenGesamt) * 100 : 0,
      kapital: e.kapital,
      anteilKapital:
        kapitalAbgegeben > 0 ? (e.kapital / kapitalAbgegeben) * 100 : 0,
    };
  });

  const beteiligungProzent =
    kapitalGesamt > 0 ? (kapitalAbgegeben / kapitalGesamt) * 100 : 0;
  const quorumErreicht =
    quorumProzent === null || beteiligungProzent >= quorumProzent;

  // --- Beschluss --------------------------------------------------------
  if (!beschlussfaehigeOptionen(optionen)) {
    return {
      optionen: ergebnisse,
      stimmenGesamt,
      kapitalAbgegeben,
      kapitalGesamt,
      beteiligungProzent,
      quorumErreicht,
      angenommen: null,
      begruendung:
        "Aus den Antwortmöglichkeiten lässt sich keine Zustimmung und " +
        "Ablehnung ablesen — die Auszählung steht, ein Beschluss ergibt " +
        "sich daraus nicht.",
    };
  }

  if (!quorumErreicht) {
    return {
      optionen: ergebnisse,
      stimmenGesamt,
      kapitalAbgegeben,
      kapitalGesamt,
      beteiligungProzent,
      quorumErreicht,
      angenommen: false,
      begruendung: `Quorum nicht erreicht (${beteiligungProzent.toFixed(1)} % von ${quorumProzent} % erforderlich)`,
    };
  }

  // Enthaltungen zaehlen fuer das Quorum, nicht fuer die Mehrheit — siehe
  // Kopf der Datei. Hier lagen die beiden Auszaehlungen auseinander.
  const ja = ergebnisse.filter((r) => istJa(r.option));
  const nein = ergebnisse.filter((r) => istNein(r.option));

  const jaWert = kapitalmehrheit
    ? ja.reduce((s, r) => s + r.kapital, 0)
    : ja.reduce((s, r) => s + r.anzahl, 0);
  const neinWert = kapitalmehrheit
    ? nein.reduce((s, r) => s + r.kapital, 0)
    : nein.reduce((s, r) => s + r.anzahl, 0);

  const grundlage = jaWert + neinWert;
  const angenommen = grundlage > 0 && jaWert > grundlage / 2;
  const einheit = kapitalmehrheit ? "Kapitalanteil" : "Köpfen";

  return {
    optionen: ergebnisse,
    stimmenGesamt,
    kapitalAbgegeben,
    kapitalGesamt,
    beteiligungProzent,
    quorumErreicht,
    angenommen,
    begruendung:
      grundlage === 0
        ? "Keine Stimme für oder gegen den Antrag — nur Enthaltungen"
        : angenommen
          ? `Mehrheit nach ${einheit} erreicht`
          : `Keine Mehrheit nach ${einheit}`,
  };
}
