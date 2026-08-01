/**
 * Kapitalertragsteuer-Beiblatt.
 *
 * Der Befund war nicht, dass falsch gerechnet wurde, sondern dass ein
 * EINHEITLICHER Kirchensteuersatz und ein EINHEITLICHER Freibetrag über alle
 * Gesellschafter einer Ausschüttung gelegt wurden — beides sind personen-
 * bezogene Angaben. Ein Fonds mit Beteiligten in Bayern und in Niedersachsen
 * kann mit einem Satz gar nicht richtig rechnen.
 *
 * Diese Tests halten vor allem die Unterscheidung fest, um die es geht:
 * „nicht kirchensteuerpflichtig" und „pflichtig, Satz unbekannt" sind nicht
 * dasselbe, auch wenn in beiden Fällen 0 EUR herauskommt.
 */

import { describe, it, expect } from "vitest";
import {
  computeKapESt,
  resolvePersonKapESt,
  buildKapEStLeaflet,
  DEFAULT_KAPEST_RATE,
  DEFAULT_SOLI_RATE,
} from "./kapesta-calculator";

describe("Grundrechnung", () => {
  it("zieht den Freibetrag ab und rechnet auf dem Rest", () => {
    const r = computeKapESt({ grossAmount: 5000, freibetragRemaining: 1000 });
    expect(r.taxableAmount).toBe(4000);
    expect(r.kapestAmount).toBe(1000); // 25 %
    expect(r.soliAmount).toBe(55); // 5,5 % auf die KapESt, nicht auf den Ertrag
    expect(r.netPayout).toBe(5000 - 1055);
  });

  it("nimmt Sätze entgegen, statt sie fest zu kennen", () => {
    // A4: die Sätze stehen in den System-Einstellungen und kommen von aussen.
    const r = computeKapESt({
      grossAmount: 1000,
      freibetragRemaining: 0,
      kapestRate: 0.3,
      soliRate: 0,
    });
    expect(r.kapestAmount).toBe(300);
    expect(r.soliAmount).toBe(0);
    expect(r.kapestRate).toBe(0.3);
  });

  it("faellt ohne Angabe auf den Rechtsstand zurueck, nicht auf 0", () => {
    // Ein Aufruf ohne Einstellungen darf nicht 0 % ergeben — das saehe aus
    // wie eine gueltige Berechnung ohne Steuer.
    const r = computeKapESt({ grossAmount: 1000, freibetragRemaining: 0 });
    expect(r.kapestRate).toBe(DEFAULT_KAPEST_RATE);
    expect(r.soliRate).toBe(DEFAULT_SOLI_RATE);
    expect(r.kapestAmount).toBeGreaterThan(0);
  });
});

describe("Kirchensteuer: nicht pflichtig ist etwas anderes als nicht erfasst", () => {
  it("nicht pflichtig — 0 EUR, und das ist eine erfasste Aussage", () => {
    const resolved = resolvePersonKapESt({
      churchTaxLiable: false,
      churchTaxRate: null,
      exemptionOrderEur: 1000,
      fallbackKirchensteuerRate: 0.09,
      fallbackFreibetragEur: 1000,
    });
    expect(resolved.kirchensteuerRate).toBe(0);
    expect(resolved.kirchensteuerDetermined).toBe(true);

    // Der Vorgabewert von 9 % darf eine Nicht-Mitgliedschaft NICHT ueberschreiben.
    const r = computeKapESt({ grossAmount: 1000, ...resolved });
    expect(r.kirchensteuerAmount).toBe(0);
  });

  it("pflichtig mit erfasstem Satz — gerechnet und als erfasst gekennzeichnet", () => {
    const resolved = resolvePersonKapESt({
      churchTaxLiable: true,
      churchTaxRate: 0.08, // Bayern / Baden-Wuerttemberg
      exemptionOrderEur: 0,
      fallbackKirchensteuerRate: 0.09,
      fallbackFreibetragEur: 1000,
    });
    expect(resolved.kirchensteuerRate).toBe(0.08);
    expect(resolved.kirchensteuerDetermined).toBe(true);

    const r = computeKapESt({ grossAmount: 1000, ...resolved });
    expect(r.kapestAmount).toBe(250);
    expect(r.kirchensteuerAmount).toBe(20); // 8 % auf 250
  });

  it("pflichtig OHNE erfassten Satz — es wird nicht geraten", () => {
    const resolved = resolvePersonKapESt({
      churchTaxLiable: true,
      churchTaxRate: null,
      exemptionOrderEur: 0,
      fallbackKirchensteuerRate: 0.09,
      fallbackFreibetragEur: 1000,
    });
    expect(resolved.kirchensteuerDetermined).toBe(false);

    const r = computeKapESt({ grossAmount: 1000, ...resolved });
    // Kein Betrag — aber unterscheidbar von „nicht pflichtig".
    expect(r.kirchensteuerAmount).toBe(0);
    expect(r.kirchensteuerDetermined).toBe(false);
  });

  it("zwei Gesellschafter in verschiedenen Laendern bekommen verschiedene Saetze", () => {
    // Der eigentliche Befund: vorher galt EIN Satz fuer beide.
    const bayern = computeKapESt({
      grossAmount: 1000,
      ...resolvePersonKapESt({
        churchTaxLiable: true,
        churchTaxRate: 0.08,
        exemptionOrderEur: 0,
        fallbackKirchensteuerRate: 0,
        fallbackFreibetragEur: 0,
      }),
    });
    const niedersachsen = computeKapESt({
      grossAmount: 1000,
      ...resolvePersonKapESt({
        churchTaxLiable: true,
        churchTaxRate: 0.09,
        exemptionOrderEur: 0,
        fallbackKirchensteuerRate: 0,
        fallbackFreibetragEur: 0,
      }),
    });
    expect(bayern.kirchensteuerAmount).toBe(20);
    expect(niedersachsen.kirchensteuerAmount).toBe(22.5);
  });
});

describe("Freistellungsauftrag", () => {
  it("ein erfasster Auftrag ueber 0 EUR ist kein fehlender Auftrag", () => {
    const resolved = resolvePersonKapESt({
      churchTaxLiable: false,
      churchTaxRate: null,
      exemptionOrderEur: 0,
      fallbackKirchensteuerRate: 0,
      fallbackFreibetragEur: 1000,
    });
    expect(resolved.freibetragRemaining).toBe(0);
    expect(resolved.freibetragDetermined).toBe(true);
  });

  it("ohne Erfassung greift der Vorgabewert — aber als Annahme gekennzeichnet", () => {
    const resolved = resolvePersonKapESt({
      churchTaxLiable: false,
      churchTaxRate: null,
      exemptionOrderEur: null,
      fallbackKirchensteuerRate: 0,
      fallbackFreibetragEur: 1000,
    });
    expect(resolved.freibetragRemaining).toBe(1000);
    expect(resolved.freibetragDetermined).toBe(false);
  });
});

describe("Das Beiblatt weist seine Vorbehalte aus", () => {
  const row = (name: string, kapest: ReturnType<typeof computeKapESt>) => ({
    shareholderName: name,
    shareholderId: name,
    grossAmount: kapest.grossAmount,
    kapest,
  });

  it("ohne Luecken keine Vorbehalte", () => {
    const leaflet = buildKapEStLeaflet([
      row(
        "Vollstaendig",
        computeKapESt({
          grossAmount: 1000,
          ...resolvePersonKapESt({
            churchTaxLiable: true,
            churchTaxRate: 0.09,
            exemptionOrderEur: 1000,
            fallbackKirchensteuerRate: 0,
            fallbackFreibetragEur: 0,
          }),
        }),
      ),
    ]);
    expect(leaflet.warnings).toEqual([]);
  });

  it("nennt die betroffenen Gesellschafter beim Namen", () => {
    // Eine Zahl allein („bei 2 Zeilen fehlen Angaben") hilft dem Buchhalter
    // nicht — er muss wissen, WEN er nachpflegen soll.
    const leaflet = buildKapEStLeaflet([
      row(
        "Ohne Kirchensteuersatz",
        computeKapESt({
          grossAmount: 1000,
          ...resolvePersonKapESt({
            churchTaxLiable: true,
            churchTaxRate: null,
            exemptionOrderEur: 0,
            fallbackKirchensteuerRate: 0.09,
            fallbackFreibetragEur: 0,
          }),
        }),
      ),
      row(
        "Ohne Freistellungsauftrag",
        computeKapESt({
          grossAmount: 1000,
          ...resolvePersonKapESt({
            churchTaxLiable: false,
            churchTaxRate: null,
            exemptionOrderEur: null,
            fallbackKirchensteuerRate: 0,
            fallbackFreibetragEur: 1000,
          }),
        }),
      ),
    ]);

    expect(leaflet.warnings).toHaveLength(2);
    expect(leaflet.warnings.join(" ")).toContain("Ohne Kirchensteuersatz");
    expect(leaflet.warnings.join(" ")).toContain("Ohne Freistellungsauftrag");
    // Der Nettobetrag muss als Hoechstwert kenntlich sein.
    expect(leaflet.warnings.join(" ")).toContain("Höchstwert");
  });
});
