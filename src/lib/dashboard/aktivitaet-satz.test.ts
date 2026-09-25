/**
 * "Letzte Aktivitäten" zeigte Rohcodes: "Anna Schmidt hat ACCESS_REPORT view".
 * Jede Zeile ist jetzt ein deutscher Satz.
 */

import { describe, expect, it } from "vitest";
import { aktivitaetsSatz } from "./aktivitaet-satz";

describe("aktivitaetsSatz", () => {
  it("der Fall aus dem Screenshot", () => {
    expect(aktivitaetsSatz({ name: "Anna Schmidt", action: "VIEW", entityType: "ACCESS_REPORT" }))
      .toBe("Anna Schmidt hat den Zugriffsbericht angesehen");
  });

  it("Objekt mit Artikel und Partizip", () => {
    expect(aktivitaetsSatz({ name: "Anna Schmidt", action: "CREATE", entityType: "Park" }))
      .toBe("Anna Schmidt hat den Windpark angelegt");
    expect(aktivitaetsSatz({ name: "Anna Schmidt", action: "UPDATE", entityType: "Invoice" }))
      .toBe("Anna Schmidt hat die Rechnung bearbeitet");
    expect(aktivitaetsSatz({ name: "Anna Schmidt", action: "DELETE", entityType: "Plot" }))
      .toBe("Anna Schmidt hat das Flurstück gelöscht");
    expect(aktivitaetsSatz({ name: "Anna Schmidt", action: "EXPORT", entityType: "PERMISSION_MATRIX" }))
      .toBe("Anna Schmidt hat die Rechteübersicht exportiert");
  });

  it("kleingeschriebene Altcodes werden erkannt", () => {
    expect(aktivitaetsSatz({ name: "Anna Schmidt", action: "UPDATE", entityType: "lease" }))
      .toBe("Anna Schmidt hat den Pachtvertrag bearbeitet");
  });

  it("An- und Abmelden ohne Objekt", () => {
    expect(aktivitaetsSatz({ name: "Anna Schmidt", action: "LOGIN", entityType: "User" }))
      .toBe("Anna Schmidt hat sich angemeldet");
    expect(aktivitaetsSatz({ name: "Anna Schmidt", action: "LOGOUT", entityType: "User" }))
      .toBe("Anna Schmidt hat sich abgemeldet");
  });

  it("ohne Benutzer: Objekt vorn", () => {
    expect(aktivitaetsSatz({ name: null, action: "CREATE", entityType: "Invoice" }))
      .toBe("Rechnung angelegt");
  });

  it("Unbekanntes bleibt lesbar statt als Code", () => {
    expect(aktivitaetsSatz({ name: "Anna Schmidt", action: "FROBNICATE", entityType: "Gizmo" }))
      .toBe("Anna Schmidt hat einen Eintrag geändert");
  });
});
