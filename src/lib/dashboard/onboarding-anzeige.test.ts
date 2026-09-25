/**
 * "Erste Schritte": bei 4 von 5 erledigten Schritten belegte die Karte noch
 * ein Drittel des Dashboards. Ab 80 % schrumpft sie auf eine Zeile.
 */

import { describe, expect, it } from "vitest";
import { onboardingAnzeige } from "./onboarding-anzeige";

describe("onboardingAnzeige", () => {
  it("alles erledigt: ausgeblendet", () => {
    expect(onboardingAnzeige(5, 5)).toBe("aus");
  });

  it("ab 80 %: eine Zeile", () => {
    expect(onboardingAnzeige(4, 5)).toBe("kompakt");
    expect(onboardingAnzeige(8, 10)).toBe("kompakt");
  });

  it("darunter: volle Liste", () => {
    expect(onboardingAnzeige(3, 5)).toBe("voll");
    expect(onboardingAnzeige(0, 5)).toBe("voll");
  });

  it("ohne Schritte: nichts anzeigen", () => {
    expect(onboardingAnzeige(0, 0)).toBe("aus");
  });
});
