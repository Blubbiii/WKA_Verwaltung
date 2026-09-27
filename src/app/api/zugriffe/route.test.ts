/**
 * External access to the tenant's parks, from the park owner's side.
 *
 * A ParkStakeholder entry opens a customer's parks to a service provider.
 * Only the provider and the platform operator could see or end it — the
 * customer whose data it opens could do neither. Now the customer lists who
 * reaches its parks and ends an entry; it stays in the history as inactive.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ICH = "mandant-kunde";

const liste = vi.fn();
const eintrag = vi.fn();
const beende = vi.fn();
const protokoll = vi.fn();

vi.mock("@/lib/auth/withPermission", () => ({
  requirePermission: vi.fn().mockResolvedValue({ authorized: true, tenantId: ICH, userId: "u1" }),
}));
vi.mock("@/lib/audit", () => ({ createAuditLog: (...a: unknown[]) => protokoll(...a) }));
vi.mock("@/lib/logger", () => ({ apiLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    parkStakeholder: {
      findMany: (...a: unknown[]) => liste(...a),
      findFirst: (...a: unknown[]) => eintrag(...a),
      update: (...a: unknown[]) => beende(...a),
    },
    park: { findMany: vi.fn().mockResolvedValue([{ id: "p1", name: "Windpark Nord" }]) },
  },
}));

const { GET } = await import("./route");
const { DELETE } = await import("./[id]/route");

const beenden = async () =>
  (await DELETE(new NextRequest("http://x/api/zugriffe/s1", { method: "DELETE" }), {
    params: Promise.resolve({ id: "s1" }),
  }))!;

beforeEach(() => {
  vi.clearAllMocks();
  liste.mockResolvedValue([
    {
      id: "s1",
      parkId: "p1",
      role: "COMMERCIAL_BF",
      validFrom: new Date("2026-01-01"),
      billingEnabled: true,
      stakeholderTenant: { name: "BF Nord GmbH" },
    },
  ]);
  beende.mockResolvedValue({ id: "s1" });
});

describe("Externe Zugriffe", () => {
  it("listet nur aktive Zugriffe auf die eigenen Parks, mit Dienstleister und Park", async () => {
    const res = (await GET())!;
    expect(res.status).toBe(200);
    const where = liste.mock.calls[0][0].where;
    expect(where).toMatchObject({ parkTenantId: ICH, isActive: true });
    expect((await res.json()).zugriffe[0]).toMatchObject({
      id: "s1",
      dienstleister: "BF Nord GmbH",
      park: "Windpark Nord",
      rolle: "COMMERCIAL_BF",
    });
  });

  it("der Kunde beendet einen Zugriff auf seinen Park — er bleibt als inaktiv erhalten", async () => {
    eintrag.mockResolvedValue({ id: "s1", parkTenantId: ICH, isActive: true });
    expect((await beenden()).status).toBe(200);
    expect(eintrag.mock.calls[0][0].where).toMatchObject({ id: "s1", parkTenantId: ICH });
    expect(beende.mock.calls[0][0].data).toMatchObject({ isActive: false });
    expect(protokoll).toHaveBeenCalled();
  });

  it("den Zugriff eines anderen Kunden kann er nicht beenden", async () => {
    eintrag.mockResolvedValue(null);
    expect((await beenden()).status).toBe(404);
    expect(beende).not.toHaveBeenCalled();
  });
});
