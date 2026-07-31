/**
 * A6 (Audit 2026-07): Versicherungspolicen — Verdrahtung.
 *
 * Die Rechenregeln stehen in reimbursement.test.ts. Hier geht es um die
 * Stellen, an denen eine Deckungslücke unentdeckt bliebe.
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
  const policy = schema.slice(schema.indexOf("model InsurancePolicy {"));
  const policyBody = policy.slice(0, policy.indexOf("\n}"));

  it("die Police haengt AM Vertrag, nicht neben ihm", () => {
    // Laufzeit, Kuendigungsfristen, Dokumente und Erinnerungen haengen bereits
    // am Contract. Eine zweite Vertragsart daneben muesste beides pflegen.
    expect(policyBody).toContain("contractId String   @unique");
  });

  it("Versicherungssumme UND Versicherungswert sind getrennt", () => {
    // Ohne den Wert ist keine Unterversicherungspruefung moeglich.
    expect(policyBody).toContain("sumInsuredEur Decimal?");
    expect(policyBody).toContain("insuredValueEur Decimal?");
  });

  it("der Verzicht auf den Unterversicherungseinwand ist ein eigenes Feld", () => {
    // In der Praxis haeufig vereinbart — als Annahme waere er falsch.
    expect(policyBody).toContain("waivesUnderinsurance Boolean @default(false)");
  });

  it("es gibt Deckungsarten mit eigener Summe und eigenem Selbstbehalt", () => {
    const coverage = schema.slice(schema.indexOf("model InsuranceCoverage {"));
    const body = coverage.slice(0, coverage.indexOf("\n}"));
    expect(body).toContain("coverageType InsuranceCoverageType");
    expect(body).toContain("sumInsuredEur");
    expect(body).toContain("deductibleType");
  });

  it("die Haftzeit bei Betriebsunterbrechung ist erfassbar", () => {
    const coverage = schema.slice(schema.indexOf("model InsuranceCoverage {"));
    expect(coverage.slice(0, coverage.indexOf("\n}"))).toContain("indemnityPeriodMonths");
  });

  it("versicherte Objekte tragen ihren eigenen Wert", () => {
    // Die Summe ueber alle Objekte ist belastbarer als ein pauschaler Wert.
    const object = schema.slice(schema.indexOf("model InsuredObject {"));
    expect(object.slice(0, object.indexOf("\n}"))).toContain("insuredValueEur");
  });

  it("der Schaden verweist auf Police, Deckung und Stoerungsvorgang", () => {
    const claim = schema.slice(schema.indexOf("model InsuranceClaim {"));
    const body = claim.slice(0, claim.indexOf("\n}"));
    expect(body).toContain("policyId String?");
    expect(body).toContain("coverageId String?");
    // Bei Betriebsunterbrechung ist der Schaden der entgangene Ertrag — ohne
    // A1 gar nicht bezifferbar.
    expect(body).toContain("faultCaseId String?");
  });

  it("die angewandten Konditionen werden am Schaden mitgespeichert", () => {
    // Eine spaetere Aenderung der Police darf einen abgeschlossenen
    // Schadenfall nicht umrechnen.
    const claim = schema.slice(schema.indexOf("model InsuranceClaim {"));
    const body = claim.slice(0, claim.indexOf("\n}"));
    expect(body).toContain("deductibleAppliedEur");
    expect(body).toContain("reimbursementBasis Json?");
  });
});

describe("Policenroute", () => {
  const route = src("app/api/insurance/policies/route.ts");

  it("die Deckungsluecke wird in der Liste mitgerechnet", () => {
    // Die Frage stellt sich VOR dem Schaden, nicht danach.
    expect(route).toContain("checkCoverageGap({");
    expect(route).toContain("coverageGap");
  });

  it("der Wert aus den versicherten Objekten hat Vorrang", () => {
    expect(route).toContain('insuredValueSource: objectValue > 0 ? "INSURED_OBJECTS" : "POLICY"');
  });

  it("eine Police an einem Nicht-Versicherungsvertrag wird abgewiesen", () => {
    // Das waere ein Erfassungsfehler, der spaeter niemandem auffaellt.
    expect(route).toContain('contract.contractType !== "INSURANCE"');
  });

  it("es gibt nur eine Police je Vertrag", () => {
    expect(route).toContain("bereits eine Police");
  });

  it("widerspruechliche Selbstbehalt-Angaben werden abgewiesen", () => {
    // Mindest- und Hoechstbetrag wirken bei einem festen Selbstbehalt nicht —
    // ein Feld, das nichts tut, fuehrt in die Irre.
    expect(route).toContain("wirken nur bei prozentualen Formen");
  });

  it("Parks und Anlagen werden gegen den Mandanten geprueft", () => {
    expect(route).toContain("tenantId: check.tenantId!");
    expect(route).toContain("park: { tenantId: check.tenantId! }");
  });
});

describe("Bewertungsroute", () => {
  const route = src("app/api/insurance/claims/[id]/assess/route.ts");

  it("bei Betriebsunterbrechung kommt der Schaden aus dem Stoerungsvorgang", () => {
    expect(route).toContain('claim.coverage?.coverageType === "BUSINESS_INTERRUPTION"');
    expect(route).toContain("claim.faultCase?.lostRevenueEur");
  });

  it("ohne Schadenhoehe wird NICHT mit 0 gerechnet", () => {
    // Eine 0 wuerde "kein Schaden" behaupten.
    expect(route).toContain("assessed: false");
    expect(route).toContain("Keine Schadenhöhe");
  });

  it("ohne Versicherungssumme wird nichts berechnet", () => {
    expect(route).toContain("Keine Versicherungssumme hinterlegt");
  });

  it("deckungsspezifische Werte schlagen die der Police", () => {
    expect(route).toContain("toNumber(coverage?.sumInsuredEur) ?? toNumber(policy.sumInsuredEur)");
  });

  it("die Herkunft der Schadenhoehe wird ausgewiesen", () => {
    expect(route).toContain("lossSource");
  });

  it("die Bewertung braucht das Pflegerecht", () => {
    expect(route).toContain("PERMISSIONS.INSURANCE_MANAGE");
  });
});

describe("Rechte", () => {
  it("es gibt genau zwei Rechte", () => {
    // Eine dritte Stufe fuer das Bewerten haette keine eigene Bedeutung — und
    // ein Katalogeintrag ohne Wirkung ist genau das, was TF-12 beanstandet.
    const catalog = src("lib/auth/permissions.catalog.ts");
    expect(catalog).toContain('name: "insurance:read"');
    expect(catalog).toContain('name: "insurance:manage"');
    expect(catalog).not.toContain('name: "insurance:assess"');
  });
});
