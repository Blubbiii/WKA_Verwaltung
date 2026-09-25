/**
 * Musterrechnung für die Briefpapier-Vorschau.
 *
 * Die Vorschau im Briefpapier rief eine Route, die es nie gab. Sie zeigt jetzt
 * eine Musterrechnung mit genau diesem Briefpapier — und die soll in sich
 * stimmen, sonst sieht die Vorlage fehlerhaft aus, obwohl sie es nicht ist.
 */

import { describe, expect, it } from "vitest";
import { musterRechnung } from "./muster-rechnung";

describe("musterRechnung", () => {
  const m = musterRechnung(new Date(2026, 8, 25));

  it("Positionen: Netto + Steuer = Brutto", () => {
    for (const p of m.items) {
      expect(Math.round((p.netAmount + p.taxAmount) * 100) / 100).toBe(p.grossAmount);
      expect(Math.round(p.quantity * p.unitPrice * 100) / 100).toBe(p.netAmount);
    }
  });

  it("Summe entspricht den Positionen (von Hand: 1.500,00 + 285,00 = 1.785,00)", () => {
    expect(m.netAmount).toBe(1500);
    expect(m.taxAmount).toBe(285);
    expect(m.grossAmount).toBe(1785);
  });

  it("ist als Muster erkennbar und fällig 30 Tage nach dem Datum", () => {
    expect(m.invoiceNumber).toMatch(/MUSTER/);
    expect(m.recipientName).toMatch(/Muster/);
    expect(m.dueDate?.toISOString().slice(0, 10)).toBe(new Date(2026, 9, 25).toISOString().slice(0, 10));
  });
});
