/**
 * Redesign 2026-06 — Phase 2: Toast-Helpers mit Undo
 *
 * Sonner unterstützt Action-Buttons nativ; dieser Helper kapselt die
 * Konvention "destruktive Aktionen sind 5 Sekunden lang rückgängig machbar".
 *
 * Verwendung:
 *
 *   import { toastWithUndo } from "@/components/ui/toast-helpers";
 *
 *   await deleteInvoice(id);
 *   toastWithUndo({
 *     message: "Rechnung gelöscht",
 *     description: `${invoice.invoiceNumber} wurde in den Papierkorb verschoben.`,
 *     undoLabel: "Rückgängig",
 *     onUndo: () => restoreInvoice(id),
 *   });
 *
 * Im Hintergrund wird der eigentliche Delete optimistisch sofort applied, der
 * Server-Call erfolgt aber erst nach Toast-Auto-Dismiss (siehe `useDeferredAction`).
 * Vorerst hier nur das UI-Wrapper, das Soft-Delete-Pattern können wir auf Domain-
 * Ebene später ergänzen.
 */

import { toast } from "sonner";

export interface ToastWithUndoOptions {
  message: string;
  description?: string;
  undoLabel?: string;
  onUndo: () => void | Promise<void>;
  /** Auto-dismiss in ms, default 5000 */
  duration?: number;
  /** Type: success (grünlich), error, info */
  type?: "success" | "error" | "info";
}

export function toastWithUndo(opts: ToastWithUndoOptions) {
  const {
    message,
    description,
    undoLabel = "Rückgängig",
    onUndo,
    duration = 5000,
    type = "info",
  } = opts;

  const fn =
    type === "success" ? toast.success : type === "error" ? toast.error : toast.info;

  return fn(message, {
    description,
    duration,
    action: {
      label: undoLabel,
      onClick: () => {
        void onUndo();
      },
    },
  });
}

/**
 * Bestätigender Toast ohne Undo — für Aktionen, die nicht rückgängig gemacht
 * werden können (z.B. SEPA-Lauf exportiert, USt-Voranmeldung übertragen).
 * Hat eine längere Auto-Dismiss-Dauer, damit der User die Bestätigung sicher liest.
 */
export function toastCommit(opts: {
  message: string;
  description?: string;
  duration?: number;
}) {
  return toast.success(opts.message, {
    description: opts.description,
    duration: opts.duration ?? 6000,
  });
}
