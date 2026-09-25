/**
 * Modelllisten passen zum Schema.
 *
 * Nach dem Ausbau der Buchhaltung standen JournalEntry und Quote weiter im
 * Aufbewahrungslauf und JournalEntry in der Soft-Delete-Liste. Die Modelle
 * gab es nicht mehr: jeder Aufbewahrungslauf meldete zwei Fehler. Beide
 * Listen greifen per Namen auf Prisma zu, tsc sieht das nicht.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");

/** model name -> field names */
const modelle = new Map<string, Set<string>>();
for (const m of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
  modelle.set(m[1], new Set([...m[2].matchAll(/^\s+(\w+)\s+\S/gm)].map((f) => f[1])));
}

function namenAusBlock(datei: string, start: RegExp): string[] {
  const s = readFileSync(join(SRC, datei), "utf8");
  const m = s.match(start);
  if (!m || m.index === undefined) throw new Error(`Block ${start} nicht gefunden in ${datei}`);
  const rest = s.slice(m.index + m[0].length);
  const block = rest.slice(0, rest.search(/\n\}|\]\)/));
  // keys (`Invoice: 10`) or string entries (`"Invoice",`), comments removed
  return [...block.replace(/\/\/.*$/gm, "").matchAll(/(?:^|\s)"?([A-Z]\w+)"?\s*[:,]/gm)].map((x) => x[1]);
}

function ohneDeletedAt(namen: string[]): string[] {
  return namen.filter((n) => !modelle.get(n)?.has("deletedAt")).map((n) => (modelle.has(n) ? `${n} (ohne deletedAt)` : `${n} (fehlt im Schema)`));
}

describe("Modelllisten", () => {
  it("der Aufbewahrungslauf kennt nur Modelle mit deletedAt", () => {
    const namen = namenAusBlock("lib/retention/retention-service.ts", /const RETENTION_POLICY_DEFAULT = \{/);
    expect(namen.length).toBeGreaterThan(3);
    expect(ohneDeletedAt(namen)).toEqual([]);
  });

  it("die Soft-Delete-Liste kennt nur Modelle mit deletedAt", () => {
    const namen = namenAusBlock("lib/prisma.ts", /const SOFT_DELETE_MODELS = new Set\(\[/);
    expect(namen.length).toBeGreaterThan(3);
    expect(ohneDeletedAt(namen)).toEqual([]);
  });
});
