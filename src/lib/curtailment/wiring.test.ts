/**
 * A4 (Audit 2026-07): Redispatch — Verdrahtung.
 *
 * Die Rechenregeln stehen in compensation.test.ts. Hier geht es um die
 * Stellen, an denen eine Forderung still falsch würde.
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
  const model = schema.slice(schema.indexOf("model CurtailmentEvent {"));
  const body = model.slice(0, model.indexOf("\n}"));

  it("die Anspruchsgrundlage bestimmt den Rechenweg", () => {
    expect(schema).toContain("enum CurtailmentLegalBasis");
    expect(schema).toContain("EEG_15");
    expect(schema).toContain("ENWG_13A");
  });

  it("die Aufteilung nach § 15 EEG hat zwei getrennte Felder", () => {
    // Ein Ereignis kann die 1-%-Schwelle ueberschreiten und muss dann geteilt
    // werden.
    expect(body).toContain("portionAt95Eur");
    expect(body).toContain("portionAt100Eur");
  });

  it("die Rechnungsgrundlagen der Schwelle werden mitgespeichert", () => {
    // Sonst laesst sich die Aufteilung spaeter nicht mehr nachvollziehen.
    expect(body).toContain("annualRevenueBasisEur");
    expect(body).toContain("priorLostRevenueInYearEur");
  });

  it("die Ausfallarbeit ist nullable", () => {
    // "noch nicht ermittelt" ist etwas anderes als 0 kWh.
    expect(body).toMatch(/lostWorkKwh    Decimal\?/);
  });

  it("gezahlte Entschaedigung und Herstellermeldung haben eigene Felder", () => {
    // Der Abgleich zwischen Forderung und Zahlung ist der Zweck des Vorgangs.
    expect(body).toContain("compensationPaidEur");
    expect(body).toContain("gridOperatorReportedKwh");
  });

  it("es gibt einen Zustand fuer die teilweise Zahlung", () => {
    // Sonst bleibt eine halb bezahlte Forderung auf "gestellt" stehen und
    // faellt aus der Nachverfolgung.
    expect(schema).toContain("PARTIALLY_PAID");
    expect(schema).toContain("TIME_BARRED");
  });
});

describe("Berechnungsdienst", () => {
  const service = src("lib/curtailment/event-service.ts");

  it("ohne Ende wird nicht gerechnet", () => {
    // Eine laufende Abregelung "bis jetzt" zu bewerten ergaebe eine Zahl, die
    // beim naechsten Klick anders ausfaellt.
    expect(service).toContain("if (!event.endAt)");
  });

  it("die 1-%-Schwelle summiert ueber das KALENDERJAHR", () => {
    // Ohne diese Summe waere jedes Ereignis fuer sich unter der Schwelle und
    // die 100-%-Quote kaeme nie zum Tragen.
    expect(service).toContain("sumPriorLostRevenue");
    expect(service).toContain('legalBasis: "EEG_15"');
  });

  it("das eigene Ereignis wird von der Vorsumme ausgeschlossen", () => {
    // Sonst zaehlte eine erneute Berechnung sich selbst mit.
    expect(service).toContain("id: { not: excludeEventId }");
  });

  it("ohne Satz bleibt die Menge stehen und die Bewertung offen", () => {
    // Menge ohne Bewertung ist ein brauchbarer Zwischenstand — eine Forderung
    // von 0 EUR waere es nicht.
    expect(service).toContain("Ausfallarbeit ermittelt, Bewertung offen");
  });

  it("unvollstaendige Jahreseinnahmen werden benannt", () => {
    // Solange das Jahr laeuft, ist die Summe unvollstaendig und die Schwelle
    // zu niedrig angesetzt. Auf den Code pruefen, nicht auf den Umbruch eines
    // Kommentars — der aendert sich beim naechsten Formatieren.
    expect(service).toContain("sumAnnualRevenue");
    expect(service).toContain("if (result._count === 0) return null;");
  });
});

describe("Routen", () => {
  const list = src("app/api/curtailment/route.ts");
  const detail = src("app/api/curtailment/[id]/route.ts");

  it("die Summen gelten fuer ALLE Treffer, nicht fuer die sichtbare Seite", () => {
    // Sonst sagt "offen: 4.200 EUR" etwas ueber Seite 1 aus und nicht ueber
    // den Bestand.
    expect(list).toContain("prisma.curtailmentEvent.aggregate");
    expect(list).toContain("openEur");
  });

  it("die Arbeitsliste zeigt nur unerledigte Forderungen", () => {
    // Abgelehnte und verjaehrte sind erledigt, wenn auch unerfreulich.
    expect(list).toContain('claimStatus: { in: ["OPEN", "SUBMITTED", "ACKNOWLEDGED", "PARTIALLY_PAID"] }');
  });

  it("eine Anlage muss zum angegebenen Park gehoeren", () => {
    expect(list).toContain("gehört nicht zum angegebenen Park");
  });

  it("eine gestellte Forderung wird nicht neu berechnet", () => {
    // Das wuerde die Grundlage aendern, die der Netzbetreiber vorliegen hat.
    expect(detail).toContain('["SUBMITTED", "ACKNOWLEDGED", "PARTIALLY_PAID", "PAID"].includes');
  });

  it("ohne Ergebnis wird NICHTS geschrieben", () => {
    expect(detail).toContain("computed: false");
  });

  it("der Zahlungsstand wird aus dem Betrag abgeleitet", () => {
    // Sonst bleibt eine teilweise gezahlte Forderung auf "gestellt" stehen.
    expect(detail).toContain('derivedStatus = "PARTIALLY_PAID"');
    expect(detail).toContain('derivedStatus = "PAID"');
  });

  it("Berechnen ist ein eigenes Recht", () => {
    expect(detail).toContain("PERMISSIONS.CURTAILMENT_COMPUTE");
    expect(detail).toContain("PERMISSIONS.CURTAILMENT_MANAGE");
  });
});

describe("Rechte", () => {
  it("die drei Rechte stehen im Katalog", () => {
    const catalog = src("lib/auth/permissions.catalog.ts");
    for (const name of ["curtailment:read", "curtailment:manage", "curtailment:compute"]) {
      expect(catalog, name).toContain(`name: "${name}"`);
    }
  });
});
