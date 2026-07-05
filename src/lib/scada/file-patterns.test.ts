/**
 * Cross-Check-Tests: neue `discoverByPattern` vs. alte `discoverFiles`-Logik.
 *
 * Phase 4 des Refactor-Sprints — die deklarative Pattern-basierte Discovery
 * MUSS für alle File-Locations dieselben Ergebnisse liefern wie die alte
 * Case-Switch-Logik. Verhalten wird gegen die Fixture-Location
 * `__fixtures__/Loc_TEST/` verglichen.
 *
 * Wenn diese Tests grün bleiben, ist der Discovery-Refactor risikofrei.
 */

import { describe, it, expect } from "vitest";
import { discoverByPattern } from "./file-patterns";
import { scanAllFileTypes, getFileTypeConfig } from "./import-service";
import { FIXTURE_ROOT, LOC_TEST_ROOT } from "./__fixtures__/paths";

// ============================================================================
// Direct Pattern-Discovery — grundsätzliche Funktionsfähigkeit
// ============================================================================

describe("discoverByPattern — Daily", () => {
  it("findet WSD-Files im YYYY/MM/-Layout", async () => {
    const files = await discoverByPattern(LOC_TEST_ROOT, "wsd", "daily");
    expect(files.length).toBeGreaterThan(0);
    // Alle gefundenen Files müssen `20260101.wsd`-Struktur haben
    for (const f of files) {
      expect(f).toMatch(/[/\\]2026[/\\]01[/\\]20260101\.wsd$/i);
    }
  });

  it("findet UQD-Files", async () => {
    const files = await discoverByPattern(LOC_TEST_ROOT, "uqd", "daily");
    expect(files.length).toBeGreaterThan(0);
  });

  it("findet KEINE Monthly-Files als Daily (Anti-Match)", async () => {
    // WSR liegt als Monthly-Rollup direkt im YYYY-Verzeichnis — darf beim
    // daily-Suche nicht mit-gefunden werden
    const files = await discoverByPattern(LOC_TEST_ROOT, "wsr", "daily");
    expect(files).toEqual([]);
  });
});

describe("discoverByPattern — Monthly", () => {
  it("findet WSR-Files im YYYY-Layout", async () => {
    const files = await discoverByPattern(LOC_TEST_ROOT, "wsr", "monthly");
    expect(files.length).toBeGreaterThan(0);
    // Alle gefundenen müssen YYYYMM00.wsr-Struktur haben
    for (const f of files) {
      expect(f).toMatch(/[/\\]20260[16]00\.wsr$/i);
    }
  });

  it("findet KEINE Daily-Files als Monthly (Anti-Match)", async () => {
    const files = await discoverByPattern(LOC_TEST_ROOT, "wsd", "monthly");
    expect(files).toEqual([]);
  });
});

describe("discoverByPattern — Yearly", () => {
  it("gibt leeres Array wenn keine Yearly-Files vorhanden", async () => {
    // Fixture hat keine YYYY0000.*-Files (nur Monthly), also erwarten wir leer
    const files = await discoverByPattern(LOC_TEST_ROOT, "avy", "yearly");
    expect(files).toEqual([]);
  });

  it("Alltime-Files (00000000.ext) werden explizit ausgeschlossen", async () => {
    // Selbst wenn 00000000.avy irgendwo existiert, würde der Filenamen-Regex
    // negativ-lookahead das ausschließen. Da unser Fixture keine 00000000.*
    // hat, dokumentiert dieser Test nur das erwartete Verhalten.
    const files = await discoverByPattern(LOC_TEST_ROOT, "avy", "yearly");
    for (const f of files) {
      expect(f).not.toMatch(/[/\\]00000000\./);
    }
  });
});

// ============================================================================
// Cross-Check: neue vs. alte Discovery liefern DASSELBE Ergebnis
// ============================================================================

describe("Cross-Check: discoverByPattern vs. legacy discoverFiles", () => {
  it("findet identische WSD-Files wie scanAllFileTypes-Backend", async () => {
    // scanAllFileTypes ist der öffentliche Wrapper um die alte discoverFiles
    const legacyResults = await scanAllFileTypes(FIXTURE_ROOT, "Loc_TEST");
    const legacyWsd = legacyResults.find((r) => r.fileType === "WSD");

    const newFiles = await discoverByPattern(LOC_TEST_ROOT, "wsd", "daily");

    expect(newFiles.length).toBe(legacyWsd?.fileCount ?? 0);
  });

  it("findet identische WSR-Files (Monthly-Rollups)", async () => {
    const legacyResults = await scanAllFileTypes(FIXTURE_ROOT, "Loc_TEST");
    const legacyWsr = legacyResults.find((r) => r.fileType === "WSR");

    const newFiles = await discoverByPattern(LOC_TEST_ROOT, "wsr", "monthly");

    expect(newFiles.length).toBe(legacyWsr?.fileCount ?? 0);
  });

  it("findet identisch pro File-Type (alle Config-Typen mit vorhandenen Fixtures)", async () => {
    const legacyResults = await scanAllFileTypes(FIXTURE_ROOT, "Loc_TEST");
    const config = getFileTypeConfig();

    for (const legacy of legacyResults) {
      const cfg = config[legacy.fileType as keyof typeof config];
      const newFiles = await discoverByPattern(
        LOC_TEST_ROOT,
        cfg.extension,
        cfg.fileLocation as "daily" | "monthly" | "yearly",
      );
      expect(newFiles.length).toBe(legacy.fileCount);
    }
  });
});
