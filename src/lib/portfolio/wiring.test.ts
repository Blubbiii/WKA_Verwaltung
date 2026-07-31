/**
 * B5 (Audit 2026-07): Portfolio-Cockpit — Verdrahtung.
 *
 * Die Rechenregeln stehen in cockpit.test.ts. Hier geht es um die Stellen, an
 * denen eine Luecke als Null nach aussen ginge — in einen Bankbericht.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function src(relativePath: string): string {
  return readFileSync(join(ROOT, "src", relativePath), "utf-8");
}

describe("Die Route verdichtet nur, sie erfindet nichts", () => {
  const route = src("app/api/reports/portfolio-cockpit/route.ts");

  it("legt kein neues Schema an", () => {
    // "Reine Verdichtung vorhandener Daten" — der Bericht sagt es selbst.
    expect(route).not.toContain(".create(");
    expect(route).not.toContain(".upsert(");
  });

  it("summiert nur TAEGLICHE Verfuegbarkeitszeilen", () => {
    // Monats- und Jahreszeilen daneben wuerden dieselbe Zeit ein zweites Mal
    // zaehlen und die Verfuegbarkeit unter 50 % druecken.
    expect(route).toContain('periodType: "DAILY"');
  });

  it("zaehlt nur VOLLZOGENE Ausschuettungen", () => {
    // Ein Entwurf ist kein ausgezahltes Geld.
    expect(route).toContain('status: "EXECUTED"');
  });

  it("verteilt Ausschuettungen NICHT gleichmaessig, wenn die Quote fehlt", () => {
    // Eine geratene Zuordnung waere in einem Beiratsbericht die falsche Zahl
    // am falschen Park.
    expect(route).toContain("NICHT gleichverteilen");
    expect(route).toContain("unmappedFunds");
  });

  it("meldet die fehlende Zuordnung nach aussen", () => {
    expect(route).toContain("keine Beteiligungsquote am Park hinterlegt");
  });

  it("die Prognose wird nicht erfunden", () => {
    expect(route).toContain("forecastKwh: null");
  });

  it("begrenzt den Zeitraum", () => {
    expect(route).toContain("MAX_YEARS");
  });
});

describe("Die Verfuegbarkeit kommt aus EINER Rechnung", () => {
  const lib = src("lib/portfolio/cockpit.ts");

  it("das Cockpit benutzt die Funktion des Garantieabgleichs", () => {
    // Eine zweite Formel waere eine zweite Wahrheit — bei einer 97-%-Garantie
    // faellt ein halber Prozentpunkt sofort auf.
    expect(lib).toContain("computeContractualAvailability");
    expect(lib).toContain("@/lib/availability/contractual-availability");
  });
});

describe("Was ausdruecklich NICHT gerechnet wird", () => {
  const lib = src("lib/portfolio/cockpit.ts");

  it("die Schuldendienstdeckung traegt ihre Begruendung im Code", () => {
    expect(lib).toContain("noDebtData");
    expect(lib).toContain("Keine Darlehensdaten im System");
  });

  it("es gibt weiterhin kein Darlehensmodell", () => {
    // Waechter: sobald jemand eines anlegt, soll dieser Test auffallen und die
    // Kennzahl nachgezogen werden.
    const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf-8");
    expect(schema).not.toMatch(/^model (Loan|Debt|CreditLine)\b/m);
  });
});

describe("Die Seite zeigt Luecken als Luecken", () => {
  const page = src("app/(dashboard)/reports/portfolio-cockpit/page.tsx");

  it("eine leere Zelle bekommt einen Strich, keine 0", () => {
    expect(page).toContain('if (metric.value === null) return "–"');
  });

  it("der Grund haengt an der Zelle", () => {
    expect(page).toContain("title={metric?.unavailable ?? undefined}");
  });

  it("im CSV steht der GRUND statt eines leeren Feldes", () => {
    // Ein leeres Feld in einer Tabellenkalkulation wird zu 0, sobald jemand
    // damit rechnet.
    expect(page).toContain("metric?.unavailable ?? \"\"");
  });

  it("die Zahl der Parks mit Daten steht an der Summe", () => {
    // Sonst saehe eine Summe ueber drei von zehn Parks aus wie das Portfolio.
    expect(page).toContain("parksWithData");
    expect(page).toContain("summary.parksTotal");
  });
});
