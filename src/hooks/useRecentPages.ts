"use client";

/**
 * Die zuletzt besuchten Seiten.
 *
 * ## Warum es das braucht
 *
 * Die Navigationsgruppen sind jetzt zugeklappt, bis auf die, in der man
 * arbeitet. Das räumt auf — kostet aber einen Klick, wenn man zwischen zwei
 * Bereichen hin- und herspringt: erst die Gruppe öffnen, dann den Eintrag.
 *
 * Genau dieser Weg ist der häufigste. Wer Rechnungen schreibt und dabei
 * Verträge nachschlägt, wechselt den ganzen Tag zwischen zwei Punkten in
 * verschiedenen Gruppen. Die drei zuletzt besuchten Seiten ganz oben machen
 * daraus wieder einen Klick.
 *
 * ## Was NICHT aufgenommen wird
 *
 * Detailseiten mit einer Kennung darin (`/parks/8f3a…`). Sie sind kein Ziel,
 * das man wiederfinden will, sondern ein einzelner Datensatz — und die Liste
 * wäre nach zehn Minuten voll mit Zeichenketten, die niemandem etwas sagen.
 * Aufgenommen werden nur die Seiten, die auch in der Navigation stehen.
 */

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ZULETZT_GESPEICHERT,
  schreibeZuletztCookie,
  type BesuchteSeite,
} from "@/lib/sidebar/zuletzt";

const SPEICHER_SCHLUESSEL = "wpm.recent-pages";
// More than shown: favorites are filtered out afterwards (lib/sidebar/prefs).
const WIE_VIELE = ZULETZT_GESPEICHERT;

/** List read from the cookie by the dashboard layout; `undefined` = not provided. */
export const StartZuletztKontext = createContext<BesuchteSeite[] | undefined>(undefined);

export type { BesuchteSeite };

/** Sieht der Pfad nach einer Detailseite aus? */
function istDetailseite(pfad: string): boolean {
  // UUID oder eine lange Zahlenfolge irgendwo im Pfad.
  return /\/[0-9a-f]{8}-[0-9a-f]{4}-|\/\d{6,}/i.test(pfad);
}

export function useRecentPages(): {
  seiten: BesuchteSeite[];
  merken: (href: string, label: string) => void;
} {
  const pathname = usePathname();
  const vomServer = useContext(StartZuletztKontext);
  const [seiten, setSeiten] = useState<BesuchteSeite[]>(vomServer ?? []);

  // Erst nach dem Einhängen lesen — auf dem Server gibt es keinen
  // localStorage, und ein Unterschied zwischen Server- und Client-Ausgabe
  // führt zu einem Hydrierungsfehler.
  // The cookie (read on the server) wins; localStorage is the fallback for
  // lists saved before the cookie existed.
  useEffect(() => {
    if (vomServer && vomServer.length > 0) return;
    try {
      const roh = window.localStorage.getItem(SPEICHER_SCHLUESSEL);
      if (roh) setSeiten(JSON.parse(roh) as BesuchteSeite[]);
    } catch {
      // Kaputter oder gesperrter Speicher — dann eben ohne.
    }
  }, [vomServer]);

  const merken = useCallback(
    (href: string, label: string) => {
      if (istDetailseite(href)) return;

      setSeiten((vorher) => {
        // Die aktuelle Seite selbst gehoert nicht in die Liste: sie ist ja
        // schon da, und ein Verweis auf sich selbst ist kein Weg irgendwohin.
        const ohneAktuelle = vorher.filter(
          (s) => s.href !== href && s.href !== pathname,
        );
        const neu = [{ href, label }, ...ohneAktuelle].slice(0, WIE_VIELE);

        try {
          window.localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify(neu));
          document.cookie = schreibeZuletztCookie(neu);
        } catch {
          // Speicher voll oder gesperrt — die Liste gilt dann nur für diese
          // Sitzung. Kein Grund, etwas anzuzeigen.
        }
        return neu;
      });
    },
    [pathname],
  );

  return {
    // Die Seite, auf der man gerade steht, wird nicht angeboten.
    seiten: seiten.filter((s) => s.href !== pathname),
    merken,
  };
}
