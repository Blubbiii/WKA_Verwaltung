"use client";

/**
 * Aktiven Tab in der URL halten.
 *
 * Bedienaufwand #15 (Audit 2026-07): Die Hub-Seiten synchronisieren `?tab=`
 * (14 Seiten), die Detailseiten nicht — 19 Stellen standen auf
 * `<Tabs defaultValue="…">`. Folge: der Dokumente-Tab eines Kontakts ist nicht
 * verlinkbar, und jeder Sprung auf eine Unterseite und zurück landet wieder
 * auf dem ersten Tab.
 *
 * Bewusst NICHT das Hub-Muster kopiert. Das lautet dort:
 *
 *     router.replace(`/admin/billing?tab=${value}`)
 *
 * — der Pfad ist fest verdrahtet (auf einer Detailseite mit `[id]` also
 * unbrauchbar) und alle übrigen Query-Parameter fallen weg. Dieser Hook nimmt
 * den Pfad aus `usePathname()` und schreibt nur den einen Parameter um.
 *
 * `replace` statt `push`: ein Tabwechsel ist keine eigene Station in der
 * Historie. Sonst müsste man nach fünf Tabwechseln fünfmal Zurück drücken, um
 * zur vorherigen Seite zu kommen.
 */

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface UseTabParamOptions {
  /**
   * Erlaubte Werte. Steht in der URL etwas anderes — Tippfehler, veralteter
   * Link, umbenannter Tab — wird der Standard verwendet. Ohne diese Prüfung
   * zeigt Radix eine leere Fläche: `<Tabs value="…">` ohne passenden
   * `TabsTrigger` rendert schlicht keinen Inhalt.
   */
  allowed?: readonly string[];
  /**
   * Name des Query-Parameters. Auf verschachtelten Tabs (Unter-Tab innerhalb
   * einer Hub-Seite, die selbst `?tab=` nutzt) muss hier ein eigener Name
   * stehen, sonst überschreiben sich beide gegenseitig.
   */
  paramName?: string;
}

export function useTabParam(
  defaultTab: string,
  { allowed, paramName = "tab" }: UseTabParamOptions = {},
): [string, (value: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = searchParams.get(paramName);
  const active = raw && (!allowed || allowed.includes(raw)) ? raw : defaultTab;

  const setTab = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      // Der Standardwert kommt nicht in die URL — sonst trägt jede geteilte
      // Adresse einen Parameter, der nichts aussagt.
      if (value === defaultTab) {
        next.delete(paramName);
      } else {
        next.set(paramName, value);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [defaultTab, paramName, pathname, router, searchParams],
  );

  return [active, setTab];
}
