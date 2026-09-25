/**
 * Pachtvertrag anlegen: wann "Weiter" geht und warum nicht.
 *
 * Vorher blieb "Weiter" grau, wenn ein neues Flurstück ausgefüllt, aber noch
 * nicht mit "Flurstück hinzufügen" übernommen war — ohne Hinweis. Jetzt
 * übernimmt "Weiter" ein vollständig ausgefülltes Flurstück selbst, und ein
 * gesperrtes "Weiter" nennt seinen Grund.
 */

import { describe, expect, it } from "vitest";
import { pruefeSchritt, type SchrittStand } from "./neuer-pachtvertrag-schritte";

const leer: SchrittStand = {
  lessorMode: "select",
  selectedLessorId: "",
  newLessor: { personType: "natural", firstName: "", lastName: "", companyName: "" },
  selectedPlotCount: 0,
  newPlotCount: 0,
  entwurfFlurstueck: { cadastralDistrict: "", plotNumber: "", areaSqm: "", municipality: "" },
  startDate: "",
};

describe("Schritt Verpächter", () => {
  it("ohne Auswahl gesperrt, mit Grund", () => {
    expect(pruefeSchritt(0, leer)).toEqual({ weiter: false, grund: "lessorMissing" });
  });

  it("neue natürliche Person braucht Vor- und Nachname", () => {
    const stand = { ...leer, lessorMode: "create" as const, newLessor: { ...leer.newLessor, firstName: "Anna" } };
    expect(pruefeSchritt(0, stand)).toEqual({ weiter: false, grund: "lessorNameMissing" });
  });

  it("neue juristische Person braucht den Firmennamen", () => {
    const stand = { ...leer, lessorMode: "create" as const, newLessor: { ...leer.newLessor, personType: "legal" as const } };
    expect(pruefeSchritt(0, stand)).toEqual({ weiter: false, grund: "companyNameMissing" });
  });

  it("ausgewählter Verpächter: weiter", () => {
    expect(pruefeSchritt(0, { ...leer, selectedLessorId: "p1" })).toEqual({ weiter: true });
  });
});

describe("Schritt Flurstücke", () => {
  it("nichts gewählt, nichts ausgefüllt: gesperrt mit Grund", () => {
    expect(pruefeSchritt(1, leer)).toEqual({ weiter: false, grund: "plotMissing" });
  });

  it("ausgefülltes, noch nicht übernommenes Flurstück: weiter und übernehmen", () => {
    const stand = { ...leer, entwurfFlurstueck: { ...leer.entwurfFlurstueck, cadastralDistrict: "Bredstedt", plotNumber: "12/3" } };
    expect(pruefeSchritt(1, stand)).toEqual({ weiter: true, uebernimmEntwurf: true });
  });

  it("halb ausgefülltes Flurstück: gesperrt, sagt was fehlt", () => {
    const stand = { ...leer, entwurfFlurstueck: { ...leer.entwurfFlurstueck, cadastralDistrict: "Bredstedt" } };
    expect(pruefeSchritt(1, stand)).toEqual({ weiter: false, grund: "plotIncomplete" });
  });

  it("vorhandenes Flurstück gewählt: weiter, ein leerer Entwurf wird nicht übernommen", () => {
    expect(pruefeSchritt(1, { ...leer, selectedPlotCount: 2 })).toEqual({ weiter: true });
  });

  it("gewählt und zusätzlich ein vollständiger Entwurf: beides zählt", () => {
    const stand = {
      ...leer,
      selectedPlotCount: 1,
      entwurfFlurstueck: { ...leer.entwurfFlurstueck, cadastralDistrict: "Bredstedt", plotNumber: "7" },
    };
    expect(pruefeSchritt(1, stand)).toEqual({ weiter: true, uebernimmEntwurf: true });
  });
});

describe("Schritt Vertrag", () => {
  it("ohne Vertragsbeginn gesperrt", () => {
    expect(pruefeSchritt(2, leer)).toEqual({ weiter: false, grund: "startDateMissing" });
  });

  it("mit Vertragsbeginn weiter", () => {
    expect(pruefeSchritt(2, { ...leer, startDate: "2026-01-01" })).toEqual({ weiter: true });
  });
});
