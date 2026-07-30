/**
 * TF-12: Der Permission-Katalog darf keine wirkungslosen Stellschrauben führen.
 *
 * Befund im Audit 2026-07: 42 der 169 Katalog-Permissions wurden von keiner
 * Route geprüft. Ein Admin vergab im Rollen-Editor "GoBD Z3-Export erstellen"
 * oder entzog "Jahresabschluss ausführen" — es änderte nichts. Kein
 * Sicherheitsloch, aber der Katalog täuschte Granularität vor.
 *
 * Dieser Test misst die Lücke und friert sie ein: neue Katalog-Einträge ohne
 * Prüfung fallen sofort auf, und jede weitere Verdrahtung senkt die Schwelle.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Bewusst KEIN Import aus ./permissions: das Modul zieht ueber die
// Auth-Kette next-auth herein, was im Node-Testlauf ohne Next-Runtime
// scheitert. Der Test arbeitet ohnehin rein textuell auf den Quellen.

const SRC = join(process.cwd(), "src");
const CATALOG_PATH = join(SRC, "lib/auth/permissions.catalog.ts");
const CONSTANTS_PATH = join(SRC, "lib/auth/permissions.ts");

/** Alle Katalognamen in Deklarationsreihenfolge. */
function catalogNames(): string[] {
  const source = readFileSync(CATALOG_PATH, "utf-8");
  return [...source.matchAll(/\{ name: "([^"]+)"/g)].map((m) => m[1]);
}

/** Quelltext aller Dateien ausser Katalog und Konstanten-Map. */
function projectSource(): string {
  const parts: string[] = [];
  const skip = new Set(["permissions.catalog.ts", "permissions.ts"]);

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "node_modules" || entry === ".next") continue;
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      if (skip.has(entry)) continue;
      parts.push(readFileSync(full, "utf-8"));
    }
  };
  walk(SRC);
  return parts.join("\n");
}

/** Konstantenname → Permission-String, invertiert. */
function constantByPermission(): Map<string, string> {
  const source = readFileSync(CONSTANTS_PATH, "utf-8");
  const map = new Map<string, string>();
  for (const m of source.matchAll(/([A-Z0-9_]+):\s*"([^"]+)"/g)) {
    map.set(m[2], m[1]);
  }
  return map;
}

function uncheckedPermissions(): string[] {
  const blob = projectSource();
  const byPermission = constantByPermission();

  return catalogNames().filter((name) => {
    // Direkt als String geprüft?
    if (blob.includes(`"${name}"`)) return false;
    // Über die Konstante geprüft?
    const constant = byPermission.get(name);
    if (constant && new RegExp(`PERMISSIONS\\.${constant}\\b`).test(blob)) return false;
    return true;
  });
}

/**
 * Stand nach Welle 8. Bewusst als Obergrenze, nicht als exakte Liste: der Test
 * soll bei jeder Verbesserung grün bleiben und nur bei Verschlechterung reissen.
 *
 * Die verbleibenden Einträge sind überwiegend Export-Rechte (Export läuft in
 * den Listen-Routen mit und hat keinen eigenen Endpunkt) sowie die
 * Portal- und Impersonate-Rechte, die an anderer Stelle als über
 * requirePermission durchgesetzt werden. Sie gehören in eine eigene Runde.
 */
const MAX_UNCHECKED = 29;

/**
 * Katalog-Einträge, für die es (noch) keine Konstante in PERMISSIONS gibt.
 * Betroffen sind die Portal-, Mailing- und System-Blöcke. Ohne Konstante muss
 * jede Prüfung als Roh-String erfolgen — der Weg, auf dem news:* durchgerutscht
 * ist.
 */
const MAX_WITHOUT_CONSTANT = 15;

describe("Permission-Katalog (TF-12)", () => {
  it(`hat höchstens ${MAX_UNCHECKED} ungeprüfte Einträge`, () => {
    const unchecked = uncheckedPermissions();
    expect(
      unchecked.length,
      `Ungeprüft (${unchecked.length}):\n  ${unchecked.sort().join("\n  ")}`,
    ).toBeLessThanOrEqual(MAX_UNCHECKED);
  });

  it("die Schwelle ist nicht unnötig hoch gesetzt", () => {
    // Verhindert, dass MAX_UNCHECKED beim Aufräumen vergessen wird und der
    // Test dauerhaft mehr erlaubt, als tatsächlich offen ist.
    const unchecked = uncheckedPermissions();
    expect(MAX_UNCHECKED - unchecked.length).toBeLessThanOrEqual(3);
  });

  it("der kritische Accounting-Block ist vollständig verdrahtet", () => {
    // Das war der im Audit hervorgehobene Teil: 15 feingranulare Rechte, u. a.
    // year-end-close:execute (im Katalog mit requiresApproval: true).
    const unchecked = new Set(uncheckedPermissions());
    const mustBeChecked = [
      "accounting:year-end-close:execute",
      "accounting:gobd-export:create",
      "accounting:datev-export:create",
      "accounting:period-lock:create",
      "accounting:period-lock:delete",
      "accounting:journal:reverse",
      "accounting:report:bilanz",
      "accounting:report:susa",
      "accounting:report:euer",
      "accounting:report:gewst",
      "accounting:report:kontoblatt",
      "accounting:report:anlagenspiegel",
    ];

    const stillDead = mustBeChecked.filter((p) => unchecked.has(p));
    expect(stillDead, `Noch ungeprüft: ${stillDead.join(", ")}`).toEqual([]);
  });

  it(`hat höchstens ${MAX_WITHOUT_CONSTANT} Einträge ohne Konstante`, () => {
    // Ohne Konstante wird die Permission zwangsläufig als Roh-String geprüft
    // oder gar nicht — genau so entstand die Lücke bei news:*: der Katalog
    // führte news:create/update/delete, die Konstanten-Map kannte sie nicht,
    // und die Routen liefen ausschliesslich über admin:manage.
    const byPermission = constantByPermission();
    const missing = catalogNames().filter((n) => !byPermission.has(n));
    expect(
      missing.length,
      `Ohne Konstante (${missing.length}):\n  ${missing.sort().join("\n  ")}`,
    ).toBeLessThanOrEqual(MAX_WITHOUT_CONSTANT);
  });

  it("keine zwei Konstanten zeigen auf dieselbe Permission", () => {
    const source = readFileSync(CONSTANTS_PATH, "utf-8");
    const seen = new Map<string, string[]>();
    for (const m of source.matchAll(/([A-Z0-9_]+):\s*"([^"]+)"/g)) {
      const list = seen.get(m[2]) ?? [];
      list.push(m[1]);
      seen.set(m[2], list);
    }
    const dupes = [...seen.entries()].filter(([, keys]) => keys.length > 1);
    expect(dupes.map(([perm]) => perm)).toEqual([]);
  });
});
