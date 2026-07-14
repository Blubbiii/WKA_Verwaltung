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
import { z } from "zod";

const STORAGE_KEY = "wpm:sepa-wizard:v1";

const SepaWizardStateSchema = z.object({
  invoiceIds: z.array(z.string()),
  bankAccountId: z.string().nullable(),
  debtorName: z.string(),
  debtorIban: z.string(),
  debtorBic: z.string(),
  executionDate: z.string(),
  /**
   * Timestamp of the wizard-run start (unix ms). Used to detect stale
   * localStorage from an aborted/older run — invoiceIds might reference
   * invoices that were already paid or deleted since. Steps that guard
   * against empty state should also treat wizards older than 24h as stale.
   */
  createdAt: z.number().nullable(),
});

export type SepaWizardState = z.infer<typeof SepaWizardStateSchema>;

/** TTL for a wizard run before its state is considered stale. */
export const SEPA_WIZARD_TTL_MS = 24 * 60 * 60 * 1000;

const DEFAULT_STATE: SepaWizardState = {
  invoiceIds: [],
  bankAccountId: null,
  debtorName: "",
  debtorIban: "",
  debtorBic: "",
  executionDate: "",
  createdAt: null,
};

function loadFromStorage(): SepaWizardState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    // Alte oder korrupte Payloads dürfen nicht den Wizard unbenutzbar machen —
    // bei jedem Struktur-Mismatch auf DEFAULT_STATE zurückfallen.
    const parsed = SepaWizardStateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return DEFAULT_STATE;
    return parsed.data;
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
