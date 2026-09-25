/**
 * Kennzahlen als eine schmale Zeile (UX-Durchsicht, Punkt 12).
 *
 * Vier gerahmte Karten kosteten vor jeder Liste rund 180 px und zeigten oft
 * Nullen. Jetzt eine Zeile; klickbar nur, was ein Ziel hat.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const lies = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8");

describe("Kennzahlzeile", () => {
  const bauteil = lies("components/ui/stats-cards.tsx");

  it("rendert keine Karten mehr, sondern eine Zeile", () => {
    expect(bauteil).not.toContain("<Card");
    expect(bauteil).toContain("flex flex-wrap");
  });

  it("die Pachtliste zeigt keine Jahrespacht, die es am Vertrag nicht gibt", () => {
    // Lease hat kein Feld annualRent — Spalte und Kennzahl zeigten immer "-" bzw. 0,00 €.
    expect(lies("app/(dashboard)/leases/page.tsx")).not.toContain("annualRent");
  });

  it("'Laufen aus' filtert die Liste", () => {
    expect(lies("app/(dashboard)/leases/page.tsx")).toContain('onClick: expiringLeases.length > 0 ? () => setStatusFilter("EXPIRING")');
  });
});
