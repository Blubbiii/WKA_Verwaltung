/**
 * Every place that creates something the licence counts asks the licence
 * first. A new create path that forgets it would let customers exceed
 * their tariff silently — this guard names the known ones and fails when
 * a new `create` for a counted model appears without the check.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const dateien: string[] = [];
const sammle = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const pfad = join(dir, name);
    if (statSync(pfad).isDirectory()) sammle(pfad);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts")) dateien.push(pfad);
  }
};
sammle(join(SRC, "app", "api"));

const ZAEHLENDE_MODELLE: Record<string, RegExp> = {
  fund: /\b(prisma|tx)\.fund\.(create|createMany)\(/,
  turbine: /\b(prisma|tx)\.turbine\.(create|createMany|upsert)\(/,
  user: /\b(prisma|tx)\.user\.(create|createMany)\(/,
};

/** Creates that legitimately do not count (with the reason). */
const AUSNAHMEN: Record<string, string> = {
  // Portal access for a shareholder: portal users are free by decision.
  "app/api/shareholders/onboard/route.ts:user": "Portal-Zugang",
  "app/api/shareholders/[id]/portal-access/route.ts:user": "Portal-Zugang",
  // The platform operator creates a new customer with its first admin.
  "app/api/admin/tenants/route.ts:user": "erster Admin eines neuen Kunden",
  // Only the virtual devices NVP and park computer — they do not count.
  "app/api/parks/route.ts:turbine": "legt nur NVP und Parkrechner an",
  "app/api/energy/scada/mappings/route.ts:turbine": "legt nur NVP und Parkrechner an",
};

describe("Lizenz: jede Anlegestelle fragt vorher die Lizenz", () => {
  it("fund, turbine, user werden nur nach lizenzPruefen angelegt", () => {
    const fehlend: string[] = [];
    for (const datei of dateien) {
      const text = readFileSync(datei, "utf8");
      const rel = relative(SRC, datei).replace(/\\/g, "/");
      for (const [modell, muster] of Object.entries(ZAEHLENDE_MODELLE)) {
        if (!muster.test(text)) continue;
        if (AUSNAHMEN[`${rel}:${modell}`]) continue;
        if (!text.includes("lizenzPruefen(")) fehlend.push(`${rel} legt ${modell} an, ohne lizenzPruefen`);
      }
    }
    expect(fehlend).toEqual([]);
  });
});

describe("Lizenz: die Sperre nach der Karenzfrist sitzt in der Rechteprüfung", () => {
  it("requirePermission und requirePermissionWithResources fragen sie ab", () => {
    const quelle = readFileSync(join(SRC, "lib", "auth", "withPermission.ts"), "utf8");
    const teil = (name: string) => quelle.slice(quelle.indexOf(`export async function ${name}(`)).split("\nexport ")[0];
    expect(teil("requirePermission")).toContain("await lizenzSperre(");
    expect(teil("requirePermissionWithResources")).toContain("await lizenzSperre(");
  });
});
