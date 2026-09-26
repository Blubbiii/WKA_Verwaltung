/**
 * Observation mode (2026-09): the shared prisma client reports queries on
 * tenant models that carry no tenant condition at all — without changing
 * them. Some are legitimate (login looks users up by e-mail, workers and
 * the platform operator work across tenants); the log shows where to look
 * while routes move to mandantDb().
 *
 * Once per model and operation, then every 1,000th occurrence with the
 * running count. Prisma calls extensions after its own async steps, so the
 * calling route is no longer on the stack — a count per model/operation is
 * the honest signal, grep finds the call sites.
 */

import { logger } from "@/lib/logger";
import { fehltMandant } from "./mandant-filter";

const zaehler = new Map<string, number>();

export function beobachteMandant(model: string | undefined, operation: string, args: unknown): void {
  if (!model || !fehltMandant(model, operation, (args ?? {}) as Record<string, unknown>)) return;
  const schluessel = `${model}.${operation}`;
  const anzahl = (zaehler.get(schluessel) ?? 0) + 1;
  zaehler.set(schluessel, anzahl);
  if (anzahl === 1 || anzahl % 1000 === 0) {
    logger.warn({ model, operation, anzahl }, `[Mandant] Abfrage ohne Mandanten-Bedingung: ${schluessel}`);
  }
}

/** Snapshot for diagnostics (monitoring, tests). */
export function mandantBeobachtungen(): Record<string, number> {
  return Object.fromEntries(zaehler);
}
