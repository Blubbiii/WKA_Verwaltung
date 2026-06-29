"use client";

/**
 * R-11 SEPA-Wizard — State-Hook mit localStorage-Persistenz.
 *
 * Der Wizard hat 4 Steps mit jeweils eigener URL. Damit der State zwischen
 * Steps (und über Page-Refresh) erhalten bleibt, persisten wir in localStorage.
 *
 * Reset (z.B. nach erfolgreichem Submit) löscht den State explizit.
 *
 * Bewusste Entscheidung gegen URL-Query-Params: invoiceIds können viele UUIDs
 * sein → URL würde unhandlich. localStorage ist auch nicht durchgängig
 * bookmarkbar, aber das ist okay — der Wizard ist ein einmal-und-fertig Flow.
 */

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "wpm:sepa-wizard:v1";

export interface SepaWizardState {
  invoiceIds: string[];
  bankAccountId: string | null;
  debtorName: string;
  debtorIban: string;
  debtorBic: string;
  executionDate: string;
}

const DEFAULT_STATE: SepaWizardState = {
  invoiceIds: [],
  bankAccountId: null,
  debtorName: "",
  debtorIban: "",
  debtorBic: "",
  executionDate: "",
};

function loadFromStorage(): SepaWizardState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<SepaWizardState>;
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return DEFAULT_STATE;
  }
}

export function useSepaWizardState() {
  const [state, setStateInternal] = useState<SepaWizardState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on client mount (avoids SSR mismatch).
  useEffect(() => {
    setStateInternal(loadFromStorage());
    setHydrated(true);
  }, []);

  const setState = useCallback((updater: Partial<SepaWizardState> | ((s: SepaWizardState) => Partial<SepaWizardState>)) => {
    setStateInternal((prev) => {
      const patch = typeof updater === "function" ? updater(prev) : updater;
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Quota exceeded oder Privacy-Mode — Wizard funktioniert weiter,
        // verliert nur Persistenz über Refresh.
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setStateInternal(DEFAULT_STATE);
  }, []);

  return { state, setState, reset, hydrated };
}
