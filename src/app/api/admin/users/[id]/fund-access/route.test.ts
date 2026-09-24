/**
 * Fondszugriff für Nutzer anderer Mandanten (Superadmin).
 *
 * Die Nutzerliste zeigt dem Superadmin alle Mandanten, der Fondszugriff
 * suchte den Nutzer aber nur im eigenen: bei 72 von 73 Nutzern "User nicht
 * gefunden". Wer die Liste sieht, soll auch den Zugriff pflegen können — mit
 * den Fonds aus dem Mandanten des Nutzers. Alle anderen bleiben beim eigenen.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const userFindUnique = vi.fn();
const fundFindMany = vi.fn();
const fundCount = vi.fn();
const accessFindMany = vi.fn();
const hierarchie = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    fund: { findMany: (...a: unknown[]) => fundFindMany(...a), count: (...a: unknown[]) => fundCount(...a) },
    fundAccess: {
      findMany: (...a: unknown[]) => accessFindMany(...a),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("@/lib/auth/withPermission", () => ({
  requirePermission: vi.fn().mockResolvedValue({ authorized: true, tenantId: "eigen", userId: "admin" }),
}));
vi.mock("@/lib/auth/permissions", () => ({
  getUserHighestHierarchy: (...a: unknown[]) => hierarchie(...a),
}));
vi.mock("@/lib/logger", () => ({
  apiLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET, PUT } from "./route";

const params = { params: Promise.resolve({ id: "u-fremd" }) };
const get = async () => (await GET(new NextRequest("http://localhost/x"), params))!;
const put = async (fundIds: string[]) =>
  (await PUT(new NextRequest("http://localhost/x", { method: "PUT", body: JSON.stringify({ fundIds }) }), params))!;
const FUND = "3f2b8c1e-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  userFindUnique.mockResolvedValue({ id: "u-fremd", email: "x@y.de", tenantId: "fremd" });
  accessFindMany.mockResolvedValue([]);
  fundFindMany.mockResolvedValue([{ id: FUND, name: "Fonds fremd", status: "ACTIVE" }]);
  fundCount.mockResolvedValue(1);
});

describe("Fondszugriff", () => {
  it("Superadmin sieht die Fonds aus dem Mandanten des Nutzers", async () => {
    hierarchie.mockResolvedValue(100);
    const res = await get();
    expect(res.status).toBe(200);
    expect(fundFindMany.mock.calls[0][0].where.tenantId).toBe("fremd");
  });

  it("Superadmin prüft die Fonds gegen den Mandanten des Nutzers", async () => {
    hierarchie.mockResolvedValue(100);
    expect((await put([FUND])).status).toBe(200);
    expect(fundCount.mock.calls[0][0].where.tenantId).toBe("fremd");
  });

  it("ein Mandanten-Admin kommt an fremde Nutzer nicht heran", async () => {
    hierarchie.mockResolvedValue(80);
    expect((await get()).status).toBe(404);
    expect((await put([FUND])).status).toBe(404);
    expect(fundFindMany).not.toHaveBeenCalled();
  });
});
