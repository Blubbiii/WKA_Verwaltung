import { describe, expect, it } from "vitest";
import {
  LEERE_PREFS,
  MAX_FAVORITEN,
  alleFavoriten,
  gruppeAnlegen,
  gruppeLoeschen,
  gruppeSichtbarkeit,
  gruppeUmbenennen,
  istFavorit,
  lesePrefs,
  umschalten,
  zuordnen,
  type SidebarPrefs,
} from "./prefs";

const mitGruppe: SidebarPrefs = {
  gruppen: [{ id: "g1", name: "Monatsabschluss", hrefs: ["/invoices"] }],
  lose: ["/parks"],
  versteckteGruppen: [],
};

describe("istFavorit", () => {
  it("findet Favoriten in Gruppen und lose", () => {
    expect(istFavorit(mitGruppe, "/invoices")).toBe(true);
    expect(istFavorit(mitGruppe, "/parks")).toBe(true);
    expect(istFavorit(mitGruppe, "/documents")).toBe(false);
  });
});

describe("umschalten", () => {
  it("legt neue Favoriten LOSE an, nie in einer Gruppe", () => {
    // Welche Gruppe die richtige waere, weiss nur der Nutzer. Ihn beim
    // Setzen des Sterns danach zu fragen macht aus einem Klick einen Dialog.
    const neu = umschalten(mitGruppe, "/documents");
    expect(neu.lose).toContain("/documents");
    expect(neu.gruppen[0].hrefs).not.toContain("/documents");
  });

  it("entfernt auch aus einer Gruppe", () => {
    const neu = umschalten(mitGruppe, "/invoices");
    expect(istFavorit(neu, "/invoices")).toBe(false);
    expect(neu.gruppen[0].hrefs).toEqual([]);
  });

  it("nimmt nicht mehr als die Obergrenze auf", () => {
    // Eine Seitenleiste mit dreissig Favoriten ist keine mehr.
    let p: SidebarPrefs = { ...LEERE_PREFS };
    for (let i = 0; i < MAX_FAVORITEN + 5; i++) {
      p = umschalten(p, `/seite-${i}`);
    }
    expect(alleFavoriten(p)).toHaveLength(MAX_FAVORITEN);
  });
});

describe("zuordnen", () => {
  it("laesst ein Ziel an genau EINER Stelle stehen", () => {
    // Laege dasselbe Ziel in zwei Gruppen, waere nicht zu sagen, welche es
    // beim Entfernen trifft.
    const zwei: SidebarPrefs = {
      gruppen: [
        { id: "g1", name: "A", hrefs: ["/x"] },
        { id: "g2", name: "B", hrefs: [] },
      ],
      lose: [],
      versteckteGruppen: [],
    };
    const neu = zuordnen(zwei, "/x", "g2");
    expect(neu.gruppen[0].hrefs).toEqual([]);
    expect(neu.gruppen[1].hrefs).toEqual(["/x"]);
    expect(alleFavoriten(neu).filter((h) => h === "/x")).toHaveLength(1);
  });

  it("holt ein Ziel mit null wieder aus der Gruppe", () => {
    const neu = zuordnen(mitGruppe, "/invoices", null);
    expect(neu.lose).toContain("/invoices");
    expect(neu.gruppen[0].hrefs).toEqual([]);
  });
});

describe("gruppeLoeschen", () => {
  it("behaelt die Favoriten und macht sie lose", () => {
    // Der Nutzer wollte die Ordnung aufloesen, nicht die Auswahl. Die
    // Eintraege mitzuloeschen waere eine Ueberraschung — und eine, die er
    // nicht rueckgaengig machen kann.
    const neu = gruppeLoeschen(mitGruppe, "g1");
    expect(neu.gruppen).toHaveLength(0);
    expect(neu.lose).toContain("/invoices");
    expect(neu.lose).toContain("/parks");
  });
});

describe("gruppeAnlegen und umbenennen", () => {
  it("lehnt leere Namen ab", () => {
    expect(gruppeAnlegen(LEERE_PREFS, "   ", "g9").gruppen).toHaveLength(0);
    const nachher = gruppeUmbenennen(mitGruppe, "g1", "  ");
    expect(nachher.gruppen[0].name).toBe("Monatsabschluss");
  });

  it("kuerzt zu lange Namen, statt das Layout zu sprengen", () => {
    const lang = "x".repeat(200);
    const neu = gruppeAnlegen(LEERE_PREFS, lang, "g9");
    expect(neu.gruppen[0].name.length).toBeLessThanOrEqual(40);
  });

  it("behaelt die Zuordnung beim Umbenennen", () => {
    // Deshalb hat eine Gruppe eine Kennung und nicht nur einen Namen.
    const neu = gruppeUmbenennen(mitGruppe, "g1", "Quartal");
    expect(neu.gruppen[0].name).toBe("Quartal");
    expect(neu.gruppen[0].hrefs).toEqual(["/invoices"]);
  });
});

describe("gruppeSichtbarkeit", () => {
  it("schaltet hin und her", () => {
    const aus = gruppeSichtbarkeit(LEERE_PREFS, "windparks");
    expect(aus.versteckteGruppen).toEqual(["windparks"]);
    const wieder = gruppeSichtbarkeit(aus, "windparks");
    expect(wieder.versteckteGruppen).toEqual([]);
  });
});

describe("lesePrefs", () => {
  it("uebersteht Unsinn im Speicher", () => {
    // Die Einstellungen liegen als JSON im Benutzerdatensatz. Was dort
    // steht, kann aus einer aelteren Fassung stammen — eine kaputte
    // Einstellung darf die Seitenleiste nicht mitreissen.
    for (const unsinn of [null, undefined, 42, "text", [], { gruppen: "nein" }]) {
      const p = lesePrefs(unsinn);
      expect(Array.isArray(p.gruppen)).toBe(true);
      expect(Array.isArray(p.lose)).toBe(true);
      expect(Array.isArray(p.versteckteGruppen)).toBe(true);
    }
  });

  it("wirft Gruppen ohne Kennung oder Namen weg", () => {
    const p = lesePrefs({
      gruppen: [{ id: "g1", name: "Gut", hrefs: ["/a"] }, { name: "ohne Id" }, null],
      lose: ["/b", 7],
    });
    expect(p.gruppen).toHaveLength(1);
    expect(p.gruppen[0].id).toBe("g1");
    expect(p.lose).toEqual(["/b"]);
  });
});
