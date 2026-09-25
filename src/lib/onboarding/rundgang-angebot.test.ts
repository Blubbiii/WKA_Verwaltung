/**
 * Der Rundgang legte sich eine Sekunde nach dem ersten Login über jede Seite —
 * auch über einen Direktlink auf eine Rechnung. Jetzt wird er nur noch auf dem
 * Dashboard angeboten, und nur angeboten, nicht gestartet.
 */

import { describe, expect, it } from "vitest";
import { rundgangAnbieten } from "./rundgang-angebot";

const bereit = { isLoaded: true, shouldAutoTrigger: true };

describe("rundgangAnbieten", () => {
  it("auf dem Dashboard beim ersten Login", () => {
    expect(rundgangAnbieten({ ...bereit, pathname: "/dashboard" })).toBe(true);
  });

  it("nicht auf anderen Seiten", () => {
    expect(rundgangAnbieten({ ...bereit, pathname: "/invoices/abc" })).toBe(false);
    expect(rundgangAnbieten({ ...bereit, pathname: "/dashboard/extra" })).toBe(false);
  });

  it("nicht, wenn er schon gemacht oder abgelehnt wurde", () => {
    expect(rundgangAnbieten({ isLoaded: true, shouldAutoTrigger: false, pathname: "/dashboard" })).toBe(false);
  });

  it("nicht, bevor der Stand geladen ist", () => {
    expect(rundgangAnbieten({ isLoaded: false, shouldAutoTrigger: true, pathname: "/dashboard" })).toBe(false);
  });
});
