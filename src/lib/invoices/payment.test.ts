/**
 * Wächter: eine mit Skonto bezahlte Rechnung gilt als bezahlt.
 *
 * ## Der Fehler
 *
 * `mark-paid` übergab bei Skonto nur `Brutto − Skonto`. `recordPayment` setzte
 * PAID aber erst ab `Brutto − Toleranz` (Toleranz ist der Cent-Bereich für
 * Bankabgleiche). Skonto liegt bei 2–3 % weit darüber — die Rechnung blieb
 * also auf `PARTIALLY_PAID` stehen, während die Oberfläche „vollständig
 * bezahlt" meldete.
 *
 * Und `PARTIALLY_PAID` ist genau das Kriterium, nach dem der Mahnlauf seine
 * Kandidaten sucht (`lib/mahnwesen/dunning.ts`). Der Kunde zahlte korrekt mit
 * Skonto und bekam dafür eine Mahnung.
 *
 * Gefunden beim systematischen Gegenlesen durch ein zweites Modell.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const invoice = {
  findUnique: vi.fn(),
};
const invoicePayment = { create: vi.fn(), update: vi.fn() };
const dunningItem = { findMany: vi.fn() };

const tx = {
  // SELECT ... FOR UPDATE sperrt die Zeile; fuer diesen Test genuegt ein
  // Treffer, damit der Ablauf weiterlaeuft.
  $queryRaw: vi.fn().mockResolvedValue([{ id: "i1" }]),
  invoice: {
    findUnique: (...a: unknown[]) => invoice.findUnique(...a),
    update: vi.fn().mockResolvedValue({}),
  },
  invoicePayment: {
    create: (...a: unknown[]) => invoicePayment.create(...a),
    update: (...a: unknown[]) => invoicePayment.update(...a),
  },
  dunningItem: { findMany: (...a: unknown[]) => dunningItem.findMany(...a) },
};

vi.mock("@/lib/tenant-settings", () => ({
  getTenantSettings: vi.fn().mockResolvedValue({ bankMatchToleranceEur: 0.02 }),
}));
vi.mock("@/lib/validation/period-lock", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { recordPayment } from "./payment";

const BRUTTO = 1190;
const SKONTO = 23.8; // 2 % — weit ueber der Toleranz von 2 Cent

beforeEach(() => {
  vi.clearAllMocks();
  invoice.findUnique.mockResolvedValue({
    id: "i1",
    tenantId: "t1",
    invoiceNumber: "RG-1",
    grossAmount: BRUTTO,
    paidAmount: 0,
    status: "SENT",
    invoiceDate: new Date("2026-03-01T00:00:00.000Z"),
  });
  dunningItem.findMany.mockResolvedValue([]);
  invoicePayment.create.mockResolvedValue({ id: "p1" });
});

describe("Zahlung erfassen", () => {
  it("mit Skonto gilt die Rechnung als BEZAHLT", async () => {
    const ergebnis = await recordPayment(tx as never, {
      tenantId: "t1",
      invoiceId: "i1",
      amount: BRUTTO - SKONTO,
      minderung: SKONTO,
      paymentDate: new Date("2026-03-10T00:00:00.000Z"),
      userId: "u1",
    });

    expect(
      ergebnis.newStatus,
      "Ohne Beruecksichtigung des Skontos bleibt die Rechnung auf " +
        "PARTIALLY_PAID — und genau danach sucht der Mahnlauf seine " +
        "Kandidaten. Der Kunde zahlt korrekt und bekommt eine Mahnung.",
    ).toBe("PAID");
    expect(ergebnis.isFullyPaid).toBe(true);
  });

  it("ohne Minderung bleibt eine Teilzahlung eine Teilzahlung", async () => {
    // Die Gegenprobe: die Minderung darf nicht jede Teilzahlung zur
    // Vollzahlung erklaeren.
    const ergebnis = await recordPayment(tx as never, {
      tenantId: "t1",
      invoiceId: "i1",
      amount: BRUTTO - SKONTO,
      paymentDate: new Date("2026-03-10T00:00:00.000Z"),
      userId: "u1",
    });
    expect(ergebnis.newStatus).toBe("PARTIALLY_PAID");
  });

  it("nach Skonto der volle Betrag ist eine Ueberzahlung", async () => {
    // Wer die Minderung vereinbart und trotzdem brutto ueberweist, hat zu
    // viel gezahlt. Das soll auffallen, nicht stillschweigend durchgehen.
    await expect(
      recordPayment(tx as never, {
        tenantId: "t1",
        invoiceId: "i1",
        amount: BRUTTO,
        minderung: SKONTO,
        paymentDate: new Date("2026-03-10T00:00:00.000Z"),
        userId: "u1",
      }),
    ).rejects.toThrow();
  });
});
