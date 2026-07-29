/**
 * Repeatable-Jobs zuverlässig entfernen.
 *
 * F20 (Audit 2026-07, Worker/Queues): Mehrere Queues bauten den
 * Repeatable-Key von Hand zusammen — und zwar falsch:
 *   - billing.queue.ts nutzte `${ruleId}` als Suffix statt des Cron-Patterns
 *   - weather.queue.ts und scada-auto-import.queue.ts setzten ein Literal `*`
 *     (bei `removeRepeatableByKey` gibt es kein Globbing)
 * Folge: wird eine BillingRule gelöscht oder ein Park deaktiviert, feuert der
 * Cron weiter und arbeitet gegen gelöschte Entitäten.
 *
 * Dazu kommt eine Falle, in die wir selbst getappt sind: BullMQ bildet den Key
 * als `${name}:${jobId}:${endDate}:${tz}:${suffix}` (siehe
 * `getRepeatConcatOptions` in bullmq/classes/repeat.js). Mit der Einführung von
 * `tz: CRON_TIMEZONE` in Welle 3a wurde aus `name:jobId:::pattern` plötzlich
 * `name:jobId::Europe/Berlin:pattern` — und damit stimmte JEDER handgebaute
 * Key nicht mehr, auch die vorher korrekten.
 *
 * Deshalb wird hier grundsätzlich nicht mehr gerechnet, sondern gescannt:
 * `getRepeatableJobs()` liefert die echten Keys, wir filtern über Name und
 * Job-ID. Das ist unabhängig vom Key-Format und übersteht auch die nächste
 * BullMQ-Änderung.
 */

import type { Queue } from "bullmq";
import { jobLogger as logger } from "@/lib/logger";

export interface RemoveRepeatableFilter {
  /** Job-Name, exakt (z. B. "process-billing"). */
  name?: string;
  /**
   * Job-ID, exakt. BullMQ liefert sie in `RepeatableJob.id`.
   * Ohne Angabe werden alle Repeatables des Namens entfernt.
   */
  jobId?: string;
}

/**
 * Entfernt alle Repeatable-Jobs, die auf den Filter passen.
 *
 * @returns Anzahl der tatsächlich entfernten Repeatables.
 */
export async function removeRepeatableJobs(
  queue: Queue,
  filter: RemoveRepeatableFilter,
): Promise<number> {
  if (!filter.name && !filter.jobId) {
    // Ohne Filter wuerden wir jeden Cron der Queue loeschen — das ist nie
    // gewollt und wäre ein stiller Totalausfall.
    throw new Error("removeRepeatableJobs: name oder jobId muss gesetzt sein");
  }

  let removed = 0;

  try {
    const repeatables = await queue.getRepeatableJobs();

    for (const rj of repeatables) {
      if (filter.name && rj.name !== filter.name) continue;
      if (filter.jobId && rj.id !== filter.jobId) continue;

      try {
        const ok = await queue.removeRepeatableByKey(rj.key);
        if (ok) removed++;
      } catch (err) {
        logger.warn(
          { queue: queue.name, key: rj.key, err },
          "[Queue] Repeatable konnte nicht entfernt werden",
        );
      }
    }
  } catch (err) {
    logger.error(
      { queue: queue.name, filter, err },
      "[Queue] Repeatables konnten nicht gelesen werden",
    );
    return 0;
  }

  if (removed > 0) {
    logger.info(
      { queue: queue.name, filter, removed },
      `[Queue:${queue.name}] ${removed} Repeatable(s) entfernt`,
    );
  } else {
    logger.info(
      { queue: queue.name, filter },
      `[Queue:${queue.name}] Kein passendes Repeatable gefunden`,
    );
  }

  return removed;
}
