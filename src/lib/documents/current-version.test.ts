import { describe, expect, it } from "vitest";
import { kettenWurzel, markiereAktuelle } from "./current-version";

describe("kettenWurzel", () => {
  it("fuehrt Wurzel und Fassung zur selben Kette", () => {
    // Beide Wege muessen bei derselben Kette landen. Taeten sie es nicht,
    // haenge die aktuelle Fassung davon ab, ueber welche Kennung man
    // hereinkommt — und genau das war der Fehler: die Wurzel loeste auf sich
    // selbst auf und lieferte damit immer die erste Fassung.
    expect(kettenWurzel({ id: "wurzel", parentId: null })).toBe("wurzel");
    expect(kettenWurzel({ id: "fassung-3", parentId: "wurzel" })).toBe("wurzel");
  });
});

describe("markiereAktuelle", () => {
  it("markiert die hoechste Version, nicht die erste", () => {
    // Der Fund: die Wurzel stand fest auf `isCurrent: true`. Sie traegt aber
    // Version 1 — die AELTESTE Fassung. Die Historie ist absteigend
    // sortiert, also trug die unterste Zeile das Kennzeichen "Aktuell",
    // waehrend die neueste oben ohne stand.
    const fassungen = markiereAktuelle([
      { version: 1, name: "urspruenglich" },
      { version: 3, name: "berichtigt" },
      { version: 2, name: "zwischendurch" },
    ]);

    const aktuell = fassungen.filter((f) => f.isCurrent);
    expect(
      aktuell.map((f) => f.name),
      "Aktuell ist genau die Fassung mit der hoechsten Versionsnummer",
    ).toEqual(["berichtigt"]);
  });

  it("markiert bei nur einer Fassung genau diese", () => {
    const fassungen = markiereAktuelle([{ version: 1 }]);
    expect(fassungen[0].isCurrent).toBe(true);
  });

  it("kommt mit einer leeren Liste zurecht", () => {
    // Ohne Sonderbehandlung waere das Maximum -Infinity und der Vergleich
    // liefe ins Leere statt zu werfen. Hier soll schlicht nichts markiert
    // sein.
    expect(markiereAktuelle([])).toEqual([]);
  });

  it("markiert bei doppelter hoechster Nummer beide", () => {
    // Sollte nicht vorkommen — die Nummer wird beim Anlegen hochgezaehlt.
    // Wenn doch, ist zwei markierte Zeilen die ehrlichere Anzeige als eine
    // willkuerlich gewaehlte.
    const fassungen = markiereAktuelle([{ version: 2 }, { version: 2 }]);
    expect(fassungen.every((f) => f.isCurrent)).toBe(true);
  });
});
