/**
 * Permission-Drift-Check (Build-Check Lite).
 *
 * Vergleicht die Permission-Konstanten in src/lib/auth/permissions.ts
 * (PERMISSIONS-Object) mit den seeded Permissions in prisma/seed.ts
 * (permissionsData-Array).
 *
 * Exit-Code:
 *   0 — kein Drift, alle Permission-Strings in beiden Quellen identisch
 *   1 — Drift erkannt, Diff wird auf stdout/stderr ausgegeben
 *
 * Usage:
 *   npx tsx scripts/check-permissions-drift.ts
 *
 * NICHT als pre-commit-Hook registriert — Tool-only.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Bei tsx-Execution: import.meta.url ist verfügbar
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const PERMISSIONS_FILE = resolve(REPO_ROOT, "src/lib/auth/permissions.ts");
const SEED_FILE = resolve(REPO_ROOT, "prisma/seed.ts");

/**
 * Extrahiert alle Permission-String-Werte aus dem `PERMISSIONS = { ... } as const`
 * Block in permissions.ts.
 *
 * Format-Annahme:
 *   PARKS_READ: "parks:read",
 *   PARKS_CREATE: "parks:create",
 *   ...
 *
 * Wir matchen `KEY: "<string>"` innerhalb des Blocks zwischen
 * `export const PERMISSIONS = {` und `} as const;`.
 */
function extractPermissionsFromCode(filePath: string): Set<string> {
  const content = readFileSync(filePath, "utf-8");
  const startMatch = content.indexOf("export const PERMISSIONS");
  if (startMatch === -1) {
    throw new Error(
      `Kein 'export const PERMISSIONS' in ${filePath} gefunden`,
    );
  }
  const fromStart = content.slice(startMatch);
  const endIdx = fromStart.indexOf("} as const");
  if (endIdx === -1) {
    throw new Error(
      `Kein '} as const' nach PERMISSIONS in ${filePath} gefunden`,
    );
  }
  const block = fromStart.slice(0, endIdx);

  const permissions = new Set<string>();
  // Match: KEY: "value:foo"  oder  KEY: 'value:foo'
  const regex = /[A-Z][A-Z0-9_]*\s*:\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(block)) !== null) {
    permissions.add(m[1]);
  }
  return permissions;
}

/**
 * Extrahiert alle Permission-Namen aus dem `permissionsData = [ ... ]` Array
 * in prisma/seed.ts.
 *
 * Format-Annahme:
 *   { name: "parks:read", displayName: "...", module: "...", action: "...", sortOrder: ... },
 *
 * Wir matchen `name: "<string>"` (oder 'name:') zwischen
 * `const permissionsData = [` und der nächsten `];`.
 */
function extractPermissionsFromSeed(filePath: string): Set<string> {
  const content = readFileSync(filePath, "utf-8");
  const startMatch = content.indexOf("permissionsData");
  if (startMatch === -1) {
    throw new Error(
      `Kein 'permissionsData' in ${filePath} gefunden`,
    );
  }
  // Suche das Array-Start `= [` nach permissionsData
  const fromStart = content.slice(startMatch);
  const arrStart = fromStart.indexOf("[");
  if (arrStart === -1) {
    throw new Error(
      `Kein '[' für permissionsData in ${filePath} gefunden`,
    );
  }
  // Heuristic: nimm die nächsten 60.000 Zeichen — die Liste ist groß aber
  // ein closing `];` sollte definitiv darin liegen.
  const block = fromStart.slice(arrStart, arrStart + 60000);
  const endIdx = block.indexOf("];");
  const limitedBlock = endIdx === -1 ? block : block.slice(0, endIdx);

  const permissions = new Set<string>();
  // Match: name: "value"   (aus { name: "parks:read", ... })
  const regex = /\bname\s*:\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(limitedBlock)) !== null) {
    permissions.add(m[1]);
  }
  return permissions;
}

function diffSets<T>(a: Set<T>, b: Set<T>): { onlyInA: T[]; onlyInB: T[] } {
  const onlyInA: T[] = [];
  const onlyInB: T[] = [];
  for (const v of a) if (!b.has(v)) onlyInA.push(v);
  for (const v of b) if (!a.has(v)) onlyInB.push(v);
  return { onlyInA, onlyInB };
}

function main(): number {
  let codePerms: Set<string>;
  let seedPerms: Set<string>;

  try {
    codePerms = extractPermissionsFromCode(PERMISSIONS_FILE);
  } catch (err) {
    console.error(
      `Fehler beim Lesen der Code-Permissions: ${err instanceof Error ? err.message : err}`,
    );
    return 2;
  }

  try {
    seedPerms = extractPermissionsFromSeed(SEED_FILE);
  } catch (err) {
    console.error(
      `Fehler beim Lesen der Seed-Permissions: ${err instanceof Error ? err.message : err}`,
    );
    return 2;
  }

  console.log(`Code-Permissions (src/lib/auth/permissions.ts):  ${codePerms.size}`);
  console.log(`Seed-Permissions (prisma/seed.ts):               ${seedPerms.size}`);
  console.log("");

  const { onlyInA: inCodeNotSeed, onlyInB: inSeedNotCode } = diffSets(
    codePerms,
    seedPerms,
  );

  if (inCodeNotSeed.length === 0 && inSeedNotCode.length === 0) {
    console.log("OK — keine Drift zwischen Code und Seed.");
    return 0;
  }

  if (inCodeNotSeed.length > 0) {
    console.log(`In Code, aber NICHT in Seed (${inCodeNotSeed.length}):`);
    for (const p of [...inCodeNotSeed].sort()) {
      console.log(`  - ${p}`);
    }
    console.log("");
  }

  if (inSeedNotCode.length > 0) {
    console.log(`In Seed, aber NICHT in Code (${inSeedNotCode.length}):`);
    for (const p of [...inSeedNotCode].sort()) {
      console.log(`  - ${p}`);
    }
    console.log("");
  }

  console.error("DRIFT erkannt — bitte Code-Konstanten und Seed-Liste synchronisieren.");
  return 1;
}

process.exit(main());
