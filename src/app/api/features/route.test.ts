/**
 * Jeder abgefragte Feature-Schalter wird auch ausgeliefert.
 *
 * Die PPA-Seite fragte "ppa-management" ab, /api/features lieferte den
 * Schalter nie — die Oberfläche fiel auf den Standard false zurück. Das Modul
 * war für jeden Mandanten gesperrt und ließ sich nirgends einschalten.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

function dateien(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...dateien(p));
    else if (/\.tsx?$/.test(p) && !p.includes(".test.")) out.push(p);
  }
  return out;
}

describe("/api/features", () => {
  it("liefert jeden Schalter, den Seitenleiste oder Seiten abfragen", () => {
    // The route delivers what ladeFeatureFlags returns (shared with the layout).
    const quelle = readFileSync(join(SRC, "lib", "features", "tenant-flags.ts"), "utf8");
    const ausgeliefert = new Set(
      [...quelle.slice(quelle.indexOf("return {")).matchAll(/"([\w-]+)":/g)].map((m) => m[1]),
    );
    const abgefragt = new Set<string>();
    for (const datei of dateien(SRC)) {
      const s = readFileSync(datei, "utf8");
      for (const m of s.matchAll(/featureFlag: "([\w-]+)"/g)) abgefragt.add(m[1]);
      for (const m of s.matchAll(/isFeatureEnabled\("([\w-]+)"\)/g)) abgefragt.add(m[1]);
    }
    expect([...abgefragt].filter((f) => !ausgeliefert.has(f)).sort()).toEqual([]);
  });
});
