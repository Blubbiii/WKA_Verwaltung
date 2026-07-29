/**
 * Deduplizierung, die eine Neuerzeugung nicht blockiert.
 *
 * F14 (Audit 2026-07, Worker/Queues): Mehrere Queues bilden ihre Job-ID rein
 * deterministisch aus der Entity (`pdf-{type}-{entityId}-{tenantId}`,
 * `inbox-ocr-{invoiceId}`). BullMQ behandelt `queue.add` mit einer bereits
 * existierenden jobId als No-Op und gibt den ALTEN Job zurück, solange der im
 * completed-Set liegt (`removeOnComplete: { count: 100 }`).
 *
 * Konkret: Jahresbericht erzeugen → Stammdaten korrigieren → erneut „Bericht
 * erstellen" → das Frontend zeigt sofort „fertig" mit dem veralteten
 * Storage-Key. Kein Fehler, keine Warnung. Dasselbe bei „OCR erneut starten":
 * die Antwort lautete „OCR erneut gestartet", passiert ist nichts.
 *
 * Die Unterscheidung, auf die es ankommt:
 * - Dedup gegen LAUFENDE Arbeit (waiting/active/delayed) ist erwünscht — ein
 *   Doppelklick soll nicht zweimal rendern.
 * - Dedup gegen ABGESCHLOSSENE Arbeit (completed/failed) ist der Fehler.
 */

import type { Queue } from "bullmq";
import { jobLogger as logger } from "@/lib/logger";

/**
 * Entfernt einen bereits abgeschlossenen Job mit dieser ID.
 *
 * @returns `true`, wenn neu erzeugt werden darf (kein Job vorhanden oder der
 *          alte wurde entfernt). `false`, wenn bereits ein Lauf unterwegs ist.
 */
export async function clearFinishedJob(
  // Die Queues sind über verschiedene Datentypen parametrisiert; hier zählt
  // nur getJob/remove, deshalb bewusst schwach typisiert.
  queue: Pick<Queue<never, never, string>, "name"> & {
    getJob: (id: string) => Promise<
      | {
          getState: () => Promise<string>;
          remove: () => Promise<unknown>;
        }
      | undefined
      | null
    >;
  },
  jobId: string,
): Promise<boolean> {
  try {
    const existing = await queue.getJob(jobId);
    if (!existing) return true;

    const state = await existing.getState();
    if (state === "completed" || state === "failed") {
      await existing.remove();
      logger.info(
        { queue: queue.name, jobId, previousState: state },
        "[Queue] Abgeschlossenen Vorlaeufer entfernt — Neuerzeugung angefordert",
      );
      return true;
    }

    logger.info(
      { queue: queue.name, jobId, state },
      "[Queue] Job laeuft bereits — kein zweiter Lauf",
    );
    return false;
  } catch (err) {
    // Im Zweifel neu erzeugen: doppelte Arbeit ist harmloser als ein veraltetes
    // Ergebnis, das als aktuell praesentiert wird.
    logger.warn(
      { queue: queue.name, jobId, err },
      "[Queue] Zustand des vorherigen Jobs nicht ermittelbar — erzeuge neu",
    );
    return true;
  }
}
