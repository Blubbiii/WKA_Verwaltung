"use client";

/**
 * useDocumentTitle — prefixt den Browser-Tab-Title mit der Summe offener
 * Action-Items, damit ein User auch in einem anderen Tab erkennt, dass es
 * etwas zu tun gibt.
 *
 * Beispiel: "Buchhaltung – WPM" → "(3) Buchhaltung – WPM" wenn 3 Approvals
 * pending sind.
 *
 * Design-Entscheidungen:
 * - Wir lesen `document.title` als Basis (nicht einen statischen "WPM"-
 *   String), damit Next.js' Page-Title-Mechanismus (metadata.title) nicht
 *   überschrieben wird. Bei jedem Title-Update strippen wir einen evtl.
 *   vorhandenen "(N) "-Prefix bevor wir neu setzen — sonst würden sich
 *   die Prefixe stacken ("(3) (3) WPM").
 * - Wir beobachten document.title-Änderungen via MutationObserver auf
 *   <title>, damit ein Page-Wechsel (Next.js setzt einen neuen Title) den
 *   Prefix nicht verliert. Sonst wäre der Title nach Navigation kurz nackt
 *   bis zum nächsten Count-Update.
 * - Beim Unmount stellen wir den letzten "nackten" Title (ohne Prefix)
 *   wieder her, damit z.B. ein Logout den Counter nicht stehen lässt.
 * - SSR-safe: jede document-Berührung läuft in useEffect.
 */

import { useEffect, useRef } from "react";

const PREFIX_REGEX = /^\(\d+\+?\)\s*/;
const TITLE_CAP = 99;

function stripPrefix(title: string): string {
  return title.replace(PREFIX_REGEX, "");
}

function capCount(n: number): string {
  return n > TITLE_CAP ? `${TITLE_CAP}+` : String(n);
}

export function useDocumentTitle(total: number): void {
  // Letzter "nackter" Title — zum Restore beim Unmount.
  const baseTitleRef = useRef<string | null>(null);
  // Guard gegen Endlos-Loop: unser eigenes Set löst den MutationObserver
  // aus, das wollen wir nicht als "Page hat Title geändert" interpretieren.
  const selfWriteRef = useRef(false);

  useEffect(() => {
    if (typeof document === "undefined") return;

    if (baseTitleRef.current === null) {
      baseTitleRef.current = stripPrefix(document.title);
    }

    function applyPrefix(rawTitle: string) {
      const base = stripPrefix(rawTitle);
      baseTitleRef.current = base;
      const next = total > 0 ? `(${capCount(total)}) ${base}` : base;
      if (document.title !== next) {
        selfWriteRef.current = true;
        document.title = next;
      }
    }

    applyPrefix(document.title);

    // Title-Tag beobachten: Next.js setzt bei Navigation einen neuen Title,
    // und wir wollen den Prefix dann erneut anwenden ohne auf das nächste
    // Polling-Intervall warten zu müssen.
    const titleEl = document.querySelector("title");
    let observer: MutationObserver | null = null;
    if (titleEl) {
      observer = new MutationObserver(() => {
        if (selfWriteRef.current) {
          selfWriteRef.current = false;
          return;
        }
        applyPrefix(document.title);
      });
      observer.observe(titleEl, { childList: true });
    }

    return () => {
      observer?.disconnect();
      // Restore: nur den nackten Titel, kein Counter.
      if (baseTitleRef.current !== null && typeof document !== "undefined") {
        const base = baseTitleRef.current;
        if (document.title !== base) {
          document.title = base;
        }
      }
    };
  }, [total]);
}
