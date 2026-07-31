/**
 * B2 (Audit 2026-07): Regulatorik — Verdrahtung.
 *
 * Die Regeln stehen in deadline-rules.test.ts. Hier geht es um die Stellen, an
 * denen eine Frist verschwinden oder ein ungeprüfter Wert wie ein geprüfter
 * aussehen würde.
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

  function model(name: string): string {
    const start = schema.indexOf(`model ${name} {`);
    expect(start, name).toBeGreaterThan(-1);
    return schema.slice(start, schema.indexOf("\n}", start));
  }

  it("die Fristen sind GESPEICHERT, nicht abgeleitet", () => {
    // Eine erledigte Frist muss erledigt bleiben. Waere die Liste abgeleitet,
    // verschwaende der Haken beim naechsten Laden.
    const body = model("ComplianceDeadline");
    expect(body).toContain("status ComplianceDeadlineStatus");
    expect(body).toContain("completedAt   DateTime?");
  });

  it("der Regelschluessel traegt die Idempotenz", () => {
    // Ohne ihn entstuenden bei jedem Lauf Dubletten.
    expect(model("ComplianceDeadline")).toContain("@@unique([tenantId, turbineId, ruleKey])");
  });

  it("die Rechtsgrundlage steht am Datensatz", () => {
    expect(model("ComplianceDeadline")).toContain("basis String @db.Text");
  });

  it("nicht zutreffend ist von erledigt getrennt", () => {
    // Sonst hiesse "erledigt" zweierlei.
    const enumStart = schema.indexOf("enum ComplianceDeadlineStatus {");
    const body = schema.slice(enumStart, schema.indexOf("\n}", enumStart));
    expect(body).toContain("DONE");
    expect(body).toContain("NOT_APPLICABLE");
  });

  it("ein Stammdatensatz je Anlage", () => {
    expect(model("RegulatoryProfile")).toContain("turbineId String  @unique");
  });

  it("Aenderung und Meldung sind ZWEI Felder", () => {
    // Die Differenz ist die Frist. Ein einzelnes Feld koennte sie nicht tragen.
    const body = model("RegulatoryProfile");
    expect(body).toContain("lastChangeAt         DateTime?");
    expect(body).toContain("lastChangeReportedAt DateTime?");
  });
});

describe("Stammdatenroute", () => {
  const route = src("app/api/regulatory/profiles/route.ts");

  it("prueft die MaStR-Nummer auf ihr Format", () => {
    // Eine Nummer mit einem Zeichen zu wenig faellt sonst erst auf, wenn der
    // Netzbetreiber die Meldung ablehnt.
    expect(route).toContain("MASTR_PATTERN");
    expect(route).toContain("/^[A-Z]{3}[0-9]{12}$/");
  });

  it("prueft die Laenge des Anlagenschluessels", () => {
    expect(route).toContain("EEG_KEY_LENGTH = 33");
    expect(route).toContain("HkNRV");
  });

  it("registriert ohne Nummer wird abgewiesen", () => {
    // Sonst zeigte die Liste "registriert", waehrend der Zahlungsanspruch fehlt.
    expect(route).toContain('data.mastrStatus === "REGISTERED" && !unit');
    expect(route).toContain("§ 52 Abs. 1 EEG");
  });

  it("eine Meldung vor der Aenderung wird abgewiesen", () => {
    expect(route).toContain("kann nicht vor der Änderung liegen");
  });

  it("das alte Freitextfeld wird NICHT ueberschrieben", () => {
    // Zwei Wahrheiten, ohne dass jemand merkt welche gilt. Gelesen wird das
    // Feld weiterhin (fuer den Vorschlag in der Maske) — geschrieben nicht.
    expect(route).toContain("BEWUSST nicht überschrieben");
    expect(route).not.toContain("prisma.turbine.update");
  });
});

describe("Fristenroute", () => {
  const route = src("app/api/regulatory/deadlines/route.ts");

  it("das Erzeugen ist idempotent", () => {
    // P2002 ist der Normalfall bei jedem Lauf nach dem ersten.
    expect(route).toContain('error.code === "P2002"');
    expect(route).toContain("skipped += 1");
  });

  it("das Erzeugen UEBERSCHREIBT nichts", () => {
    // Sonst verlöre eine erledigte Frist ihren Haken, sobald sich ein
    // Stammdatum aendert.
    expect(route).not.toContain("complianceDeadline.upsert");
    expect(route).not.toContain("complianceDeadline.updateMany");
  });

  it("uebergangene Anlagen werden benannt", () => {
    // Sonst liest sich "12 erzeugt" wie Vollstaendigkeit.
    expect(route).toContain("turbinesWithoutProfile");
  });

  it("nur der Ausschreibungszuschlag bekommt die Standortguete-Pruefung", () => {
    expect(route).toContain('profile.scheme === "TENDER_AWARD"');
  });

  it("die Liste zeigt standardmaessig nur OFFENE", () => {
    // Erledigte sind Historie, keine Arbeitsliste.
    expect(route).toContain('{ status: "OPEN" as const }');
  });

  it("Zuruecksetzen auf offen raeumt den Erledigungsvermerk", () => {
    expect(route).toContain('data.status === "OPEN" ? null : new Date()');
  });
});

describe("Der bestehende Fristenkalender nimmt sie auf", () => {
  const route = src("app/api/deadlines/route.ts");

  it("Meldefristen laufen im selben Kalender mit", () => {
    // Wer nach Fristen schaut, will nicht an zwei Stellen suchen.
    expect(route).toContain("complianceDeadline.findMany");
    expect(route).toContain('entityType: "compliance"');
  });

  it("nur offene", () => {
    expect(route).toContain('status: "OPEN"');
  });

  it("die Grundlage kommt mit", () => {
    expect(route).toContain("basis: deadline.basis");
  });
});

describe("Migration", () => {
  const sql = read("prisma/migrations/manual/regulatory.sql");

  it("schreibt keinen Bestand um", () => {
    // `turbines.mastrNumber` bleibt unveraendert — ein stiller Backfill wuerde
    // ungepruefte Werte in ein geprueftes Feld heben.
    expect(sql).not.toMatch(/UPDATE\s+"?turbines"?/i);
    expect(sql).not.toMatch(/INSERT\s+INTO\s+"?regulatory_profiles"?/i);
  });

  it("laeuft in einer Transaktion", () => {
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("COMMIT;");
  });

  it("der Regelschluessel ist eindeutig je Anlage", () => {
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "compliance_deadlines_tenantId_turbineId_ruleKey_key"');
  });
});
