/**
 * Central queue/worker configuration.
 * All BullMQ job defaults in one place. Env-overridable.
 */

import type { JobsOptions } from "bullmq";

function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

/** Presets for different queue importance levels */
const PRESETS = {
  /** Critical jobs (billing, email) — 3 attempts, fast retry */
  critical: {
    attempts: envInt("QUEUE_CRITICAL_ATTEMPTS", 3),
    backoffDelay: envInt("QUEUE_CRITICAL_BACKOFF_MS", 2000),
    removeOnComplete: 100,
    removeOnFail: 500,
  },
  /** Standard jobs (pdf, webhook, weather, paperless) — 3 attempts, moderate retry */
  standard: {
    attempts: envInt("QUEUE_STANDARD_ATTEMPTS", 3),
    backoffDelay: envInt("QUEUE_STANDARD_BACKOFF_MS", 5000),
    removeOnComplete: 100,
    removeOnFail: 500,
  },
  /** Slow jobs (billing-batch, scada) — 3 attempts, slow retry */
  slow: {
    attempts: envInt("QUEUE_SLOW_ATTEMPTS", 3),
    backoffDelay: envInt("QUEUE_SLOW_BACKOFF_MS", 10000),
    removeOnComplete: 100,
    removeOnFail: 500,
  },
  /** Background jobs (reminder, report, ocr) — 2 attempts, slow retry */
  background: {
    attempts: envInt("QUEUE_BACKGROUND_ATTEMPTS", 2),
    backoffDelay: envInt("QUEUE_BACKGROUND_BACKOFF_MS", 30000),
    removeOnComplete: 50,
    removeOnFail: 200,
  },
} as const;

export type QueuePreset = keyof typeof PRESETS;

/** Build BullMQ defaultJobOptions from a preset */
export function getJobOptions(preset: QueuePreset): JobsOptions {
  const p = PRESETS[preset];
  return {
    attempts: p.attempts,
    backoff: {
      type: "exponential",
      delay: p.backoffDelay,
    },
    removeOnComplete: { count: p.removeOnComplete },
    removeOnFail: { count: p.removeOnFail },
  };
}

/**
 * Lock-Dauern für Worker mit langlaufenden Jobs.
 *
 * F25 / F15 (Audit 2026-07): BullMQs Default-`lockDuration` sind 30 Sekunden.
 * Läuft ein Job länger und erneuert den Lock nicht, gilt er als "stalled" und
 * wird ERNEUT ZUGESTELLT — bei mehreren Worker-Replikas an einen anderen
 * Prozess. Genau so entstehen die überlappenden Läufe aus F25, nicht durch das
 * Fehlen eines verteilten Locks: BullMQ erzeugt pro Cron-Tick nur einen Job
 * (deterministische jobId) und nur ein Worker kann ihn aktiv setzen.
 *
 * `concurrency: 1` hilft dagegen nicht — das gilt pro Prozess.
 *
 * Gemessener Stand vor dem Fix: von 15 Workern hatten 12 keine `lockDuration`,
 * darunter der SCADA-Import und der Retention-Lauf.
 *
 * Zusätzlich `maxStalledCount: 1` überall dort, wo ein doppelter Lauf teurer
 * ist als ein sichtbarer Fehlschlag.
 */
export const WORKER_LOCK_MS = {
  /** SCADA-Import: Dateiscan + Import über alle Mandanten. */
  scadaAutoImport: envInt("WORKER_LOCK_SCADA_MS", 30 * 60_000),
  /** DSGVO/GoBD-Retention: Sweep über alle Mandanten. */
  retention: envInt("WORKER_LOCK_RETENTION_MS", 30 * 60_000),
  /** Berichtserzeugung inkl. PDF-Rendering und Versand. */
  report: envInt("WORKER_LOCK_REPORT_MS", 10 * 60_000),
  /** Tages-Digest über alle Nutzer eines Mandanten. */
  dailyDigest: envInt("WORKER_LOCK_DIGEST_MS", 10 * 60_000),
  /** Paperless-Dokumentensynchronisation. */
  paperless: envInt("WORKER_LOCK_PAPERLESS_MS", 10 * 60_000),
  /** Re-Ausführung genehmigter Aktionen (bis zu 50 je Lauf). */
  approvalsReconcile: envInt("WORKER_LOCK_APPROVALS_MS", 10 * 60_000),
  /** Wetter-Sync: eine externe API-Abfrage je Park. */
  weather: envInt("WORKER_LOCK_WEATHER_MS", 5 * 60_000),
} as const;

/** Queue-to-preset mapping (for reference / documentation) */
export const QUEUE_PRESETS: Record<string, QueuePreset> = {
  billing: "slow",
  pdf: "standard",
  email: "critical",
  webhook: "slow",
  reminder: "background",
  report: "background",
  weather: "standard",
  "scada-auto-import": "slow",
  paperless: "slow",
  "inbox-ocr": "background",
};
