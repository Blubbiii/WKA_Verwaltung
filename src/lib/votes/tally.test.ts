import { describe, expect, it } from "vitest";
import {
  beschlussfaehigeOptionen,
  stimmgewicht,
  zaehleAus,
  type AuszaehlungEingabe,
} from "./tally";

const STANDARD = ["Ja", "Nein", "Enthaltung"];

function eingabe(teil: Partial<AuszaehlungEingabe> = {}): AuszaehlungEingabe {
  return {
    stimmen: [],
    stimmberechtigte: [],
    optionen: STANDARD,
    quorumProzent: null,
    kapitalmehrheit: false,
    ...teil,
  };
}

/** Kurzschreibweise: eine Stimme mit Gewicht. */
const stimme = (option: string, gewicht: number) => ({
  selectedOption: option,
  votingRightsPercentage: gewicht,
  ownershipPercentage: null,
});

describe("Enthaltungen", () => {
  it("zaehlen fuer das Quorum, aber nicht fuer die Mehrheit", () => {
    // DER FALL, an dem die beiden Auszaehlungen auseinanderlagen.
    //
    // 45 % Ja, 40 % Nein, 15 % Enthaltung:
    //   - Das Gesellschafterportal rechnete 45 von 85 → angenommen.
    //   - Die Verwaltungsansicht rechnete 45 von 100 → abgelehnt.
    //
    // Derselbe Beschluss, zwei Ergebnisse, je nachdem wer hinsieht. Richtig
    // ist die erste Lesart: die Enthaltung ist keine Stimme fuer oder gegen
    // den Antrag (§ 47 GmbHG — Mehrheit der ABGEGEBENEN Stimmen).
    const ergebnis = zaehleAus(
      eingabe({
        stimmen: [
          stimme("Ja", 45),
          stimme("Nein", 40),
          stimme("Enthaltung", 15),
        ],
        stimmberechtigte: [
          { votingRightsPercentage: 45, ownershipPercentage: null },
          { votingRightsPercentage: 40, ownershipPercentage: null },
          { votingRightsPercentage: 15, ownershipPercentage: null },
        ],
        kapitalmehrheit: true,
      }),
    );

    expect(
      ergebnis.angenommen,
      "45 % Ja gegen 40 % Nein ist eine Mehrheit. Die 15 % Enthaltung " +
        "gehoeren nicht in die Grundlage — sonst kann ein Antrag an " +
        "Enthaltungen scheitern, obwohl mehr dafuer als dagegen gestimmt haben.",
    ).toBe(true);

    // Die Beteiligung zaehlt die Enthaltungen dagegen MIT — sie sind
    // abgegebene Stimmen und damit Teil des Quorums.
    expect(ergebnis.beteiligungProzent).toBeCloseTo(100, 5);
  });

  it("allein reichen fuer keinen Beschluss", () => {
    const ergebnis = zaehleAus(
      eingabe({
        stimmen: [stimme("Enthaltung", 60)],
        stimmberechtigte: [{ votingRightsPercentage: 60, ownershipPercentage: null }],
        kapitalmehrheit: true,
      }),
    );
    expect(ergebnis.angenommen).toBe(false);
    expect(ergebnis.begruendung).toMatch(/nur Enthaltungen/i);
  });
});

describe("Eigene Antwortmoeglichkeiten", () => {
  it("werden ausgezaehlt, auch wenn sie nicht Ja und Nein heissen", () => {
    const ergebnis = zaehleAus(
      eingabe({
        optionen: ["Variante A", "Variante B"],
        stimmen: [stimme("Variante A", 70), stimme("Variante B", 30)],
        stimmberechtigte: [
          { votingRightsPercentage: 70, ownershipPercentage: null },
          { votingRightsPercentage: 30, ownershipPercentage: null },
        ],
      }),
    );

    const a = ergebnis.optionen.find((o) => o.option === "Variante A")!;
    expect(a.anzahl).toBe(1);
    expect(a.kapital).toBe(70);
    expect(a.anteilKapital).toBeCloseTo(70, 5);
  });

  it("ergeben aber KEINEN Beschluss — und das heisst nicht abgelehnt", () => {
    // Die Verwaltungsansicht suchte den Zustimmungsanteil ueber den Text
    // „Ja". Bei „Zustimmung"/„Ablehnung" kam dort immer 0 heraus, und die
    // Abstimmung wurde als ABGELEHNT angezeigt — egal wie alle gestimmt
    // hatten. Eine Falschaussage ueber einen Gesellschafterbeschluss.
    const ergebnis = zaehleAus(
      eingabe({
        optionen: ["Variante A", "Variante B"],
        stimmen: [stimme("Variante A", 90)],
        stimmberechtigte: [{ votingRightsPercentage: 90, ownershipPercentage: null }],
      }),
    );

    expect(
      ergebnis.angenommen,
      "Ohne erkennbare Zustimmung und Ablehnung gibt es kein Ergebnis im " +
        "Sinne von angenommen oder abgelehnt. `false` waere hier eine " +
        "Behauptung, die niemand aufgestellt hat.",
    ).toBeNull();
  });

  it("erkennt gaengige deutsche Bezeichnungen", () => {
    expect(beschlussfaehigeOptionen(["Zustimmung", "Ablehnung"])).toBe(true);
    expect(beschlussfaehigeOptionen(["Dafür", "Dagegen"])).toBe(true);
    expect(beschlussfaehigeOptionen(["Ja", "Nein"])).toBe(true);
    expect(beschlussfaehigeOptionen(["Variante A", "Variante B"])).toBe(false);
    // Nur eine Seite genuegt nicht — sonst waere jede Zustimmung ohne
    // Gegenoption automatisch angenommen.
    expect(beschlussfaehigeOptionen(["Ja", "Enthaltung"])).toBe(false);
  });
});

describe("Stimmgewicht", () => {
  it("unterscheidet „nicht gesetzt\" von „kein Stimmrecht\"", () => {
    // Beide Auszaehlungen nutzten `||`. Damit fiel eine ausdrueckliche 0 auf
    // den Kapitalanteil zurueck: wer stimmrechtslose Anteile haelt, stimmte
    // mit vollem Gewicht mit.
    expect(
      stimmgewicht({ votingRightsPercentage: 0, ownershipPercentage: 25 }),
      "Ein ausdrueckliches Stimmrecht von 0 % heisst: keine Stimme. Nicht: " +
        "nimm ersatzweise den Kapitalanteil.",
    ).toBe(0);

    // null heisst dagegen „nicht gesetzt" — dann gilt der Kapitalanteil.
    expect(stimmgewicht({ votingRightsPercentage: null, ownershipPercentage: 25 })).toBe(25);
    expect(stimmgewicht({ votingRightsPercentage: null, ownershipPercentage: null })).toBe(0);
  });

  it("laesst einen Stimmrechtslosen das Ergebnis nicht kippen", () => {
    const ergebnis = zaehleAus(
      eingabe({
        stimmen: [
          stimme("Ja", 30),
          { selectedOption: "Nein", votingRightsPercentage: 0, ownershipPercentage: 60 },
        ],
        stimmberechtigte: [
          { votingRightsPercentage: 30, ownershipPercentage: null },
          { votingRightsPercentage: 0, ownershipPercentage: 60 },
        ],
        kapitalmehrheit: true,
      }),
    );

    expect(
      ergebnis.angenommen,
      "Der Gesellschafter ohne Stimmrecht hat mit seinem KAPITALanteil von " +
        "60 % gegen 30 % Ja gestimmt und den Beschluss gekippt.",
    ).toBe(true);
  });
});

describe("Quorum", () => {
  it("wird an allen Stimmberechtigten gemessen, nicht an den Abgegebenen", () => {
    const ergebnis = zaehleAus(
      eingabe({
        stimmen: [stimme("Ja", 30)],
        stimmberechtigte: [
          { votingRightsPercentage: 30, ownershipPercentage: null },
          { votingRightsPercentage: 70, ownershipPercentage: null },
        ],
        quorumProzent: 50,
        kapitalmehrheit: true,
      }),
    );

    expect(ergebnis.beteiligungProzent).toBeCloseTo(30, 5);
    expect(ergebnis.quorumErreicht).toBe(false);
    expect(ergebnis.angenommen).toBe(false);
    expect(ergebnis.begruendung).toMatch(/Quorum/);
  });

  it("kommt ohne Stimmberechtigte nicht ins Rutschen", () => {
    // 0/0. Ohne Sonderbehandlung waere die Beteiligung NaN, und `NaN >= 50`
    // ist false — das Ergebnis waere zufaellig richtig aus dem falschen Grund.
    const ergebnis = zaehleAus(eingabe({ quorumProzent: 50 }));
    expect(Number.isNaN(ergebnis.beteiligungProzent)).toBe(false);
    expect(ergebnis.beteiligungProzent).toBe(0);
    expect(ergebnis.quorumErreicht).toBe(false);
  });
});

describe("Stimme auf eine geloeschte Option", () => {
  it("wird nicht stillschweigend mitgezaehlt", () => {
    // Werden die Antwortmoeglichkeiten nach Beginn geaendert, zeigen alte
    // Stimmen ins Leere. Zaehlte man sie in die Gesamtzahl, summierten sich
    // die Anteile nicht auf 100 % — ohne dass jemand saehe, warum.
    const ergebnis = zaehleAus(
      eingabe({
        stimmen: [stimme("Ja", 50), stimme("Vielleicht", 50)],
        stimmberechtigte: [
          { votingRightsPercentage: 50, ownershipPercentage: null },
          { votingRightsPercentage: 50, ownershipPercentage: null },
        ],
      }),
    );

    expect(ergebnis.stimmenGesamt).toBe(1);
    const summe = ergebnis.optionen.reduce((s, o) => s + o.anteilKapital, 0);
    expect(summe).toBeCloseTo(100, 5);
  });
});
