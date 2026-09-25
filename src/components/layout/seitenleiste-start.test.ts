/**
 * Die Seitenleiste springt beim Laden nicht mehr (UX-Durchsicht, Punkt 9).
 *
 * Sie baute sich in drei Schritten auf: Standardreihenfolge, dann gespeicherte
 * Reihenfolge; alle Einträge, dann nur die erlaubten; ohne Modul-Einträge,
 * dann mit. Jetzt liefert das Layout Reihenfolge, Rechte und Schalter gleich
 * mit — die Leiste steht beim ersten Zeichnen.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const lies = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8");

describe("Seitenleiste: erster Stand vom Server", () => {
  const layout = lies("app/(dashboard)/layout.tsx");
  const start = lies("components/layout/seitenleiste-start.tsx");

  it("das Layout lädt die Startdaten und reicht sie weiter", () => {
    expect(layout).toContain("ladeSeitenleisteStart()");
    expect(layout).toContain("<SeitenleisteStart");
  });

  it("Rechte und Schalter landen unter denselben Schlüsseln im Query-Cache wie die Hooks sie lesen", () => {
    expect(start).toContain('["/api/auth/my-permissions"]');
    expect(start).toContain('["/api/features"]');
    expect(lies("hooks/usePermissions.ts")).toContain('queryKey: ["/api/auth/my-permissions"]');
    expect(lies("hooks/useFeatureFlags.ts")).toContain('queryKey: ["/api/features"]');
  });

  it("Favoriten, zuletzt besuchte Seiten und Mandantenname kommen ebenfalls vom Server", () => {
    expect(start).toContain("StartFavoritenKontext.Provider");
    expect(start).toContain("StartZuletztKontext.Provider");
    expect(lies("lib/sidebar/start-daten.ts")).toContain("cookieSpeicher.get(ZULETZT_COOKIE)");
    expect(lies("hooks/useRecentPages.ts")).toContain("document.cookie = schreibeZuletztCookie(neu)");
    expect(lies("components/layout/sidebar.tsx")).toContain("session?.user?.tenantName ?? startMandant");
  });

  it("die Reihenfolge kommt über den Kontext, den useSidebarOrder liest", () => {
    expect(start).toContain("GespeicherteReihenfolgeKontext.Provider");
    expect(lies("hooks/useSidebarOrder.ts")).toContain("useContext(GespeicherteReihenfolgeKontext)");
  });
});
