"use client";

import { useCallback, useRef } from "react";
import { toast } from "sonner";

/**
 * Hook for deletions with undo capability via toast notification.
 * Uses soft-delete: marks record as deleted, shows toast with "Rückgängig" button.
 * If undo is clicked within the timeout, the deletion is reversed.
 *
 * Usage:
 * ```ts
 * const { deleteWithUndo } = useUndoDelete();
 * await deleteWithUndo({
 *   label: "Dokument gelöscht",
 *   deleteAction: () => fetch(`/api/documents/${id}`, { method: "DELETE" }),
 *   undoAction: () => fetch(`/api/documents/${id}/restore`, { method: "POST" }),
 *   onComplete: () => refetchData(),
 * });
 * ```
 */

interface DeleteWithUndoOptions {
  label: string;
  deleteAction: () => Promise<Response | void>;
  undoAction?: () => Promise<Response | void>;
  onComplete?: () => void;
  onUndo?: () => void;
  timeoutMs?: number;
}

export function useUndoDelete() {
  const pendingRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const deleteWithUndo = useCallback(async (options: DeleteWithUndoOptions) => {
    const {
      label,
      deleteAction,
      undoAction,
      onComplete,
      onUndo,
      timeoutMs = 5000,
    } = options;

    try {
      // Execute the delete
      const res = await deleteAction();
      if (res && !res.ok) {
        throw new Error("Löschen fehlgeschlagen");
      }

      // Generate unique ID for this deletion
      const deleteId = crypto.randomUUID();

      if (undoAction) {
        // Show toast with undo button
        toast(label, {
          description: "Wird in 5 Sekunden endgültig gelöscht",
          action: {
            label: "Rückgängig",
            onClick: async () => {
              // Cancel the pending finalization
              const timeout = pendingRef.current.get(deleteId);
              if (timeout) {
                clearTimeout(timeout);
                pendingRef.current.delete(deleteId);
              }

              try {
                await undoAction();
                toast.success("Wiederhergestellt");
                onUndo?.();
              } catch {
                toast.error("Wiederherstellen fehlgeschlagen");
              }
            },
          },
          duration: timeoutMs,
        });

        // Set timeout for finalization
        const timeout = setTimeout(() => {
          pendingRef.current.delete(deleteId);
          onComplete?.();
        }, timeoutMs);
        pendingRef.current.set(deleteId, timeout);
      } else {
        // No undo available — just show success
        toast.success(label);
        onComplete?.();
      }
    } catch {
      toast.error("Fehler beim Löschen");
    }
  }, []);

  return { deleteWithUndo };
}
