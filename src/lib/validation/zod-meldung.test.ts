/**
 * Validierungsmeldungen auf Deutsch und mit Feldname.
 *
 * 46 Routen reichten `issues[0].message` durch. Zod spricht ohne Einstellung
 * Englisch und nennt das Feld nicht: der Lieferanten-Dialog zeigte
 * "Too big: expected string to have <=11 characters" — welches Feld, blieb offen.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodMeldung } from "./zod-meldung";

describe("zodMeldung", () => {
  it("nennt Feld und Grund auf Deutsch", () => {
    const fehler = z.object({ bic: z.string().max(11) }).safeParse({ bic: "COBADEFFXXX123" }).error!;
    expect(zodMeldung(fehler)).toBe("bic: Zu groß: erwartet, dass string <=11 Zeichen hat");
  });

  it("behält eigene deutsche Meldungen des Schemas", () => {
    const fehler = z.object({ name: z.string().min(1, "Name ist erforderlich") }).safeParse({ name: "" }).error!;
    expect(zodMeldung(fehler)).toBe("name: Name ist erforderlich");
  });

  it("verschachtelte Felder mit Punkt, Fehler ohne Feld ohne Präfix", () => {
    const tief = z.object({ items: z.array(z.object({ unitPrice: z.number() })) })
      .safeParse({ items: [{ unitPrice: "x" }] }).error!;
    expect(zodMeldung(tief)).toMatch(/^items\.0\.unitPrice: /);
    const flach = z.string().safeParse(3).error!;
    expect(zodMeldung(flach)).not.toContain(":  ");
    expect(zodMeldung(flach)).toMatch(/^Ungültige Eingabe/);
  });
});
