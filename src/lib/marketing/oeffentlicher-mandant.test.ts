/**
 * Welcher Mandant liefert die öffentlichen Seiten?
 *
 * Startseite, Impressum, Datenschutz und Cookie-Hinweis lasen bisher beim
 * erstbesten aktiven Mandanten (`findFirst` ohne Sortierung). Bei mehreren
 * Mandanten stand damit womöglich das Impressum einer fremden Firma auf der
 * öffentlichen Seite — eine Pflichtangabe nach § 5 DDG. Und wer sein
 * Impressum im Admin-Bereich pflegte, sah es unter Umständen nie erscheinen.
 */

import { describe, expect, it } from "vitest";
import { waehleOeffentlichenMandanten } from "./oeffentlicher-mandant";

const A = { id: "a", slug: "betreiber" };
const B = { id: "b", slug: "kunde" };

describe("waehleOeffentlichenMandanten", () => {
  it("nimmt den ausdrücklich eingestellten Mandanten", () => {
    expect(waehleOeffentlichenMandanten([A, B], "kunde")).toEqual({ mandant: B });
  });

  it("nimmt bei genau einem Mandanten diesen — Einzelinstallationen ändern sich nicht", () => {
    expect(waehleOeffentlichenMandanten([A], undefined)).toEqual({ mandant: A });
  });

  it("rät bei mehreren Mandanten nicht, sondern fällt auf die Vorgaben zurück", () => {
    const ergebnis = waehleOeffentlichenMandanten([A, B], undefined);
    expect(ergebnis.mandant).toBeNull();
    expect(ergebnis.warnung).toMatch(/PUBLIC_SITE_TENANT_SLUG/);
  });

  it("ein eingestellter, aber unbekannter Mandant wird gemeldet statt ersetzt", () => {
    const ergebnis = waehleOeffentlichenMandanten([A, B], "gibt-es-nicht");
    expect(ergebnis.mandant).toBeNull();
    expect(ergebnis.warnung).toMatch(/gibt-es-nicht/);
  });

  it("ohne aktive Mandanten gelten die Vorgaben, ohne Warnung", () => {
    expect(waehleOeffentlichenMandanten([], undefined)).toEqual({ mandant: null });
  });

  it("ein leerer Wert gilt als nicht gesetzt", () => {
    expect(waehleOeffentlichenMandanten([A], "  ")).toEqual({ mandant: A });
  });
});
