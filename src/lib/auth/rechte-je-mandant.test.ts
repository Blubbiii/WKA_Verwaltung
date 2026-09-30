/**
 * Permissions per tenant (2026-09).
 *
 * A role assignment carries the tenant it was granted for. The permission
 * check used to collect every assignment of a user — an administrator of
 * tenant A who is only a manager in tenant B acted as administrator in B
 * as well. Now a check is asked for one tenant: assignments of that tenant
 * count, plus global ones (tenantId null).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const zuweisungen = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { userRoleAssignment: { findMany: (...a: unknown[]) => zuweisungen(...a) } },
}));
vi.mock("./permissionCache", () => ({
  getCachedPermissions: vi.fn().mockResolvedValue(null),
  setCachedPermissions: vi.fn(),
}));
vi.mock("./index", () => ({ auth: vi.fn() }));

const { hasPermission, getUserHighestHierarchy } = await import("./permissions");

const rolle = (name: string, hierarchy: number, rechte: string[]) => ({
  id: name,
  name,
  isSystem: true,
  hierarchy,
  permissions: rechte.map((r) => ({ permission: { name: r } })),
});

beforeEach(() => {
  zuweisungen.mockResolvedValue([
    { tenantId: "nord", resourceType: "__global__", resourceIds: [], role: rolle("Administrator", 80, ["parks:update", "invoices:delete"]) },
    { tenantId: "sued", resourceType: "__global__", resourceIds: [], role: rolle("Manager", 60, ["parks:read"]) },
    { tenantId: null, resourceType: "__global__", resourceIds: [], role: rolle("Berichte global", 40, ["reports:read"]) },
  ]);
});

describe("Rechte je Mandant", () => {
  it("die Rolle wirkt in dem Mandanten, für den sie vergeben ist", async () => {
    expect(await hasPermission("u", "parks:update", "nord")).toBe(true);
    expect(await hasPermission("u", "invoices:delete", "nord")).toBe(true);
  });

  it("in einem anderen Mandanten nicht", async () => {
    expect(await hasPermission("u", "parks:update", "sued")).toBe(false);
    expect(await hasPermission("u", "invoices:delete", "sued")).toBe(false);
    expect(await hasPermission("u", "parks:read", "sued")).toBe(true);
  });

  it("eine globale Rolle wirkt überall", async () => {
    expect(await hasPermission("u", "reports:read", "nord")).toBe(true);
    expect(await hasPermission("u", "reports:read", "sued")).toBe(true);
  });

  it("die Rangstufe folgt dem Mandanten", async () => {
    expect(await getUserHighestHierarchy("u", "nord")).toBe(80);
    expect(await getUserHighestHierarchy("u", "sued")).toBe(60);
  });

  it("die Plattform-Rolle (Superadmin) gilt in jedem Mandanten, obwohl am System-Mandanten vergeben", async () => {
    zuweisungen.mockResolvedValue([
      { tenantId: "system", resourceType: "__global__", resourceIds: [], role: rolle("Superadmin", 100, ["admin:tenants"]) },
    ]);
    expect(await getUserHighestHierarchy("sa", "kunde")).toBe(100);
    expect(await hasPermission("sa", "admin:tenants", "kunde")).toBe(true);
  });
});
