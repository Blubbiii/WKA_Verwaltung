/**
 * Backup schedule set in the UI (decision E3, 2026-09).
 *
 * The schedule lives in system_configs (global, tenantId null). The
 * wpm-backup container reads it via psql (scripts/backup-scheduler.sh) and
 * writes its status back — the app container cannot see the backup volume,
 * so this is how "last backup" and "service alive" reach the UI.
 *
 * Rhythm follows the grandfather-father-son rotation of backup-db.sh:
 *   daily   → daily backup every day, plus weekly on Sunday and monthly on the 1st
 *   weekly  → weekly on Sunday, plus monthly on the 1st
 *   monthly → monthly on the 1st
 * All at the configured time, Europe/Berlin.
 */

export type BackupRhythmus = "daily" | "weekly" | "monthly";

export interface BackupZeitplan {
  aktiv: boolean;
  rhythmus: BackupRhythmus;
  /** "HH:MM", Europe/Berlin */
  uhrzeit: string;
  behalteTaeglich: number;
  behalteWoechentlich: number;
  behalteMonatlich: number;
  s3: boolean;
}

/** The fixed plan used before, and the container's fallback without DB. */
export const STANDARD_ZEITPLAN: BackupZeitplan = {
  aktiv: true,
  rhythmus: "daily",
  uhrzeit: "02:00",
  behalteTaeglich: 7,
  behalteWoechentlich: 4,
  behalteMonatlich: 3,
  s3: false,
};

/** Keys in system_configs. The shell script reads the same names. */
export const ZEITPLAN_SCHLUESSEL = {
  aktiv: "backup.schedule.enabled",
  rhythmus: "backup.schedule.interval",
  uhrzeit: "backup.schedule.time",
  behalteTaeglich: "backup.schedule.retentionDaily",
  behalteWoechentlich: "backup.schedule.retentionWeekly",
  behalteMonatlich: "backup.schedule.retentionMonthly",
  s3: "backup.schedule.s3",
} as const satisfies Record<keyof BackupZeitplan, string>;

/** Written by the container. */
export const STATUS_SCHLUESSEL = {
  letzterErfolg: "backup.status.lastSuccessAt",
  letzterTyp: "backup.status.lastType",
  letzteGroesse: "backup.status.lastSizeBytes",
  letzterFehler: "backup.status.lastErrorAt",
  fehlertext: "backup.status.lastError",
  lebenszeichen: "backup.status.heartbeatAt",
} as const;

export interface BackupStatus {
  letzterErfolg?: string;
  letzterTyp?: string;
  letzteGroesse?: number;
  letzterFehler?: string;
  fehlertext?: string;
  lebenszeichen?: string;
}

const UHRZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;
const RHYTHMEN: BackupRhythmus[] = ["daily", "weekly", "monthly"];

function anzahl(wert: string | undefined, standard: number) {
  const n = Number(wert);
  return Number.isInteger(n) && n >= 1 && n <= 365 ? n : standard;
}

export function zeitplanAusWerten(werte: Record<string, string | undefined>): BackupZeitplan {
  const s = STANDARD_ZEITPLAN;
  const rhythmus = werte[ZEITPLAN_SCHLUESSEL.rhythmus] as BackupRhythmus | undefined;
  const uhrzeit = werte[ZEITPLAN_SCHLUESSEL.uhrzeit];
  const aktiv = werte[ZEITPLAN_SCHLUESSEL.aktiv];
  const s3 = werte[ZEITPLAN_SCHLUESSEL.s3];
  return {
    aktiv: aktiv === undefined ? s.aktiv : aktiv === "true",
    rhythmus: rhythmus && RHYTHMEN.includes(rhythmus) ? rhythmus : s.rhythmus,
    uhrzeit: uhrzeit && UHRZEIT.test(uhrzeit) ? uhrzeit : s.uhrzeit,
    behalteTaeglich: anzahl(werte[ZEITPLAN_SCHLUESSEL.behalteTaeglich], s.behalteTaeglich),
    behalteWoechentlich: anzahl(werte[ZEITPLAN_SCHLUESSEL.behalteWoechentlich], s.behalteWoechentlich),
    behalteMonatlich: anzahl(werte[ZEITPLAN_SCHLUESSEL.behalteMonatlich], s.behalteMonatlich),
    s3: s3 === undefined ? s.s3 : s3 === "true",
  };
}

// ---------------------------------------------------------------------------
// Europe/Berlin wall clock without a timezone library
// ---------------------------------------------------------------------------

const TZ = "Europe/Berlin";
const teileFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function berlinTeile(zeit: Date) {
  const t = Object.fromEntries(teileFormat.formatToParts(zeit).map((p) => [p.type, p.value]));
  return { y: +t.year, m: +t.month, d: +t.day, h: +t.hour, min: +t.minute, s: +t.second };
}

/** Offset of Berlin against UTC at that instant, in ms. */
function versatz(zeit: Date) {
  const t = berlinTeile(zeit);
  return Date.UTC(t.y, t.m - 1, t.d, t.h, t.min, t.s) - Math.floor(zeit.getTime() / 1000) * 1000;
}

/** UTC instant of a Berlin wall-clock time. */
function ausBerlin(y: number, m: number, d: number, h: number, min: number) {
  const naiv = Date.UTC(y, m - 1, d, h, min);
  const erster = naiv - versatz(new Date(naiv));
  // Second pass settles the hour around a DST switch.
  return new Date(naiv - versatz(new Date(erster)));
}

function laeuftAn(rhythmus: BackupRhythmus, wochentag: number, tag: number) {
  if (rhythmus === "daily") return true;
  if (rhythmus === "weekly") return wochentag === 0 || tag === 1;
  return tag === 1;
}

/** Next scheduled run after `jetzt`, or null when switched off. */
export function naechsterLauf(plan: BackupZeitplan, jetzt: Date): Date | null {
  if (!plan.aktiv) return null;
  const [h, min] = plan.uhrzeit.split(":").map(Number);
  const heute = berlinTeile(jetzt);
  for (let i = 0; i <= 62; i++) {
    // Calendar arithmetic on the Berlin date (noon avoids DST edges).
    const tag = new Date(Date.UTC(heute.y, heute.m - 1, heute.d + i, 12));
    if (!laeuftAn(plan.rhythmus, tag.getUTCDay(), tag.getUTCDate())) continue;
    const lauf = ausBerlin(tag.getUTCFullYear(), tag.getUTCMonth() + 1, tag.getUTCDate(), h, min);
    if (lauf > jetzt) return lauf;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Situation shown in the UI
// ---------------------------------------------------------------------------

export type BackupWarnung = "aus" | "keinLebenszeichen" | "fehlgeschlagen" | "ueberfaellig";

/** The container reports every 5 minutes; two hours of silence is not a hiccup. */
const LEBENSZEICHEN_MAX_MS = 2 * 3_600_000;
/** Allowed age of the last success: one period plus six hours of slack. */
const PERIODE_MS: Record<BackupRhythmus, number> = {
  daily: 24 * 3_600_000,
  weekly: 7 * 24 * 3_600_000,
  monthly: 31 * 24 * 3_600_000,
};
const SPIELRAUM_MS = 6 * 3_600_000;

export function backupLage(
  plan: BackupZeitplan,
  status: BackupStatus,
  jetzt: Date,
): { ok: boolean; warnung: BackupWarnung | null } {
  if (!plan.aktiv) return { ok: false, warnung: "aus" };
  const alter = (iso?: string) => (iso ? jetzt.getTime() - new Date(iso).getTime() : Infinity);

  if (alter(status.lebenszeichen) > LEBENSZEICHEN_MAX_MS) {
    return { ok: false, warnung: "keinLebenszeichen" };
  }
  if (status.letzterFehler && alter(status.letzterFehler) < alter(status.letzterErfolg)) {
    return { ok: false, warnung: "fehlgeschlagen" };
  }
  if (alter(status.letzterErfolg) > PERIODE_MS[plan.rhythmus] + SPIELRAUM_MS) {
    return { ok: false, warnung: "ueberfaellig" };
  }
  return { ok: true, warnung: null };
}
