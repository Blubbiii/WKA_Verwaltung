/**
 * Ratchet for the move to mandantDb (2026-09): the number of API files that
 * use the shared `prisma` client directly may only go down.
 *
 * When a file moves to mandantDb, lower OBERGRENZE to the new count — the
 * test tells the number. New routes start with mandantDb; genuinely
 * cross-tenant ones (platform operator, cron, health, auth) are exempt.
 *
 * A single route that must stay cross-tenant says so in its first line:
 *   // mandantenübergreifend: <reason>
 * The reason is the point — it is what a reviewer checks.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const OBERGRENZE = 1;
const MANDANTENUEBERGREIFEND = /^app\/api\/(superadmin|cron|health|auth)\//;

const SRC = join(process.cwd(), "src");
const dateien: string[] = [];
const sammle = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const pfad = join(dir, name);
    if (statSync(pfad).isDirectory()) sammle(pfad);
    else if (/\.ts$/.test(name) && !name.endsWith(".test.ts")) dateien.push(pfad);
  }
};
sammle(join(SRC, "app", "api"));

describe("Umstellung auf den geprüften Datenbankzugriff", () => {
  it("API-Dateien mit direktem prisma werden nicht mehr", () => {
    const direkt = dateien
      .map((d) => relative(SRC, d).replace(/\\/g, "/"))
      .filter((rel) => !MANDANTENUEBERGREIFEND.test(rel))
      .filter((rel) => {
        const inhalt = readFileSync(join(SRC, rel), "utf8");
        return /from "@\/lib\/prisma"/.test(inhalt) && !/^\/\/ mandantenübergreifend: \S/.test(inhalt);
      });
    expect(
      direkt.length,
      `${direkt.length} Dateien nutzen prisma direkt (Obergrenze ${OBERGRENZE}). Neue Routen: mandantDb(check.tenantId) aus @/lib/mandant/mandant-db. Nach einer Umstellung OBERGRENZE auf ${direkt.length} senken.`,
    ).toBeLessThanOrEqual(OBERGRENZE);
  });
});
