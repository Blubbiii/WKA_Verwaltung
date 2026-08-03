"use client";

/**
 * Favoriten, eigene Gruppen und ausgeblendete Systemgruppen.
 *
 * ## Sofort sichtbar, dann gespeichert
 *
 * Ein Klick auf den Stern muss unmittelbar wirken. Auf die Antwort des Servers
 * zu warten macht aus einer Kleinigkeit eine Ladezeit — und wer zehn Seiten
 * markiert, wartet zehnmal.
 *
 * Deshalb wird der neue Zustand sofort gezeigt und im Hintergrund geschickt.
 * Geht das Schicken schief, **wird zurückgenommen** und die Ursache gemeldet:
 * ein Stern, der leuchtet, obwohl nichts gespeichert wurde, ist schlimmer als
 * einer, der nicht angeht — beim nächsten Laden wäre er weg, und niemand
 * wüsste warum.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  LEERE_PREFS,
  lesePrefs,
  type SidebarPrefs,
} from "@/lib/sidebar/prefs";

export interface UseSidebarPrefsResult {
  prefs: SidebarPrefs;
  isLoading: boolean;
  /** Neuen Zustand setzen — sofort sichtbar, im Hintergrund gespeichert. */
  speichern: (neu: SidebarPrefs) => Promise<void>;
}

export function useSidebarPrefs(): UseSidebarPrefsResult {
  const [prefs, setPrefs] = useState<SidebarPrefs>(LEERE_PREFS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let abgebrochen = false;
    (async () => {
      try {
        const res = await fetch("/api/user/sidebar-prefs");
        if (res.ok && !abgebrochen) {
          const daten = await res.json();
          setPrefs(lesePrefs(daten.data));
        }
      } catch {
        // Ohne Einstellungen ist die Seitenleiste vollstaendig benutzbar —
        // kein Grund, den Nutzer damit zu behelligen.
      } finally {
        if (!abgebrochen) setIsLoading(false);
      }
    })();
    return () => {
      abgebrochen = true;
    };
  }, []);

  const speichern = useCallback(
    async (neu: SidebarPrefs) => {
      const vorher = prefs;
      setPrefs(neu);
      try {
        const res = await fetch("/api/user/sidebar-prefs", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(neu),
        });
        if (!res.ok) {
          const fehler = await res.json().catch(() => ({}));
          throw new Error(fehler.message ?? "Speichern fehlgeschlagen");
        }
      } catch (e) {
        // Zurueck auf den letzten gesicherten Stand. Ein Stern, der leuchtet
        // ohne gespeichert zu sein, waere beim naechsten Laden weg — und
        // niemand wuesste warum.
        setPrefs(vorher);
        toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
      }
    },
    [prefs],
  );

  return { prefs, isLoading, speichern };
}
