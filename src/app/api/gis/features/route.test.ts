/**
 * Kartenebenen mit Obergrenze.
 *
 * Die Route lud Parks, Anlagen, Flurstücke und Markierungen vollständig,
 * Flurstücke samt Geometrie und Pachthistorie. `gisMaxFeaturesPerLayer` gab
 * es, nur nicht hier. Und wird gekürzt, muss die Karte es sagen — sonst fehlen
 * Flurstücke, ohne dass es jemand merkt.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const plotFindMany = vi.fn();
const annotationFindMany = vi.fn();

vi.mock("@/lib/config/api-limits", () => ({ API_LIMITS: { gisMaxFeaturesPerLayer: 2 } }));
const db = {
  park: { findMany: vi.fn().mockResolvedValue([]) },
  turbine: { findMany: vi.fn().mockResolvedValue([]) },
  plot: { findMany: (...a: unknown[]) => plotFindMany(...a) },
  mapAnnotation: { findMany: (...a: unknown[]) => annotationFindMany(...a) },
};
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/mandant/mandant-db", () => ({ mandantDb: () => db }));
vi.mock("@/lib/auth/permissions", () => ({ PERMISSIONS: { PLOTS_READ: "plots:read" } }));
vi.mock("@/lib/turbines/real-turbines", () => ({ NUR_ANLAGEN: {} }));
vi.mock("@/lib/auth/withPermission", () => ({
  requirePermission: vi.fn().mockResolvedValue({ authorized: true, tenantId: "t1" }),
}));
vi.mock("@/lib/logger", () => ({
  apiLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET } from "./route";

const flurstueck = (id: string) => ({ id, leasePlots: [], plotAreas: [], park: null });

beforeEach(() => {
  vi.clearAllMocks();
  annotationFindMany.mockResolvedValue([]);
});

describe("Kartenebenen mit Obergrenze", () => {
  it("lädt je Ebene höchstens Grenze + 1 Objekte", async () => {
    plotFindMany.mockResolvedValue([]);
    await GET(new NextRequest("http://localhost/api/gis/features"));
    expect(plotFindMany.mock.calls[0][0].take).toBe(3);
    expect(annotationFindMany.mock.calls[0][0].take).toBe(3);
  });

  it("kürzt eine übervolle Ebene und sagt es", async () => {
    plotFindMany.mockResolvedValue([flurstueck("a"), flurstueck("b"), flurstueck("c")]);
    const res = await GET(new NextRequest("http://localhost/api/gis/features"));
    const rumpf = await res.json();

    expect(rumpf.plots).toHaveLength(2);
    expect(rumpf.gekuerzt).toEqual(["plots"]);
    expect(rumpf.grenze).toBe(2);
  });

  it("ohne Kürzung bleibt die Liste leer", async () => {
    plotFindMany.mockResolvedValue([flurstueck("a")]);
    const rumpf = await (await GET(new NextRequest("http://localhost/api/gis/features"))).json();
    expect(rumpf.gekuerzt).toEqual([]);
  });
});
