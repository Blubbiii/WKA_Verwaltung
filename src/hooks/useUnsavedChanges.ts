"use client";

/**
 * Warnt, bevor ungespeicherte Eingaben verlorengehen.
 *
 * Bedienaufwand #20 (Audit 2026-07): Im Repo gab es **kein einziges**
 * `beforeunload`, keinen Router-Blocker, kein Autosave. Betroffen sind unter
 * anderem `invoices/new` (898 Zeilen) und `leases/new` (1687 Zeilen,
 * vierstufiger Assistent). Ein F5 auf Schritt 4 des Pacht-Assistenten löscht
 * alles, ohne Rückfrage.
 *
 * ## Was der Hook abdeckt — und was nicht
 *
 * **Abgedeckt:** Tab schließen, Reload (F5), Zurück-Taste des Browsers,
 * Eingabe einer fremden Adresse. Das erledigt `beforeunload`; der Browser zeigt
 * seinen eigenen Dialog, dessen Text sich nicht setzen lässt.
 *
 * **Abgedeckt, aber mit Einschränkung:** Klicks auf interne Links innerhalb der
 * Anwendung. Der App-Router von Next.js hat **keinen** offiziellen
 * Navigations-Blocker (`useBlocker` gibt es nur im React Router). Der Hook
 * fängt deshalb Klicks auf `<a>`-Elemente in der Erfassungsphase ab und fragt
 * nach. Das deckt die Seitenleiste, Brotkrumen und jeden `<Link>` ab.
 *
 * **NICHT abgedeckt:** ein programmatisches `router.push()` aus fremdem Code.
 * Dafür gibt es keinen Aufhänger. Wer im eigenen Formular navigiert, ruft
 * vorher `markSaved()` bzw. fragt selbst.
 *
 * Diese Lücke wird hier benannt statt verschwiegen: ein Sicherheitsnetz, von
 * dem man glaubt, es sei lückenlos, ist gefährlicher als eines, dessen Grenzen
 * man kennt.
 */

import { useCallback, useEffect, useRef } from "react";

export interface UseUnsavedChangesOptions {
  /** Nur warnen, solange das stimmt. */
  when: boolean;
  /**
   * Rückfrage bei internen Links. Standard an. Auf `false` setzen, wenn die
   * Seite ihre eigene Rückfrage mitbringt.
   */
  guardInAppLinks?: boolean;
  /** Text der Rückfrage bei internen Links (der Browserdialog ist nicht setzbar). */
  message?: string;
}

export function useUnsavedChanges({
  when,
  guardInAppLinks = true,
  message,
}: UseUnsavedChangesOptions): { confirmLeave: () => boolean } {
  // In einem Ref halten, damit die Listener nicht bei jedem Tastendruck neu
  // registriert werden müssen.
  const activeRef = useRef(when);
  activeRef.current = when;

  const messageRef = useRef(message);
  messageRef.current = message;

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!activeRef.current) return;
      // `preventDefault` ist der aktuelle Weg; `returnValue` bleibt für ältere
      // Browser stehen, die ohne es keinen Dialog zeigen.
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    if (!guardInAppLinks) return;

    function handleClick(event: MouseEvent) {
      if (!activeRef.current) return;
      // Modifizierte Klicks öffnen einen neuen Tab — die aktuelle Seite mit
      // ihren Eingaben bleibt stehen, es gibt nichts zu warnen.
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (anchor.target && anchor.target !== "_self") return;
      // Externe Ziele wandern über beforeunload, das den Browserdialog zeigt.
      if (!href.startsWith("/")) return;

      const confirmed = window.confirm(
        messageRef.current ?? "Es gibt ungespeicherte Eingaben. Seite trotzdem verlassen?",
      );
      if (!confirmed) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    // Erfassungsphase: der Router von Next hängt seinen Handler in der
    // Bubbling-Phase ein. Nur so kommt die Rückfrage vor der Navigation.
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [guardInAppLinks]);

  /**
   * Für eigene Abbrechen-Knöpfe: gibt `true` zurück, wenn weitergegangen
   * werden darf.
   */
  const confirmLeave = useCallback(() => {
    if (!activeRef.current) return true;
    return window.confirm(
      messageRef.current ?? "Es gibt ungespeicherte Eingaben. Seite trotzdem verlassen?",
    );
  }, []);

  return { confirmLeave };
}
