"use client";

/**
 * Ein gemeinsamer Zustand für Favoriten.
 *
 * ## Warum ein Kontext und nicht einfach der Hook
 *
 * Der Stern steht an zwei Stellen: am Navigationseintrag und neben der
 * Seitenüberschrift. Beide zeigen dieselbe Tatsache — „diese Seite ist ein
 * Favorit" — und beide können sie ändern.
 *
 * Benutzte jede Stelle den Hook für sich, hätte jede ihren eigenen Zustand:
 * ein Klick auf den Stern in der Kopfzeile liesse den in der Seitenleiste
 * unverändert. Zwei Sterne für dieselbe Seite, die verschiedene Dinge
 * behaupten — genau die Sorte Widerspruch, die ich in diesem Produkt schon
 * bei den Kennzahlen und der Abstimmungsauszählung gefunden habe.
 *
 * Eine Tatsache, ein Ort.
 */

import { createContext, useContext, type ReactNode } from "react";
import {
  LEERE_PREFS,
  umschalten as umschaltenRegel,
  type SidebarPrefs,
} from "@/lib/sidebar/prefs";
import { useSidebarPrefs, type UseSidebarPrefsResult } from "@/hooks/useSidebarPrefs";

const Kontext = createContext<UseSidebarPrefsResult>({
  prefs: LEERE_PREFS,
  isLoading: true,
  speichern: async () => {},
});

export function SidebarPrefsProvider({ children }: { children: ReactNode }) {
  const wert = useSidebarPrefs();
  return <Kontext.Provider value={wert}>{children}</Kontext.Provider>;
}

/**
 * Zugriff auf Favoriten und ausgeblendete Gruppen.
 *
 * Ausserhalb des Providers liefert er leere Einstellungen und ein Speichern,
 * das nichts tut — bewusst kein Fehler: eine Seite ohne Provider soll ohne
 * Favoriten funktionieren, nicht abstürzen.
 */
export function useSidebarPrefsContext(): UseSidebarPrefsResult {
  return useContext(Kontext);
}

/** Kurzform für den Stern: ist diese Seite ein Favorit? */
export function useIstFavorit(href: string): {
  aktiv: boolean;
  umschalten: () => void;
  prefs: SidebarPrefs;
} {
  const { prefs, speichern } = useSidebarPrefsContext();
  const aktiv =
    prefs.lose.includes(href) || prefs.gruppen.some((g) => g.hrefs.includes(href));

  return {
    aktiv,
    prefs,
    // Die Umschaltregel liegt in lib/sidebar/prefs.ts — hier nur der Aufruf,
    // damit sie nicht ein zweites Mal entsteht.
    umschalten: () => void speichern(umschaltenRegel(prefs, href)),
  };
}
