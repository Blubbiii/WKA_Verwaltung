/**
 * Goldmaster-Tests GewSt-Hinzurechnung §8 Nr 1 GewStG (P17).
 *
 * Deckt:
 *  - Keine Konten markiert → Warning + alles 0
 *  - Pacht unter Freibetrag → 0 Hinzurechnung
 *  - Pacht über Freibetrag → korrekte 25%-Hinzurechnung
 *  - Kombiniert: Schuldzinsen + Pacht + Mieten + Lizenzen
 *  - Negative/0-Aufwand wird ignoriert
 *  - Quoten korrekt angewandt (Nr 1a: 100%, 1d: 20%, 1e: 50%, 1f: 25%)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ledgerAccount: { findMany: vi.fn() },
    journalEntryLine: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  GEWST_FREIBETRAG_EUR,
  GEWST_HINZURECHNUNG_QUOTE,
  GEWST_QUOTES,
  computeGewSt,
} from "./gewerbesteuer";

const mockAccts = prisma.ledgerAccount.findMany as unknown as ReturnType<typeof vi.fn>;
const mockLines = prisma.journalEntryLine.findMany as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockAccts.mockReset();
  mockLines.mockReset();
});

describe("Konstanten + Quoten §8 Nr 1 GewStG", () => {
  it("Freibetrag = 200.000 €", () => {
    expect(GEWST_FREIBETRAG_EUR).toBe(200_000);
  });

  it("Hinzurechnungs-Quote = 25%", () => {
    expect(GEWST_HINZURECHNUNG_QUOTE).toBe(0.25);
  });

  it("Quoten: INTEREST 100%, RENT_MOVABLE 20%, RENT_IMMOVABLE 50%, LICENSE 25%", () => {
    expect(GEWST_QUOTES.INTEREST).toBe(1.0);
    expect(GEWST_QUOTES.RENT_MOVABLE).toBe(0.2);
    expect(GEWST_QUOTES.RENT_IMMOVABLE).toBe(0.5);
    expect(GEWST_QUOTES.LICENSE).toBe(0.25);
  });
});

describe("computeGewSt — Edge-Cases", () => {
  it("Keine Konten markiert → Warning + alles 0", async () => {
    mockAccts.mockResolvedValue([]);
    mockLines.mockResolvedValue([]);

    const r = await computeGewSt("t-1", 2025);
    expect(r.summeBemessung).toBe(0);
    expect(r.hinzurechnungsBetrag).toBe(0);
    expect(r.warnings).toContain(
      "Keine Konten mit gewStAddBackKey markiert — Hinzurechnung kann nicht berechnet werden. Bitte Pacht-/Zins-/Lizenz-Konten kennzeichnen.",
    );
  });

  it("Konto markiert aber kein Aufwand → 0 Bemessung", async () => {
    mockAccts.mockResolvedValue([
      { accountNumber: "4210", name: "Pacht", gewStAddBackKey: "RENT_IMMOVABLE" },
    ]);
    mockLines.mockResolvedValue([]);

    const r = await computeGewSt("t-1", 2025);
    expect(r.summeBemessung).toBe(0);
    expect(r.hinzurechnungsBetrag).toBe(0);
    expect(r.warnings).toHaveLength(0); // Konto IST markiert, also kein Warning
  });
});

describe("computeGewSt — Pacht (Nr 1e, 50%-Quote)", () => {
  it("240.000 € Pacht (Bemessung 120k, unter 200k Freibetrag) → 0 Hinzurechnung", async () => {
    mockAccts.mockResolvedValue([
      { accountNumber: "4210", name: "Pacht Flächen", gewStAddBackKey: "RENT_IMMOVABLE" },
    ]);
    mockLines.mockResolvedValue([
      { account: "4210", debitAmount: 240_000, creditAmount: 0 },
    ]);

    const r = await computeGewSt("t-1", 2025);
    expect(r.lines.find((l) => l.key === "RENT_IMMOVABLE")!.aufwand).toBe(240_000);
    expect(r.lines.find((l) => l.key === "RENT_IMMOVABLE")!.bemessung).toBe(120_000);
    expect(r.summeBemessung).toBe(120_000);
    expect(r.ueberFreibetrag).toBe(0);
    expect(r.hinzurechnungsBetrag).toBe(0);
  });

  it("600.000 € Pacht (Bemessung 300k, 100k über Freibetrag) → 25.000 € Hinzurechnung", async () => {
    mockAccts.mockResolvedValue([
      { accountNumber: "4210", name: "Pacht Flächen", gewStAddBackKey: "RENT_IMMOVABLE" },
    ]);
    mockLines.mockResolvedValue([
      { account: "4210", debitAmount: 600_000, creditAmount: 0 },
    ]);

    const r = await computeGewSt("t-1", 2025);
    expect(r.summeBemessung).toBe(300_000);
    expect(r.ueberFreibetrag).toBe(100_000);
    expect(r.hinzurechnungsBetrag).toBe(25_000); // 100k × 25%
  });

  it("Pacht über mehrere Konten wird saldiert", async () => {
    mockAccts.mockResolvedValue([
      { accountNumber: "4210", name: "Pacht A", gewStAddBackKey: "RENT_IMMOVABLE" },
      { accountNumber: "4211", name: "Pacht B", gewStAddBackKey: "RENT_IMMOVABLE" },
    ]);
    mockLines.mockResolvedValue([
      { account: "4210", debitAmount: 100_000, creditAmount: 0 },
      { account: "4211", debitAmount: 100_000, creditAmount: 0 },
    ]);

    const r = await computeGewSt("t-1", 2025);
    expect(r.lines.find((l) => l.key === "RENT_IMMOVABLE")!.aufwand).toBe(200_000);
    expect(r.contributingAccounts).toHaveLength(2);
  });
});

describe("computeGewSt — Schuldzinsen (Nr 1a, 100%-Quote)", () => {
  it("50.000 € Zinsen → Bemessung 50k, unter Freibetrag → 0 Hinzurechnung", async () => {
    mockAccts.mockResolvedValue([
      { accountNumber: "2110", name: "Schuldzinsen", gewStAddBackKey: "INTEREST" },
    ]);
    mockLines.mockResolvedValue([
      { account: "2110", debitAmount: 50_000, creditAmount: 0 },
    ]);

    const r = await computeGewSt("t-1", 2025);
    expect(r.lines.find((l) => l.key === "INTEREST")!.bemessung).toBe(50_000);
    expect(r.hinzurechnungsBetrag).toBe(0);
  });
});

describe("computeGewSt — Mieten bewegliche WG (Nr 1d, 20%-Quote)", () => {
  it("1.000.000 € Miete → Bemessung 200k = exakt Freibetrag → 0 Hinzurechnung", async () => {
    mockAccts.mockResolvedValue([
      { accountNumber: "4220", name: "Miete Maschinen", gewStAddBackKey: "RENT_MOVABLE" },
    ]);
    mockLines.mockResolvedValue([
      { account: "4220", debitAmount: 1_000_000, creditAmount: 0 },
    ]);

    const r = await computeGewSt("t-1", 2025);
    expect(r.summeBemessung).toBe(200_000);
    expect(r.ueberFreibetrag).toBe(0);
    expect(r.hinzurechnungsBetrag).toBe(0);
  });
});

describe("computeGewSt — Lizenzen (Nr 1f, 25%-Quote)", () => {
  it("800.000 € Lizenz → Bemessung 200k = Freibetrag → 0 Hinzurechnung", async () => {
    mockAccts.mockResolvedValue([
      { accountNumber: "4910", name: "Lizenzen", gewStAddBackKey: "LICENSE" },
    ]);
    mockLines.mockResolvedValue([
      { account: "4910", debitAmount: 800_000, creditAmount: 0 },
    ]);

    const r = await computeGewSt("t-1", 2025);
    expect(r.summeBemessung).toBe(200_000);
    expect(r.hinzurechnungsBetrag).toBe(0);
  });

  it("1.200.000 € Lizenz → Bemessung 300k → 100k über Freibetrag → 25.000 € Hinz", async () => {
    mockAccts.mockResolvedValue([
      { accountNumber: "4910", name: "Lizenzen", gewStAddBackKey: "LICENSE" },
    ]);
    mockLines.mockResolvedValue([
      { account: "4910", debitAmount: 1_200_000, creditAmount: 0 },
    ]);

    const r = await computeGewSt("t-1", 2025);
    expect(r.hinzurechnungsBetrag).toBe(25_000);
  });
});

describe("computeGewSt — Kombiniert (alle 4 Positionen)", () => {
  it("Realistischer Mix: Zinsen 100k + Pacht 300k + Lizenzen 80k → korrekt summiert", async () => {
    mockAccts.mockResolvedValue([
      { accountNumber: "2110", name: "Zinsen", gewStAddBackKey: "INTEREST" },
      { accountNumber: "4210", name: "Pacht", gewStAddBackKey: "RENT_IMMOVABLE" },
      { accountNumber: "4910", name: "Lizenzen", gewStAddBackKey: "LICENSE" },
    ]);
    mockLines.mockResolvedValue([
      { account: "2110", debitAmount: 100_000, creditAmount: 0 },
      { account: "4210", debitAmount: 300_000, creditAmount: 0 },
      { account: "4910", debitAmount: 80_000, creditAmount: 0 },
    ]);

    const r = await computeGewSt("t-1", 2025);
    // Bemessungen: Zinsen 100k (×1.0), Pacht 150k (×0.5), Lizenzen 20k (×0.25)
    // Summe = 270.000 €
    expect(r.summeBemessung).toBe(270_000);
    expect(r.ueberFreibetrag).toBe(70_000);
    expect(r.hinzurechnungsBetrag).toBe(17_500); // 70k × 25%
  });
});

describe("computeGewSt — Negative/Korrektur-Salden", () => {
  it("Korrekturbuchung (Soll - Haben = 0) wird ignoriert", async () => {
    mockAccts.mockResolvedValue([
      { accountNumber: "4210", name: "Pacht", gewStAddBackKey: "RENT_IMMOVABLE" },
    ]);
    mockLines.mockResolvedValue([
      { account: "4210", debitAmount: 100_000, creditAmount: 0 },
      { account: "4210", debitAmount: 0, creditAmount: 100_000 }, // vollständig storniert
    ]);

    const r = await computeGewSt("t-1", 2025);
    expect(r.summeBemessung).toBe(0);
  });

  it("Negativer Saldo wird ignoriert", async () => {
    mockAccts.mockResolvedValue([
      { accountNumber: "4210", name: "Pacht", gewStAddBackKey: "RENT_IMMOVABLE" },
    ]);
    mockLines.mockResolvedValue([
      { account: "4210", debitAmount: 0, creditAmount: 50_000 },
    ]);

    const r = await computeGewSt("t-1", 2025);
    expect(r.summeBemessung).toBe(0);
  });
});

describe("computeGewSt — Zeitfilter", () => {
  it("Nur Buchungen im fiscalYear werden aggregiert", async () => {
    mockAccts.mockResolvedValue([
      { accountNumber: "4210", name: "Pacht", gewStAddBackKey: "RENT_IMMOVABLE" },
    ]);
    mockLines.mockResolvedValue([
      { account: "4210", debitAmount: 100_000, creditAmount: 0 },
    ]);

    await computeGewSt("t-1", 2025);

    const where = mockLines.mock.calls[0][0].where;
    const dateFilter = where.journalEntry.entryDate;
    expect(dateFilter.gte.getUTCFullYear()).toBe(2025);
    expect(dateFilter.gte.getUTCMonth()).toBe(0);
    expect(dateFilter.lte.getUTCFullYear()).toBe(2025);
    expect(dateFilter.lte.getUTCMonth()).toBe(11);
  });
});
