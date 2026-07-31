/**
 * B6 (Audit 2026-07): Zeichnung + GwG — Verdrahtung.
 *
 * Die Rechenregeln stehen in subscription.test.ts. Hier geht es um die eine
 * Stelle, an der das System Nein sagen MUSS, und um die Nachweise, die nicht
 * verlorengehen duerfen.
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

describe("Die Annahme ist gesperrt, nicht bewarnt", () => {
  const route = src("app/api/subscriptions/[id]/route.ts");

  it("ohne Legitimation wird die Annahme abgewiesen", () => {
    // Nach § 10 Abs. 1 Nr. 1 i.V.m. § 11 Abs. 1 GwG ist vor Begruendung der
    // Geschaeftsbeziehung zu identifizieren. Die Annahme IST die Begruendung.
    expect(route).toContain("if (!acceptance.canAccept)");
    expect(route).toContain('apiError("CONFLICT", 409');
  });

  it("die Sperre steht im Rechenkern, nicht nur in der Route", () => {
    const lib = src("lib/subscriptions/subscription.ts");
    expect(lib).toContain("§ 10 Abs. 1 Nr. 1, § 11 Abs. 1 GwG");
    expect(lib).toContain("blockers.push(");
  });

  it("die Oberflaeche sperrt den Knopf mit Begruendung", () => {
    const card = src("components/funds/subscriptions-card.tsx");
    expect(card).toContain("!subscription.acceptance.canAccept");
    expect(card).toContain("subscription.acceptance.blockers.join");
  });
});

describe("Was NICHT geloescht oder ueberschrieben wird", () => {
  it("der Widerruf setzt Status und Grund, er loescht nichts", () => {
    const route = src("app/api/subscriptions/[id]/route.ts");
    expect(route).not.toContain("subscription.delete");
    expect(route).toContain('status: "WITHDRAWN"');
    expect(route).toContain("withdrawalReason");
  });

  it("jede GwG-Pruefung ist ein eigener Datensatz", () => {
    // Am Stammsatz zu ueberschreiben wuerde genau den Nachweis vernichten,
    // fuer den die Aufbewahrungspflicht besteht.
    const route = src("app/api/aml-checks/route.ts");
    expect(route).toContain("prisma.amlCheck.create");
    expect(route).not.toContain("amlCheck.update");
    expect(route).not.toContain("prisma.person.update");
  });

  it("der massgebliche Stand ist die JUENGSTE Pruefung", () => {
    const route = src("app/api/subscriptions/route.ts");
    expect(route).toContain("b.createdAt.getTime() - a.createdAt.getTime()");
  });
});

describe("Datenmodell", () => {
  const schema = read("prisma/schema.prisma");

  function model(name: string): string {
    const start = schema.indexOf(`model ${name} {`);
    expect(start, name).toBeGreaterThan(-1);
    return schema.slice(start, schema.indexOf("\n}", start));
  }

  it("die Widerrufsbelehrung ist ein eigenes DATUM, kein Haken", () => {
    // Ohne sie laeuft die Frist nicht an (§ 356 Abs. 3 S. 1 BGB).
    expect(model("Subscription")).toContain("withdrawalInstructionAt DateTime?");
  });

  it("das Agio steht am Zeichnungsschein", () => {
    expect(model("Subscription")).toContain("agioPercent Decimal");
  });

  it("die Aufbewahrungsfrist wird mitgefuehrt", () => {
    // Damit nicht zu frueh geloescht wird — und nicht zu spaet.
    expect(model("AmlCheck")).toContain("retentionUntil DateTime?");
  });

  it("PEP und wirtschaftlich Berechtigter sind eigene Felder", () => {
    const body = model("AmlCheck");
    expect(body).toContain("isPep     Boolean");
    expect(body).toContain("beneficialOwnerVerified Boolean");
  });

  it("die Wiedervorlageliste ist indiziert", () => {
    expect(model("AmlCheck")).toContain("@@index([tenantId, status, nextReviewAt])");
  });
});

describe("Einzahlung", () => {
  const route = src("app/api/subscriptions/[id]/route.ts");

  it("PAID setzt nur, wer auch angenommen ist", () => {
    // Eine bezahlte, aber nicht angenommene Zeichnung ist kein Gesellschafter
    // — das Geld liegt treuhaenderisch.
    expect(route).toContain('payment.isSettled && subscription.status === "ACCEPTED"');
    expect(route).toContain("nicht als Einlage vereinnahmt");
  });

  it("ein Widerruf nach Fristablauf wird erfasst, nicht abgewiesen", () => {
    // Ob er wirksam ist, entscheidet nicht diese Software.
    expect(route).toContain("rechtlich zu prüfen");
  });
});

describe("Legitimationsroute", () => {
  const route = src("app/api/aml-checks/route.ts");

  it("abgeschlossen ohne Datum wird abgewiesen", () => {
    // Der Zeitpunkt gehoert zum Nachweis (§ 8 Abs. 1 GwG).
    expect(route).toContain('data.status === "VERIFIED" && !identifiedAt');
  });

  it("die Wiedervorlage wird vorbelegt und als Vorbelegung benannt", () => {
    // Das GwG nennt keine festen Intervalle.
    expect(route).toContain("REVIEW_INTERVAL_YEARS");
    expect(route).toContain("nennt keine festen Intervalle");
  });

  it("die Aufbewahrungsfrist wird gemeldet", () => {
    expect(route).toContain("§ 8 Abs. 4 S. 1 GwG");
  });
});

describe("Migration", () => {
  const sql = read("prisma/migrations/manual/subscriptions_aml.sql");

  it("legt keine erfundene Identifizierung an", () => {
    // Eine erfundene Identifizierung waere schlimmer als eine fehlende — sie
    // saehe aus wie ein Nachweis und waere keiner.
    expect(sql).not.toMatch(/INSERT\s+INTO\s+"?aml_checks"?/i);
    expect(sql).not.toMatch(/INSERT\s+INTO\s+"?subscriptions"?/i);
    expect(sql).toContain("Kein Backfill");
  });

  it("laeuft in einer Transaktion", () => {
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("COMMIT;");
  });
});
