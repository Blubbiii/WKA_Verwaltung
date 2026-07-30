/**
 * A2 (Audit 2026-07): Verfügbarkeitsgarantie — Verdrahtung.
 *
 * Die Rechenregeln stehen in contractual-availability.test.ts. Hier geht es um
 * die Stellen, an denen eine falsche Zahl unter richtigem Namen entstehen
 * könnte — und um F21, das an dieser Stelle mit erledigt wird.
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

function codeOnly(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// F21: die vorgetäuschte vertragliche Verfügbarkeit
// ---------------------------------------------------------------------------

describe("F21 — die vertragliche Verfuegbarkeit ist keine Kopie der technischen mehr", () => {
  const route = src("app/api/energy/analytics/availability-detail/route.ts");

  it("contractualPct wird nicht mehr aus technicalPct kopiert", () => {
    // Vorher: `contractualPct = technicalPct; // Simplified`
    // Eine Zahl unter dem Namen "vertraglich", die keine ist — bei einer
    // 97-%-Garantie entscheidet genau sie ueber fuenfstellige Betraege.
    const code = codeOnly(route);
    expect(code).not.toContain("contractualPct = technicalPct;");
    expect(code).not.toContain("const contractPct = techPct;");
  });

  it("die Unterkategorien werden jetzt ueberhaupt abgefragt", () => {
    // Ohne sie KONNTE excludeContractual nicht wirken — der Parameter wurde
    // gelesen, im meta zurueckgegeben und nie angewandt.
    expect(route).toContain("SUM(t5_1)::bigint");
    expect(route).toContain("SUM(t5_3)::bigint");
  });

  it("gerechnet wird mit demselben Kern wie der Jahresabgleich", () => {
    // Zwei Implementierungen derselben Kennzahl driften auseinander.
    expect(route).toContain("computeContractualAvailability(");
    expect(route).toContain('from "@/lib/availability/contractual-availability"');
  });

  it("nur Unterkategorien duerfen ueber den Parameter ausgeschlossen werden", () => {
    // Sonst koennte ein Aufrufer T1 ausschliessen und sich 100 % ausrechnen.
    expect(route).toContain("function isSubCategory");
    expect(route).toContain("excludeContractual.filter(isSubCategory)");
  });

  it("der Jahreswert kommt aus den Summen, nicht als Mittel der Monate", () => {
    // Ein Monat mit wenigen Stunden Datengrundlage waere sonst genauso schwer
    // wie ein voller.
    expect(route).toContain("const yearBuckets: TimeBuckets = monthlyRows.reduce");
  });
});

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

describe("Datenmodell", () => {
  const schema = read("prisma/schema.prisma");
  const guarantee = schema.slice(schema.indexOf("model AvailabilityGuarantee {"));
  const guaranteeBody = guarantee.slice(0, guarantee.indexOf("\n}"));
  const settlement = schema.slice(schema.indexOf("model AvailabilitySettlement {"));
  const settlementBody = settlement.slice(0, settlement.indexOf("\n}"));

  it("die Garantie haengt am Wartungsvertrag", () => {
    expect(guaranteeBody).toContain("contractId String");
  });

  it("Ausschluesse stehen als Kategorienliste UND im Wortlaut", () => {
    // Die Liste ist die maschinelle Fassung, der Text die belastbare.
    expect(guaranteeBody).toContain("excludedCategories  String[]");
    expect(guaranteeBody).toContain("exclusionNotes String?");
  });

  it("die Punkte-Rundung ist ein eigenes Vertragsfeld", () => {
    // "je angefangenem" gegen "je vollem Prozentpunkt" entscheidet bei 96,9 %
    // gegen eine 97-%-Marke ueber alles oder nichts.
    expect(guaranteeBody).toContain("pointRounding PointRounding");
  });

  it("die Garantie hat eine Laufzeit statt ueberschrieben zu werden", () => {
    // Sonst aendert sich eine bereits abgerechnete Garantie rueckwirkend.
    expect(guaranteeBody).toContain("validFrom DateTime");
    expect(guaranteeBody).toContain("validTo   DateTime?");
  });

  it("die erreichte Verfuegbarkeit ist nullable", () => {
    // 0 % wuerde die volle Poenale ausloesen — das darf kein Ergebnis
    // fehlender SCADA-Daten sein.
    expect(settlementBody).toMatch(/actualAvailabilityPct Decimal\?/);
  });

  it("die Zielmarke wird im Abgleich MITGESPEICHERT", () => {
    // Eine spaetere Vertragsaenderung darf eine gestellte Forderung nicht
    // veraendern.
    expect(settlementBody).toMatch(/targetAvailabilityPct Decimal\s+@db/);
  });

  it("ein Zeitraum je Garantie nur einmal", () => {
    // Sonst entstehen zwei Forderungen fuer dasselbe Jahr.
    expect(settlementBody).toContain("@@unique([guaranteeId, periodStart, periodEnd])");
  });

  it("die Herstellermeldung hat ein eigenes Feld", () => {
    // Die Abweichung zwischen beiden ist der Zweck der ganzen Funktion.
    expect(settlementBody).toContain("vendorReportedPct");
  });
});

// ---------------------------------------------------------------------------
// Dienst
// ---------------------------------------------------------------------------

describe("Abgleichsdienst", () => {
  const service = src("lib/availability/settlement-service.ts");

  it("energiebasierte Garantien werden NICHT zeitbasiert gerechnet", () => {
    // Eine falsche Zahl unter richtigem Namen ist genau der Fehler, den A2
    // beheben soll.
    expect(service).toContain('guarantee.method === "ENERGY_BASED"');
    expect(service).toContain("fehlt die vertragliche Referenzkurve");
  });

  it("die Verfuegbarkeit kommt aus den Summen, nicht als Mittel je Anlage", () => {
    // Eine kleine Anlage mit Totalausfall wuerde sonst genauso schwer wiegen
    // wie eine grosse mit voller Verfuegbarkeit.
    expect(service).toContain("const combined = computeContractualAvailability(total, definition)");
  });

  it("die Einzelwerte je Anlage bleiben in der Herleitung", () => {
    // Sie sind es, die in der Diskussion mit dem Hersteller gebraucht werden.
    expect(service).toContain("perTurbine");
  });

  it("die richtige SCADA-Aufloesung wird abgefragt", () => {
    // 'daily' statt 'DAILY' haette still keine Zeile gefunden — und eine
    // leere Summe saehe aus wie "keine Ausfallzeiten".
    expect(service).toContain("a.\"periodType\" = 'DAILY'");
  });

  it("eine fehlende Jahresverguetung wird gemeldet, nicht als 0 EUR verbucht", () => {
    expect(service).toContain("Staffeln in Prozent der Jahresvergütung ergeben 0 EUR");
  });

  it("ohne SCADA-Daten kommt eine Begruendung, keine Zahl", () => {
    expect(service).toContain("Keine SCADA-Verfügbarkeitsdaten im Zeitraum");
  });
});

// ---------------------------------------------------------------------------
// Routen
// ---------------------------------------------------------------------------

describe("Routen", () => {
  const guarantees = src("app/api/availability/guarantees/route.ts");
  const settlements = src("app/api/availability/settlements/route.ts");
  const settlementDetail = src("app/api/availability/settlements/[id]/route.ts");

  it("widerspruechliche Kategorien werden beim Erfassen abgewiesen", () => {
    // Der Rechenkern weist das ohnehin ab — hier gibt es die Meldung beim
    // Erfassen statt erst bei der Abrechnung.
    expect(guarantees).toContain("zugleich als verfügbar und ausgeschlossen angegeben");
  });

  it("ueberlappende Staffeln lassen sich gar nicht erst speichern", () => {
    expect(guarantees).toContain("überlappen sich");
  });

  it("nur Hauptkategorien koennen verfuegbar sein", () => {
    // Eine Unterkategorie ist definitionsgemaess Teil einer Stoerung.
    expect(guarantees).toContain("availableCategories: z.array(z.enum(MAIN_CATEGORIES)).min(1)");
  });

  it("ein Vertrag ohne Park wird beim Erfassen abgewiesen", () => {
    // Sonst steht die Garantie im System und niemand versteht, warum sie
    // nichts liefert.
    expect(guarantees).toContain("keinem Park zugeordnet");
  });

  it("ein Zeitraum ausserhalb der Garantielaufzeit wird abgewiesen", () => {
    expect(settlements).toContain("beginnt vor der Laufzeit der Garantie");
    expect(settlements).toContain("endet nach der Laufzeit der Garantie");
  });

  it("ein zweiter Abgleich fuer denselben Zeitraum wird abgewiesen", () => {
    expect(settlements).toContain("bereits einen Abgleich");
  });

  it("auch ein nicht berechenbarer Abgleich wird festgehalten", () => {
    // So bleibt sichtbar, dass geprueft wurde und warum kein Ergebnis
    // vorliegt, statt dass die Pruefung spurlos bleibt.
    expect(settlements).toContain('reason: result.reason ?? "nicht berechenbar"');
  });

  it("die Abweichung zur Herstellermeldung wird serverseitig gerechnet", () => {
    expect(settlements).toContain("vendorDeviation");
  });

  it("Bestaetigen ist ein eigenes Recht", () => {
    // Rechnen darf, wer die Technik kennt; Festschreiben, wer die Forderung
    // verantwortet.
    expect(settlementDetail).toContain("PERMISSIONS.AVAILABILITY_CONFIRM");
    expect(settlementDetail).toContain("PERMISSIONS.AVAILABILITY_SETTLE");
    expect(settlementDetail).toContain("const wantsConfirm = data.status === \"CONFIRMED\"");
  });

  it("ein Abgleich ohne Ergebnis laesst sich nicht bestaetigen", () => {
    expect(settlementDetail).toContain("existing.actualAvailabilityPct === null");
  });

  it("ein abgerechneter Abgleich faellt nicht zurueck auf Entwurf", () => {
    // Die Rechnung stuende sonst ohne Grundlage da.
    expect(settlementDetail).toContain('existing.status === "INVOICED"');
  });

  it("der Bestaetigungszeitpunkt wird nur einmal gesetzt", () => {
    expect(settlementDetail).toContain("existing.confirmedAt === null");
  });
});

// ---------------------------------------------------------------------------
// Rechte
// ---------------------------------------------------------------------------

describe("Rechte", () => {
  it("die vier Rechte stehen im Katalog", () => {
    const catalog = src("lib/auth/permissions.catalog.ts");
    for (const name of [
      "availability:read",
      "availability:manage",
      "availability:settle",
      "availability:confirm",
    ]) {
      expect(catalog, name).toContain(`name: "${name}"`);
    }
  });
});
