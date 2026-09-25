/**
 * Reihenfolge der Menügruppen.
 *
 * Die Standardreihenfolge stand zweimal im Code (Hook und API) und kannte
 * "Betriebsführung" und "Grundstücke & Pachten" nicht — dafür eine Gruppe
 * "administration", die es so nicht gibt. Die unbekannten Gruppen rutschten
 * beim ersten Zeichnen ans Ende und sprangen nach dem Laden an ihren Platz.
 */

import { describe, expect, it } from "vitest";
import { sortiereGruppen, standardReihenfolge } from "./reihenfolge";

const g = (labelKey: string) => ({ label: labelKey, labelKey, items: [] });
const konfig = [g("crm"), g("inbox"), g("windparks"), g("managementBilling"), g("groundLeases"), g("finances")];
const keys = (gs: { labelKey?: string }[]) => gs.map((x) => x.labelKey);

describe("standardReihenfolge", () => {
  it("ist die Reihenfolge der Konfiguration", () => {
    expect(standardReihenfolge(konfig)).toEqual(["crm", "inbox", "windparks", "managementBilling", "groundLeases", "finances"]);
  });
});

describe("sortiereGruppen", () => {
  it("ohne gespeicherte Reihenfolge: wie konfiguriert", () => {
    expect(keys(sortiereGruppen(konfig, []))).toEqual(["crm", "inbox", "windparks", "managementBilling", "groundLeases", "finances"]);
  });

  it("gespeicherte Reihenfolge gilt", () => {
    const order = ["finances", "groundLeases", "managementBilling", "windparks", "inbox", "crm"];
    expect(keys(sortiereGruppen(konfig, order))).toEqual(order);
  });

  it("eine neue Gruppe landet hinter ihrem Vorgänger aus der Konfiguration, nicht am Ende", () => {
    // Gespeichert, bevor es "managementBilling" gab:
    const order = ["finances", "windparks", "crm", "inbox", "groundLeases"];
    expect(keys(sortiereGruppen(konfig, order))).toEqual(["finances", "windparks", "managementBilling", "crm", "inbox", "groundLeases"]);
  });

  it("unbekannte Schlüssel in der gespeicherten Reihenfolge stören nicht", () => {
    expect(keys(sortiereGruppen(konfig, ["administration", "crm"]))).toEqual(["crm", "inbox", "windparks", "managementBilling", "groundLeases", "finances"]);
  });
});
