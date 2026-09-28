/**
 * The platform operator enters a customer's tenant (2026-09).
 *
 * Only with an active support access granted by the customer, or as an
 * emergency access with a stated reason — which lasts one hour and tells
 * the customer's admins at once.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const SYSTEM = "mandant-system";
const KUNDE = "mandant-kunde";

const aktiv = vi.fn();
const anlegen = vi.fn();
const setzen = vi.fn();
const benachrichtigen = vi.fn();

vi.mock("@/lib/auth/withPermission", () => ({
  requireSuperadmin: vi.fn().mockResolvedValue({ authorized: true, tenantId: SYSTEM, userId: "sa" }),
}));
vi.mock("@/lib/support/zugang", () => ({
  aktiverSupportZugriff: (...a: unknown[]) => aktiv(...a),
  vergesseZugang: vi.fn(),
  NOTFALL_DAUER_MS: 3_600_000,
}));
vi.mock("@/lib/auth/aktiver-mandant-cookie", () => ({ setzeAktivenMandanten: (...a: unknown[]) => setzen(...a) }));
vi.mock("@/lib/notifications", () => ({ notifyAdmins: (...a: unknown[]) => benachrichtigen(...a) }));
vi.mock("@/lib/logger", () => ({ apiLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findUnique: vi.fn().mockResolvedValue({ id: KUNDE, name: "Kunde GmbH", slug: "kunde", logoUrl: null }) },
    supportZugriff: { create: (...a: unknown[]) => anlegen(...a), findMany: vi.fn().mockResolvedValue([]) },
    auditLog: { create: vi.fn() },
  },
}));

const { POST } = await import("./route");

const betreten = async (body: Record<string, unknown>) =>
  (await POST(new NextRequest("http://x/api/superadmin/support", { method: "POST", body: JSON.stringify(body) })))!;

beforeEach(() => {
  vi.clearAllMocks();
  aktiv.mockResolvedValue(null);
  anlegen.mockImplementation(async ({ data }) => ({ id: "n1", ...data }));
});

describe("Mandant betreten", () => {
  it("ohne Freigabe des Kunden verweigert", async () => {
    const res = await betreten({ tenantId: KUNDE });
    expect(res.status).toBe(403);
    expect(setzen).not.toHaveBeenCalled();
  });

  it("mit aktiver Freigabe erlaubt, bis zu deren Ende", async () => {
    const bis = new Date(Date.now() + 2 * 3_600_000);
    aktiv.mockResolvedValue({ id: "f1", art: "FREIGABE", gueltigBis: bis });
    const res = await betreten({ tenantId: KUNDE });
    expect(res.status).toBe(200);
    const [daten, sekunden] = setzen.mock.calls[0];
    expect(daten).toMatchObject({ activeTenantId: KUNDE, userId: "sa", support: true });
    expect(sekunden).toBeGreaterThan(7_000);
    expect(sekunden).toBeLessThanOrEqual(7_200);
  });

  it("den eigenen Mandanten muss man nicht betreten", async () => {
    expect((await betreten({ tenantId: SYSTEM })).status).toBe(400);
  });

  it("Notfall ohne Begründung verweigert", async () => {
    const res = await betreten({ tenantId: KUNDE, notfall: { begruendung: "kurz" } });
    expect(res.status).toBe(400);
    expect(anlegen).not.toHaveBeenCalled();
  });

  it("Notfall mit Begründung: eine Stunde, Kunden-Admins werden benachrichtigt", async () => {
    const res = await betreten({
      tenantId: KUNDE,
      notfall: { begruendung: "Abrechnungslauf hängt, Kunde telefonisch nicht erreichbar" },
    });
    expect(res.status).toBe(200);
    const daten = anlegen.mock.calls[0][0].data;
    expect(daten).toMatchObject({ tenantId: KUNDE, art: "NOTFALL", superadminId: "sa" });
    expect(daten.gueltigBis.getTime() - Date.now()).toBeLessThanOrEqual(3_600_000);
    expect(benachrichtigen).toHaveBeenCalledWith(expect.objectContaining({ tenantId: KUNDE }));
    expect(setzen).toHaveBeenCalled();
  });
});
