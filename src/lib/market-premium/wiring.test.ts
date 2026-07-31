/**
 * B1 (Audit 2026-07): Marktpraemie — Verdrahtung.
 *
 * Die Rechenregeln stehen in premium.test.ts. Hier geht es um die Stellen, an
 * denen aus einer Datenluecke eine Zahl wuerde.
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

  it("die stuendliche Reihe ist mandantenuebergreifend", () => {
    // Der Boersenpreis ist fuer alle derselbe. Ihn je Mandant zu fuehren
    // ermoeglichte Abweichungen, die es nicht geben kann.
    const body = model("HourlySpotPrice");
    expect(body).not.toContain("tenantId");
    expect(body).toContain("@@unique([biddingZone, hour, source])");
  });

  it("das Monatsaggregat bleibt bestehen", () => {
    // `market_prices` wird nicht ersetzt, die Reihe steht daneben.
    expect(schema).toContain("model MarketPrice {");
  });

  it("der Korrekturfaktor ist ein FELD, keine Ableitung", () => {
    // Die Stuetzstellentabelle aus Anlage 2 EEG hat sich mit jeder Novelle
    // geaendert; ein falscher Faktor verschoebe jede Praemie um wenige
    // Prozent, ohne aufzufallen.
    expect(model("RegulatoryProfile")).toContain("correctionFactor Decimal?");
  });

  it("die § 51-Schwelle ist ein FELD", () => {
    expect(model("RegulatoryProfile")).toContain("negativePriceThresholdHours Int");
  });

  it("die Rechnungsgrundlagen werden mitgespeichert", () => {
    // Der Monatsmarktwert wird nachtraeglich korrigiert; eine abgerechnete
    // Praemie darf sich nicht rueckwirkend verschieben.
    const body = model("MarketPremiumCalculation");
    expect(body).toContain("awardValueCtPerKwh  Decimal?");
    expect(body).toContain("correctionFactor    Decimal?");
    expect(body).toContain("marketValueCtPerKwh Decimal?");
    expect(body).toContain("negativeThresholdHours Int");
  });

  it("ein Ergebnis je Anlage und Monat", () => {
    expect(model("MarketPremiumCalculation")).toContain("@@unique([turbineId, year, month])");
  });
});

describe("Import der Preisreihe", () => {
  const route = src("app/api/energy/spot-prices/route.ts");

  it("ueberschreibt vorhandene Stunden NICHT", () => {
    // Jede doppelte negative Stunde verdoppelte den entfallenden Anspruch.
    expect(route).toContain("skipDuplicates: true");
    expect(route).toContain("NICHT überschrieben");
  });

  it("normiert auf die volle Stunde", () => {
    // Minutenanteile unterliefen den Unique-Index.
    expect(route).toContain("setUTCMinutes(0, 0, 0)");
  });

  it("meldet eine unvollstaendige Reihe MIT der Folge", () => {
    // In einer Luecke koennte ein zusammenhaengender negativer Zeitraum
    // liegen.
    expect(route).toContain("zu niedrig berechnet");
  });

  it("sagt bei leerer Reihe, dass die Stunden unbekannt und nicht null sind", () => {
    expect(route).toContain("nicht null, sondern unbekannt");
  });
});

describe("Berechnung", () => {
  const route = src("app/api/energy/market-premium/route.ts");

  it("ohne Preisreihe wird kein Ergebnis mit 0 Stunden gebaut", () => {
    expect(route).toContain("prices.length > 0 ? findNegativePriceHours(prices, threshold) : null");
  });

  it("die stuendliche Erzeugung wird NICHT geschaetzt", () => {
    // Monatsmenge geteilt durch Stunden wuerde in einer Flautestunde einen
    // Anspruch abziehen, den es nie gab.
    expect(route).toContain("productionInNegativeHoursKwh: null");
    expect(route).toContain("Flautestunde");
  });

  it("eine vorhandene Berechnung wird nicht still ersetzt", () => {
    expect(route).toContain("existing && !data.overwrite");
  });

  it("der fehlende Monatsmarktwert wird gemeldet", () => {
    expect(route).toContain("wird nicht geschätzt");
  });

  it("die Luecke beim entfallenden Anspruch wird ausgesprochen", () => {
    // Sie zu verschweigen waere schlimmer als sie zu haben.
    expect(route).toContain("Die Stundenzahl steht, der Betrag nicht");
  });
});

describe("Migration", () => {
  const sql = read("prisma/migrations/manual/market_premium.sql");

  it("laesst das Monatsaggregat unberuehrt", () => {
    expect(sql).not.toMatch(/DROP\s+TABLE\s+"?market_prices"?/i);
    expect(sql).toContain("bleibt UNVERAENDERT bestehen");
  });

  it("importiert keine Preise", () => {
    expect(sql).not.toMatch(/INSERT\s+INTO\s+"?hourly_spot_prices"?/i);
  });

  it("die Vorbelegung der Schwelle ist als solche benannt", () => {
    expect(sql).toContain("VORBELEGUNG, keine Rechtsauskunft");
  });

  it("laeuft in einer Transaktion", () => {
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("COMMIT;");
  });
});
