/**
 * A3 (Audit 2026-07): Zählpunkt und Abrechnungsprüfung — Verdrahtung.
 *
 * Die Regeln stehen in reconciliation.test.ts. Hier geht es um die Stellen, an
 * denen eine fehlende Zahl als „in Ordnung" durchginge oder eine Abrechnung
 * dem falschen Park zugeordnet würde.
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

// ---------------------------------------------------------------------------
// Der fehlende Zuordnungsschlüssel
// ---------------------------------------------------------------------------

describe("Zaehlpunkt — der Schluessel, den es nicht gab", () => {
  const schema = read("prisma/schema.prisma");
  const model = schema.slice(schema.indexOf("model MeteringPoint {"));
  const body = model.slice(0, model.indexOf("\n}"));
  const route = src("app/api/energy/metering-points/route.ts");

  it("es gibt beide Arten von Kennung", () => {
    // Marktlokation = bilanzieller Ort, Messlokation = Ort der Messung. Eine
    // MaLo kann mehrere MeLo haben; beides gehoert erfasst.
    expect(schema).toContain("MARKTLOKATION");
    expect(schema).toContain("MESSLOKATION");
  });

  it("eine Kennung ist je Mandant eindeutig", () => {
    // Zwei Datensaetze mit derselben MaLo wuerden eine Abrechnung zwei Parks
    // zuordnen — der Abgleich waere dann beliebig.
    expect(body).toContain("@@unique([tenantId, code])");
  });

  it("die Route weist eine doppelte Kennung ab", () => {
    expect(route).toContain("bereits einem Zählpunkt zugeordnet");
  });

  it("die Kennung wird normalisiert gespeichert", () => {
    // Leerzeichen und Kleinschreibung aus einer Abrechnung wuerden sonst zu
    // einem zweiten Datensatz derselben Lokation fuehren.
    expect(route).toContain('data.code.replace(/\\s/g, "").toUpperCase()');
  });

  it("die Form wird geprueft, die Pruefziffer nicht", () => {
    // Bestandsdaten enthalten regelmaessig historische Kennungen, die das
    // Pruefziffernverfahren nicht erfuellen.
    expect(route).toContain("besteht aus 11 Ziffern");
    expect(route).toContain("Geprüft wird die Form, nicht die Prüfziffer");
  });

  it("eine Anlage muss zum angegebenen Park gehoeren", () => {
    // Sonst zoege der Abgleich die SCADA-Daten eines fremden Parks heran.
    expect(route).toContain("gehört nicht zum angegebenen Park");
  });
});

// ---------------------------------------------------------------------------
// Der Abgleich
// ---------------------------------------------------------------------------

describe("Abgleichsdienst", () => {
  const service = src("lib/settlement-check/check-service.ts");

  it("die SCADA-Menge kommt aus dem Zaehlwerk, nicht aus der Integration", () => {
    // Der Netzbetreiber rechnet ebenfalls mit Zaehlerstaenden; eine
    // Integration ueber die Leistung schleppt bei jeder Datenluecke einen
    // Fehler ein.
    expect(service).toContain('cumulativeEnergyWh');
    expect(service).toContain('source: "METER_READING"');
  });

  it("der Ausweichweg wird als solcher gekennzeichnet", () => {
    // Eine Zahl aus einer anderen Quelle darf nicht so aussehen wie eine aus
    // der erwarteten.
    expect(service).toContain('source: "POWER_INTEGRATION"');
    expect(service).toContain("ungenauer als der Zählerstand");
  });

  it("nicht erfasste Produktion ergibt null, nicht 0", () => {
    // Eine 0 wuerde im Abgleich als "nichts produziert" gelesen und eine
    // dramatische Abweichung erzeugen, obwohl nur die Daten fehlen.
    expect(service).toContain("if (rows._count === 0) return null;");
  });

  it("fuer ein ganzes Jahr wird kein Satz gemittelt", () => {
    // Die Monate haben unterschiedliche Mengen; ein ungewichtetes Mittel
    // waere schlicht falsch.
    expect(service).toContain("if (month === null)");
    expect(service).toContain("ungewichtetes Mittel wäre schlicht falsch");
  });

  it("das Zeitfenster ist UTC", () => {
    // Eine lokale Grenze verschoebe den Monatsanfang um zwei Stunden und zoege
    // Werte des Vormonats herein.
    expect(service).toContain("Date.UTC(year, month - 1, 1)");
  });
});

describe("Abgleichsroute", () => {
  const route = src("app/api/energy/settlements/[id]/check/route.ts");
  const schema = read("prisma/schema.prisma");

  it("jeder Lauf wird als eigener Datensatz festgehalten", () => {
    // SCADA-Daten koennen nachgeliefert werden; eine nachgerechnete Zahl
    // stimmt dann nicht mehr mit der ueberein, die beim Reklamieren vorlag.
    expect(route).toContain("prisma.settlementCheck.create");
  });

  it("die verglichenen Werte werden mitgespeichert", () => {
    const model = schema.slice(schema.indexOf("model SettlementCheck {"));
    const body = model.slice(0, model.indexOf("\n}"));
    expect(body).toContain("settledKwh");
    expect(body).toContain("scadaKwh");
    expect(body).toContain("reportedKwh");
  });

  it("die angewandten Toleranzen werden mitgespeichert", () => {
    // Ohne sie laesst sich ein alter Befund nicht mehr nachvollziehen.
    expect(route).toContain("tolerances: {");
  });

  it("die Herkunft der SCADA-Menge geht an den Bearbeiter zurueck", () => {
    expect(route).toContain("scadaSource: sources.scadaSource");
    expect(route).toContain("sourceNotes: sources.notes");
  });

  it("die Pruefung hat ein eigenes Recht", () => {
    expect(route).toContain("PERMISSIONS.ENERGY_SETTLEMENT_CHECK");
  });
});

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

describe("Abrechnungsimport", () => {
  const route = src("app/api/energy/settlements/import/route.ts");

  it("die Zuordnung laeuft ueber den Zaehlpunkt", () => {
    // Genau dafuer gibt es ihn — er steht in der Abrechnung.
    expect(route).toContain("meteringCode");
    expect(route).toContain("parkByCode");
  });

  it("ein unbekannter Zaehlpunkt wird gemeldet, nicht geraten", () => {
    expect(route).toContain("keinem Park zugeordnet");
  });

  it("Betraege werden mit dem gemeinsamen Parser gelesen", () => {
    // "1.234,56" wuerde parseFloat als 1.234 lesen.
    expect(route).toContain('from "@/lib/parse-amount"');
  });

  it("bestehende Abrechnungen werden NICHT ueberschrieben", () => {
    // Eine verteilte Abrechnung ist Grundlage von Pachtabrechnungen und
    // Ausschuettungen; sie still zu ersetzen wuerde die Folgerechnungen
    // unbemerkt ungueltig machen.
    expect(route).toContain("bereits eine Abrechnung — übersprungen");
  });

  it("es gibt einen Probelauf", () => {
    expect(route).toContain("if (dryRun)");
  });

  it("eingelesene Abrechnungen sind Entwuerfe", () => {
    // Sie sind ungeprueft; der Dreiecksabgleich laeuft danach.
    expect(route).toContain('status: "DRAFT"');
  });

  it("die Mandantenbindung der Parks wird geprueft", () => {
    // Ein direkt angegebener parkId kommt vom Client.
    expect(route).toContain("allowedParks");
  });

  it("eine negative Menge wird abgewiesen", () => {
    expect(route).toContain("Negative Menge");
  });
});

// ---------------------------------------------------------------------------
// Rechte
// ---------------------------------------------------------------------------

describe("Rechte", () => {
  it("beide neuen Rechte stehen im Katalog", () => {
    const catalog = src("lib/auth/permissions.catalog.ts");
    expect(catalog).toContain('name: "energy:settlement:check"');
    expect(catalog).toContain('name: "energy:metering-points"');
  });
});
