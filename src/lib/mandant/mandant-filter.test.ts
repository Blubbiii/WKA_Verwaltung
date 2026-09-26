import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MANDANT_MODELLE, INDIREKTE_MODELLE, mandantFilter, fehltMandant } from "./mandant-filter";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";

describe("Mandanten-Tabellen: die Liste passt zum Schema", () => {
  it("jede Tabelle mit Pflichtfeld tenantId steht drin — und nur diese", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const erwartet = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)]
      .filter(([, , body]) => /^\s+tenantId\s+String\s/m.test(body))
      .map(([, name]) => name)
      .sort();
    expect([...MANDANT_MODELLE].sort()).toEqual(erwartet);
  });
});

describe("Mandanten-Filter: Lesen", () => {
  it("ohne Filter: nur der Mandant", () => {
    expect(mandantFilter("Park", "findMany", {}, A)).toEqual({ where: { tenantId: A } });
  });

  it("mit Filter: beides muss gelten — ein fremder Mandant im Filter hebt nichts auf", () => {
    const args = { where: { tenantId: B, name: "X" }, take: 5 };
    expect(mandantFilter("Park", "findMany", args, A)).toEqual({
      where: { tenantId: B, name: "X", AND: [{ tenantId: A }] },
      take: 5,
    });
  });

  it("vorhandene Bedingungen bleiben oben stehen — die Soft-Delete-Erweiterung sucht deletedAt dort", () => {
    const args = { where: { deletedAt: { not: null }, AND: [{ name: "X" }] } };
    expect(mandantFilter("Park", "findMany", args, A).where).toEqual({
      deletedAt: { not: null },
      AND: [{ name: "X" }, { tenantId: A }],
    });
  });

  it("gilt für Zählen, Summieren, Gruppieren und Massenänderung", () => {
    for (const op of ["count", "aggregate", "groupBy", "findFirst", "updateMany", "deleteMany"]) {
      expect(mandantFilter("Invoice", op, { where: { status: "PAID" } }, A).where, op).toEqual({
        status: "PAID",
        AND: [{ tenantId: A }],
      });
    }
  });

  it("Abfragen per ID bekommen den Mandanten dazu (Ändern und Löschen eingeschlossen)", () => {
    for (const op of ["findUnique", "findUniqueOrThrow", "update", "delete"]) {
      expect(mandantFilter("Park", op, { where: { id: "p1" } }, A).where, op).toEqual({
        id: "p1",
        AND: [{ tenantId: A }],
      });
    }
  });
});

describe("Mandanten-Filter: Anlegen", () => {
  it("ohne Mandant wird er gesetzt", () => {
    expect(mandantFilter("Park", "create", { data: { name: "P" } }, A)).toEqual({ data: { name: "P", tenantId: A } });
  });

  it("mit dem eigenen Mandanten bleibt es, wie es ist", () => {
    expect(mandantFilter("Park", "create", { data: { name: "P", tenantId: A } }, A).data).toEqual({ name: "P", tenantId: A });
  });

  it("ein fremder Mandant ist ein Fehler, kein stilles Überschreiben", () => {
    expect(() => mandantFilter("Park", "create", { data: { name: "P", tenantId: B } }, A)).toThrow(/Mandant/);
  });

  it("createMany setzt jeden Datensatz; upsert filtert und setzt", () => {
    expect(mandantFilter("Park", "createMany", { data: [{ name: "1" }, { name: "2" }] }, A).data).toEqual([
      { name: "1", tenantId: A },
      { name: "2", tenantId: A },
    ]);
    const upsert = mandantFilter("Park", "upsert", { where: { id: "p1" }, create: { name: "P" }, update: { name: "Q" } }, A);
    expect(upsert.where).toEqual({ id: "p1", AND: [{ tenantId: A }] });
    expect(upsert.create).toEqual({ name: "P", tenantId: A });
  });

  it("über die Relation angelegt (tenant: { connect }) bleibt unangetastet", () => {
    const args = { data: { name: "P", tenant: { connect: { id: A } } } };
    expect(mandantFilter("Park", "create", args, A)).toEqual(args);
  });
});

describe("Mandanten-Filter: indirekte Tabellen und fremde", () => {
  it("eine Anlage hängt über den Park am Mandanten", () => {
    expect(INDIREKTE_MODELLE.Turbine(A)).toEqual({ park: { tenantId: A } });
    expect(mandantFilter("Turbine", "findMany", { where: { deviceType: "WEA" } }, A).where).toEqual({
      deviceType: "WEA",
      AND: [{ park: { tenantId: A } }],
    });
  });

  it("Tabellen ohne Mandantenbezug bleiben unverändert", () => {
    const args = { where: { key: "x" } };
    expect(mandantFilter("Permission", "findMany", args, A)).toBe(args);
  });
});

describe("Beobachtung: fehlt der Mandant im Filter?", () => {
  it("findet tenantId auch verschachtelt und in AND/OR", () => {
    expect(fehltMandant("Park", "findMany", { where: { tenantId: A } })).toBe(false);
    expect(fehltMandant("Park", "findMany", { where: { AND: [{ name: "x" }, { tenantId: A }] } })).toBe(false);
    expect(fehltMandant("Invoice", "findMany", { where: { fund: { tenantId: A } } })).toBe(false);
  });

  it("meldet Lesen und Ändern ohne Mandant, nicht aber Anlegen oder fremde Tabellen", () => {
    expect(fehltMandant("Park", "findMany", {})).toBe(true);
    expect(fehltMandant("Park", "update", { where: { id: "p1" }, data: {} })).toBe(true);
    expect(fehltMandant("Park", "create", { data: { name: "P" } })).toBe(false);
    expect(fehltMandant("Permission", "findMany", {})).toBe(false);
  });
});
