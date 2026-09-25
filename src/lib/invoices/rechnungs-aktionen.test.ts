/**
 * Rechnungsdetail: eine Hauptaktion je Status, der Rest im "…"-Menü.
 *
 * Vorher standen bis zu zehn gleichrangige Knöpfe in der Kopfzeile — Zahlung
 * erfassen, Bezahlt, Teilstorno, Korrektur, Vollstorno, Vorschau, PDF,
 * Duplizieren, XRechnung —, die Zeile lief rechts aus dem Bild.
 */

import { describe, expect, it } from "vitest";
import { rechnungsAktionen } from "./rechnungs-aktionen";

describe("rechnungsAktionen", () => {
  it("Entwurf: versenden, daneben bearbeiten; löschen nur im Menü", () => {
    const a = rechnungsAktionen({ status: "DRAFT", skontoMoeglich: false });
    expect(a.haupt).toBe("send");
    expect(a.sichtbar).toEqual(["edit"]);
    expect(a.gefaehrlich).toEqual(["delete"]);
    expect(a.menue).toEqual(["preview", "pdf", "duplicate", "xrechnung", "zugferd"]);
  });

  it("versendet: Zahlung erfassen; Bezahlt-Markieren, Korrektur und Stornos im Menü", () => {
    const a = rechnungsAktionen({ status: "SENT", skontoMoeglich: false });
    expect(a.haupt).toBe("recordPayment");
    expect(a.sichtbar).toEqual([]);
    expect(a.menue).toEqual(["markPaid", "preview", "pdf", "duplicate", "xrechnung", "zugferd", "correction"]);
    expect(a.gefaehrlich).toEqual(["partialCancel", "fullCancel"]);
  });

  it("versendet mit Skonto: beide Bezahlt-Varianten im Menü", () => {
    const a = rechnungsAktionen({ status: "SENT", skontoMoeglich: true });
    expect(a.menue.slice(0, 2)).toEqual(["markPaid", "markPaidWithSkonto"]);
  });

  it("teilbezahlt: Zahlung erfassen, kein Vollstorno", () => {
    const a = rechnungsAktionen({ status: "PARTIALLY_PAID", skontoMoeglich: false });
    expect(a.haupt).toBe("recordPayment");
    expect(a.menue).toEqual(["preview", "pdf", "duplicate", "xrechnung", "zugferd", "correction"]);
    expect(a.gefaehrlich).toEqual(["partialCancel"]);
  });

  it("bezahlt: keine Hauptaktion, Vorschau sichtbar", () => {
    const a = rechnungsAktionen({ status: "PAID", skontoMoeglich: false });
    expect(a.haupt).toBeNull();
    expect(a.sichtbar).toEqual(["preview"]);
    expect(a.menue).toEqual(["pdf", "duplicate", "xrechnung", "zugferd", "correction"]);
    expect(a.gefaehrlich).toEqual(["partialCancel"]);
  });

  it("storniert: nur ansehen und als Vorlage nutzen, keine E-Rechnung", () => {
    const a = rechnungsAktionen({ status: "CANCELLED", skontoMoeglich: false });
    expect(a.haupt).toBeNull();
    expect(a.sichtbar).toEqual(["preview"]);
    expect(a.menue).toEqual(["pdf", "duplicate"]);
    expect(a.gefaehrlich).toEqual([]);
  });
});
