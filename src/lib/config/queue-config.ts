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
