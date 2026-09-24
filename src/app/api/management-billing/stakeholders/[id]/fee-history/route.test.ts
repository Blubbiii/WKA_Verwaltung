/**
 * Gebühren-Historie nur für Stakeholder des eigenen Mandanten.
 *
 * Die Stammdaten eines fremden Stakeholders verweigerte die Nachbarroute mit
 * 403, seine Gebühren-Historie gab diese Route aber heraus — und per POST
 * ließ sich sein Gebührensatz ändern. Die ID allein ist kein Zugriffsrecht.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const stakeholderFindUnique = vi.fn();
const historyFindMany = vi.fn();
const historyFindFirst = vi.fn();
const historyUpdate = vi.fn();
const historyCreate = vi.fn();
const stakeholderUpdate = vi.fn();

vi.mock("@/lib/prisma", () => {
  const client = {
    parkStakeholder: {
      findUnique: (...a: unknown[]) => stakeholderFindUnique(...a),
      update: (...a: unknown[]) => stakeholderUpdate(...a),
    },
    stakeholderFeeHistory: {
      findMany: (...a: unknown[]) => historyFindMany(...a),
      findFirst: (...a: unknown[]) => historyFindFirst(...a),
      update: (...a: unknown[]) => historyUpdate(...a),
      create: (...a: unknown[]) => historyCreate(...a),
    },
  };
  return { prisma: { ...client, $transaction: (fn: (tx: typeof client) => unknown) => fn(client) } };
});
vi.mock("@/lib/config", () => ({ getConfigBoolean: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/auth/withPermission", () => ({
  requirePermission: vi.fn().mockResolvedValue({ authorized: true, tenantId: "eigen" }),
}));
vi.mock("@/lib/logger", () => ({
  apiLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET, POST } from "./route";

const params = { params: Promise.resolve({ id: "s1" }) };
// The handlers are typed as possibly returning undefined; every path here returns.
const post = async () =>
  (await POST(
    new NextRequest("http://localhost/x", { method: "POST", body: JSON.stringify({ feePercentage: 2 }) }),
    params,
  ))!;
const get = async () => (await GET(new NextRequest("http://localhost/x"), params))!;

beforeEach(() => {
  vi.clearAllMocks();
  historyFindMany.mockResolvedValue([{ id: "h1", feePercentage: 1.5 }]);
  historyFindFirst.mockResolvedValue(null);
  historyCreate.mockResolvedValue({ id: "h2", feePercentage: 2 });
});

describe("Gebühren-Historie", () => {
  it("verweigert die Historie eines fremden Stakeholders", async () => {
    stakeholderFindUnique.mockResolvedValue({ id: "s1", stakeholderTenantId: "fremd" });
    const res = await get();
    expect(res.status).toBe(403);
    expect(historyFindMany).not.toHaveBeenCalled();
  });

  it("ändert den Satz eines fremden Stakeholders nicht", async () => {
    stakeholderFindUnique.mockResolvedValue({ id: "s1", stakeholderTenantId: "fremd" });
    const res = await post();
    expect(res.status).toBe(403);
    expect(historyCreate).not.toHaveBeenCalled();
    expect(stakeholderUpdate).not.toHaveBeenCalled();
  });

  it("meldet 404 für eine unbekannte ID", async () => {
    stakeholderFindUnique.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
    expect((await post()).status).toBe(404);
  });

  it("liefert und ändert beim eigenen Stakeholder", async () => {
    stakeholderFindUnique.mockResolvedValue({ id: "s1", stakeholderTenantId: "eigen" });
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).history).toHaveLength(1);
    expect((await post()).status).toBe(201);
    expect(stakeholderUpdate).toHaveBeenCalled();
  });
});
