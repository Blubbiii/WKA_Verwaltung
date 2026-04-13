import { describe, it, expect } from "vitest";
import {
  getDunningLevels,
  selectNextDunningLevel,
  computeOverdueDays,
  type DunningLevel,
} from "./dunning";
import type { TenantSettings } from "@/lib/tenant-settings";

// =============================================================================
// Helpers
// =============================================================================

function makeTenantSettings(overrides: Partial<TenantSettings> = {}): TenantSettings {
  // Realistic defaults — match what tenant-settings.ts uses
  return {
    paymentTermDays: 14,
    defaultTaxRate: 19,
    taxExempt: false,
    taxExemptNote: "",
    invoicePaymentText: "",
    creditNotePaymentText: "",
    defaultSkontoPercent: 2,
    defaultSkontoDays: 7,
    portalEnabled: true,
    portalWelcomeText: "",
    portalContactEmail: "",
    portalContactPhone: "",
    portalVisibleSections: [],
    emailSignature: "",
    emailFromName: "",
    companyName: "",
    companyAddress: "",
    companyPhone: "",
    companyEmail: "",
    companyWebsite: "",
    datevRevenueAccount: "",
    datevExpenseAccount: "",
    datevDebtorStart: 10000,
    datevCreditorStart: 70000,
    datevAccountEinspeisung: "",
    datevAccountDirektvermarktung: "",
    datevAccountPachtEinnahmen: "",
    datevAccountPachtAufwand: "",
    datevAccountWartung: "",
    datevAccountBF: "",
    datevAccountReceivables: "",
    datevAccountOutputTax19: "",
    datevAccountOutputTax7: "",
    datevAccountInputTax19: "",
    datevAccountInputTax7: "",
    fiscalYearStartMonth: 1,
    reminderEnabled: true,
    reminderDays1: 7,
    reminderDays2: 14,
    reminderDays3: 30,
    reminderFee1: 0,
    reminderFee2: 5,
    reminderFee3: 10,
    ...overrides,
  } as TenantSettings;
}

const STANDARD_LEVELS: DunningLevel[] = [
  { level: 1, minDays: 7, fee: 0 },
  { level: 2, minDays: 14, fee: 5 },
  { level: 3, minDays: 30, fee: 10 },
];

// =============================================================================
// getDunningLevels
// =============================================================================

describe("getDunningLevels", () => {
  it("baut 3 Stufen aus TenantSettings", () => {
    const settings = makeTenantSettings();
    const levels = getDunningLevels(settings);

    expect(levels).toHaveLength(3);
    expect(levels[0]).toEqual({ level: 1, minDays: 7, fee: 0 });
    expect(levels[1]).toEqual({ level: 2, minDays: 14, fee: 5 });
    expect(levels[2]).toEqual({ level: 3, minDays: 30, fee: 10 });
  });

  it("respektiert tenant-spezifische Mahngebühren", () => {
    const settings = makeTenantSettings({
      reminderFee1: 2.5,
      reminderFee2: 7.5,
      reminderFee3: 15,
    });
    const levels = getDunningLevels(settings);

    expect(levels[0].fee).toBe(2.5);
    expect(levels[1].fee).toBe(7.5);
    expect(levels[2].fee).toBe(15);
  });

  it("respektiert tenant-spezifische Tage-Schwellen", () => {
    const settings = makeTenantSettings({
      reminderDays1: 5,
      reminderDays2: 10,
      reminderDays3: 21,
    });
    const levels = getDunningLevels(settings);

    expect(levels[0].minDays).toBe(5);
    expect(levels[1].minDays).toBe(10);
    expect(levels[2].minDays).toBe(21);
  });
});

// =============================================================================
// selectNextDunningLevel
// =============================================================================

describe("selectNextDunningLevel", () => {
  it("gibt null zurück wenn noch kein Schwellenwert erreicht ist", () => {
    expect(selectNextDunningLevel(0, 5, STANDARD_LEVELS)).toBeNull();
  });

  it("gibt Level 1 zurück wenn Tage genau dem ersten Schwellenwert entsprechen", () => {
    const result = selectNextDunningLevel(0, 7, STANDARD_LEVELS);
    expect(result?.level).toBe(1);
  });

  it("gibt Level 1 zurück bei Erstüberfälligkeit über Schwellenwert 1, aber unter 2", () => {
    const result = selectNextDunningLevel(0, 10, STANDARD_LEVELS);
    expect(result?.level).toBe(1);
    expect(result?.fee).toBe(0);
  });

  it("gibt Level 2 zurück bei Erstüberfälligkeit über Schwellenwert 2", () => {
    // currentLevel 0, 14 Tage → Level 1 (kommt zuerst), nicht Level 2
    // Das ist korrekt: Mahnung muss eskalieren, Level kann nicht übersprungen werden
    const result = selectNextDunningLevel(0, 14, STANDARD_LEVELS);
    expect(result?.level).toBe(1);
  });

  it("eskaliert nach Level 1 zu Level 2 bei 14+ Tagen", () => {
    const result = selectNextDunningLevel(1, 14, STANDARD_LEVELS);
    expect(result?.level).toBe(2);
    expect(result?.fee).toBe(5);
  });

  it("eskaliert nach Level 2 zu Level 3 bei 30+ Tagen", () => {
    const result = selectNextDunningLevel(2, 30, STANDARD_LEVELS);
    expect(result?.level).toBe(3);
    expect(result?.fee).toBe(10);
  });

  it("gibt null zurück wenn bereits auf Level 3", () => {
    expect(selectNextDunningLevel(3, 100, STANDARD_LEVELS)).toBeNull();
  });

  it("gibt null zurück wenn Level 1 erreicht aber noch keine 14 Tage für Level 2", () => {
    expect(selectNextDunningLevel(1, 13, STANDARD_LEVELS)).toBeNull();
  });

  it("gibt null zurück wenn Level 2 erreicht aber noch keine 30 Tage für Level 3", () => {
    expect(selectNextDunningLevel(2, 29, STANDARD_LEVELS)).toBeNull();
  });

  it("respektiert custom Schwellenwerte", () => {
    const customLevels: DunningLevel[] = [
      { level: 1, minDays: 3, fee: 1 },
      { level: 2, minDays: 7, fee: 5 },
    ];
    expect(selectNextDunningLevel(0, 2, customLevels)).toBeNull();
    expect(selectNextDunningLevel(0, 3, customLevels)?.level).toBe(1);
    expect(selectNextDunningLevel(1, 6, customLevels)).toBeNull();
    expect(selectNextDunningLevel(1, 7, customLevels)?.level).toBe(2);
  });

  it("kann mit leerer Levels-Liste umgehen", () => {
    expect(selectNextDunningLevel(0, 100, [])).toBeNull();
  });
});

// =============================================================================
// computeOverdueDays
// =============================================================================

describe("computeOverdueDays", () => {
  const NOW = new Date("2026-04-13T12:00:00Z");

  it("gibt 0 zurück wenn dueDate in der Zukunft liegt", () => {
    const future = new Date("2026-04-20T12:00:00Z");
    expect(computeOverdueDays(future, NOW)).toBe(0);
  });

  it("gibt 0 zurück wenn dueDate genau jetzt ist", () => {
    expect(computeOverdueDays(NOW, NOW)).toBe(0);
  });

  it("gibt 1 zurück bei genau 1 Tag Überfälligkeit", () => {
    const yesterday = new Date("2026-04-12T12:00:00Z");
    expect(computeOverdueDays(yesterday, NOW)).toBe(1);
  });

  it("gibt 7 zurück bei 7 Tagen Überfälligkeit", () => {
    const weekAgo = new Date("2026-04-06T12:00:00Z");
    expect(computeOverdueDays(weekAgo, NOW)).toBe(7);
  });

  it("rundet ab bei Teilstunden (12 Stunden überfällig = 0 Tage)", () => {
    const halfDayAgo = new Date("2026-04-13T00:00:00Z");
    expect(computeOverdueDays(halfDayAgo, NOW)).toBe(0);
  });

  it("rundet ab bei 23 Stunden überfällig (= 0 Tage)", () => {
    const twentyThreeHoursAgo = new Date("2026-04-12T13:00:00Z");
    expect(computeOverdueDays(twentyThreeHoursAgo, NOW)).toBe(0);
  });

  it("gibt 30 zurück bei einem Monat Überfälligkeit", () => {
    const monthAgo = new Date("2026-03-14T12:00:00Z");
    expect(computeOverdueDays(monthAgo, NOW)).toBe(30);
  });

  it("nutzt new Date() als Default für now Parameter", () => {
    const future = new Date(Date.now() + 86400000); // tomorrow
    expect(computeOverdueDays(future)).toBe(0);
  });
});
