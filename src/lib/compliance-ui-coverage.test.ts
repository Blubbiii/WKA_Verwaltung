/**
 * TF-11: Compliance-Endpunkte muessen einen UI-Aufrufer haben.
 *
 * Befund im Audit 2026-07: Vier vollstaendig implementierte, compliance-
 * pflichtige Endpunkte hatten keinen einzigen Frontend-Aufrufer:
 *   - E-Bilanz §5b EStG (XBRL fuer ELSTER)
 *   - Bundesanzeiger §325 HGB (Offenlegung)
 *   - DSGVO Art. 15 Auskunft
 *   - GoBD §145 AO Verfahrensdokumentation
 *
 * Eine gesetzliche Pflicht, die nur per curl erfuellbar ist, ist praktisch
 * nicht erfuellt. Der Test prueft, dass jeder dieser Endpunkte aus dem
 * Client-Code heraus aufgerufen wird — und faellt auch dann, wenn jemand die
 * Oberflaeche spaeter wieder entfernt.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");

/** Quelltext aller Client-Komponenten ("use client"). */
function clientSource(): string {
  const parts: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "node_modules" || entry === ".next" || entry === "api") continue;
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      if (entry.endsWith(".test.ts") || entry.endsWith(".test.tsx")) continue;
      const content = readFileSync(full, "utf-8");
      // Nur Client-Code zaehlt: ein Server-zu-Server-Aufruf waere kein UI.
      if (!content.includes('"use client"')) continue;
      parts.push(content);
    }
  };
  walk(SRC);
  return parts.join("\n");
}

const CLIENT = clientSource();

const ENDPOINTS: Array<{ path: string; label: string }> = [
  { path: "/api/buchhaltung/ebilanz", label: "E-Bilanz §5b EStG" },
  { path: "/api/buchhaltung/bundesanzeiger", label: "Bundesanzeiger §325 HGB" },
  { path: "/api/admin/verfahrensdokumentation", label: "GoBD §145 AO Verfahrensdokumentation" },
  { path: "/api/admin/search/reindex", label: "Suchindex-Neuaufbau (TF-8)" },
  { path: "/api/search", label: "Volltextsuche (TF-8)" },
];

describe("Compliance-Endpunkte mit UI (TF-11)", () => {
  it.each(ENDPOINTS)("$label wird aus dem Client aufgerufen", ({ path }) => {
    expect(CLIENT.includes(path), `Kein Client-Aufruf von ${path}`).toBe(true);
  });

  it("die DSGVO-Auskunft wird aufgerufen (dynamischer Pfad)", () => {
    // Der Pfad enthaelt eine Personen-ID und ist deshalb interpoliert.
    expect(CLIENT).toMatch(/\/api\/admin\/persons\/\$\{[^}]+\}\/data-export/);
  });

  it("die DSGVO-Auskunft ist an die Permission gebunden, die der Endpunkt verlangt", () => {
    // Der Endpunkt prueft admin:audit. Ein Button, der allen erscheint und dann
    // 403 liefert, waere schlechter als keiner.
    const page = readFileSync(
      join(SRC, "app/(dashboard)/crm/contacts/[id]/page.tsx"),
      "utf-8",
    );
    expect(page).toContain('hasPermission("admin:audit")');
  });

  it("die drei Abschluss-Tabs sind im Hub verdrahtet", () => {
    const hub = readFileSync(
      join(SRC, "app/(dashboard)/buchhaltung/abschluss/page.tsx"),
      "utf-8",
    );
    for (const tab of ["ebilanz", "bundesanzeiger", "verfahrensdoku"]) {
      expect(hub, `Tab ${tab} fehlt`).toContain(`value="${tab}"`);
    }
  });

  it("der Download-Helper gibt die ObjectURL wieder frei", () => {
    // Das kopierte Muster im Code liess revokeObjectURL teils weg — der Blob
    // haelt dann Speicher bis zum Reload.
    const helper = readFileSync(join(SRC, "lib/download.ts"), "utf-8");
    // Auf Aufrufe pruefen, nicht auf das Wort — die Erklaerung im Kommentar
    // nennt revokeObjectURL ebenfalls.
    const creates = (helper.match(/createObjectURL\(/g) ?? []).length;
    const revokes = (helper.match(/revokeObjectURL\(/g) ?? []).length;
    expect(creates).toBeGreaterThan(0);
    expect(revokes).toBe(creates);
  });
});
