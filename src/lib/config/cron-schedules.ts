/**
 * Zentrale Cron-Expressions für BullMQ-Repeat-Jobs.
 * env-überschreibbar via CRON_<NAME>.
 */
function envCron(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

/**
 * Zeitzone für ALLE BullMQ-Repeat-Jobs.
 *
 * F24: Ohne `tz` wertet BullMQ Cron-Patterns in Prozess-Lokalzeit aus. Die
 * Container haben kein `TZ` gesetzt → UTC. "Täglich 08:00" liefe real um
 * 09:00 (Winter) bzw. 10:00 (Sommer) Berliner Zeit und verschöbe sich zweimal
 * pro Jahr. Fachlich sind alle Zeitangaben (Mahnlauf, Digest, Retention)
 * deutsche Ortszeit — deshalb hier explizit Europe/Berlin.
 */
export const CRON_TIMEZONE = process.env.CRON_TIMEZONE || "Europe/Berlin";
export const CRON_SCHEDULES = {
  /** Täglich 3:00 Uhr — DSGVO/GoBD Retention */
  RETENTION: envCron("CRON_RETENTION", "0 3 * * *"),
  /** Täglich 6:00 Uhr — Scheduled-Reports */
  REPORT: envCron("CRON_REPORT", "0 6 * * *"),
  /** Täglich 8:00 Uhr — Mahn-Reminders */
  REMINDER: envCron("CRON_REMINDER", "0 8 * * *"),
  /** Täglich 8:00 Uhr — Daily-Digest-Mail (Idee E) */
  DAILY_DIGEST: envCron("CRON_DAILY_DIGEST", "0 8 * * *"),
  /** Alle 6 Stunden — tus resumable-upload garbage collection */
  TUS_GC: envCron("CRON_TUS_GC", "0 */6 * * *"),
};
