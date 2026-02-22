"use client";

import { useState, useCallback, useMemo, useEffect } from "react";

interface UseBatchSelectionOptions<T> {
  items: T[];
  idField?: keyof T;
}

interface UseBatchSelectionReturn {
  selectedIds: Set<string>;
  isAllSelected: boolean;
  isSomeSelected: boolean;
  toggleItem: (id: string) => void;
  toggleAll: () => void;
  clearSelection: () => void;
  selectedCount: number;
}

/**
 * Reusable hook for managing multi-select / batch selection state on table rows.
 *
 * When the underlying item list changes (e.g. page change, filter change),
 * selections that no longer appear in the list are automatically removed.
 *
 * @param options.items  - The current array of items displayed in the table.
 * @param options.idField - The key on each item that holds its unique id (default: "id").
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useBatchSelection<T extends Record<string, any>>({
  items,
  idField = "id" as keyof T,
}: UseBatchSelectionOptions<T>): UseBatchSelectionReturn {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Build a set of currently visible item ids for fast lookup
  const visibleIds = useMemo(() => {
    return new Set(items.map((item) => String(item[idField])));
  }, [items, idField]);

  // When the visible items change, prune stale selections
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (visibleIds.has(id)) {
          next.add(id);
        }
      }
      // Only update state if something actually changed
      if (next.size !== prev.size) {
        return next;
      }
      return prev;
    });
  }, [visibleIds]);

  const toggleItem = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      // If all visible items are already selected, deselect all
      const allSelected =
        visibleIds.size > 0 &&
        [...visibleIds].every((id) => prev.has(id));

      if (allSelected) {
        return new Set<string>();
      }
      // Otherwise select all visible items
      return new Set(visibleIds);
    });
  }, [visibleIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectedCount = selectedIds.size;
  const isAllSelected = visibleIds.size > 0 && selectedCount === visibleIds.size;
  const isSomeSelected = selectedCount > 0 && !isAllSelected;

  return {
    selectedIds,
    isAllSelected,
    isSomeSelected,
    toggleItem,
    toggleAll,
    clearSelection,
    selectedCount,
  };
}
