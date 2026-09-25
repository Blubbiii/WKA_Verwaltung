import { describe, expect, it } from "vitest";
import {
  STANDARD_ZEITPLAN,
  backupLage,
  naechsterLauf,
  zeitplanAusWerten,
} from "./backup-zeitplan";

describe("Backup-Zeitplan: gespeicherte Werte lesen", () => {
  it("ohne Einträge gilt der bisherige feste Plan", () => {
    expect(zeitplanAusWerten({})).toEqual(STANDARD_ZEITPLAN);
    expect(STANDARD_ZEITPLAN).toMatchObject({ aktiv: true, rhythmus: "daily", uhrzeit: "02:00" });
  });

  it("gültige Werte werden übernommen, ungültige fallen auf den Standard", () => {
    const plan = zeitplanAusWerten({
      "backup.schedule.enabled": "false",
      "backup.schedule.interval": "weekly",
      "backup.schedule.time": "23:30",
      "backup.schedule.retentionDaily": "14",
      "backup.schedule.retentionWeekly": "kaputt",
      "backup.schedule.s3": "true",
    });
    expect(plan).toMatchObject({
      aktiv: false,
      rhythmus: "weekly",
      uhrzeit: "23:30",
      behalteTaeglich: 14,
      behalteWoechentlich: STANDARD_ZEITPLAN.behalteWoechentlich,
      s3: true,
    });
    expect(zeitplanAusWerten({ "backup.schedule.time": "25:00" }).uhrzeit).toBe("02:00");
    expect(zeitplanAusWerten({ "backup.schedule.interval": "hourly" }).rhythmus).toBe("daily");
  });
});

// All times are Europe/Berlin wall clock, given as UTC instants (CEST = UTC+2).
const berlin = (iso: string) => new Date(iso);

describe("Backup-Zeitplan: nächster Lauf", () => {
  const plan = { ...STANDARD_ZEITPLAN, uhrzeit: "02:00" };

  it("täglich: heute, wenn die Uhrzeit noch kommt, sonst morgen", () => {
    // Fri 2026-09-25 01:00 Berlin → today 02:00 Berlin
    expect(naechsterLauf(plan, berlin("2026-09-24T23:00:00Z"))?.toISOString()).toBe("2026-09-25T00:00:00.000Z");
    // Fri 2026-09-25 10:00 Berlin → Sat 02:00 Berlin
    expect(naechsterLauf(plan, berlin("2026-09-25T08:00:00Z"))?.toISOString()).toBe("2026-09-26T00:00:00.000Z");
  });

  it("wöchentlich: sonntags", () => {
    const woche = { ...plan, rhythmus: "weekly" as const };
    // Fri 2026-09-25 → Sun 2026-09-27 02:00 Berlin
    expect(naechsterLauf(woche, berlin("2026-09-25T08:00:00Z"))?.toISOString()).toBe("2026-09-27T00:00:00.000Z");
  });

  it("monatlich: am Ersten — über die Umstellung auf Winterzeit hinweg", () => {
    const monat = { ...plan, rhythmus: "monthly" as const };
    // 2026-11-01 02:00 CET = 01:00 UTC
    expect(naechsterLauf(monat, berlin("2026-10-05T08:00:00Z"))?.toISOString()).toBe("2026-11-01T01:00:00.000Z");
  });

  it("abgeschaltet: kein nächster Lauf", () => {
    expect(naechsterLauf({ ...plan, aktiv: false }, new Date())).toBeNull();
  });
});

describe("Backup-Zeitplan: Lage", () => {
  const plan = STANDARD_ZEITPLAN;
  const jetzt = berlin("2026-09-25T08:00:00Z");
  const vorStunden = (h: number) => new Date(jetzt.getTime() - h * 3_600_000).toISOString();

  it("alles in Ordnung", () => {
    expect(
      backupLage(plan, { letzterErfolg: vorStunden(6), lebenszeichen: vorStunden(0.05) }, jetzt),
    ).toEqual({ ok: true, warnung: null });
  });

  it("der Dienst meldet sich nicht — das ist der Fall, in dem gar nichts läuft", () => {
    expect(backupLage(plan, { letzterErfolg: vorStunden(6), lebenszeichen: vorStunden(3) }, jetzt).warnung).toBe(
      "keinLebenszeichen",
    );
    expect(backupLage(plan, {}, jetzt).warnung).toBe("keinLebenszeichen");
  });

  it("der letzte Lauf ist gescheitert", () => {
    expect(
      backupLage(
        plan,
        { letzterErfolg: vorStunden(30), letzterFehler: vorStunden(6), lebenszeichen: vorStunden(0.05) },
        jetzt,
      ).warnung,
    ).toBe("fehlgeschlagen");
  });

  it("überfällig: täglich, aber das letzte Backup ist älter als ein Tag plus Spielraum", () => {
    expect(
      backupLage(plan, { letzterErfolg: vorStunden(31), lebenszeichen: vorStunden(0.05) }, jetzt).warnung,
    ).toBe("ueberfaellig");
    // Weekly tolerates a week.
    expect(
      backupLage({ ...plan, rhythmus: "weekly" }, { letzterErfolg: vorStunden(100), lebenszeichen: vorStunden(0.05) }, jetzt)
        .warnung,
    ).toBeNull();
  });

  it("abgeschaltet: keine Warnung, aber auch kein ok", () => {
    expect(backupLage({ ...plan, aktiv: false }, {}, jetzt)).toEqual({ ok: false, warnung: "aus" });
  });
});
