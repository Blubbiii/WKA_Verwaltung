import { describe, expect, it } from "vitest";
import {
  findeAbweichungen,
  giltAm,
  gueltigeAm,
  pruefeQuoten,
} from "./parties";

const d = (iso: string) => new Date(iso);

describe("giltAm", () => {
  it("zaehlt den letzten Tag noch mit", () => {
    // `validTo` ist EINSCHLIESSLICH — wie bei LeaseLessor. Wuerde auf
    // Zeitstempel verglichen, fiele ein Eintrag mit validTo auf Mitternacht
    // an seinem letzten Tag bereits heraus. Genau ein Tag Unterschied, und
    // er entscheidet bei einem Flurschaden darueber, wer auf der Flaeche war.
    const eintrag = {
      personId: "p1",
      validFrom: d("2026-01-01T00:00:00Z"),
      validTo: d("2026-06-30T00:00:00Z"),
    };

    expect(giltAm(eintrag, d("2026-06-30T23:59:00Z")), "letzter Tag").toBe(true);
    expect(giltAm(eintrag, d("2026-07-01T00:00:00Z")), "Folgetag").toBe(false);
    expect(giltAm(eintrag, d("2026-01-01T06:00:00Z")), "erster Tag").toBe(true);
    expect(giltAm(eintrag, d("2025-12-31T23:00:00Z")), "Vortag").toBe(false);
  });

  it("behandelt offene Enden als offen", () => {
    const seitJeher = { personId: "p1", validFrom: null, validTo: null };
    expect(giltAm(seitJeher, d("1999-01-01T00:00:00Z"))).toBe(true);
    expect(giltAm(seitJeher, d("2099-01-01T00:00:00Z"))).toBe(true);
  });
});

describe("gueltigeAm", () => {
  it("bildet einen Eigentuemerwechsel sauber ab", () => {
    // Der alte Eintrag wird abgegrenzt, der neue beginnt am Folgetag. Beide
    // bleiben stehen — sonst verloere eine abgerechnete Periode ihre
    // Grundlage.
    const eintraege = [
      { personId: "alt", validFrom: null, validTo: d("2026-06-30T00:00:00Z") },
      { personId: "neu", validFrom: d("2026-07-01T00:00:00Z"), validTo: null },
    ];

    expect(gueltigeAm(eintraege, d("2026-06-15T00:00:00Z")).map((e) => e.personId))
      .toEqual(["alt"]);
    expect(gueltigeAm(eintraege, d("2026-08-15T00:00:00Z")).map((e) => e.personId))
      .toEqual(["neu"]);

    // Am Uebergabetag selbst darf es nicht beide UND nicht keinen geben.
    const amStichtag = gueltigeAm(eintraege, d("2026-06-30T12:00:00Z"));
    expect(
      amStichtag.map((e) => e.personId),
      "Am 30.06. gilt noch der alte Eigentuemer — der neue beginnt am 01.07.",
    ).toEqual(["alt"]);
  });
});

describe("pruefeQuoten", () => {
  it("meldet eine Luecke", () => {
    const pruefung = pruefeQuoten([
      { personId: "a", sharePercent: 50, validFrom: null, validTo: null },
      { personId: "b", sharePercent: 25, validFrom: null, validTo: null },
    ]);
    expect(pruefung.stimmt).toBe(false);
    expect(pruefung.summe).toBe(75);
    expect(pruefung.hinweis).toMatch(/75/);
  });

  it("vertraegt Rundung auf vier Nachkommastellen", () => {
    // Drei Erben zu gleichen Teilen. Ohne Toleranz meldete das eine
    // Abweichung, und der Hinweis stuende dauerhaft an einem korrekt
    // erfassten Flurstueck.
    const pruefung = pruefeQuoten([
      { personId: "a", sharePercent: 33.3333, validFrom: null, validTo: null },
      { personId: "b", sharePercent: 33.3333, validFrom: null, validTo: null },
      { personId: "c", sharePercent: 33.3334, validFrom: null, validTo: null },
    ]);
    expect(pruefung.stimmt).toBe(true);
    expect(pruefung.hinweis).toBeNull();
  });

  it("schweigt, wenn gar nichts erfasst ist", () => {
    // „Nichts erfasst" ist etwas anderes als „falsch erfasst". Eine Warnung
    // an jedem Flurstueck ohne Angaben liest nach einer Woche niemand mehr.
    const pruefung = pruefeQuoten([]);
    expect(pruefung.stimmt).toBe(true);
    expect(pruefung.hinweis).toBeNull();
  });

  it("betrachtet nur die am Stichtag gueltigen Quoten", () => {
    // Waehrend eines Wechsels stehen alte und neue Quoten nebeneinander in
    // der Tabelle. Wer sie alle addiert, kommt auf 200 % und meldet einen
    // Fehler, wo keiner ist.
    const pruefung = pruefeQuoten(
      [
        { personId: "alt", sharePercent: 100, validFrom: null, validTo: d("2026-06-30T00:00:00Z") },
        { personId: "neu", sharePercent: 100, validFrom: d("2026-07-01T00:00:00Z"), validTo: null },
      ],
      d("2026-08-01T00:00:00Z"),
    );
    expect(pruefung.summe).toBe(100);
    expect(pruefung.stimmt).toBe(true);
  });
});

describe("findeAbweichungen", () => {
  it("meldet einen Verpaechter, der nicht als Eigentuemer eingetragen ist", () => {
    const abw = findeAbweichungen(
      [{ personId: "a", name: "Anna Ackermann" }],
      [{ personId: "b", name: "Bernd Bauer" }],
    );
    expect(abw.map((x) => x.art).sort()).toEqual([
      "nur-eigentuemer",
      "nur-verpaechter",
    ]);
    expect(abw.find((x) => x.art === "nur-verpaechter")?.erklaerung).toMatch(
      /Nießbraucher|unvollständig/,
    );
  });

  it("schweigt, wenn beide dieselbe Person nennen", () => {
    const abw = findeAbweichungen(
      [{ personId: "a", name: "Anna Ackermann" }],
      [{ personId: "a", name: "Anna Ackermann" }],
    );
    expect(abw).toEqual([]);
  });

  it("schweigt, wenn eine Seite gar nicht erfasst ist", () => {
    // Ein Flurstueck ohne Eigentuemerangabe ist unvollstaendig, nicht
    // widerspruechlich. Der Hinweis stuende sonst auf jedem zweiten
    // Flurstueck und verloere jede Wirkung.
    expect(findeAbweichungen([], [{ personId: "b", name: "Bernd" }])).toEqual([]);
    expect(findeAbweichungen([{ personId: "a", name: "Anna" }], [])).toEqual([]);
  });

  it("meldet einen fehlenden Miteigentuemer im Vertrag", () => {
    // Erbengemeinschaft: zwei Eigentuemer, aber nur einer hat unterschrieben.
    // Der Vertrag deckt die Flaeche damit nicht vollstaendig ab — das ist
    // der Fall, fuer den dieser Hinweis da ist.
    const abw = findeAbweichungen(
      [
        { personId: "a", name: "Anna Ackermann" },
        { personId: "b", name: "Bernd Ackermann" },
      ],
      [{ personId: "a", name: "Anna Ackermann" }],
    );
    expect(abw).toHaveLength(1);
    expect(abw[0].name).toBe("Bernd Ackermann");
    expect(abw[0].art).toBe("nur-eigentuemer");
  });
});
