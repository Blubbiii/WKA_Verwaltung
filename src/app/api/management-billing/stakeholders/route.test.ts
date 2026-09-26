/**
 * Who may create a stakeholder link.
 *
 * A ParkStakeholder entry opens the park tenant's settlement data to the
 * stakeholder tenant. The route took both tenant ids from the body — any
 * customer admin could register itself for any foreign park and read that
 * customer's settlements. Now: a customer admin only for its own tenant
 * and a park it already reaches (own, or a client it manages); the first
 * link between two tenants is the platform operator's.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ICH = "mandant-a";
const FREMD = "mandant-b";

const erstelle = vi.fn();
const superadmin = vi.fn();
const verweise = vi.fn();
const fondsZaehlen = vi.fn();

vi.mock("@/lib/auth/withPermission", () => ({
  requirePermission: vi.fn().mockResolvedValue({ authorized: true, tenantId: ICH, userId: "u1" }),
}));
vi.mock("@/lib/auth/permissions", () => ({ isSuperadmin: (...a: unknown[]) => superadmin(...a) }));
vi.mock("@/lib/management-billing/verweise", () => ({ verweisePruefen: (...a: unknown[]) => verweise(...a) }));
vi.mock("@/lib/config", () => ({ getConfigBoolean: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/logger", () => ({ apiLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findUnique: vi.fn().mockResolvedValue({ id: "t" }) },
    park: { findFirst: vi.fn().mockResolvedValue({ id: "p1" }) },
    parkStakeholder: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: (...a: unknown[]) => erstelle(...a),
    },
    stakeholderFeeHistory: { create: vi.fn() },
    fund: { count: (...a: unknown[]) => fondsZaehlen(...a) },
  },
}));

const { POST } = await import("./route");

const anlegen = async (body: Record<string, unknown>) =>
  (await POST(
    new NextRequest("http://x/api/management-billing/stakeholders", {
      method: "POST",
      body: JSON.stringify({ role: "COMMERCIAL_BF", parkId: "p1", ...body }),
    }),
  ))!;

beforeEach(() => {
  vi.clearAllMocks();
  superadmin.mockResolvedValue(false);
  verweise.mockResolvedValue(null);
  erstelle.mockResolvedValue({ id: "s1" });
  fondsZaehlen.mockResolvedValue(0);
});

describe("Stakeholder anlegen", () => {
  it("ein Kunden-Admin trägt keinen anderen Mandanten als Stakeholder ein", async () => {
    const res = await anlegen({ stakeholderTenantId: FREMD, parkTenantId: ICH });
    expect(res.status).toBe(403);
    expect(erstelle).not.toHaveBeenCalled();
  });

  it("ein Kunden-Admin hängt sich nicht an einen Park, den er nicht erreicht", async () => {
    verweise.mockResolvedValue(new Response(null, { status: 400 }));
    const res = await anlegen({ stakeholderTenantId: ICH, parkTenantId: FREMD });
    expect(verweise).toHaveBeenCalledWith(ICH, { parkId: "p1" });
    expect(res.status).toBe(400);
    expect(erstelle).not.toHaveBeenCalled();
  });

  it("für den eigenen Mandanten und einen erreichbaren Park geht es", async () => {
    const res = await anlegen({ stakeholderTenantId: ICH, parkTenantId: ICH });
    expect(res.status).toBe(201);
    expect(erstelle).toHaveBeenCalled();
  });

  it("der Superadmin verbindet zwei Mandanten zum ersten Mal", async () => {
    superadmin.mockResolvedValue(true);
    const res = await anlegen({ stakeholderTenantId: FREMD, parkTenantId: ICH });
    expect(res.status).toBe(201);
    expect(verweise).not.toHaveBeenCalled();
  });

  it("sichtbare Gesellschaften müssen dem Kunden gehören", async () => {
    // Two ids given, only one is a fund of the park tenant.
    fondsZaehlen.mockResolvedValue(1);
    const res = await anlegen({ stakeholderTenantId: ICH, parkTenantId: ICH, visibleFundIds: ["f1", "f-fremd"] });
    expect(res.status).toBe(400);
    expect(fondsZaehlen).toHaveBeenCalledWith({ where: { id: { in: ["f1", "f-fremd"] }, tenantId: ICH } });
    expect(erstelle).not.toHaveBeenCalled();
  });
});
