/**
 * Eingehende E-Mail ohne Zuordnungsregel.
 *
 * Vorher landete sie beim erstbesten aktiven Mandanten. Bei mehreren
 * Mandanten geriet so eine Rechnung, die Firma B galt, in den Posteingang von
 * Firma A — eine Vertraulichkeitsverletzung, die niemand bemerkt hätte.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const routeFindFirst = vi.fn();
const inboundCreate = vi.fn();
const eindeutig = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    emailRoute: { findFirst: (...a: unknown[]) => routeFindFirst(...a) },
    inboundEmail: { create: (...a: unknown[]) => inboundCreate(...a) },
    // Sollte die Route noch den erstbesten Mandanten suchen, faellt es hier auf.
    tenant: {
      findFirst: vi.fn().mockResolvedValue({ id: "fremder-mandant" }),
      findMany: vi.fn(),
    },
  },
}));
vi.mock("@/lib/tenant/eindeutiger-mandant", () => ({
  eindeutigerAktiverMandant: () => eindeutig(),
}));
vi.mock("@/lib/storage", () => ({ uploadFile: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  apiLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
  getClientIp: () => "127.0.0.1",
  getRateLimitResponse: vi.fn(),
}));

import { POST } from "./route";

const SCHLUESSEL = "test-schluessel";

function anfrage(): NextRequest {
  return new NextRequest("http://localhost/api/email/inbound", {
    method: "POST",
    headers: { authorization: `Bearer ${SCHLUESSEL}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: "lieferant@example.com",
      to: "unbekannt@posteingang.example",
      subject: "Rechnung 4711",
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INBOUND_EMAIL_API_KEY = SCHLUESSEL;
  routeFindFirst.mockResolvedValue(null); // keine Zuordnungsregel
});

describe("Eingehende E-Mail ohne Zuordnungsregel", () => {
  it("wird bei mehreren Mandanten abgelehnt statt einem beliebigen zugestellt", async () => {
    eindeutig.mockResolvedValue(null);
    const res = await POST(anfrage());

    expect(res.status).toBe(422);
    expect(inboundCreate, "Es darf nichts gespeichert werden").not.toHaveBeenCalled();
    const rumpf = await res.json();
    expect(rumpf.error).toMatch(/Zuordnung/);
  });

  it("geht bei genau einem Mandanten an diesen", async () => {
    eindeutig.mockResolvedValue({ id: "einziger" });
    inboundCreate.mockResolvedValue({ id: "mail-1" });
    await POST(anfrage()).catch(() => undefined);

    expect(inboundCreate).toHaveBeenCalled();
    const daten = inboundCreate.mock.calls[0][0].data;
    expect(daten.tenantId).toBe("einziger");
  });
});
