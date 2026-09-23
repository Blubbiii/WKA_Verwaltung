/**
 * F-6 Sprint 4: Tabellen-State (Filter, Sortierung, Pagination) persistent.
 *
 * Hält Zustand sowohl in der URL (für Sharing / Browser-Back) als auch
 * in LocalStorage (für Cross-Session-Persistenz pro Table-Key).
 *
 * Nutzung:
 *   const [state, setState] = usePersistedTableState("invoices", {
 *     status: "all",
 *     page: 1,
 *   });
 *
 * Beim Mount wird die URL als Quelle der Wahrheit gelesen, danach LocalStorage.
 * Beim Update werden URL + LocalStorage atomar geschrieben.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";

const STORAGE_PREFIX = "wpm:table:";

type StateRecord = Record<string, string | number | boolean | null | undefined>;

// Erlaubte Primitive-Werte pro Column: str/num/bool/null/undefined — Objects
// oder Arrays im localStorage würden hier nur Chaos anrichten.
const StateRecordSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.undefined()]),
);

function readFromStorage<T extends StateRecord>(key: string): Partial<T> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return {};
    // Fremd-Payload oder abgeschriebene Feldnamen dürfen nicht die Tabelle brechen.
    const parsed = StateRecordSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return {};
    return parsed.data as Partial<T>;
  } catch {
    return {};
  }
}

function writeToStorage(key: string, value: StateRecord): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    // QuotaExceeded etc. — silently skip
  }
}

function readFromUrl<T extends StateRecord>(
  searchParams: URLSearchParams,
  defaults: T,
): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(defaults)) {
    const raw = searchParams.get(key);
    if (raw === null) continue;
    const defaultVal = defaults[key];
    if (typeof defaultVal === "number") {
      const n = Number(raw);
      // Number.isFinite verhindert dass "Infinity" / "-Infinity" akzeptiert
      // werden — isNaN wuerde diese durchlassen.
      if (Number.isFinite(n)) (result as StateRecord)[key] = n;
    } else if (typeof defaultVal === "boolean") {
      (result as StateRecord)[key] = raw === "true";
    } else {
      (result as StateRecord)[key] = raw;
    }
  }
  return result;
}

/**
 * Naechster Zustand und die dazu passende Adresse — ohne Seiteneffekte.
 *
 * Liegt bewusst ausserhalb des Hooks: `setState`-Updater muessen rein sein,
 * React fuehrt sie unter Umstaenden waehrend des Renderns aus (im StrictMode
 * doppelt). Vorher stand hier `router.replace()` im Updater, und die
 * Rechnungsliste warf „Cannot update a component (Router) while rendering a
 * different component".
 *
 * Vorgabewerte und leere Werte verschwinden aus der Adresse; fremde Parameter
 * der Seite bleiben stehen.
 */
export function naechsterTabellenZustand<T extends StateRecord>(
  vorher: T,
  patch: Partial<T>,
  defaults: T,
  aktuelleSuche: string,
): { next: T; query: string } {
  const next = { ...vorher, ...patch };
  const params = new URLSearchParams(aktuelleSuche);
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined || value === null || value === "" || value === defaults[key]) {
      params.delete(key);
    } else {
      params.set(key, String(value));
    }
  }
  return { next, query: params.toString() };
}

export function usePersistedTableState<T extends StateRecord>(
  tableKey: string,
  defaults: T,
): [T, (patch: Partial<T>) => void] {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialized = useRef(false);
  // searchParams in Ref halten, damit `update`-Callback nicht bei jedem
  // router.replace() neu erzeugt wird (sonst Endlos-Loop in Children mit [update]-deps).
  const searchParamsRef = useRef(searchParams);
  useEffect(() => {
    searchParamsRef.current = searchParams;
  }, [searchParams]);
  const defaultsRef = useRef(defaults);
  useEffect(() => {
    defaultsRef.current = defaults;
  }, [defaults]);

  const [state, setState] = useState<T>(() => {
    // Bei SSR: nur Defaults — URL und LocalStorage sind nicht verfügbar
    if (typeof window === "undefined") return defaults;
    // Erste Lese-Reihenfolge: URL > LocalStorage > Defaults
    const fromUrl = readFromUrl(searchParams, defaults);
    if (Object.keys(fromUrl).length > 0) {
      return { ...defaults, ...fromUrl };
    }
    const fromStorage = readFromStorage<T>(tableKey);
    return { ...defaults, ...fromStorage };
  });

  // Bei Mount in URL übernehmen (z.B. nach LocalStorage-Restore)
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const params = new URLSearchParams(searchParams.toString());
    let changed = false;
    for (const [key, value] of Object.entries(state)) {
      if (value === undefined || value === null || value === "" || value === defaults[key]) {
        if (params.has(key)) {
          params.delete(key);
          changed = true;
        }
        continue;
      }
      const str = String(value);
      if (params.get(key) !== str) {
        params.set(key, str);
        changed = true;
      }
    }
    if (changed) {
      router.replace(`?${params.toString()}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Der jeweils juengste Zustand, damit mehrere Aenderungen im selben Takt
  // aufeinander aufbauen, ohne dass die Berechnung in einen Updater muss.
  const stateRef = useRef(state);

  const update = useCallback(
    (patch: Partial<T>) => {
      // Aus window.location.search lesen (frisch) statt aus den searchParams
      // des letzten Renders.
      const aktuelleSuche =
        typeof window !== "undefined" ? window.location.search : searchParamsRef.current.toString();
      const { next, query } = naechsterTabellenZustand(
        stateRef.current,
        patch,
        defaultsRef.current,
        aktuelleSuche,
      );
      stateRef.current = next;
      setState(next);
      writeToStorage(tableKey, next);
      router.replace(`?${query}`, { scroll: false });
    },
    [tableKey, router],
  );

  return [state, update];
}
