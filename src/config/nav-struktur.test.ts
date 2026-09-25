/**
 * Menüstruktur (UX-Durchsicht, Punkte 7 und 8).
 *
 * - "Energie" hatte zehn Unterpunkte, Daten, Auswertung und Einrichtung
 *   gemischt. Jetzt: Energiedaten / Auswertung, die Einrichtungsseiten
 *   (Turbinen-Import, SCADA-Zuordnung, Netz-Topologie) unter Administration.
 * - PPA-Verträge stehen bei den Verträgen, nicht bei den Abrechnungen.
 * - Zwei Einträge hießen "Einstellungen": "Mein Konto" und
 *   "Systemeinstellungen".
 * - Die Periodensperre bleibt bewusst neben dem Belegexport (siehe dort).
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { navGroups, type NavItem } from "./nav-config";

const de = JSON.parse(readFileSync(join(process.cwd(), "src/messages/de.json"), "utf8"));
const titel = (e: { title: string; titleKey?: string }) => (e.titleKey ? de.nav[e.titleKey] : e.title);
const alleItems: NavItem[] = navGroups.flatMap((g) => g.items);
const finde = (href: string) => alleItems.find((i) => i.href === href);
const kinderVon = (href: string) => (finde(href)?.children ?? []).map((c) => c.href);
const gruppeVon = (href: string) =>
  navGroups.find((g) => g.items.some((i) => i.href === href || i.children?.some((c) => c.href === href)))?.labelKey;

describe("Menüstruktur", () => {
  it("Energie ist in Daten und Auswertung geteilt", () => {
    expect(kinderVon("/energy")).toEqual(["/energy", "/energy/productions", "/energy/settlements", "/energy/scada/data"]);
    // Portfolio-Cockpit stays its own entry: it needs invoices:read, the
    // analysis entry energy:read.
    expect(kinderVon("/energy/analytics")).toEqual(["/energy/analytics", "/energy/curtailment", "/energy/scada/anomalies"]);
  });

  it("Einrichtungsseiten stehen unter Administration", () => {
    for (const href of ["/energy/turbine-import", "/energy/scada", "/energy/topology"]) {
      expect(gruppeVon(href), href).toBe("admin");
    }
  });

  it("PPA-Verträge stehen bei den Verträgen", () => {
    expect(kinderVon("/contracts")).toContain("/invoices/ppa");
    expect(kinderVon("/invoices")).not.toContain("/invoices/ppa");
  });

  it("die Periodensperre bleibt neben dem Belegexport", () => {
    const kinder = kinderVon("/invoices");
    expect(kinder.indexOf("/admin/periodensperre")).toBe(kinder.indexOf("/invoices/beleg-export") + 1);
  });

  it("kein Eintrag heißt zweimal gleich auf oberster Ebene", () => {
    const namen = alleItems.map(titel);
    const doppelt = namen.filter((n, i) => namen.indexOf(n) !== i);
    expect(doppelt).toEqual([]);
  });

  it("Mein Konto und Systemeinstellungen", () => {
    expect(titel(finde("/settings")!)).toBe("Mein Konto");
    expect(titel(finde("/admin/settings")!)).toBe("Systemeinstellungen");
  });

  it("jede Seite ist weiterhin genau einmal erreichbar", () => {
    // A parent with children is reached through them (it repeats its own href
    // as first child), so count children in its place.
    const hrefs = alleItems.flatMap((i) => (i.children?.length ? i.children.map((c) => c.href) : [i.href]));
    const eindeutig = new Set(hrefs);
    for (const h of [
      "/crm/tasks", "/energy/productions", "/energy/curtailment", "/energy/topology", "/energy/turbine-import",
      "/energy/scada", "/energy/scada/data", "/energy/scada/anomalies", "/reports/portfolio-cockpit",
      "/invoices/ppa", "/admin/periodensperre", "/settings", "/admin/settings",
    ]) {
      expect(eindeutig.has(h), h).toBe(true);
      expect(hrefs.filter((x) => x === h).length, h).toBe(1);
    }
  });
});
