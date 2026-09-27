/**
 * Raw SQL names its tenant (2026-09, Etappe 4).
 *
 * mandantDb scopes Prisma queries, not $queryRaw/$executeRaw — those pass
 * through unchanged. Every raw query that reads a table therefore carries
 * `"tenantId" = ${…}` itself, or a condition fragment (whereClause …) that
 * does. System queries without customer data are listed by name.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

/** Queries without customer data: file → why. */
const SYSTEMABFRAGEN: Record<string, string> = {
  "lib/audit-trigger-check.ts": "liest pg_trigger (Systemkatalog)",
};

const dateien: string[] = [];
const sammle = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const pfad = join(dir, name);
    if (statSync(pfad).isDirectory()) sammle(pfad);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) dateien.push(pfad);
  }
};
sammle(SRC);

/** The template literal starting at `start`, with ${…} nesting skipped. */
function vorlage(s: string, start: number): string {
  let i = start;
  let tiefe = 0;
  while (i < s.length) {
    if (s.startsWith("${", i)) {
      tiefe++;
      i += 2;
      continue;
    }
    if (s[i] === "}" && tiefe) tiefe--;
    else if (s[i] === "`" && !tiefe) break;
    i++;
  }
  return s.slice(start, i);
}

const ANFANG = /(\$queryRaw(?:Unsafe)?|\$executeRaw(?:Unsafe)?|Prisma\.sql)\s*(?:<[^`]*?>)?\s*\(?\s*`/g;
const MANDANT = /"tenantId"\s*=\s*\$\{/;

describe("rohes SQL", () => {
  it("jede Abfrage auf eine Tabelle nennt ihren Mandanten", () => {
    const ohne: string[] = [];
    for (const pfad of dateien) {
      const rel = relative(SRC, pfad).replace(/\\/g, "/");
      if (SYSTEMABFRAGEN[rel]) continue;
      const s = readFileSync(pfad, "utf8");
      if (!s.includes("$queryRaw") && !s.includes("$executeRaw")) continue;
      for (const m of s.matchAll(ANFANG)) {
        const sql = vorlage(s, m.index! + m[0].length);
        if (!/\b(FROM|JOIN)\s+"?[a-z_]+/i.test(sql)) continue; // fragment, or SELECT 1
        if (MANDANT.test(sql)) continue;
        // A condition fragment built in the same file with the tenant in it.
        const baustein = /\$\{\w*(?:[Ww]here|[Cc]ondition|[Cc]lause)\w*\}/.test(sql);
        if (baustein && MANDANT.test(s)) continue;
        ohne.push(`${rel}:${s.slice(0, m.index).split("\n").length}`);
      }
    }
    expect(ohne, "Rohes SQL ohne \"tenantId\" = ${…} — mandantDb filtert $queryRaw nicht").toEqual([]);
  });
});
