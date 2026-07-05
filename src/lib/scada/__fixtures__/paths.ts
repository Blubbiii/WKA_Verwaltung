import path from "node:path";

/**
 * Absoluter Pfad zu einem SCADA-Fixture.
 *
 * @example
 *   fixturePath("Loc_TEST/2026/01/20260101.wsd")
 */
export function fixturePath(relative: string): string {
  return path.join(__dirname, relative);
}

export const FIXTURE_ROOT = __dirname;
export const LOC_TEST_ROOT = path.join(__dirname, "Loc_TEST");
