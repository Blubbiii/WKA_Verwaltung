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
import { fetchAndUpsertBundesbankRates } from "@/lib/accounting/bundesbank-fetch";
import {
  getProvider,
  ProviderUnavailableError,
  FAILURE_THRESHOLD,
  type ProviderName,
} from "@/lib/bank-import/providers";

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

/**
 * Ab wie vielen Tagen ohne erfolgreichen Abruf gewarnt wird.
 *
 * Drei Tage decken ein Wochenende ab, an dem kein Auszug kommt, ohne dass der
 * Ausfall eine Woche unbemerkt bleibt.
 */
export const STALE_AFTER_DAYS = 3;

export interface BankConnectionCheckResult {
  checked: number;
  stale: { id: string; name: string; lastSuccessAt: string | null }[];
  notConfigured: { id: string; name: string; provider: string; nextSteps: string[] }[];
  failureThreshold: number;
  warnings: string[];
}

/**
 * Prueft den Zustand aller Bankverbindungen.
 *
 * Ruft NICHT selbst bei der Bank ab — das koennte nur ein EBICS-/FinTS-Adapter,
 * und der ist nicht eingerichtet (siehe `lib/bank-import/providers.ts`). Was
 * ohne Protokollimplementierung Wert hat, tut er:
 *
 *  1. Er meldet Verbindungen, von denen seit Tagen nichts kam. Ein
 *     automatischer Abruf, der still ausfaellt, ist schlimmer als keiner — er
 *     erweckt den Eindruck, die Umsaetze seien aktuell.
 *  2. Er versucht bei den nicht eingerichteten Verfahren den Abruf und haelt
 *     den Grund fest, statt sie stumm zu uebergehen.
 */
export async function runBankConnectionCheck(): Promise<BankConnectionCheckResult> {
  const connections = await prisma.bankConnection.findMany({
    where: { status: { in: ["ACTIVE", "SETUP_PENDING", "ERROR"] } },
    select: {
      id: true,
      name: true,
      tenantId: true,
      provider: true,
      status: true,
      lastSuccessAt: true,
      consecutiveFailures: true,
    },
  });

  const now = new Date();
  const staleThreshold = new Date(now.getTime() - STALE_AFTER_DAYS * 24 * 3600 * 1000);

  const stale: BankConnectionCheckResult["stale"] = [];
  const notConfigured: BankConnectionCheckResult["notConfigured"] = [];

  for (const connection of connections) {
    const provider = getProvider(connection.provider as ProviderName);

    if (!provider.isOperational) {
      // Den Grund einmal festhalten, statt die Verbindung stumm zu uebergehen.
      // Sonst sieht eine nie freigeschaltete EBICS-Verbindung jahrelang aus
      // wie eine, die gleich loslaeuft.
      try {
        await provider.fetchStatement({ credentials: null });
      } catch (error) {
        if (error instanceof ProviderUnavailableError) {
          notConfigured.push({
            id: connection.id,
            name: connection.name,
            provider: connection.provider,
            nextSteps: error.nextSteps,
          });
          await prisma.bankConnection.update({
            where: { id: connection.id },
            data: { lastError: error.message, status: "SETUP_PENDING" },
          });
        }
      }
      continue;
    }

    // FILE_DROP holt nicht ab, sondern nimmt entgegen. Der Lauf prueft deshalb
    // nur, ob ueberhaupt noch etwas ankommt.
    const isStale =
      connection.lastSuccessAt === null || connection.lastSuccessAt < staleThreshold;

    if (isStale) {
      stale.push({
        id: connection.id,
        name: connection.name,
        lastSuccessAt: connection.lastSuccessAt?.toISOString() ?? null,
      });
    }
  }

  const warnings: string[] = [];
  if (stale.length > 0) {
    warnings.push(
      `${stale.length} Verbindung(en) haben seit mindestens ${STALE_AFTER_DAYS} Tagen keinen Auszug geliefert. Bitte prüfen, ob der Export der Bank noch läuft — die Umsätze sind sonst nicht aktuell, sehen aber so aus.`,
    );
  }
  if (notConfigured.length > 0) {
    warnings.push(
      `${notConfigured.length} Verbindung(en) nutzen ein Verfahren, das nicht eingerichtet ist (EBICS/FinTS). Sie rufen nichts ab.`,
    );
  }

  logger.info(
    { connections: connections.length, stale: stale.length, notConfigured: notConfigured.length },
    "[Maintenance] Bankverbindungen geprüft",
  );

  return {
    checked: connections.length,
    stale,
    notConfigured,
    failureThreshold: FAILURE_THRESHOLD,
    warnings,
  };
}
