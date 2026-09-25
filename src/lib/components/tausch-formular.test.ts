import { describe, expect, it } from "vitest";
import { tauschFormularFuer, tauschPayload } from "./tausch-formular";

const ALT = {
  manufacturer: "Winergy",
  model: "PEAB 4456",
  designLifeYears: 20,
  warrantyEndDate: "2019-05-31T00:00:00.000Z",
  warrantyProvider: "Winergy",
};

describe("Großkomponente tauschen: Formular → API", () => {
  it("Hersteller, Modell und Auslegungsdauer werden vorbelegt, die Gewährleistung nicht", () => {
    const form = tauschFormularFuer(ALT, "2026-09-25");
    expect(form.removedAt).toBe("2026-09-25");
    expect(form.manufacturer).toBe("Winergy");
    expect(form.model).toBe("PEAB 4456");
    expect(form.designLifeYears).toBe("20");
    // An exchange part has its own warranty — inheriting it would be a promise nobody made.
    expect(form.warrantyEndDate).toBe("");
    expect(form.warrantyProvider).toBe("");
  });

  it("Zahlen werden gelesen (auch mit Komma), Leeres geht als null", () => {
    const payload = tauschPayload({
      ...tauschFormularFuer(ALT, "2026-09-25"),
      removalReason: "FAILURE",
      costEur: "185.000,50",
      designLifeYears: "",
      serialNumber: "  G-4711 ",
    });
    expect(payload).toMatchObject({
      removedAt: "2026-09-25",
      removalReason: "FAILURE",
      costEur: 185000.5,
      designLifeYears: null,
      serialNumber: "G-4711",
      warrantyEndDate: null,
      notes: null,
    });
    // Without an own install date the server uses the removal date.
    expect(payload).not.toHaveProperty("installedAt");
  });

  it("ein eigenes Einbaudatum wird mitgeschickt", () => {
    const payload = tauschPayload({ ...tauschFormularFuer(ALT, "2026-09-25"), installedAt: "2026-10-02" });
    expect(payload.installedAt).toBe("2026-10-02");
  });
});
