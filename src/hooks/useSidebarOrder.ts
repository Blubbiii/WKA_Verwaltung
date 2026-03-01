"use client";

import { useState, useEffect, useCallback } from "react";

const DEFAULT_GROUP_ORDER = [
  "crm",
  "inbox",
  "windparks",
  "finances",
  "administration",
  "communication",
];

export interface UseSidebarOrderResult {
  groupOrder: string[];
  isLoading: boolean;
  isSaving: boolean;
  isDefault: boolean;
  updateOrder: (newOrder: string[]) => Promise<void>;
  resetOrder: () => Promise<void>;
}

export function useSidebarOrder(): UseSidebarOrderResult {
  const [groupOrder, setGroupOrder] = useState<string[]>(DEFAULT_GROUP_ORDER);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDefault, setIsDefault] = useState(true);

  const fetchOrder = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/user/sidebar-order");
      if (res.ok) {
        const data = await res.json();
        setGroupOrder(data.order ?? DEFAULT_GROUP_ORDER);
        setIsDefault(data.isDefault ?? true);
      }
    } catch {
      // Use default on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateOrder = useCallback(
    async (newOrder: string[]) => {
      // Optimistic update
      setGroupOrder(newOrder);
      setIsDefault(false);
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
    setGroupOrder(DEFAULT_GROUP_ORDER);
    setIsDefault(true);
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
    fetchOrder();
  }, [fetchOrder]);

  return { groupOrder, isLoading, isSaving, isDefault, updateOrder, resetOrder };
}
