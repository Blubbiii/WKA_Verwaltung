import { describe, expect, it } from "vitest";
import { sammelAuswahl } from "./settlement-batch";

describe("Netzbetreiber-Abrechnungen: Sammelaktionen nach Status", () => {
  const auswahl = [
    { id: "a", status: "INVOICED" },
    { id: "b", status: "CALCULATED" },
    { id: "c", status: "DRAFT" },
    { id: "d", status: "INVOICED" },
    { id: "e", status: "CLOSED" },
  ];

  it("freigeben nur fakturierte, zurückweisen nur berechnete", () => {
    expect(sammelAuswahl(auswahl)).toEqual({
      freigeben: ["a", "d"],
      zurueckweisen: ["b"],
      // Neither action applies to these — the UI names them instead of sending them.
      uebrig: 2,
    });
  });

  it("leere Auswahl", () => {
    expect(sammelAuswahl([])).toEqual({ freigeben: [], zurueckweisen: [], uebrig: 0 });
  });
});
