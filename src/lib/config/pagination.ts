/**
 * Centralized pagination defaults for API routes and UI lists.
 * Env-overridable so ops can tune page sizes without a code change.
 *
 * Pattern: import { PAGE_SIZE_DEFAULT } from "@/lib/config/pagination"
 * Don't hardcode `limit: 20` or `limit: 100` in routes/components.
 */

function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

/** Default page size for admin/audit tables (25 rows fits on screen nicely) */
export const PAGE_SIZE_ADMIN = envInt("PAGE_SIZE_ADMIN", 25);

/** Default page size for general lists (documents, CRM, etc.) */
export const PAGE_SIZE_DEFAULT = envInt("PAGE_SIZE_DEFAULT", 20);

/** Default page size for large data sets (billing rules, energy rates) */
export const PAGE_SIZE_LARGE = envInt("PAGE_SIZE_LARGE", 50);

/** Default page size for dropdown/autocomplete fetches */
export const PAGE_SIZE_DROPDOWN = envInt("PAGE_SIZE_DROPDOWN", 100);

/**
 * Safe fallback size for lists that don't yet have Pagination-UI
 * (invoices, leases, contracts, vendors, contacts). Large enough that
 * 99% of tenants see everything; env-overridable per Ops if needed.
 * Ziel-Zustand: alle diese Listen bekommen echte Pagination-UI, dann
 * kann diese Konstante wieder weg.
 */
export const PAGE_SIZE_BULK_LIST = envInt("PAGE_SIZE_BULK_LIST", 200);

/** Default page size for CSV export bulk fetches */
export const PAGE_SIZE_CSV_EXPORT = envInt("PAGE_SIZE_CSV_EXPORT", 500);

/** Maximum allowed page size (prevents abuse) */
export const PAGE_SIZE_MAX = envInt("PAGE_SIZE_MAX", 100);

/** Default starting page */
export const PAGE_DEFAULT = 1;

/** Default limit for type-ahead/search suggestions */
export const SEARCH_LIMIT = envInt("SEARCH_LIMIT", 10);

/**
 * Für Auswahlfelder, in denen **jeder** Datensatz wählbar sein muss.
 *
 * ## Warum das nicht `PAGE_SIZE_DROPDOWN` ist
 *
 * Die beiden lösen verschiedene Aufgaben, und der Unterschied ist der zwischen
 * „unbequem" und „unmöglich":
 *
 * - `PAGE_SIZE_DROPDOWN` (100) passt für eine **durchsuchbare** Liste, die
 *   nachlädt. Wer weiter unten steht, tippt.
 * - Ein einfaches Auswahlfeld lädt einmal und zeigt, was es hat. Steht ein
 *   Park nicht darin, **kann der Nutzer ihn nicht wählen** — und nichts sagt
 *   ihm, warum.
 *
 * Gefunden am 04.08.2026: der Pacht- und der Energie-Assistent luden
 * `/api/parks?limit=100`, während es 117 Parks gab. Für die letzten
 * siebzehn liess sich keine Abrechnung anlegen. Kein Fehler, keine Meldung —
 * der Park stand einfach nicht in der Liste.
 *
 * ## Warum eine Zahl und nicht „alle"
 *
 * Weil eine Auswahl mit tausend Einträgen ohnehin unbenutzbar ist. Die Zahl
 * ist eine **Schmerzgrenze**, keine Lösung: wer sie erreicht, braucht ein
 * durchsuchbares Feld mit serverseitiger Suche, kein grösseres Limit.
 *
 * Sie liegt am oberen Ende dessen, was die Routen zulassen (`maxLimit: 1000`),
 * damit sie nicht stillschweigend gekappt wird.
 */
export const PAGE_SIZE_SELECTABLE = envInt("PAGE_SIZE_SELECTABLE", 1000);
