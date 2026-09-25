/**
 * Produktionsdaten: der manuell erfasste Erlös geht nicht verloren.
 *
 * Das Formular fragte Erlösart (Pflichtfeld) und Erlös ab, die API kannte
 * beide Felder nicht und verwarf sie stillschweigend. Gewünscht ist die
 * manuelle Erfassung (Entscheidung E1, 2026-09); gerechnet wird weiter mit
 * der Netzbetreiber-Abrechnung.
 */

import { describe, expect, it } from "vitest";
import { productionCreateSchema, productionUpdateSchema } from "./production-schemas";

const TURBINE = "11111111-1111-4111-8111-111111111111";
const ART = "22222222-2222-4222-8222-222222222222";

describe("Produktionsdaten-Schemas", () => {
  it("Anlegen behält Erlös und Erlösart", () => {
    const d = productionCreateSchema.parse({ turbineId: TURBINE, year: 2026, month: 8, productionKwh: 1000, revenueEur: 123.45, revenueTypeId: ART });
    expect(d.revenueEur).toBe(123.45);
    expect(d.revenueTypeId).toBe(ART);
  });

  it("Bearbeiten behält den Erlös, auch das Leeren", () => {
    expect(productionUpdateSchema.parse({ revenueEur: 99.9 }).revenueEur).toBe(99.9);
    expect(productionUpdateSchema.parse({ revenueEur: null }).revenueEur).toBeNull();
  });

  it("ein negativer Erlös ist erlaubt (Rückforderung), ein Text nicht", () => {
    expect(productionCreateSchema.parse({ turbineId: TURBINE, year: 2026, month: 8, productionKwh: 0, revenueEur: -10 }).revenueEur).toBe(-10);
    expect(() => productionCreateSchema.parse({ turbineId: TURBINE, year: 2026, month: 8, productionKwh: 0, revenueEur: "viel" })).toThrow();
  });
});
