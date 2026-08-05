/**
 * TF-12: Der Permission-Katalog darf keine wirkungslosen Stellschrauben führen.
 *
 * Befund im Audit 2026-07: 42 der 169 Katalog-Permissions wurden von keiner
 * Route geprüft. Ein Admin vergab im Rollen-Editor "GoBD Z3-Export erstellen"
 * oder entzog "Jahresabschluss ausführen" — es änderte nichts. Kein
 * Sicherheitsloch, aber der Katalog täuschte Granularität vor.
 *
 * Stand: 14 Einträge werden weiterhin nicht via `requirePermission` geprüft —
 * aber jeder davon trägt jetzt im Katalog ein `unenforcedReason` mit der
 * Begründung (superadmin-only, no-endpoint, deprecated, portal-session).
 *
 * Der Test prüft deshalb keine Obergrenze mehr, sondern eine exakte Invariante
 * in beide Richtungen: kein ungeprüftes Recht ohne Grund, und kein Grund an
 * einem Recht, das tatsächlich geprüft wird. Wer ein neues Recht in den Katalog
 * schreibt, muss es entweder verdrahten oder begründen.
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

/**
 * Quelltext aller Dateien ausser Katalog und Konstanten-Map.
 *
 * Der Baumdurchlauf liest ueber tausend Dateien und dauert einige Sekunden.
 * Beide Invarianten-Tests brauchen dasselbe Ergebnis — ohne diesen
 * Zwischenspeicher lief der Scan zweimal und riss die 5-Sekunden-Grenze von
 * vitest, sobald der Baum wuchs. Das las sich wie ein inhaltlicher
 * Fehlschlag, war aber keiner.
 */
let projectSourceCache: string | null = null;

function projectSource(): string {
  if (projectSourceCache !== null) return projectSourceCache;
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
      /*
        Testdateien zaehlen nicht.

        Der Scan wertet jedes Vorkommen eines Rechtenamens in Anfuehrungszeichen
        als "wird geprueft". Ein Test, der "system:audit" bloss als Beispieldatum
        erwaehnt, sah damit aus wie eine Route, die es durchsetzt — und das Recht
        galt als abgedeckt, obwohl keine Route es prueft.

        Genau so ist es passiert: ein neuer Test mit echten Rechtenamen in seinen
        Beispieldaten machte "system:audit" still zu einem geprueften Recht.
        Ein Waechter, den man durch Hinschreiben besaenftigen kann, waecht nicht.
      */
      if (/\.test\.tsx?$/.test(entry)) continue;
      parts.push(readFileSync(full, "utf-8"));
    }
  };
  walk(SRC);
  projectSourceCache = parts.join("\n");
  return projectSourceCache;
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

let uncheckedCache: string[] | null = null;

function uncheckedPermissions(): string[] {
  if (uncheckedCache !== null) return uncheckedCache;
  const blob = projectSource();
  const byPermission = constantByPermission();

  const result = catalogNames().filter((name) => {
    // Direkt als String geprüft — ALLE Quote-Varianten.
    //
    // Der erste Wurf dieses Tests suchte nur nach doppelten Anführungszeichen
    // und meldete dadurch sieben Export-Rechte als ungeprüft, die in
    // `EXPORT_PERMISSION_MAP` (api/export/[type]/route.ts) längst mit einfachen
    // Anführungszeichen standen. Eine Messung, die falsch hoch zählt, ist
    // genauso irreführend wie eine, die zu niedrig zählt.
    for (const quote of ['"', "'", "`"]) {
      if (blob.includes(`${quote}${name}${quote}`)) return false;
    }
    // Über die Konstante geprüft?
    const constant = byPermission.get(name);
    if (constant && new RegExp(`PERMISSIONS\\.${constant}\\b`).test(blob)) return false;
    return true;
  });

  uncheckedCache = result;
  return result;
}

/**
 * Katalog-Einträge ohne Konstante in PERMISSIONS.
 *
 * Muss 0 sein: ohne Konstante lässt sich nur per Roh-String prüfen, und genau
 * so sind news:* und mailings:* durchgerutscht — im Katalog vorhanden, in der
 * Konstanten-Map nicht, von keiner Route geprüft.
 */
const MAX_WITHOUT_CONSTANT = 0;

/**
 * Rechte, die bewusst NICHT via `requirePermission` geprüft werden, tragen im
 * Katalog ein `unenforcedReason`. Damit ist die Lücke nicht mehr eine Zahl,
 * sondern eine dokumentierte Liste — und der Test kann exakt statt mit einer
 * Obergrenze prüfen.
 */
function permissionsWithReason(): Set<string> {
  const source = readFileSync(CATALOG_PATH, "utf-8");
  const withReason = new Set<string>();
  for (const m of source.matchAll(/\{ name: "([^"]+)"[^}]*unenforcedReason:/g)) {
    withReason.add(m[1]);
  }
  return withReason;
}

// Der Scan laeuft beim Laden des Moduls, nicht im ersten Test. vitest misst
// sein 5-Sekunden-Limit pro `it` — ein Baumdurchlauf ueber tausend Dateien
// passte da unter Last nicht mehr hinein und meldete Timeout statt Ergebnis.
// Beim Modul-Laden gilt die Grenze nicht.
const UNCHECKED = uncheckedPermissions();

describe("Permission-Katalog (TF-12)", () => {
  it("jedes ungeprüfte Recht hat einen dokumentierten Grund", () => {
    // Das ist der Kern von TF-12: nicht die Zahl zählt, sondern dass kein
    // Eintrag mehr unbemerkt wirkungslos ist. Wer ein neues Recht in den
    // Katalog schreibt, muss es entweder prüfen oder begründen.
    const unchecked = UNCHECKED;
    const documented = permissionsWithReason();
    const undocumented = unchecked.filter((p) => !documented.has(p));

    expect(
      undocumented,
      `Ungeprüft und ohne unenforcedReason: ${undocumented.join(", ")}`,
    ).toEqual([]);
  });

  it("kein Recht traegt einen Grund, obwohl es geprüft wird", () => {
    // Gegenrichtung: ein `unenforcedReason` an einem verdrahteten Recht ist ein
    // veralteter Kommentar und führt Leser in die Irre.
    const unchecked = new Set(UNCHECKED);
    const stale = [...permissionsWithReason()].filter((p) => !unchecked.has(p));
    expect(stale, `Grund gesetzt, obwohl geprüft: ${stale.join(", ")}`).toEqual([]);
  });

  it("der kritische Accounting-Block ist vollständig verdrahtet", () => {
    // Das war der im Audit hervorgehobene Teil: 15 feingranulare Rechte, u. a.
    // year-end-close:execute (im Katalog mit requiresApproval: true).
    const unchecked = new Set(UNCHECKED);
    const mustBeChecked = [
      "accounting:year-end-close:execute",
      "accounting:gobd-export:create",
      "accounting:datev-export:create",
      "accounting:period-lock:create",
      "accounting:period-lock:delete",
      // "accounting:journal:reverse" ist entfernt — Katalog-Dopplung zu
      // "accounting:reverse" (siehe merge_duplicate_reverse_permission.sql).
      "accounting:reverse",
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
