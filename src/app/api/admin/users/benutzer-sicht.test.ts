/**
 * User administration after support phase 2 (2026-09).
 *
 * - The platform operator sees users of other tenants as a count only;
 *   names and e-mail addresses only of the tenant he works in and of
 *   tenants with an active support access.
 * - He edits or deactivates a foreign user only with such access, and never
 *   gives himself memberships of customer tenants (that is what support
 *   access is for).
 * - Assigning a user to several tenants is the customer's own business: an
 *   admin who is administrator in both units adds users of one unit to the
 *   other — and cannot touch memberships of tenants he does not administer.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const SYSTEM = "00000000-0000-4000-8000-000000000001";
const NORD = "00000000-0000-4000-8000-00000000000a";
const SUED = "00000000-0000-4000-8000-00000000000b";
const FREMD = "00000000-0000-4000-8000-00000000000c";

const sitzung = { authorized: true, tenantId: SYSTEM, userId: "sa" };
let superadmin = true;
const freigaben = new Set<string>();
const rangIn = new Map<string, number>();

const db = {
  user: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    groupBy: vi.fn(),
  },
  tenant: { findMany: vi.fn(), findUnique: vi.fn() },
  userTenantMembership: { upsert: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(),
};

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth/withPermission", () => ({
  requirePermission: vi.fn(async () => sitzung),
  requireSuperadmin: vi.fn(async () => ({ authorized: superadmin })),
}));
vi.mock("@/lib/auth/permissions", () => ({
  PERMISSIONS: { USERS_READ: "users:read", USERS_UPDATE: "users:update", USERS_DELETE: "users:delete", USERS_CREATE: "users:create" },
  isSuperadmin: vi.fn(async () => superadmin),
  getUserHighestHierarchy: vi.fn(async (_u: string, t: string) => rangIn.get(t) ?? 0),
}));
vi.mock("@/lib/support/zugang", () => ({ mandantenMitFreigabe: vi.fn(async () => freigaben) }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { id: sitzung.userId } })) }));
vi.mock("@/lib/auth/permissionCache", () => ({ invalidateUser: vi.fn() }));
vi.mock("@/lib/lizenz/lizenz-db", () => ({ lizenzPruefen: vi.fn(async () => null) }));
vi.mock("@/lib/logger", () => ({ apiLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

const liste = await import("./route");
const detail = await import("./[id]/route");

const anfrage = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://x${url}`, { method, ...(body !== undefined && { body: JSON.stringify(body) }) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(sitzung, { tenantId: SYSTEM, userId: "sa" });
  superadmin = true;
  freigaben.clear();
  rangIn.clear();
  db.user.update.mockResolvedValue({ id: "u" });
  db.userTenantMembership.findMany.mockResolvedValue([]);
});

describe("Benutzerliste des Superadmins", () => {
  it("Namen nur aus sichtbaren Mandanten, fremde nur als Anzahl", async () => {
    freigaben.add(NORD);
    db.user.findMany.mockResolvedValue([{ id: "n1", tenantId: NORD, email: "a@nord.test" }]);
    db.user.groupBy.mockResolvedValue([{ tenantId: FREMD, _count: { _all: 7 } }]);
    db.tenant.findMany.mockResolvedValue([{ id: FREMD, name: "Fremd GmbH" }]);

    const res = (await liste.GET(anfrage("/api/admin/users")))!;
    const json = await res.json();

    const where = db.user.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toEqual({ in: expect.arrayContaining([SYSTEM, NORD]) });
    expect(where.tenantId.in).not.toContain(FREMD);
    expect(json.verborgen).toEqual([{ tenantId: FREMD, tenantName: "Fremd GmbH", anzahl: 7 }]);
  });
});

describe("fremde Benutzer", () => {
  it("ohne Freigabe weder ansehen noch ändern noch deaktivieren", async () => {
    db.user.findUnique.mockResolvedValue({ id: "f1", tenantId: FREMD, email: "x@fremd.test", status: "ACTIVE" });
    expect((await detail.GET(anfrage("/api/admin/users/f1"), ctx("f1")))!.status).toBe(403);
    expect((await detail.PATCH(anfrage("/api/admin/users/f1", "PATCH", { password: "neuesPasswort1" }), ctx("f1")))!.status).toBe(403);
    expect((await detail.DELETE(anfrage("/api/admin/users/f1", "DELETE"), ctx("f1")))!.status).toBe(403);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("mit Freigabe schon", async () => {
    freigaben.add(FREMD);
    db.user.findUnique.mockResolvedValue({ id: "f1", tenantId: FREMD, email: "x@fremd.test", status: "ACTIVE" });
    expect((await detail.PATCH(anfrage("/api/admin/users/f1", "PATCH", { firstName: "Neu" }), ctx("f1")))!.status).toBe(200);
  });

  it("der Superadmin gibt sich selbst keine Mitgliedschaft in einem Kundenmandanten", async () => {
    freigaben.add(FREMD);
    db.user.findUnique.mockResolvedValue({ id: "sa", tenantId: SYSTEM, email: "admin@plattform.test", status: "ACTIVE" });
    const res = (await detail.PATCH(
      anfrage("/api/admin/users/sa", "PATCH", { memberships: [{ tenantId: SYSTEM, isPrimary: true }, { tenantId: FREMD }] }),
      ctx("sa"),
    ))!;
    expect(res.status).toBe(403);
    expect(db.userTenantMembership.upsert).not.toHaveBeenCalled();
  });
});

describe("Kunden-Admin ordnet Benutzer seinen Einheiten zu", () => {
  beforeEach(() => {
    superadmin = false;
    Object.assign(sitzung, { tenantId: NORD, userId: "leitung" });
    rangIn.set(NORD, 80).set(SUED, 80);
    // The caller's own memberships: Nord (home) and Süd.
    db.userTenantMembership.findMany.mockResolvedValue([
      { tenantId: NORD, status: "ACTIVE" },
      { tenantId: SUED, status: "ACTIVE" },
    ]);
    db.user.findFirst.mockResolvedValue({ id: "m1", tenantId: NORD, email: "m@nord.test", status: "ACTIVE" });
  });

  it("in eine Einheit, in der er Administrator ist", async () => {
    const res = (await detail.PATCH(
      anfrage("/api/admin/users/m1", "PATCH", { memberships: [{ tenantId: NORD, isPrimary: true }, { tenantId: SUED }] }),
      ctx("m1"),
    ))!;
    expect(res.status).toBe(200);
    expect(db.userTenantMembership.upsert).toHaveBeenCalledTimes(2);
  });

  it("nicht in einen Mandanten, den er nicht verwaltet", async () => {
    const res = (await detail.PATCH(
      anfrage("/api/admin/users/m1", "PATCH", { memberships: [{ tenantId: NORD, isPrimary: true }, { tenantId: FREMD }] }),
      ctx("m1"),
    ))!;
    expect(res.status).toBe(403);
    expect(db.userTenantMembership.upsert).not.toHaveBeenCalled();
  });

  it("entfernt nur Mitgliedschaften der Mandanten, die er verwaltet", async () => {
    await detail.PATCH(anfrage("/api/admin/users/m1", "PATCH", { memberships: [{ tenantId: NORD, isPrimary: true }] }), ctx("m1"));
    const where = db.userTenantMembership.deleteMany.mock.calls[0][0].where;
    expect(where.tenantId.in).toEqual(expect.arrayContaining([SUED]));
    expect(where.tenantId.in).not.toContain(FREMD);
  });
});
