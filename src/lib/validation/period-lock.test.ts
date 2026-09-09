/**
 * Unit-Tests für Periodensperre (P9, GoBD §146 AO).
 *
 * Diese Tests laufen REINE Logik gegen einen In-Memory-Mock — sie testen
 * NICHT die DB-Schicht. Das Period-Gate ist eine simple Lookup-Funktion,
 * die meisten Edge-Cases sind in der Date-Berechnung (UTC vs. lokal, Monat
 * 1-12 vs. 0-11). Die DB-Integration wird via Playwright/E2E getestet.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PeriodLockedError } from "./period-lock";

// =============================================================================
// PeriodLockedError
// =============================================================================

describe("PeriodLockedError", () => {
  it("sets name, periodYear, periodMonth correctly", () => {
    const err = new PeriodLockedError(2025, 3);
    expect(err.name).toBe("PeriodLockedError");
    expect(err.periodYear).toBe(2025);
    expect(err.periodMonth).toBe(3);
    expect(err.message).toContain("2025-03");
  });

  it("pads single-digit months in message", () => {
    const err = new PeriodLockedError(2025, 1);
    expect(err.message).toContain("2025-01");
  });

  it("is instanceof Error (for try/catch in routes)", () => {
    const err = new PeriodLockedError(2025, 1);
    expect(err).toBeInstanceOf(Error);
  });
});

// =============================================================================
// assertPeriodOpen — period lookup math
//
// Wir mocken den prisma-Client und testen ob:
// (a) UTC-Konversion korrekt (Date 2025-01-15 → year=2025, month=1)
// (b) Lock ohne unlockedAt → wirft
// (c) Lock MIT unlockedAt (entsperrt) → wirft NICHT
// (d) Kein Lock → wirft NICHT
// =============================================================================

vi.mock("@/lib/prisma", () => ({
  prisma: {
    accountingPeriodLock: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { assertPeriodOpen } from "./period-lock";

const mockFindUnique = prisma.accountingPeriodLock.findUnique as unknown as ReturnType<
  typeof vi.fn
>;

describe("assertPeriodOpen", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
  });

  it("does not throw when no lock exists", async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(
      assertPeriodOpen("tenant-1", new Date(Date.UTC(2025, 0, 15))),
    ).resolves.toBeUndefined();
  });

  it("throws PeriodLockedError when an active lock exists", async () => {
    mockFindUnique.mockResolvedValue({
      id: "lock-1",
      unlockedAt: null,
    });
    await expect(
      assertPeriodOpen("tenant-1", new Date(Date.UTC(2025, 0, 15))),
    ).rejects.toBeInstanceOf(PeriodLockedError);
  });

  it("does NOT throw when lock has been unlocked", async () => {
    mockFindUnique.mockResolvedValue({
      id: "lock-1",
      unlockedAt: new Date("2025-06-01"),
    });
    await expect(
      assertPeriodOpen("tenant-1", new Date(Date.UTC(2025, 0, 15))),
    ).resolves.toBeUndefined();
  });

  it("derives periodYear/periodMonth in UTC (no off-by-one)", async () => {
    mockFindUnique.mockResolvedValue(null);
    // 2025-03-15 UTC midnight
    await assertPeriodOpen("tenant-1", new Date(Date.UTC(2025, 2, 15)));
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: {
        tenantId_periodYear_periodMonth: {
          tenantId: "tenant-1",
          periodYear: 2025,
          periodMonth: 3, // 1-based: März
        },
      },
      select: { id: true, unlockedAt: true },
    });
  });

  it("handles December correctly (no month=13)", async () => {
    mockFindUnique.mockResolvedValue(null);
    await assertPeriodOpen("tenant-1", new Date(Date.UTC(2025, 11, 31)));
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: {
        tenantId_periodYear_periodMonth: {
          tenantId: "tenant-1",
          periodYear: 2025,
          periodMonth: 12,
        },
      },
      select: { id: true, unlockedAt: true },
    });
  });

  it("PeriodLockedError carries the year+month for error response", async () => {
    mockFindUnique.mockResolvedValue({ id: "lock-x", unlockedAt: null });
    try {
      await assertPeriodOpen("tenant-1", new Date(Date.UTC(2024, 10, 5)));
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PeriodLockedError);
      const pe = err as PeriodLockedError;
      expect(pe.periodYear).toBe(2024);
      expect(pe.periodMonth).toBe(11); // November
    }
  });
});
