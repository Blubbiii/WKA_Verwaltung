/**
 * State of a report generated in the background (GET /api/reports/jobs/[id]).
 *
 * Workers run as a separate process. If none runs, a job waits forever — the
 * UI must not spin endlessly, so waiting beyond a limit counts as "stuck" and
 * offers direct generation instead.
 */

export type BerichtsPhase = "wartet" | "laeuft" | "fertig" | "fehler" | "haengt";

/** After this long in the queue without a worker picking it up. */
export const WARTESCHLANGE_HAENGT_MS = 45_000;

export function berichtsPhase(state: string, wartetSeitMs: number): BerichtsPhase {
  switch (state) {
    case "completed":
      return "fertig";
    case "active":
      return "laeuft";
    case "waiting":
    case "delayed":
    case "prioritized":
    case "waiting-children":
      return wartetSeitMs >= WARTESCHLANGE_HAENGT_MS ? "haengt" : "wartet";
    default:
      return "fehler";
  }
}
