/**
 * B3 (Audit 2026-07): Grosskomponenten — Verdrahtung.
 *
 * Die Rechenregeln stehen in lifetime.test.ts. Hier geht es um die Stellen, an
 * denen eine Tauschhistorie verlorenginge oder eine Gewaehrleistung
 * behauptet wuerde, die niemand gegeben hat.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf-8");
}

function src(relativePath: string): string {
  return read(join("src", relativePath));
}

describe("Datenmodell", () => {
  const schema = read("prisma/schema.prisma");
  const start = schema.indexOf("model MajorComponent {");
  const body = schema.slice(start, schema.indexOf("\n}", start));

  it("der Ausbau ist ein Feld, kein Loeschen", () => {
    // Ohne Historie waere "das wievielte Getriebe ist das" nicht beantwortbar
    // — und genau das fragt der Gutachter beim Verkauf.
    expect(start).toBeGreaterThan(-1);
    expect(body).toContain("removedAt     DateTime?");
    expect(body).toContain("removalReason ComponentRemovalReason?");
  });

  it("die Tauschkette ist verknuepft", () => {
    expect(body).toContain("replacedById String?         @unique");
    expect(body).toContain('@relation("ComponentReplacement"');
  });

  it("der Ausbaugrund ist ein Enum, kein Freitext", () => {
    // Er entscheidet, ob ein Gewaehrleistungs- oder Versicherungsanspruch
    // dahintersteht.
    const enumStart = schema.indexOf("enum ComponentRemovalReason {");
    expect(enumStart).toBeGreaterThan(-1);
    const enumBody = schema.slice(enumStart, schema.indexOf("\n}", enumStart));
    expect(enumBody).toContain("FAILURE");
    expect(enumBody).toContain("SCHEDULED");
  });

  it("Betriebsstunden beim Einbau sind erfassbar", () => {
    // Bei einem gebrauchten Austauschteil nicht 0.
    expect(body).toContain("operatingHoursAtInstall Int?");
  });

  it("die ablaufenden Gewaehrleistungen sind indiziert", () => {
    expect(body).toContain("@@index([tenantId, warrantyEndDate])");
  });

  it("die eingebauten Komponenten je Anlage sind indiziert", () => {
    expect(body).toContain("@@index([turbineId, removedAt])");
  });
});

describe("Anlegen", () => {
  const route = src("app/api/components/route.ts");

  it("eine belegte Position wird abgewiesen", () => {
    // Sonst entstuenden zwei eingebaute Getriebe und die Tauschhistorie
    // zerfiele in zwei unverbundene Straenge.
    expect(route).toContain("bereits eine Komponente dieses Typs eingebaut");
    expect(route).toContain("Tauschhistorie zusammenhängt");
  });

  it("ein Einbau lange vor der Inbetriebnahme wird abgewiesen", () => {
    expect(route).toContain("mehr als zwei Jahre vor der Inbetriebnahme");
  });

  it("die Positionspruefung laeuft in der Liste mit", () => {
    expect(route).toContain("checkPositions(");
    expect(route).toContain("positionProblems");
  });

  it("die Liste zeigt standardmaessig nur EINGEBAUTE", () => {
    expect(route).toContain("{ removedAt: null }");
  });
});

describe("Tausch", () => {
  const route = src("app/api/components/[id]/replace/route.ts");

  it("laeuft in einer Transaktion", () => {
    // Ein halber Tausch hinterliesse eine Anlage ohne Getriebe im Register.
    expect(route).toContain("prisma.$transaction");
  });

  it("loescht die alte Komponente NICHT", () => {
    expect(route).not.toContain("majorComponent.delete");
    expect(route).toContain("removedAt,");
    expect(route).toContain("replacedById: created.id");
  });

  it("vererbt die Gewaehrleistung NICHT", () => {
    // Sie ist eine Zusage zum einzelnen Stueck. Sie stillschweigend zu
    // uebernehmen waere eine Zusage, die niemand gegeben hat.
    expect(route).toContain("NICHT: sie ist eine Zusage zum");
    expect(route).toContain(
      "warrantyEndDate: data.warrantyEndDate ? new Date(data.warrantyEndDate) : null",
    );
  });

  it("vererbt die Auslegungsdauer schon", () => {
    // Sie ist eine Eigenschaft des Bauteiltyps, nicht des einzelnen Stuecks.
    expect(route).toContain("data.designLifeYears ?? old.designLifeYears");
  });

  it("eine fehlende Gewaehrleistung wird ausdruecklich gemeldet", () => {
    expect(route).toContain("gilt dafür nicht");
  });

  it("ein Ausfall ohne Stoerungsvorgang wird gemeldet", () => {
    // Ein Getriebeschaden ist in der Regel auch ein Gewaehrleistungs- oder
    // Versicherungsfall.
    expect(route).toContain('data.removalReason === "FAILURE" && !data.faultCaseId');
  });

  it("eine bereits ausgebaute Komponente kann nicht ersetzt werden", () => {
    expect(route).toContain("bereits am");
    expect(route).toContain("nicht noch einmal ersetzt");
  });

  it("umgedrehte Datumsangaben werden abgewiesen", () => {
    expect(route).toContain("Ausbau kann nicht vor dem Einbau liegen");
    expect(route).toContain("nicht vor dem Ausbau des alten liegen");
  });
});

describe("Migration", () => {
  const sql = read("prisma/migrations/manual/major_components.sql");

  it("kein Backfill aus Freitext", () => {
    // Was dabei herauskaeme, saehe aus wie ein gepflegtes Register und waere
    // geraten.
    expect(sql).not.toMatch(/INSERT\s+INTO\s+"?major_components"?/i);
    expect(sql).toContain("Kein Backfill");
  });

  it("laeuft in einer Transaktion", () => {
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("COMMIT;");
  });
});
