/**
 * Export mit Obergrenze.
 *
 * Die Route lud jede Tabelle vollständig und baute daraus XLSX oder CSV im
 * Arbeitsspeicher. Bei einem großen Mandanten kippt der Serverprozess — nicht
 * nur für den Exportierenden. `API_LIMITS.maxExportEntries` gab es längst, nur
 * nicht hier.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const parkFindMany = vi.fn();
const excel = vi.fn();

vi.mock("@/lib/config/api-limits", () => ({ API_LIMITS: { maxExportEntries: 3 } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    park: { findMany: (...a: unknown[]) => parkFindMany(...a) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  },
}));
vi.mock("@/lib/auth/withPermission", () => ({
  requirePermission: vi.fn().mockResolvedValue({ authorized: true, tenantId: "t1", userId: "u1" }),
}));
vi.mock("@/lib/export/excel", () => ({ generateExcel: (...a: unknown[]) => excel(...a) }));
vi.mock("@/lib/export/csv", () => ({ generateCsvBuffer: vi.fn(() => Buffer.from("x")) }));
vi.mock("@/lib/logger", () => ({
  apiLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET } from "./route";

async function aufruf(): Promise<Response> {
  const res = await GET(new NextRequest("http://localhost/api/export/parks?format=xlsx"), {
    params: Promise.resolve({ type: "parks" }),
  });
  if (!res) throw new Error("Route lieferte keine Antwort");
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  excel.mockResolvedValue(Buffer.from("xlsx"));
});

describe("Export mit Obergrenze", () => {
  it("lädt höchstens Grenze + 1 Zeilen", async () => {
    parkFindMany.mockResolvedValue([{ id: "p1" }]);
    await aufruf();
    expect(parkFindMany.mock.calls[0][0].take).toBe(4);
  });

  it("über der Grenze: verständliche Absage, keine Datei", async () => {
    parkFindMany.mockResolvedValue([{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }]);
    const res = await aufruf();

    expect(res.status).toBe(422);
    expect(excel, "Die Datei darf gar nicht erst entstehen").not.toHaveBeenCalled();
    const rumpf = await res.json();
    expect(rumpf.error).toMatch(/3/);
    expect(rumpf.error).toMatch(/Filter|eingrenzen/i);
  });

  it("genau an der Grenze wird geliefert", async () => {
    parkFindMany.mockResolvedValue([{ id: "1" }, { id: "2" }, { id: "3" }]);
    const res = await aufruf();
    expect(res.status).toBe(200);
    expect(excel).toHaveBeenCalled();
  });
});
