/**
 * Import-Service Tests — Discovery + File-Type-Config + Filename-Parsing.
 *
 * Sicherheitsnetz für den bevorstehenden Refactor. Deckt:
 *   - scanAllFileTypes(): findet ALLE File-Types in Loc_TEST-Fixture
 *   - extractDateFromFilename(): korrekte Behandlung von Daily/Monthly/Yearly/Alltime
 *   - FILE_TYPE_CONFIG-Consistency: 27 Extensions, keine Duplikate
 *   - isValidFileType(): Case-Sensitivity, Whitelist-Verhalten
 */

import { describe, it, expect } from "vitest";
import path from "node:path";
import {
  scanAllFileTypes,
  extractDateFromFilename,
  isValidFileType,
  getFileTypeConfig,
} from "./import-service";
import { FIXTURE_ROOT } from "./__fixtures__/paths";

// ============================================================================
// scanAllFileTypes — Discovery-Engine
// ============================================================================

describe("scanAllFileTypes — Discovery gegen Fixture-Location", () => {
  it("findet Daily-, Monthly- und Yearly-Files in Loc_TEST", async () => {
    const results = await scanAllFileTypes(FIXTURE_ROOT, "Loc_TEST");

    // Contract: nicht-leer
    expect(results.length).toBeGreaterThan(0);

    // Alle Result-Einträge haben die 4 Pflicht-Felder
    for (const r of results) {
      expect(r.fileType).toBeTypeOf("string");
      expect(r.extension).toBeTypeOf("string");
      expect(r.fileCount).toBeGreaterThan(0);
      expect(["daily", "monthly", "yearly"]).toContain(r.fileLocation);
    }
  });

  it("findet die 6 Daily-File-Types (WSD, UID, UQD, WDD, 84D, 85D)", async () => {
    const results = await scanAllFileTypes(FIXTURE_ROOT, "Loc_TEST");
    const dailyTypes = results.filter((r) => r.fileLocation === "daily").map((r) => r.fileType);

    expect(dailyTypes).toEqual(expect.arrayContaining(["WSD", "UID", "UQD", "WDD", "84D", "85D"]));
  });

  it("findet Monthly-Aggregate (AVM, WSR, SSM, SWM)", async () => {
    // NOTE: AVR und PES sind in FILE_TYPE_CONFIG als 'daily' klassifiziert
    // (existieren aber real auch als monthly cumulative im Loc-Root).
    // Der aktuelle Discovery-Code findet sie nicht als monthly — bewusst
    // als Discovery-Verhalten festgehalten; falls Fix gewünscht: separater Sprint.
    const results = await scanAllFileTypes(FIXTURE_ROOT, "Loc_TEST");
    const monthlyTypes = results.filter((r) => r.fileLocation === "monthly" || r.fileLocation === "yearly")
      .map((r) => r.fileType);

    expect(monthlyTypes).toEqual(expect.arrayContaining(["AVM", "WSR", "SSM", "SWM"]));
  });

  it("wirft aussagekräftigen Fehler bei nicht-existentem Standort", async () => {
    await expect(scanAllFileTypes(FIXTURE_ROOT, "Loc_NONEXISTENT"))
      .rejects.toThrow(/nicht gefunden/i);
  });

  it("Snapshot: gefundene File-Types + Anzahl (Regression-Guard)", async () => {
    const results = await scanAllFileTypes(FIXTURE_ROOT, "Loc_TEST");
    // Nur fileType + fileCount snapshotten (fileLocation ist Metadaten, keine Regression-Kandidat)
    const compact = results
      .map((r) => ({ fileType: r.fileType, fileCount: r.fileCount, ext: r.extension }))
      .sort((a, b) => a.fileType.localeCompare(b.fileType));
    expect(compact).toMatchSnapshot();
  });
});

// ============================================================================
// extractDateFromFilename — Filename-Parsing
// ============================================================================

describe("extractDateFromFilename", () => {
  it("erkennt Daily-Filename YYYYMMDD.ext", () => {
    const date = extractDateFromFilename(path.join("some", "dir", "20260315.wsd"));
    expect(date).not.toBeNull();
    expect(date!.getUTCFullYear()).toBe(2026);
    expect(date!.getUTCMonth()).toBe(2); // März = index 2
    expect(date!.getUTCDate()).toBe(15);
  });

  it("erkennt Monthly-Filename YYYYMM00.ext → erster des Monats", () => {
    const date = extractDateFromFilename("20260600.wsr");
    expect(date).not.toBeNull();
    expect(date!.getUTCFullYear()).toBe(2026);
    expect(date!.getUTCMonth()).toBe(5); // Juni
    expect(date!.getUTCDate()).toBe(1);
  });

  it("erkennt Yearly-Filename YYYY0000.ext → Jan 1", () => {
    const date = extractDateFromFilename("20260000.avy");
    expect(date).not.toBeNull();
    expect(date!.getUTCFullYear()).toBe(2026);
    expect(date!.getUTCMonth()).toBe(0);
    expect(date!.getUTCDate()).toBe(1);
  });

  it("Alltime-Filename 00000000.ext → null (kann keinem Datum zugeordnet werden)", () => {
    expect(extractDateFromFilename("00000000.wsm")).toBeNull();
  });

  it("Regression-Guard: invalide Filenames → null (kein Throw)", () => {
    expect(extractDateFromFilename("garbage.wsd")).toBeNull();
    expect(extractDateFromFilename("2026-01-01.wsd")).toBeNull(); // Bindestriche nicht erlaubt
    expect(extractDateFromFilename("202613"  + "01.wsd")).toBeNull(); // Monat 13 invalide
    expect(extractDateFromFilename("2026" + "0132.wsd")).toBeNull(); // Tag 32 invalide
  });

  it("erkennt 84D/85D Datei-Extension (nicht nur 3-stellige)", () => {
    const date = extractDateFromFilename("20260315.84d");
    expect(date).not.toBeNull();
    expect(date!.getUTCFullYear()).toBe(2026);
  });
});

// ============================================================================
// FILE_TYPE_CONFIG — Config-Consistency
// ============================================================================

describe("FILE_TYPE_CONFIG — Config-Consistency", () => {
  it("hat die erwartete Anzahl File-Types (25 aktuell, +2 aus Sprint A wenn UIM/UQM ergänzt)", () => {
    const config = getFileTypeConfig();
    // Aktuell: WSD, UID (2) + AVR/AVW/AVM/AVY (4) + SSM/SWM (2) + PES/PEW/PET (3)
    //        + WSR/WSW/WSM/WSY (4) + WDD (1) + 84D/85D (2) + UQD/UQR/UQW/UQY (4)
    //        + UIR/UIW/UIY (3) = 25
    // Nach Sprint A: +UIM +UQM = 27
    expect(Object.keys(config).length).toBeGreaterThanOrEqual(25);
    expect(Object.keys(config).length).toBeLessThanOrEqual(30);
  });

  it("alle Extensions sind lowercase und ohne Punkt", () => {
    const config = getFileTypeConfig();
    for (const [fileType, cfg] of Object.entries(config)) {
      expect(cfg.extension).toBe(cfg.extension.toLowerCase());
      expect(cfg.extension.startsWith(".")).toBe(false);
      // File-Type-Key ist upper-case (WSD, UID, 84D)
      expect(fileType).toBe(fileType.toUpperCase());
    }
  });

  it("keine Duplikat-Extensions", () => {
    const config = getFileTypeConfig();
    const extensions = Object.values(config).map((c) => c.extension);
    const unique = new Set(extensions);
    expect(unique.size).toBe(extensions.length);
  });

  it("alle fileLocation-Werte sind daily/monthly/yearly (nie alltime)", () => {
    // Sprint-A-Regression: alltime als fileLocation war dead-code
    const config = getFileTypeConfig();
    const validLocations = new Set(["daily", "monthly", "yearly"]);
    for (const cfg of Object.values(config)) {
      expect(validLocations.has(cfg.fileLocation)).toBe(true);
    }
  });
});

// ============================================================================
// isValidFileType — Frontend/Backend-Sync Guard
// ============================================================================

describe("isValidFileType", () => {
  it("akzeptiert alle canonical File-Type-Keys aus FILE_TYPE_CONFIG", () => {
    const config = getFileTypeConfig();
    for (const key of Object.keys(config)) {
      expect(isValidFileType(key)).toBe(true);
    }
  });

  it("lehnt Lowercase-Varianten ab (Case-Sensitive)", () => {
    expect(isValidFileType("wsd")).toBe(false);
    expect(isValidFileType("uid")).toBe(false);
  });

  it("lehnt unbekannte Extensions ab", () => {
    expect(isValidFileType("XXX")).toBe(false);
    expect(isValidFileType("")).toBe(false);
  });
});
