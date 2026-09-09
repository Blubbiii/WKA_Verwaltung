/**
 * Wiederkehrende Wartungslaeufe — die Fachlogik, ohne HTTP.
 *
 * Diese drei Laeufe gab es bisher nur als Endpunkte unter `/api/cron/*`, mit
 * Bearer-Token davor und dem Hinweis „kann von einem externen Scheduler
 * aufgerufen werden". Aufgerufen hat sie nie jemand: im ganzen Codebase gibt
 * es keinen Aufrufer, und die Repeat-Jobs des Workers fassten sie nicht an.
 * Fristenpruefung, Basiszinssatz und Bankabruf liefen also seit jeher nicht.
 *
 * Seit es einen Worker gibt, ist der externe Ausloeser ueberfluessig. Die
 * Logik liegt deshalb hier, und beide Wege rufen dieselbe Funktion:
 *
 *   - `maintenance.worker.ts` — planmaessig ueber BullMQ
 *   - `app/api/cron/*`        — von Hand, zum Nachziehen oder Pruefen
 *
 * Ausdruecklich NICHT in den Routen belassen und vom Worker per HTTP
 * angesprochen: das haette dem Worker einen Netzwerkweg zur eigenen App, eine
 * erreichbare URL und ein Geheimnis abverlangt — drei Dinge, die ausfallen
 * koennen, fuer einen Aufruf innerhalb desselben Systems.
 *
 * Rueckgabewerte sind bewusst JSON-tauglich (Zeitpunkte als ISO-Zeichenkette):
 * sie landen als Job-Ergebnis in Redis.
 */

import { prisma } from "@/lib/prisma";
import { jobLogger } from "@/lib/logger";
import { checkDeadlinesAndNotify } from "@/lib/notifications/deadline-checker";
import { fetchAndUpsertBundesbankRates } from "@/lib/awv/bundesbank-fetch";

const logger = jobLogger.child({ component: "maintenance" });

// ---------------------------------------------------------------------------
// Fristenpruefung
// ---------------------------------------------------------------------------

export interface DeadlineCheckResult {
  totalCreated: number;
  tenantsChecked: number;
  /** Mandanten, deren Pruefung geworfen hat — NICHT als 0 verbucht. */
  failedTenants: string[];
}

/**
 * Prueft fuer alle Mandanten anstehende Fristen und legt Benachrichtigungen an.
 *
 * Ein Fehler bei einem Mandanten bricht den Lauf nicht ab — sonst haetten die
 * uebrigen keine Benachrichtigung bekommen. Er wird aber festgehalten und
 * zurueckgegeben: `totalCreated: 0` bei drei gescheiterten Mandanten heisst
 * „nicht geprueft", nicht „nichts faellig".
 */
export async function runDeadlineCheck(): Promise<DeadlineCheckResult> {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });

  let totalCreated = 0;
  const failedTenants: string[] = [];

  for (const tenant of tenants) {
    try {
      const result = await checkDeadlinesAndNotify(tenant.id);
      totalCreated += result.created;
    } catch (err) {
      failedTenants.push(tenant.id);
      logger.error(
        { tenantId: tenant.id, err },
        "[Maintenance] Fristenpruefung fuer Mandant fehlgeschlagen",
      );
    }
  }

  logger.info(
    { totalCreated, tenantsChecked: tenants.length, failed: failedTenants.length },
    "[Maintenance] Fristenpruefung abgeschlossen",
  );

  return { totalCreated, tenantsChecked: tenants.length, failedTenants };
}

// ---------------------------------------------------------------------------
// Bundesbank-Basiszinssatz
// ---------------------------------------------------------------------------

/**
 * Holt den Basiszinssatz der Bundesbank und schreibt ihn fort.
 *
 * Der Satz aendert sich zum 1. Januar und 1. Juli (§ 247 BGB). Woechentlich
 * abzurufen ist deshalb reichlich — aber ein verpasster Wechsel verfaelscht
 * jede danach berechnete Verzugszinsforderung, und ein Abruf kostet nichts.
 */
export async function runBundesbankRateFetch() {
  const result = await fetchAndUpsertBundesbankRates();
  logger.info({ result }, "[Maintenance] Bundesbank-Basiszinssatz abgerufen");
  return result;
}

// ---------------------------------------------------------------------------
// Bankverbindungen
// ---------------------------------------------------------------------------
