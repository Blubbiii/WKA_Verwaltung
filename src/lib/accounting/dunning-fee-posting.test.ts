/**
 * F9-Rest: Buchung des Mahngebühren-Anteils bei Zahlung.
 *
 * Ausgangslage vor dem Fix: Mahngebühren wurden ausschliesslich auf DunningItem
 * geführt. `sumOpenDunningCharges()` liess die Mehrzahlung zwar zu, aber
 * `createPaymentPosting()` buchte den VOLLEN geflossenen Betrag gegen das
 * Forderungskonto — die Forderung wurde also um die Gebühr überkreditiert und
 * der Ertrag nie erfasst.
 *
 * Fachliche Entscheidungen, die hier festgeschrieben sind:
 *  - Zeitpunkt: Buchung bei ZAHLUNG, nicht bei Versand der Mahnung
 *    (§252 Abs. 1 Nr. 4 HGB — Schadensersatzanspruch unsicherer
 *    Einbringlichkeit wird nicht vorab aktiviert).
 *  - Umsatzsteuer: keine. §288 BGB ist Verzugsschaden, kein Leistungsaustausch.
 *  - Ohne konfiguriertes Ertragskonto wird NICHT geraten, sondern wie bisher
 *    gebucht und geloggt.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client-runtime-utils";

const settingsMock = vi.fn();
const createMock = vi.fn();
const findFirstMock = vi.fn();

vi.mock("@/lib/tenant-settings", () => ({
  getTenantSettings: () => settingsMock(),
  resolvePaymentAccount: () => "1200",
}));

vi.mock("./period-lock", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
  PeriodLockedError: class extends Error {},
}));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { createPaymentPosting } from "./auto-posting";

/** Minimaler Transaktions-Stub. */
function makeTx() {
  return {
    journalEntry: {
      findFirst: (args: unknown) => findFirstMock(args),
      create: (args: unknown) => createMock(args),
    },
  } as unknown as Parameters<typeof createPaymentPosting>[0];
}

/** Liest die erzeugten Buchungszeilen aus dem create-Aufruf. */
function linesFromCreate() {
  const arg = createMock.mock.calls[0]?.[0] as {
    data: { lines: { create: Array<Record<string, unknown>> } };
  };
  return arg.data.lines.create;
}

const BASE_SETTINGS = {
  datevAccountReceivables: "1400",
  chartOfAccountsVersion: "SKR03",
  datevAccountDunningFee: "",
};

beforeEach(() => {
  createMock.mockReset();
  findFirstMock.mockReset();
  settingsMock.mockReset();

  // Kein bestehender Beleg (Idempotenz-Check) und keine Ursprungsbuchung.
  findFirstMock.mockResolvedValue(null);
  createMock.mockResolvedValue({ id: "je-1" });
  settingsMock.mockResolvedValue(BASE_SETTINGS);
});

describe("createPaymentPosting — Gebühren-Split (F9-Rest)", () => {
  const base = {
    tenantId: "t1",
    invoiceId: "inv-1",
    paymentId: "pay-1",
    bookingDate: new Date("2026-03-15T00:00:00Z"),
    paymentMethod: "BANK" as const,
    userId: "u1",
    reference: "RE-2026-001",
  };

  it("bucht ohne Mehrzahlung wie bisher zweizeilig", async () => {
    settingsMock.mockResolvedValue({
      ...BASE_SETTINGS,
      datevAccountDunningFee: "2700",
    });

    await createPaymentPosting(makeTx(), {
      ...base,
      amount: new Decimal("1000.00"),
      openInvoiceAmount: new Decimal("1000.00"),
    });

    const lines = linesFromCreate();
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatchObject({ account: "1400" });
    expect(String(lines[1].creditAmount)).toBe("1000");
  });

  it("teilt Rechnung und Gebühr auf getrennte Konten", async () => {
    settingsMock.mockResolvedValue({
      ...BASE_SETTINGS,
      datevAccountDunningFee: "2700",
    });

    // 1.000 € Rechnung + 5 € Mahngebühr + 12,40 € Zinsen = 1.017,40 €
    const result = await createPaymentPosting(makeTx(), {
      ...base,
      amount: new Decimal("1017.40"),
      openInvoiceAmount: new Decimal("1000.00"),
    });

    const lines = linesFromCreate();
    expect(lines).toHaveLength(3);

    // Geldseite traegt den vollen Betrag.
    expect(String(lines[0].debitAmount)).toBe("1017.4");
    // Forderung nur der Rechnungsanteil — das war der Kern des Fehlers.
    expect(lines[1]).toMatchObject({ account: "1400" });
    expect(String(lines[1].creditAmount)).toBe("1000");
    // Gebühr auf das Ertragskonto.
    expect(lines[2]).toMatchObject({ account: "2700" });
    expect(String(lines[2].creditAmount)).toBe("17.4");

    expect(result.dunningFeeAmount).toBe("17.4");
  });

  it("die Buchung bleibt ausgeglichen", async () => {
    settingsMock.mockResolvedValue({
      ...BASE_SETTINGS,
      datevAccountDunningFee: "2700",
    });

    await createPaymentPosting(makeTx(), {
      ...base,
      amount: new Decimal("1017.40"),
      openInvoiceAmount: new Decimal("1000.00"),
    });

    const lines = linesFromCreate();
    const debit = lines.reduce(
      (s, l) => s.plus(new Decimal(String(l.debitAmount ?? 0))),
      new Decimal(0),
    );
    const credit = lines.reduce(
      (s, l) => s.plus(new Decimal(String(l.creditAmount ?? 0))),
      new Decimal(0),
    );
    expect(debit.toString()).toBe(credit.toString());
  });

  it("bucht ohne konfiguriertes Ertragskonto NICHT auf ein geratenes Konto", async () => {
    // Verhalten wie vor dem Fix — aber sichtbar, statt still falsch.
    const result = await createPaymentPosting(makeTx(), {
      ...base,
      amount: new Decimal("1017.40"),
      openInvoiceAmount: new Decimal("1000.00"),
    });

    const lines = linesFromCreate();
    expect(lines).toHaveLength(2);
    expect(String(lines[1].creditAmount)).toBe("1017.4");
    expect(result.dunningFeeUnposted).toBe("17.4");
    expect(result.dunningFeeAmount).toBeUndefined();
  });

  it("ohne openInvoiceAmount bleibt das Altverhalten erhalten", async () => {
    settingsMock.mockResolvedValue({
      ...BASE_SETTINGS,
      datevAccountDunningFee: "2700",
    });

    await createPaymentPosting(makeTx(), {
      ...base,
      amount: new Decimal("1017.40"),
    });

    const lines = linesFromCreate();
    expect(lines).toHaveLength(2);
    expect(String(lines[1].creditAmount)).toBe("1017.4");
  });

  it("eine Teilzahlung unter dem offenen Betrag erzeugt keinen Gebührenanteil", async () => {
    settingsMock.mockResolvedValue({
      ...BASE_SETTINGS,
      datevAccountDunningFee: "2700",
    });

    const result = await createPaymentPosting(makeTx(), {
      ...base,
      amount: new Decimal("400.00"),
      openInvoiceAmount: new Decimal("1000.00"),
    });

    expect(linesFromCreate()).toHaveLength(2);
    expect(result.dunningFeeAmount).toBeUndefined();
  });

  it("es wird keine Umsatzsteuer auf die Gebühr gebucht", async () => {
    settingsMock.mockResolvedValue({
      ...BASE_SETTINGS,
      datevAccountDunningFee: "2700",
      datevAccountOutputTax19: "1776",
    });

    await createPaymentPosting(makeTx(), {
      ...base,
      amount: new Decimal("1017.40"),
      openInvoiceAmount: new Decimal("1000.00"),
    });

    // §288 BGB ist Schadensersatz, kein Leistungsaustausch → kein USt-Konto.
    const accounts = linesFromCreate().map((l) => l.account);
    expect(accounts).not.toContain("1776");
  });
});
