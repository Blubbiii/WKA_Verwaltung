/**
 * Notiz an einer Gesellschaft = CRM-Notiz (Entscheidung E2, 2026-09).
 *
 * Die Gesellschaften-Liste hatte eine bearbeitbare Spalte "Notiz", aber
 * `Fund` hat kein Notizfeld — gespeichert wurde nichts. Jetzt legt jede
 * Eingabe eine CRM-Notiz an; die Historie steht unter "Aktivitäten".
 */

import { describe, expect, it } from "vitest";
import { notizAlsAktivitaet, notizText } from "./notiz";

describe("notizAlsAktivitaet", () => {
  it("kurzer Text: Titel ist der Text", () => {
    expect(notizAlsAktivitaet("Beiratssitzung verschoben", "f1")).toEqual({
      type: "NOTE", title: "Beiratssitzung verschoben", description: "Beiratssitzung verschoben", fundId: "f1",
    });
  });

  it("langer oder mehrzeiliger Text: Titel ist die erste Zeile, gekürzt auf 120 Zeichen", () => {
    const text = "Erste Zeile\nZweite Zeile";
    expect(notizAlsAktivitaet(text, "f1")!.title).toBe("Erste Zeile");
    const lang = "x".repeat(300);
    expect(notizAlsAktivitaet(lang, "f1")!.title).toBe("x".repeat(119) + "…");
    expect(notizAlsAktivitaet(lang, "f1")!.description).toBe(lang);
  });

  it("leerer Text: keine Notiz", () => {
    expect(notizAlsAktivitaet("   ", "f1")).toBeNull();
  });
});

describe("notizText", () => {
  it("zeigt die Beschreibung, sonst den Titel", () => {
    expect(notizText({ title: "T", description: "Beschreibung" })).toBe("Beschreibung");
    expect(notizText({ title: "T", description: null })).toBe("T");
    expect(notizText(null)).toBeNull();
  });
});
