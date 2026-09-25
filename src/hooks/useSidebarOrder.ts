import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { navGroups } from "@/config/nav-config";
import { sortierbareGruppen, sortiereGruppen, standardReihenfolge } from "@/lib/sidebar/reihenfolge";

/**
 * Saved group order handed over by the dashboard layout (server). `undefined`
 * means "not provided" — then the hook fetches it; `[]` means "none saved".
 */
export const GespeicherteReihenfolgeKontext = createContext<string[] | undefined>(undefined);

export interface UseSidebarOrderResult {
  /** Effective order of all sortable groups (never incomplete). */
  groupOrder: string[];
  isLoading: boolean;
  isSaving: boolean;
  isDefault: boolean;
  updateOrder: (newOrder: string[]) => Promise<void>;
  resetOrder: () => Promise<void>;
}

const SORTIERBAR = sortierbareGruppen(navGroups);

export function useSidebarOrder(): UseSidebarOrderResult {
  const vomServer = useContext(GespeicherteReihenfolgeKontext);
  const [gespeichert, setGespeichert] = useState<string[]>(vomServer ?? []);
  const [isLoading, setIsLoading] = useState(vomServer === undefined);
  const [isSaving, setIsSaving] = useState(false);

  const groupOrder = useMemo(() => standardReihenfolge(sortiereGruppen(SORTIERBAR, gespeichert)), [gespeichert]);

  const fetchOrder = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/user/sidebar-order");
      if (res.ok) {
        const data = await res.json();
        setGespeichert(Array.isArray(data.order) ? data.order : []);
      }
    } catch {
      // Keep the config order on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateOrder = useCallback(
    async (newOrder: string[]) => {
      // Optimistic update
      setGespeichert(newOrder);
      try {
        setIsSaving(true);
        const res = await fetch("/api/user/sidebar-order", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: newOrder }),
        });
        if (!res.ok) throw new Error("Save failed");
      } catch {
        // Revert on error
        await fetchOrder();
      } finally {
        setIsSaving(false);
      }
    },
    [fetchOrder]
  );

  const resetOrder = useCallback(async () => {
    setGespeichert([]);
    try {
      setIsSaving(true);
      await fetch("/api/user/sidebar-order", { method: "DELETE" });
    } catch {
      // Even if delete fails, local state is already reset
    } finally {
      setIsSaving(false);
    }
  }, []);

  useEffect(() => {
    // The layout already delivered it — fetching again would only flicker.
    if (vomServer === undefined) fetchOrder();
  }, [fetchOrder, vomServer]);

  return { groupOrder, isLoading, isSaving, isDefault: gespeichert.length === 0, updateOrder, resetOrder };
}
