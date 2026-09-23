/**
 * „Der" Mandant — nur, wenn es genau einen gibt.
 *
 * Mehrere Stellen fielen ohne ausdrückliche Zuordnung auf den erstbesten
 * aktiven Mandanten zurück. Bei einer Einzelinstallation ist das richtig. Bei
 * mehreren Mandanten landete so etwa eine eingehende Rechnung von Firma B im
 * Posteingang von Firma A.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { tenant: { findMany: (...a: unknown[]) => findMany(...a) } },
}));

import { eindeutigerAktiverMandant } from "./eindeutiger-mandant";

beforeEach(() => findMany.mockReset());

describe("eindeutigerAktiverMandant", () => {
  it("liefert den Mandanten, wenn es genau einen aktiven gibt", async () => {
    findMany.mockResolvedValue([{ id: "t1" }]);
    expect(await eindeutigerAktiverMandant()).toEqual({ id: "t1" });
  });

  it("liefert nichts, wenn es mehrere gibt — statt einen zu raten", async () => {
    findMany.mockResolvedValue([{ id: "t1" }, { id: "t2" }]);
    expect(await eindeutigerAktiverMandant()).toBeNull();
  });

  it("liefert nichts ohne aktiven Mandanten", async () => {
    findMany.mockResolvedValue([]);
    expect(await eindeutigerAktiverMandant()).toBeNull();
  });

  it("fragt nur aktive Mandanten ab und höchstens zwei", async () => {
    // Zwei genügen für die Frage „genau einer?"; mehr zu laden wäre Verschwendung.
    findMany.mockResolvedValue([{ id: "t1" }]);
    await eindeutigerAktiverMandant();
    const args = findMany.mock.calls[0][0];
    expect(args.where).toEqual({ status: "ACTIVE" });
    expect(args.take).toBe(2);
  });
});
