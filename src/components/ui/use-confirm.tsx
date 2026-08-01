"use client";

/**
 * Bestätigungsdialog als Hook — Ersatz für das native `confirm()`.
 *
 * Vierzehn Stellen fragten mit `window.confirm()` nach, darunter die
 * Sammellöschung von Parks und Beteiligungen und die Stapel-Festschreibung von
 * Buchungen. Der Browserdialog kann nur eine Zeile Text und keine Auflistung
 * dessen, was gleich passiert; er trägt das Aussehen des Betriebssystems statt
 * das der Anwendung, und in manchen Browsern lässt er sich für die restliche
 * Sitzung unterdrücken — dann liefe die Aktion kommentarlos durch.
 *
 * ## Warum ein Hook und nicht nur eine Komponente
 *
 * `<DeleteConfirmDialog>` gibt es bereits und wird an rund dreißig Stellen
 * genutzt. Sie verlangt aber, den Ablauf umzudrehen: Zustand für „offen",
 * Zustand für „was war nochmal gemeint", und der eigentliche Vorgang wandert in
 * einen Rückruf. Für eine Sammelaktion mitten in einer Seite ist das viel
 * Umbau — und je mehr Umbau, desto eher bleibt eine Stelle eben doch bei
 * `confirm()`.
 *
 * Dieser Hook behält den Ablauf, wie er dasteht:
 *
 *     if (!confirm(t("deleteConfirm"))) return;          // vorher
 *     if (!(await confirm({ title: … }))) return;        // nachher
 *
 * ## Was er zusätzlich kann
 *
 * `details` nimmt beliebigen Inhalt auf — meist die Liste dessen, was betroffen
 * ist. Bei einem nicht umkehrbaren Vorgang ist die blosse Anzahl zu wenig:
 * „12 Buchungen festschreiben?" beantwortet nicht, WELCHE zwölf.
 */

import { useCallback, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ConfirmOptions {
  /** Überschrift. Sollte die Handlung benennen, nicht bloss „Sind Sie sicher?". */
  title: string;
  /** Fliesstext. */
  description?: ReactNode;
  /**
   * Was genau betroffen ist — Liste, Tabelle, Aufzählung.
   *
   * Der eigentliche Zugewinn gegenüber `confirm()`. Wird in einem eigenen,
   * scrollbaren Bereich dargestellt, damit auch dreissig Einträge den Dialog
   * nicht über den Bildschirmrand schieben.
   */
  details?: ReactNode;
  /** Beschriftung der bestätigenden Schaltfläche. Standard: „Bestätigen". */
  confirmLabel?: string;
  /** Beschriftung der abbrechenden Schaltfläche. Standard: „Abbrechen". */
  cancelLabel?: string;
  /**
   * `destructive` färbt die Schaltfläche rot und zeigt den Papierkorb.
   * Standard ist `warning` — auffällig, aber nicht als Löschung lesbar.
   */
  variant?: "destructive" | "warning";
  /**
   * Setzt den Hinweis „kann nicht rückgängig gemacht werden" darunter.
   * Bei `destructive` standardmässig an.
   */
  irreversible?: boolean;
}

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (confirmed: boolean) => void;
}

export function useConfirm(): {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  confirmDialog: ReactNode;
} {
  const t = useTranslations("common.confirmDialog");
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  // Damit ein noch offenes Versprechen beim Aufräumen nicht hängen bleibt:
  // wird der Dialog auf anderem Weg geschlossen (Escape, Klick daneben),
  // liefert er `false` statt gar nichts.
  const pendingRef = useRef<PendingConfirm | null>(null);
  pendingRef.current = pending;

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ options, resolve });
    });
  }, []);

  const settle = useCallback((confirmed: boolean) => {
    const current = pendingRef.current;
    setPending(null);
    current?.resolve(confirmed);
  }, []);

  const options = pending?.options;
  const isDestructive = options?.variant === "destructive";
  const showIrreversible = options?.irreversible ?? isDestructive;
  const Icon = isDestructive ? Trash2 : AlertTriangle;

  const confirmDialog = (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => {
        // Nur das Schliessen behandeln — das Öffnen kommt aus confirm().
        if (!open) settle(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle
            className={
              isDestructive
                ? "flex items-center gap-2 text-destructive"
                : "flex items-center gap-2"
            }
          >
            <Icon className="h-5 w-5" />
            {options?.title}
          </AlertDialogTitle>
          {options?.description ? (
            <AlertDialogDescription>{options.description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>

        {options?.details ? (
          <div className="max-h-56 overflow-y-auto rounded-md border bg-muted/40 p-3 text-sm">
            {options.details}
          </div>
        ) : null}

        {showIrreversible ? (
          <p className="text-sm font-medium text-destructive">{t("irreversible")}</p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>
            {options?.cancelLabel ?? t("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              settle(true);
            }}
            className={
              isDestructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : undefined
            }
          >
            {options?.confirmLabel ?? t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, confirmDialog };
}
