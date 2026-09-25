"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { GespeicherteReihenfolgeKontext } from "@/hooks/useSidebarOrder";
import { StartFavoritenKontext } from "@/hooks/useSidebarPrefs";
import { StartZuletztKontext } from "@/hooks/useRecentPages";
import type { SeitenleisteStartDaten } from "@/lib/sidebar/start-daten";

const MandantKontext = createContext<string | null>(null);

/** Tenant name known on the server — the session loads later on the client. */
export function useStartMandant(): string | null {
  return useContext(MandantKontext);
}

/**
 * Hands the server-loaded sidebar data to the client: permissions and flags
 * into the query cache (same keys as usePermissions/useFeatureFlags), the
 * group order and favorites into the contexts useSidebarOrder and
 * useSidebarPrefs read. Without data (null)
 * everything falls back to fetching on the client.
 */
export function SeitenleisteStart({ daten, children }: { daten: SeitenleisteStartDaten | null; children: ReactNode }) {
  const [zustand] = useState(() => {
    if (!daten) return undefined;
    const qc = new QueryClient();
    qc.setQueryData(["/api/auth/my-permissions"], daten.rechte);
    qc.setQueryData(["/api/features"], daten.flags);
    return dehydrate(qc);
  });

  return (
    <HydrationBoundary state={zustand}>
      <GespeicherteReihenfolgeKontext.Provider value={daten?.gruppenReihenfolge}>
        <StartFavoritenKontext.Provider value={daten?.favoriten}>
          <StartZuletztKontext.Provider value={daten?.zuletzt}>
            <MandantKontext.Provider value={daten?.mandantName ?? null}>{children}</MandantKontext.Provider>
          </StartZuletztKontext.Provider>
        </StartFavoritenKontext.Provider>
      </GespeicherteReihenfolgeKontext.Provider>
    </HydrationBoundary>
  );
}
