import { describe, expect, it } from "vitest";
import { berlinerMonat } from "./berlin";

describe("Monat nach deutscher Ortszeit", () => {
  it("März mit Umstellung auf Sommerzeit hat 743 Stunden", () => {
    const m = berlinerMonat(2025, 3);
    expect(m.von.toISOString()).toBe("2025-02-28T23:00:00.000Z");
    expect(m.bis.toISOString()).toBe("2025-03-31T22:00:00.000Z");
    expect(m.stunden).toBe(743);
  });

  it("Oktober mit Umstellung auf Winterzeit hat 745 Stunden", () => {
    expect(berlinerMonat(2025, 10).stunden).toBe(745);
  });

  it("Dezember endet am 1. Januar des Folgejahres", () => {
    const m = berlinerMonat(2025, 12);
    expect(m.bis.toISOString()).toBe("2025-12-31T23:00:00.000Z");
    expect(m.stunden).toBe(744);
  });
});
