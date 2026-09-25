/**
 * The decision of scripts/backup-scheduler.sh (which backups are due), run
 * through its test mode. Skipped where no POSIX sh is available.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SKRIPT = join(process.cwd(), "scripts", "backup-scheduler.sh");

function shVorhanden() {
  try {
    execFileSync("sh", ["-c", "exit 0"]);
    return true;
  } catch {
    return false;
  }
}

function faellig(env: Record<string, string>, marker: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "bs-"));
  for (const [typ, datum] of Object.entries(marker)) writeFileSync(join(dir, `.last_${typ}`), datum);
  const out = execFileSync("sh", [SKRIPT, "--entscheide"], {
    env: { ...process.env, BS_AKTIV: "true", BS_RHYTHMUS: "daily", BS_UHRZEIT: "02:00", BS_MARKER_DIR: dir, ...env },
  }).toString();
  return out.split(/\s+/).filter(Boolean);
}

// Sunday 2026-11-01 is also the first of the month.
const SONNTAG_ERSTER = { BS_HEUTE: "2026-11-01", BS_WOCHENTAG: "7", BS_TAG: "01" };
const FREITAG = { BS_HEUTE: "2026-09-25", BS_WOCHENTAG: "5", BS_TAG: "25" };

describe.skipIf(!shVorhanden())("Backup-Scheduler im Container: was ist fällig?", () => {
  it("vor der Uhrzeit nichts, danach die Sicherungen des Tages", () => {
    expect(faellig({ ...FREITAG, BS_JETZT: "01:59" })).toEqual([]);
    expect(faellig({ ...FREITAG, BS_JETZT: "02:00" })).toEqual(["daily"]);
    expect(faellig({ ...SONNTAG_ERSTER, BS_JETZT: "09:15" })).toEqual(["daily", "weekly", "monthly"]);
  });

  it("einmal pro Tag und Typ — auch nach einem Fehlschlag kein Dauerversuch", () => {
    expect(faellig({ ...FREITAG, BS_JETZT: "14:00" }, { daily: "2026-09-25" })).toEqual([]);
    // Yesterday's marker does not block today.
    expect(faellig({ ...FREITAG, BS_JETZT: "14:00" }, { daily: "2026-09-24" })).toEqual(["daily"]);
  });

  it("der Rhythmus bestimmt die Typen", () => {
    expect(faellig({ ...SONNTAG_ERSTER, BS_JETZT: "03:00", BS_RHYTHMUS: "weekly" })).toEqual(["weekly", "monthly"]);
    expect(faellig({ ...SONNTAG_ERSTER, BS_JETZT: "03:00", BS_RHYTHMUS: "monthly" })).toEqual(["monthly"]);
    expect(faellig({ ...FREITAG, BS_JETZT: "03:00", BS_RHYTHMUS: "weekly" })).toEqual([]);
  });

  it("abgeschaltet: nichts", () => {
    expect(faellig({ ...FREITAG, BS_JETZT: "12:00", BS_AKTIV: "false" })).toEqual([]);
  });

  it("späte Uhrzeit mit führender Null wird als Zahl verglichen", () => {
    expect(faellig({ ...FREITAG, BS_JETZT: "08:30", BS_UHRZEIT: "09:05" })).toEqual([]);
    expect(faellig({ ...FREITAG, BS_JETZT: "23:45", BS_UHRZEIT: "23:30" })).toEqual(["daily"]);
  });
});
