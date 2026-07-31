/**
 * A5 (Audit 2026-07): Mehrere Verpächter — Verdrahtung.
 *
 * Die Rechenregeln stehen in share-split.test.ts. Hier geht es um die eine
 * Frage, die bei einem Eingriff in eine gerade auditierte Engine zählt:
 * **rechnen Bestandsverträge unverändert weiter?**
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveSharesFrom } from "./resolve-shares";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf-8");
}

function src(relativePath: string): string {
  return read(join("src", relativePath));
}

// ---------------------------------------------------------------------------
// Der Rückfall
// ---------------------------------------------------------------------------

describe("Bestandsvertraege rechnen unveraendert", () => {
  it("ohne erfasste Anteile gilt der eine Verpaechter zu 100 Prozent", () => {
    const resolved = resolveSharesFrom({ lessorId: "person-1" });
    expect(resolved?.source).toBe("SINGLE_LESSOR_FALLBACK");
    expect(resolved?.shares).toEqual([
      { personId: "person-1", sharePercent: 100, validFrom: null, validTo: null },
    ]);
  });

  it("eine leere Anteilsliste zaehlt wie keine", () => {
    const resolved = resolveSharesFrom({ lessorId: "person-1", lessorShares: [] });
    expect(resolved?.source).toBe("SINGLE_LESSOR_FALLBACK");
  });

  it("erfasste Anteile haben Vorrang", () => {
    const resolved = resolveSharesFrom({
      lessorId: "person-1",
      lessorShares: [
        { personId: "a", sharePercent: 60, validFrom: null, validTo: null },
        { personId: "b", sharePercent: 40, validFrom: null, validTo: null },
      ],
    });
    expect(resolved?.source).toBe("LEASE_LESSORS");
    expect(resolved?.shares).toHaveLength(2);
  });

  it("ein Vertrag ganz ohne Verpaechter ergibt null, keine Annahme", () => {
    // Das ist ein Datenfehler und kein Fall fuer eine stille Annahme.
    expect(resolveSharesFrom({ lessorId: null })).toBeNull();
  });

  it("die Herkunft wird ausgewiesen", () => {
    // Sie gehoert in jede Herleitung — sonst ist nicht erkennbar, ob eine
    // Position aus erfassten Quoten oder aus dem Rueckfall stammt.
    const withShares = resolveSharesFrom({
      lessorId: "x",
      lessorShares: [{ personId: "a", sharePercent: 100, validFrom: null, validTo: null }],
    });
    expect(withShares?.source).toBe("LEASE_LESSORS");
  });
});

// ---------------------------------------------------------------------------
// Der Eingriff in die Engine
// ---------------------------------------------------------------------------

describe("Settlement-Engine", () => {
  const calculator = src("lib/lease-revenue/calculator.ts");

  it("die Position bleibt EINE je Vertrag", () => {
    // Waere sie je Miteigentuemer vervielfacht worden, kaeme der je Vertrag
    // nachgeschlagene Vorschuss n-fach in Abzug — stillschweigend, weil die
    // Summen je Vertrag weiterhin plausibel aussaehen.
    expect(calculator).toContain("const createdItem = await tx.leaseRevenueSettlementItem.create");
    expect(calculator).toContain("advancePerLease.get(item.leaseId)");
  });

  it("die Aufteilung ist additiv", () => {
    expect(calculator).toContain("writeLessorAllocations(tx, {");
    expect(calculator).toContain("tx.leaseRevenueSettlementItemLessor.create");
  });

  it("unschluessige Anteile fuehren zu KEINER Aufteilung", () => {
    // Eine halbe Verteilung waere schlimmer als keine — sie saehe nach einer
    // Zahlung aus.
    expect(calculator).toContain("Verpächteranteile unschlüssig — keine Aufteilung geschrieben");
  });

  it("ein Vertrag ohne Verpaechter wird protokolliert statt geraten", () => {
    expect(calculator).toContain("Pachtvertrag ohne Verpächter — keine Aufteilung geschrieben");
  });

  it("der steuerliche Anteil wird mitgeteilt", () => {
    // Jeder Miteigentuemer ist ein eigenes Umsatzsteuersubjekt; ohne getrennte
    // Betraege liesse sich die Gutschrift nicht korrekt ausweisen.
    expect(calculator).toContain("taxableAmountEur: new Decimal(round2(args.taxableAmountEur * factor))");
  });

  it("die Anteile werden mitgeladen", () => {
    expect(calculator).toContain("lessorShares: {");
  });
});

// ---------------------------------------------------------------------------
// Datenmodell
// ---------------------------------------------------------------------------

describe("Datenmodell", () => {
  const schema = read("prisma/schema.prisma");

  it("der Anteil hat Quote UND Gueltigkeitszeitraum", () => {
    const model = schema.slice(schema.indexOf("model LeaseLessor {"));
    const body = model.slice(0, model.indexOf("\n}"));
    expect(body).toContain("sharePercent Decimal @db.Decimal(7, 4)");
    expect(body).toContain("validFrom DateTime?");
    expect(body).toContain("validTo DateTime?");
  });

  it("eine Person kann eine abweichende Bankverbindung am Anteil haben", () => {
    // Bei einer Erbengemeinschaft mit Nachlasskonto ist das Konto aus dem
    // Person-Stammsatz das falsche.
    const model = schema.slice(schema.indexOf("model LeaseLessor {"));
    expect(model.slice(0, model.indexOf("\n}"))).toContain("bankIban String?");
  });

  it("ein beteiligter Verpaechter laesst sich nicht mitloeschen", () => {
    // Eine Person, die an einer abgerechneten Periode beteiligt war, darf
    // nicht mitsamt ihrem Anteil verschwinden.
    const model = schema.slice(schema.indexOf("model LeaseLessor {"));
    expect(model.slice(0, model.indexOf("\n}"))).toContain("onDelete: Restrict");
  });

  it("Lease.lessorId bleibt bestehen", () => {
    // Der Rueckfall haengt daran. Es gibt bewusst KEINEN Backfill.
    const model = schema.slice(schema.indexOf("model Lease {"));
    expect(model.slice(0, model.indexOf("\n}"))).toContain("lessorId");
  });

  it("die Migration verzichtet ausdruecklich auf einen Backfill", () => {
    const migration = read("prisma/migrations/manual/lease_lessors.sql");
    expect(migration).toContain("KEIN BACKFILL");
  });

  it("die Aufteilung fuehrt den wirksamen Anteil und die Tage", () => {
    const model = schema.slice(schema.indexOf("model LeaseRevenueSettlementItemLessor {"));
    const body = model.slice(0, model.indexOf("\n}"));
    expect(body).toContain("effectiveSharePercent");
    expect(body).toContain("days Int");
  });
});

// ---------------------------------------------------------------------------
// Anschluss an F1 und F2
// ---------------------------------------------------------------------------

describe("Anschluss an die Findings F1 und F2", () => {
  it("beide Stellen teilen weiterhin nach Kopfzahl — mit TODO auf die Quote", () => {
    // Die Flaechenteilung eines Flurstuecks unter MEHREREN VERTRAEGEN ist ein
    // anderes Problem als die Anteile INNERHALB eines Vertrags. A5 loest das
    // zweite; das erste braucht `LeasePlot.sharePercent` und bleibt offen.
    const leaseRevenue = src("lib/lease-revenue/calculator.ts");
    const settlement = src("lib/settlement/calculator.ts");
    expect(leaseRevenue).toContain("TODO(schema): `LeasePlot.sharePercent");
    expect(settlement).toContain("TODO(schema): `LeasePlot.sharePercent");
  });
});
