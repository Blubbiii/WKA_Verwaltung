/**
 * A7 (Audit 2026-07): Rückbauverpflichtung — Verdrahtung.
 *
 * Die Rechenregeln stehen in provision.test.ts. Hier geht es um die Stellen,
 * an denen eine Bilanzgrösse entstünde, die niemand erklären kann.
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
  const obligation = schema.slice(schema.indexOf("model DismantlingObligation {"));
  const obligationBody = obligation.slice(0, obligation.indexOf("\n}"));
  const provision = schema.slice(schema.indexOf("model DismantlingProvision {"));
  const provisionBody = provision.slice(0, provision.indexOf("\n}"));

  it("eine Verpflichtung je Park", () => {
    expect(obligationBody).toContain("parkId String @unique");
  });

  it("das Gutachten hat ein Datum", () => {
    // 500.000 EUR von 2012 sind eine andere Aussage als dieselbe Zahl von 2026.
    expect(obligationBody).toContain("costEstimateDate    DateTime?");
  });

  it("die Buergschaftsfrist ist indiziert", () => {
    // Sie laeuft still ab, weil niemand den Aktenordner liest.
    expect(obligationBody).toContain("@@index([tenantId, securityValidTo])");
  });

  it("Handels- und Steuerbilanz stehen GETRENNT im Datensatz", () => {
    // Sie kommen bei derselben Verpflichtung zu verschiedenen Betraegen, und
    // beide sind richtig.
    expect(provisionBody).toContain("hgbProvisionEur");
    expect(provisionBody).toContain("taxProvisionEur");
    expect(provisionBody).toContain("differenceEur");
  });

  it("die Rechnungsgrundlagen werden mitgespeichert", () => {
    // Eine spaetere Aenderung des Gutachtens darf einen festgestellten
    // Jahresabschluss nicht rueckwirkend umrechnen.
    expect(provisionBody).toContain("estimatedCostTodayEur Decimal");
    expect(provisionBody).toContain("costInflationPercent  Decimal");
    expect(provisionBody).toContain("hgbDiscountRatePercent Decimal?");
  });

  it("ein Datensatz je Verpflichtung und Jahr", () => {
    // Sonst entstehen zwei Rueckstellungswerte fuer denselben Abschluss.
    expect(provisionBody).toContain("@@unique([obligationId, year])");
  });

  it("die Jahresbuchung ist verknuepfbar", () => {
    expect(provisionBody).toContain("journalEntryId String?");
  });
});

describe("Verpflichtungsroute", () => {
  const route = src("app/api/dismantling/route.ts");

  it("die Sicherheitspruefung laeuft in der Liste mit", () => {
    expect(route).toContain("checkSecurity({");
    expect(route).toContain("securityCheck");
  });

  it("ein Park ohne Inbetriebnahmedatum wird abgewiesen", () => {
    // Ohne Beginn der Ansammlung gibt es keine Rueckstellung. Das hier zu
    // melden ist besser, als spaeter eine Zahl ohne Grundlage zu erklaeren.
    expect(route).toContain("kein Inbetriebnahmedatum");
  });

  it("ein Rueckbaujahr vor der Inbetriebnahme wird abgewiesen", () => {
    expect(route).toContain("liegt nicht nach der Inbetriebnahme");
  });

  it("es gibt nur eine Verpflichtung je Park", () => {
    expect(route).toContain("bereits eine Rückbauverpflichtung");
  });
});

describe("Fortschreibungsroute", () => {
  const route = src("app/api/dismantling/[id]/provision/route.ts");

  it("eine vorhandene Fortschreibung wird NICHT still ersetzt", () => {
    // Der Wert kann Grundlage eines festgestellten Abschlusses sein.
    expect(route).toContain("Zum Ersetzen bitte ausdrücklich bestätigen");
    expect(route).toContain("overwrite");
  });

  it("die Zufuehrung kommt aus dem Vorjahresdatensatz", () => {
    expect(route).toContain("data.year - 1");
    expect(route).toContain("previousYearHgbEur");
  });

  it("ohne Rechnungsgrundlage wird NICHTS geschrieben", () => {
    // Eine Rueckstellung ohne Grundlage waere eine Bilanzgroesse, die niemand
    // erklaeren kann.
    expect(route).toContain("computed: false");
  });

  it("die Hinweise gehen an den Bearbeiter zurueck", () => {
    // Vor allem der zum fehlenden Abzinsungssatz — der Betrag ist dann zu hoch.
    expect(route).toContain("warnings: result.warnings");
  });

  it("das Fortschreiben ist ein eigenes Recht", () => {
    expect(route).toContain("PERMISSIONS.DISMANTLING_PROVISION");
  });
});

describe("Rechte", () => {
  it("die drei Rechte stehen im Katalog", () => {
    const catalog = src("lib/auth/permissions.catalog.ts");
    for (const name of ["dismantling:read", "dismantling:manage", "dismantling:provision"]) {
      expect(catalog, name).toContain(`name: "${name}"`);
    }
  });
});

describe("Der steuerliche Satz ist nicht konfigurierbar", () => {
  it("5,5 Prozent stehen als Konstante im Code", () => {
    // § 6 Abs. 1 Nr. 3a lit. e EStG ist gesetzlich fest — ein Eingabefeld
    // dafuer waere falsch.
    const lib = src("lib/dismantling/provision.ts");
    expect(lib).toContain("export const TAX_DISCOUNT_RATE_PERCENT = 5.5");
    const route = src("app/api/dismantling/[id]/provision/route.ts");
    expect(route).not.toContain("taxDiscountRatePercent");
  });
});
