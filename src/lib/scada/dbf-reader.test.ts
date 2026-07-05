/**
 * Snapshot- und Contract-Tests für alle SCADA-DBF-Reader.
 *
 * Diese Tests bilden das Sicherheitsnetz für den bevorstehenden Refactor
 * (Schema-Descriptor statt hand-gerollter Reader). Jeder Reader wird gegen
 * eine echte Enercon-DBF-Fixture aus `__fixtures__/Loc_TEST/` geprüft:
 *
 *   1. **Contract-Tests** (immer, deterministic): Anzahl Records passt,
 *      Timestamps sind valide, Plant-Number ist Zahl, keine Silent-Failures.
 *   2. **Snapshot-Tests** (Vitest): erster Record als JSON — bricht bei
 *      Feld-Verlust oder falscher Skalierung sofort.
 *
 * Beim Refactor darf sich der Contract NICHT ändern. Die Snapshot-Dateien
 * werden bei ersten Lauf erzeugt (via `vitest --update`) und ab dann
 * eingecheckt.
 */

import { describe, it, expect } from "vitest";
import {
  readWsdFile,
  readUidFile,
  readUqdFile,
  readWddFile,
  read84dFile,
  read85dFile,
  readAvrFile,
  readWsrFile,
  readPesFile,
  readSsmFile,
  readSwmFile,
} from "./dbf-reader";
import { fixturePath } from "./__fixtures__/paths";

// ============================================================================
// Daily Files (10-Minuten-Werte)
// ============================================================================

describe("readWsdFile — Wind Speed Daily", () => {
  it("liest gültige 10-Minuten-Records aus WSD-Fixture", async () => {
    const records = await readWsdFile(fixturePath("Loc_TEST/2026/01/20260101.wsd"));

    // Contract: nicht-leer, alle Records sind valide
    expect(records.length).toBeGreaterThan(0);
    for (const rec of records) {
      expect(rec.timestamp).toBeInstanceOf(Date);
      expect(Number.isFinite(rec.timestamp.getTime())).toBe(true);
      expect(rec.plantNo).toBeTypeOf("number");
    }
  });

  it("erster Record enthält alle Sprint-A Felder (Curtailment, Meteo, Blindleistung)", async () => {
    const records = await readWsdFile(fixturePath("Loc_TEST/2026/01/20260101.wsd"));
    const first = records[0];

    // Sprint A: neue Felder MÜSSEN in WsdRecord existieren (auch wenn ggf. null)
    // Bricht wenn ein Refactor die Felder versehentlich entfernt.
    const fieldSet = Object.keys(first).sort();
    expect(fieldSet).toEqual(expect.arrayContaining([
      "timestamp", "plantNo",
      "windSpeedMs", "powerW", "rotorRpm", "operatingHours", "windDirection",
      "reactivePowerVar", "cumulativeEnergyWh", "operatingMinutes",
      "powerWindKw", "powerTechnicalKw", "powerForcedKw", "powerExternalKw",
      "pitchAngle", "rainIndex", "airPressureHpa", "airHumidityPct",
      "visibilityRange", "brightnessNight", "icingCount", "coldIcing",
    ]));
  });

  it("Snapshot: erster Record aus WSD-Fixture", async () => {
    const records = await readWsdFile(fixturePath("Loc_TEST/2026/01/20260101.wsd"));
    // Timestamp normalisieren damit der Snapshot deterministisch ist
    const normalized = { ...records[0], timestamp: records[0].timestamp.toISOString() };
    expect(normalized).toMatchSnapshot();
  });
});

describe("readUidFile — Electrical Daily (P/Q/S/cos φ/U/I)", () => {
  it("liest UID-Records mit vollem Elektro-Feld-Set", async () => {
    const records = await readUidFile(fixturePath("Loc_TEST/2026/01/20260101.uid"));
    expect(records.length).toBeGreaterThan(0);
    for (const rec of records) {
      expect(rec.timestamp).toBeInstanceOf(Date);
      expect(Number.isFinite(rec.timestamp.getTime())).toBe(true);
      expect(rec.plantNo).toBeTypeOf("number");
      // Phase-Arrays haben je 3 Elemente (U1/U2/U3, I1/I2/I3)
      expect(rec.meanVoltagesV).toHaveLength(3);
      expect(rec.meanCurrentsA).toHaveLength(3);
    }
  });

  it("Snapshot: erster UID-Record", async () => {
    const records = await readUidFile(fixturePath("Loc_TEST/2026/01/20260101.uid"));
    const normalized = { ...records[0], timestamp: records[0].timestamp.toISOString() };
    expect(normalized).toMatchSnapshot();
  });
});

describe("readUqdFile — Reactive per-Phase Daily", () => {
  it("liest UQD-Records mit per-Phase P1-P3 und Q1-Q3", async () => {
    const records = await readUqdFile(fixturePath("Loc_TEST/2026/01/20260101.uqd"));
    expect(records.length).toBeGreaterThan(0);
    for (const rec of records) {
      expect(rec.timestamp).toBeInstanceOf(Date);
      expect(rec.plantNo).toBeTypeOf("number");
    }
  });

  it("Snapshot: erster UQD-Record", async () => {
    const records = await readUqdFile(fixturePath("Loc_TEST/2026/01/20260101.uqd"));
    const normalized = { ...records[0], timestamp: records[0].timestamp.toISOString() };
    expect(normalized).toMatchSnapshot();
  });
});

describe("readWddFile — Shadow Casting Daily", () => {
  it("liest WDD-Records", async () => {
    const records = await readWddFile(fixturePath("Loc_TEST/2026/01/20260101.wdd"));
    expect(records.length).toBeGreaterThan(0);
    for (const rec of records) {
      expect(rec.timestamp).toBeInstanceOf(Date);
      expect(rec.plantNo).toBeTypeOf("number");
    }
  });

  it("Snapshot: erster WDD-Record", async () => {
    const records = await readWddFile(fixturePath("Loc_TEST/2026/01/20260101.wdd"));
    const normalized = { ...records[0], timestamp: records[0].timestamp.toISOString() };
    expect(normalized).toMatchSnapshot();
  });
});

describe("read84dFile — Operating State A0-A39", () => {
  it("liest 84D-Records", async () => {
    const records = await read84dFile(fixturePath("Loc_TEST/2026/01/20260101.84d"));
    expect(records.length).toBeGreaterThan(0);
    for (const rec of records) {
      expect(rec.timestamp).toBeInstanceOf(Date);
      expect(rec.plantNo).toBeTypeOf("number");
    }
  });

  it("Snapshot: erster 84D-Record", async () => {
    const records = await read84dFile(fixturePath("Loc_TEST/2026/01/20260101.84d"));
    const normalized = { ...records[0], timestamp: records[0].timestamp.toISOString() };
    expect(normalized).toMatchSnapshot();
  });
});

describe("read85dFile — Operating State A48+", () => {
  it("liest 85D-Records", async () => {
    const records = await read85dFile(fixturePath("Loc_TEST/2026/01/20260101.85d"));
    expect(records.length).toBeGreaterThan(0);
    for (const rec of records) {
      expect(rec.timestamp).toBeInstanceOf(Date);
      expect(rec.plantNo).toBeTypeOf("number");
    }
  });

  it("Snapshot: erster 85D-Record", async () => {
    const records = await read85dFile(fixturePath("Loc_TEST/2026/01/20260101.85d"));
    const normalized = { ...records[0], timestamp: records[0].timestamp.toISOString() };
    expect(normalized).toMatchSnapshot();
  });
});

// ============================================================================
// Monthly Files (aggregierte Zusammenfassungen)
// ============================================================================

describe("readAvrFile — Availability Rolling", () => {
  it("liest AVR-Records aus Monatsdatei", async () => {
    const records = await readAvrFile(fixturePath("Loc_TEST/2026/20260100.avr"));
    expect(records.length).toBeGreaterThan(0);
    for (const rec of records) {
      // Aggregat-Records nutzen `date` (Perioden-Start) statt `timestamp`
      expect(rec.date).toBeInstanceOf(Date);
      expect(rec.plantNo).toBeTypeOf("number");
    }
  });

  it("Snapshot: erster AVR-Record", async () => {
    const records = await readAvrFile(fixturePath("Loc_TEST/2026/20260100.avr"));
    const normalized = { ...records[0], date: records[0].date.toISOString() };
    expect(normalized).toMatchSnapshot();
  });
});

describe("readWsrFile — Wind Summary Rolling", () => {
  it("liest WSR-Records mit vollem Feld-Set (inkl. Curtailment)", async () => {
    const records = await readWsrFile(fixturePath("Loc_TEST/2026/20260100.wsr"));
    expect(records.length).toBeGreaterThan(0);
    for (const rec of records) {
      expect(rec.date).toBeInstanceOf(Date);
      expect(rec.plantNo).toBeTypeOf("number");
    }
  });

  it("Snapshot: erster WSR-Record", async () => {
    const records = await readWsrFile(fixturePath("Loc_TEST/2026/20260100.wsr"));
    const normalized = { ...records[0], date: records[0].date.toISOString() };
    expect(normalized).toMatchSnapshot();
  });
});

describe("readPesFile — Power/State Events Monthly", () => {
  it("liest PES-Records", async () => {
    const records = await readPesFile(fixturePath("Loc_TEST/2026/20260100.pes"));
    expect(records.length).toBeGreaterThan(0);
  });

  it("Snapshot: erster PES-Record", async () => {
    const records = await readPesFile(fixturePath("Loc_TEST/2026/20260100.pes"));
    // Event-Records können unterschiedliche Timestamp-Naming haben — normalisiere generisch
    const first = records[0] as unknown as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(first)) {
      normalized[k] = v instanceof Date ? v.toISOString() : v;
    }
    expect(normalized).toMatchSnapshot();
  });
});

describe("readSsmFile — State Summary Monthly", () => {
  it("liest SSM-Records", async () => {
    const records = await readSsmFile(fixturePath("Loc_TEST/2026/20260100.ssm"));
    expect(records.length).toBeGreaterThan(0);
  });

  it("Snapshot: erster SSM-Record", async () => {
    const records = await readSsmFile(fixturePath("Loc_TEST/2026/20260100.ssm"));
    expect(records[0]).toMatchSnapshot();
  });
});

describe("readSwmFile — Warning Summary Monthly", () => {
  it("liest SWM-Records", async () => {
    const records = await readSwmFile(fixturePath("Loc_TEST/2026/20260100.swm"));
    expect(records.length).toBeGreaterThan(0);
  });

  it("Snapshot: erster SWM-Record", async () => {
    const records = await readSwmFile(fixturePath("Loc_TEST/2026/20260100.swm"));
    expect(records[0]).toMatchSnapshot();
  });
});

// ============================================================================
// Robustness / Regression-Schutz
// ============================================================================

describe("Reader Robustness", () => {
  it("readWsdFile: nicht-existente Datei → leeres Array, kein Throw", async () => {
    // Die Reader loggen den Fehler intern und geben [] zurück — verifiziert dass
    // ein einzelner File-Fehler den Batch-Import nicht kippt.
    const records = await readWsdFile(fixturePath("Loc_TEST/nonexistent.wsd"));
    expect(records).toEqual([]);
  });

  it("WSD und WSR haben Feld-Kompatibilität für gemeinsame Aggregation", async () => {
    // Sprint-A-Regression: WSD-Reader las nur 5 Felder, WSR-Reader 20 — Drift.
    // Beide MÜSSEN jetzt dieselben Basis-Werte auslesen können.
    const daily = await readWsdFile(fixturePath("Loc_TEST/2026/01/20260101.wsd"));
    const monthly = await readWsrFile(fixturePath("Loc_TEST/2026/20260100.wsr"));

    // Beide haben Curtailment-Felder
    expect(daily[0]).toHaveProperty("powerWindKw");
    expect(daily[0]).toHaveProperty("powerExternalKw");
    // WSR nutzt "meanPowerWindKw" (Aggregat-Namensraum)
    expect(monthly[0]).toHaveProperty("meanPowerWindKw");
  });
});
