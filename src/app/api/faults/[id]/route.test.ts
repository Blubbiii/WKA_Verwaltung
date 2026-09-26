/**
 * Störungsende nachtragen.
 *
 * Die Detailseite bot kein Feld für das Ende — eine laufend angelegte Störung
 * ließ sich nie bewerten. Mit dem neuen Feld schickt die Seite nur `endAt`.
 * Die Route verglich Ende und Beginn aber nur, wenn beide im Rumpf standen:
 * ein Ende vor dem gespeicherten Beginn wäre durchgegangen.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const findFirst = vi.fn();
const update = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { faultCase: { findFirst: (...a: unknown[]) => findFirst(...a), update: (...a: unknown[]) => update(...a) } },
}));
// The route uses the tenant-bound client (mandantDb) — same delegate for the test.
vi.mock("@/lib/mandant/mandant-db", () => ({
  mandantDb: () => ({ faultCase: { findFirst: (...a: unknown[]) => findFirst(...a), update: (...a: unknown[]) => update(...a) } }),
}));
vi.mock("@/lib/auth/withPermission", () => ({
  requirePermission: vi.fn().mockResolvedValue({ authorized: true, tenantId: "t1", userId: "u1" }),
}));
vi.mock("@/lib/auth/permissions", () => ({
  PERMISSIONS: { FAULTS_READ: "faults:read", FAULTS_UPDATE: "faults:update", FAULTS_DELETE: "faults:delete" },
}));
vi.mock("@/lib/audit", () => ({ createAuditLog: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  apiLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { PATCH } from "./route";

const params = { params: Promise.resolve({ id: "f1" }) };
const patch = async (body: unknown) =>
  (await PATCH(new NextRequest("http://localhost/x", { method: "PATCH", body: JSON.stringify(body) }), params))!;

beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockResolvedValue({
    id: "f1", caseNumber: "S-1", lostEnergyKwh: null, ratePerKwh: null, status: "OPEN",
    startAt: new Date("2026-09-20T08:00:00Z"), endAt: null,
  });
  update.mockImplementation(({ data }: { data: unknown }) => Promise.resolve({ id: "f1", ...(data as object) }));
});

describe("Störungsende nachtragen", () => {
  it("nimmt ein Ende nach dem gespeicherten Beginn an", async () => {
    const res = await patch({ endAt: "2026-09-21T08:00:00.000Z" });
    expect(res.status).toBe(200);
    expect(update.mock.calls[0][0].data.endAt).toEqual(new Date("2026-09-21T08:00:00Z"));
  });

  it("lehnt ein Ende vor dem gespeicherten Beginn ab", async () => {
    const res = await patch({ endAt: "2026-09-19T08:00:00.000Z" });
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("lehnt einen Beginn nach dem gespeicherten Ende ab", async () => {
    findFirst.mockResolvedValue({
      id: "f1", caseNumber: "S-1", lostEnergyKwh: null, ratePerKwh: null, status: "OPEN",
      startAt: new Date("2026-09-20T08:00:00Z"), endAt: new Date("2026-09-21T08:00:00Z"),
    });
    const res = await patch({ startAt: "2026-09-22T08:00:00.000Z" });
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});
