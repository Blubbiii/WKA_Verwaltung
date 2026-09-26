/**
 * Who may manage an existing stakeholder link: the stakeholder tenant, and
 * the platform operator — who creates the first link between two tenants
 * and so must be able to end it again.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ICH = "mandant-a";

const superadmin = vi.fn();
const eintrag = vi.fn();
const deaktiviere = vi.fn();

vi.mock("@/lib/auth/withPermission", () => ({
  requirePermission: vi.fn().mockResolvedValue({ authorized: true, tenantId: ICH, userId: "u1" }),
}));
vi.mock("@/lib/auth/permissions", () => ({ isSuperadmin: (...a: unknown[]) => superadmin(...a) }));
vi.mock("@/lib/config", () => ({ getConfigBoolean: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/logger", () => ({ apiLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    parkStakeholder: {
      findUnique: (...a: unknown[]) => eintrag(...a),
      update: (...a: unknown[]) => deaktiviere(...a),
      delete: (...a: unknown[]) => deaktiviere(...a),
    },
  },
}));

const { DELETE } = await import("./route");

const loeschen = async () =>
  (await DELETE(new NextRequest("http://x/api/management-billing/stakeholders/s1", { method: "DELETE" }), {
    params: Promise.resolve({ id: "s1" }),
  }))!;

beforeEach(() => {
  vi.clearAllMocks();
  superadmin.mockResolvedValue(false);
  deaktiviere.mockResolvedValue({ id: "s1" });
});

describe("Stakeholder beenden", () => {
  it("der Stakeholder-Mandant beendet seine Verknüpfung", async () => {
    eintrag.mockResolvedValue({ id: "s1", stakeholderTenantId: ICH, parkTenantId: "kunde" });
    expect((await loeschen()).status).toBe(200);
  });

  it("ein anderer Mandant nicht", async () => {
    eintrag.mockResolvedValue({ id: "s1", stakeholderTenantId: "anderer", parkTenantId: "kunde" });
    expect((await loeschen()).status).toBe(403);
    expect(deaktiviere).not.toHaveBeenCalled();
  });

  it("der Superadmin, der sie angelegt hat, schon", async () => {
    superadmin.mockResolvedValue(true);
    eintrag.mockResolvedValue({ id: "s1", stakeholderTenantId: "anderer", parkTenantId: "kunde" });
    expect((await loeschen()).status).toBe(200);
  });
});
