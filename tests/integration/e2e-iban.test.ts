/**
 * Die Prüfziffer-Rechnung, gegen bekannte IBANs geprüft.
 *
 * Modulo 97 auf einer 20-stelligen Zahl lässt sich nicht mit `%` erledigen —
 * die Zahl ist grösser als `Number.MAX_SAFE_INTEGER`. Ziffernweise zu rechnen
 * ist der übliche Weg und leicht falsch gemacht.
 *
 * Ein Fehler darin fiele im Ablauf-Test als rätselhafter 400er auf („Ungültige
 * Debtor-IBAN"), und man suchte ihn in der Anwendung statt im Testwerkzeug.
 */

import { describe, it, expect } from "vitest";
import { deutscheIban, testIban } from "../../e2e/support/iban";

/** Prüft eine IBAN nach ISO 13616 — unabhängig von der Erzeugung. */
function istGueltig(iban: string): boolean {
  const umgestellt = iban.slice(4) + iban.slice(0, 4);
  const ziffern = umgestellt.replace(/[A-Z]/g, (c) =>
    String(c.charCodeAt(0) - 55),
  );
  let rest = 0;
  for (const z of ziffern) rest = (rest * 10 + Number(z)) % 97;
  return rest === 1;
}

describe("deutscheIban", () => {
  it("trifft eine bekannte IBAN", () => {
    // Deutsche Bundesbank, oeffentlich dokumentierte Test-IBAN.
    expect(deutscheIban("12030000", "0000202051")).toBe("DE02120300000000202051");
  });

  it("erzeugt durchweg gueltige Pruefziffern", () => {
    // Die eigentliche Absicherung: nicht ein Beispiel, sondern die Rechnung.
    for (let i = 0; i < 200; i++) {
      const iban = deutscheIban("12030000", String(i * 7919 + 1));
      expect(istGueltig(iban), `${iban} hat eine falsche Pruefziffer`).toBe(true);
    }
  });

  it("fuellt kurze Kontonummern links mit Nullen", () => {
    expect(deutscheIban("12030000", "1")).toHaveLength(22);
    expect(deutscheIban("12030000", "1")).toContain("0000000001");
  });

  it("erkennt eine verfaelschte IBAN als ungueltig", () => {
    // Gegenprobe zur Pruefroutine oben — sonst koennte sie alles durchwinken
    // und der Test darueber waere wertlos.
    const echt = deutscheIban("12030000", "0000202051");
    const verfaelscht = echt.slice(0, -1) + (echt.endsWith("1") ? "2" : "1");
    expect(istGueltig(verfaelscht)).toBe(false);
  });
});

describe("testIban", () => {
  it("ist gueltig und je Aufruf verschieden", () => {
    const a = testIban(1_700_000_000_123);
    const b = testIban(1_700_000_000_124);

    expect(istGueltig(a)).toBe(true);
    expect(istGueltig(b)).toBe(true);
    expect(
      a,
      "Zwei Laeufe wuerden dasselbe Bankkonto anlegen und der zweite mit 409 scheitern",
    ).not.toBe(b);
  });
});
