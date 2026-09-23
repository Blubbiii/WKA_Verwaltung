import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { hatEigeneSeite, PFADE_OHNE_SEITE } from "./brotkrumen-ziele";

const APP = join(process.cwd(), "src", "app");

// Every page route as a list of URL segments; route groups dropped,
// dynamic segments written as "*".
function seitenRouten(dir: string): string[][] {
  const out: string[][] = [];
  for (const eintrag of readdirSync(dir)) {
    const pfad = join(dir, eintrag);
    if (statSync(pfad).isDirectory()) {
      if (eintrag !== "api") out.push(...seitenRouten(pfad));
    } else if (eintrag === "page.tsx") {
      out.push(
        relative(APP, dir)
          .split(sep)
          .filter((t) => t && !/^\(.*\)$/.test(t))
          .map((t) => (t.startsWith("[") ? "*" : t))
      );
    }
  }
  return out;
}

// Prefixes the breadcrumb would link to that have no page of their own.
// Only routes under the dashboard layout render the breadcrumb.
function berechnePfadeOhneSeite(): string[] {
  const dashboard = join(APP, "(dashboard)");
  const vorhanden = new Set(seitenRouten(APP).map((s) => s.join("/")));
  const tot = new Set<string>();
  for (const route of seitenRouten(dashboard)) {
    for (let i = 1; i < route.length; i++) {
      const praefix = route.slice(0, i).join("/");
      if (!vorhanden.has(praefix)) tot.add("/" + praefix);
    }
  }
  return [...tot].sort();
}

describe("Brotkrumen-Ziele", () => {
  it("die Liste der Pfade ohne Seite passt zum Dateibaum", () => {
    // Fails when a page is added or removed: update PFADE_OHNE_SEITE.
    expect([...PFADE_OHNE_SEITE].sort()).toEqual(berechnePfadeOhneSeite());
  });

  it("Abschnitte ohne Seite werden nicht verlinkt", () => {
    expect(hatEigeneSeite("/verwaltung")).toBe(false);
    expect(hatEigeneSeite("/reports")).toBe(false);
    expect(hatEigeneSeite("/leases/usage-fees/setup")).toBe(false);
    expect(hatEigeneSeite("/energy/productions/3f2b8c1e-0000-4000-8000-000000000001")).toBe(false);
  });

  it("Abschnitte mit Seite bleiben verlinkt", () => {
    expect(hatEigeneSeite("/parks")).toBe(true);
    expect(hatEigeneSeite("/parks/3f2b8c1e-0000-4000-8000-000000000001")).toBe(true);
    expect(hatEigeneSeite("/energy/productions")).toBe(true);
    expect(hatEigeneSeite("/leases/usage-fees")).toBe(true);
  });
});
