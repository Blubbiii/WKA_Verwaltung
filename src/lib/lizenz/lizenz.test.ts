import { describe, expect, it } from "vitest";
import {
  KARENZ_TAGE,
  anlegenVerweigert,
  lizenzLage,
  lizenzMeldung,
  neuGezaehlt,
  sperrtNachKarenz,
  wirksameGrenzen,
  zaehlerFuerFirma,
  type Verbrauch,
} from "./lizenz";

const TARIF_M = {
  name: "M",
  maxFirmen: 3,
  maxUmspannwerke: 1,
  maxWea: 10,
  maxBenutzer: 5,
  maxSpeicherMb: 10_240,
};

const IM_RAHMEN: Verbrauch = { firmen: 3, umspannwerke: 1, wea: 10, benutzer: 5, speicherMb: 900 };
const TAG = 86_400_000;

describe("Lizenz: wirksame Grenzen", () => {
  it("ohne Tarif ist alles unbegrenzt — bestehende Kunden werden nicht gebremst", () => {
    expect(wirksameGrenzen(null, null)).toEqual({
      firmen: null,
      umspannwerke: null,
      wea: null,
      benutzer: null,
      speicherMb: null,
    });
  });

  it("die Sonderregel je Kunde schlägt den Tarif, nur für die genannten Zähler", () => {
    expect(wirksameGrenzen(TARIF_M, { wea: 12 })).toEqual({
      firmen: 3,
      umspannwerke: 1,
      wea: 12,
      benutzer: 5,
      speicherMb: 10_240,
    });
  });

  it("null im Tarif heißt unbegrenzt", () => {
    expect(wirksameGrenzen({ ...TARIF_M, maxBenutzer: null }, null).benutzer).toBeNull();
  });
});

describe("Lizenz: anlegen", () => {
  const grenzen = wirksameGrenzen(TARIF_M, null);

  it("genau am Limit ist nichts mehr frei", () => {
    expect(anlegenVerweigert(grenzen, IM_RAHMEN, "wea")).toEqual({ zaehler: "wea", grenze: 10, verbrauch: 10 });
    expect(anlegenVerweigert(grenzen, { ...IM_RAHMEN, wea: 9 }, "wea")).toBeNull();
  });

  it("mehrere auf einmal (Import, Park-Assistent) zählen zusammen", () => {
    expect(anlegenVerweigert(grenzen, { ...IM_RAHMEN, wea: 7 }, "wea", 3)).toBeNull();
    expect(anlegenVerweigert(grenzen, { ...IM_RAHMEN, wea: 7 }, "wea", 4)).not.toBeNull();
  });

  it("unbegrenzt verweigert nie", () => {
    expect(anlegenVerweigert(wirksameGrenzen(null, null), IM_RAHMEN, "benutzer", 100)).toBeNull();
  });

  it("die Meldung nennt Tarif, Umfang und Stand", () => {
    expect(lizenzMeldung("M", { zaehler: "wea", grenze: 10, verbrauch: 12 })).toBe(
      "Ihr Tarif M umfasst 10 WEA, angelegt sind 12. Bitte buchen Sie eine größere Stufe.",
    );
    expect(lizenzMeldung("M", { zaehler: "umspannwerke", grenze: 1, verbrauch: 1 })).toBe(
      "Ihr Tarif M umfasst 1 Umspannwerk, angelegt ist 1. Bitte buchen Sie eine größere Stufe.",
    );
  });
});

describe("Lizenz: Lage und Karenzfrist", () => {
  const grenzen = wirksameGrenzen(TARIF_M, null);
  const jetzt = new Date("2026-10-01T12:00:00Z");

  it("im Rahmen: nichts überschritten, keine Frist", () => {
    const lage = lizenzLage(grenzen, IM_RAHMEN, null, jetzt);
    expect(lage.ueberschritten).toEqual([]);
    expect(lage.karenzBis).toBeNull();
    expect(lage.gesperrt).toBe(false);
  });

  it("überschritten: die Frist läuft ab dem ersten Tag, gesperrt erst danach", () => {
    const seit = new Date(jetzt.getTime() - 5 * TAG);
    const lage = lizenzLage(grenzen, { ...IM_RAHMEN, wea: 12 }, seit, jetzt);
    expect(lage.ueberschritten).toEqual(["wea"]);
    expect(lage.karenzBis?.getTime()).toBe(seit.getTime() + KARENZ_TAGE * TAG);
    expect(lage.gesperrt).toBe(false);
    expect(KARENZ_TAGE).toBe(30);
  });

  it("nach Ablauf der Frist gesperrt", () => {
    const seit = new Date(jetzt.getTime() - 31 * TAG);
    expect(lizenzLage(grenzen, { ...IM_RAHMEN, benutzer: 6 }, seit, jetzt).gesperrt).toBe(true);
  });

  it("wieder im Rahmen: keine Sperre, auch wenn ein altes Datum noch steht", () => {
    const seit = new Date(jetzt.getTime() - 90 * TAG);
    expect(lizenzLage(grenzen, IM_RAHMEN, seit, jetzt).gesperrt).toBe(false);
  });
});

describe("Lizenz: was die Sperre nach der Frist trifft", () => {
  it("Anlegen und Bearbeiten von Stammdaten", () => {
    for (const recht of ["parks:create", "parks:update", "plots:update", "contracts:create", "documents:create", "crm:update"]) {
      expect(sperrtNachKarenz(recht), recht).toBe(true);
    }
  });

  it("Lesen, Export, Löschen bleiben frei — wer den Verbrauch senken will, muss es können", () => {
    for (const recht of ["parks:read", "parks:export", "parks:delete", "turbines:delete", "users:delete"]) {
      expect(sperrtNachKarenz(recht), recht).toBe(false);
    }
  });

  it("Abrechnungen, Rechnungen und Gutschriften laufen weiter — sonst träfe es Dritte", () => {
    for (const recht of ["invoices:create", "invoices:update", "energy:create", "leases:update", "management-billing:create"]) {
      expect(sperrtNachKarenz(recht), recht).toBe(false);
    }
  });

  it("Benutzer deaktivieren und Gesellschaften umstellen bleibt möglich", () => {
    expect(sperrtNachKarenz("users:update")).toBe(false);
    expect(sperrtNachKarenz("funds:update")).toBe(false);
  });
});

describe("Lizenz: welche Gesellschaft zählt als was", () => {
  const aktiv = { verwaltung: "AKTIV" as const, status: "ACTIVE", kategorieCode: "BETREIBER" };

  it("aktiv verwaltet zählt als Firma, als Umspannwerk-Gesellschaft als Umspannwerk", () => {
    expect(zaehlerFuerFirma(aktiv)).toBe("firmen");
    expect(zaehlerFuerFirma({ ...aktiv, kategorieCode: null })).toBe("firmen");
    expect(zaehlerFuerFirma({ ...aktiv, kategorieCode: "UMSPANNWERK" })).toBe("umspannwerke");
  });

  it("nur beteiligt oder archiviert zählt nicht", () => {
    expect(zaehlerFuerFirma({ ...aktiv, verwaltung: "BETEILIGUNG" })).toBeNull();
    expect(zaehlerFuerFirma({ ...aktiv, status: "ARCHIVED" })).toBeNull();
  });

  it("beim Ändern wird nur geprüft, was neu hinzukommt", () => {
    const beteiligt = { ...aktiv, verwaltung: "BETEILIGUNG" as const };
    expect(neuGezaehlt(beteiligt, aktiv)).toBe("firmen");
    expect(neuGezaehlt(aktiv, { ...aktiv, kategorieCode: "UMSPANNWERK" })).toBe("umspannwerke");
    expect(neuGezaehlt({ ...aktiv, status: "ARCHIVED" }, aktiv)).toBe("firmen");
    // Unchanged, or becoming uncounted, needs no check.
    expect(neuGezaehlt(aktiv, { ...aktiv, status: "INACTIVE" })).toBeNull();
    expect(neuGezaehlt(aktiv, beteiligt)).toBeNull();
  });
});
