/**
 * B3: Grosskomponenten — Alter, Garantie, Restdauer.
 *
 * Der wichtigste Test ist der, der KEINE Zahl erwartet: ohne
 * Auslegungslebensdauer darf nichts geschaetzt werden.
 */

import { describe, it, expect } from "vitest";
import {
  computeLifetime,
  checkPositions,
  WARRANTY_WARN_DAYS,
  PLANNING_THRESHOLD,
} from "./lifetime";

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

const TODAY = d("2026-07-31");

describe("Restnutzungsdauer", () => {
  it("wird OHNE Auslegungslebensdauer nicht geschaetzt", () => {
    // Eine erfundene Restlebensdauer landet sonst in einer Rueckstellung.
    const result = computeLifetime(
      {
        installedAt: d("2016-07-31"),
        removedAt: null,
        designLifeYears: null,
        warrantyEndDate: null,
      },
      TODAY,
    );
    expect(result.plannedRemainingYears).toBeNull();
    expect(result.consumedRatio).toBeNull();
    // Und NICHT 0 — das saehe aus wie "sofort faellig".
    expect(result.plannedRemainingYears).not.toBe(0);
    expect(result.notes.some((n) => n.includes("nicht geschätzt"))).toBe(true);
  });

  it("rechnet gegen die Auslegungsdauer", () => {
    const result = computeLifetime(
      {
        installedAt: d("2016-07-31"),
        removedAt: null,
        designLifeYears: 20,
        warrantyEndDate: null,
      },
      TODAY,
    );
    expect(result.ageYears).toBeCloseTo(10, 1);
    expect(result.plannedRemainingYears).toBeCloseTo(10, 1);
    expect(result.consumedRatio).toBeCloseTo(0.5, 2);
  });

  it("meldet die Planungsschwelle", () => {
    const result = computeLifetime(
      {
        installedAt: d("2009-07-31"),
        removedAt: null,
        designLifeYears: 20,
        warrantyEndDate: null,
      },
      TODAY,
    );
    expect(result.consumedRatio!).toBeGreaterThanOrEqual(PLANNING_THRESHOLD);
    expect(result.notes.some((n) => n.includes("Ersatzbeschaffung"))).toBe(true);
  });

  it("eine erreichte Auslegungsdauer ist KEINE Ausfallprognose", () => {
    // Das muss dastehen, sonst liest jemand "0 Jahre Restdauer" als "kaputt".
    const result = computeLifetime(
      {
        installedAt: d("2000-01-01"),
        removedAt: null,
        designLifeYears: 20,
        warrantyEndDate: null,
      },
      TODAY,
    );
    expect(result.plannedRemainingYears!).toBeLessThan(0);
    expect(result.notes.some((n) => n.includes("keine Ausfallprognose"))).toBe(true);
  });
});

describe("Ausgebaute Komponenten", () => {
  it("altern in der Historie NICHT weiter", () => {
    // Sonst zeigte ein 2015 getauschtes Getriebe heute 25 Jahre.
    const result = computeLifetime(
      {
        installedAt: d("2005-01-01"),
        removedAt: d("2015-01-01"),
        designLifeYears: 20,
        warrantyEndDate: null,
      },
      TODAY,
    );
    expect(result.ageYears).toBeCloseTo(10, 1);
    expect(result.isHistorical).toBe(true);
  });

  it("bekommen keinen Planungshinweis", () => {
    // Fuer ein ausgebautes Teil ist nichts mehr zu planen.
    const result = computeLifetime(
      {
        installedAt: d("2000-01-01"),
        removedAt: d("2019-01-01"),
        designLifeYears: 20,
        warrantyEndDate: null,
      },
      TODAY,
    );
    expect(result.notes.some((n) => n.includes("Ersatzbeschaffung"))).toBe(false);
    expect(result.notes.some((n) => n.includes("Ausfallprognose"))).toBe(false);
  });
});

describe("Gewaehrleistung", () => {
  it("keine erfasst ist NICHT abgelaufen", () => {
    // Der Unterschied entscheidet, ob jemand nachschauen muss.
    const result = computeLifetime(
      { installedAt: d("2020-01-01"), removedAt: null, designLifeYears: 20, warrantyEndDate: null },
      TODAY,
    );
    expect(result.warranty).toBe("NONE");
    expect(result.warrantyDaysLeft).toBeNull();
  });

  it("abgelaufen wird als abgelaufen gefuehrt", () => {
    const result = computeLifetime(
      {
        installedAt: d("2020-01-01"),
        removedAt: null,
        designLifeYears: 20,
        warrantyEndDate: d("2025-01-01"),
      },
      TODAY,
    );
    expect(result.warranty).toBe("EXPIRED");
    expect(result.warrantyDaysLeft!).toBeLessThan(0);
  });

  it("ein naher Ablauf wird gemeldet — mit dem Grund", () => {
    // Bekannte Maengel muessen VOR Ablauf angezeigt werden.
    const result = computeLifetime(
      {
        installedAt: d("2020-01-01"),
        removedAt: null,
        designLifeYears: 20,
        warrantyEndDate: d("2026-10-01"),
      },
      TODAY,
    );
    expect(result.warranty).toBe("ACTIVE");
    expect(result.warrantyDaysLeft).toBe(62);
    expect(result.notes.some((n) => n.includes("Mängel"))).toBe(true);
    expect(WARRANTY_WARN_DAYS).toBe(180);
  });

  it("ein ferner Ablauf wird nicht gemeldet", () => {
    const result = computeLifetime(
      {
        installedAt: d("2020-01-01"),
        removedAt: null,
        designLifeYears: 20,
        warrantyEndDate: d("2030-01-01"),
      },
      TODAY,
    );
    expect(result.notes.some((n) => n.includes("Gewährleistung"))).toBe(false);
  });
});

describe("Ohne Einbaudatum", () => {
  it("wird kein Alter erfunden — die Garantie gilt trotzdem", () => {
    const result = computeLifetime(
      {
        installedAt: null,
        removedAt: null,
        designLifeYears: 20,
        warrantyEndDate: d("2027-01-01"),
      },
      TODAY,
    );
    expect(result.ageYears).toBeNull();
    expect(result.plannedRemainingYears).toBeNull();
    expect(result.warranty).toBe("ACTIVE");
  });
});

describe("Belegung der Positionen", () => {
  it("zwei eingebaute Getriebe sind ein Datenfehler", () => {
    // Der haeufige Fall: beim Tausch den Ausbau des alten Teils vergessen.
    const problems = checkPositions([
      { type: "GEARBOX", position: null, removedAt: null },
      { type: "GEARBOX", position: null, removedAt: null },
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("Ausbau des alten Teils");
  });

  it("ein ausgebautes plus ein eingebautes ist der Normalfall", () => {
    expect(
      checkPositions([
        { type: "GEARBOX", position: null, removedAt: d("2020-01-01") },
        { type: "GEARBOX", position: null, removedAt: null },
      ]),
    ).toEqual([]);
  });

  it("drei Rotorblaetter auf drei Positionen sind in Ordnung", () => {
    expect(
      checkPositions([
        { type: "ROTOR_BLADE", position: "A", removedAt: null },
        { type: "ROTOR_BLADE", position: "B", removedAt: null },
        { type: "ROTOR_BLADE", position: "C", removedAt: null },
      ]),
    ).toEqual([]);
  });

  it("zwei Blaetter auf derselben Position nicht", () => {
    const problems = checkPositions([
      { type: "ROTOR_BLADE", position: "A", removedAt: null },
      { type: "ROTOR_BLADE", position: "A", removedAt: null },
      { type: "ROTOR_BLADE", position: "B", removedAt: null },
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("Position A");
  });
});
