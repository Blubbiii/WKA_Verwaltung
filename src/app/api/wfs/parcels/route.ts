import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { fetchWfsParcels } from "@/lib/wfs/wfs-client";
import { WFS_SERVICES, WFS_CACHE_DURATION_MS } from "@/lib/wfs/wfs-config";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// GET /api/wfs/parcels
// WFS Proxy — queries German cadastral WFS services and returns GeoJSON.
// Caches results in WfsCadastralCache for 7 days.
//
// Query params:
//   ?service=NRW             - WFS service key (required)
//   ?cadastralDistrict=xxx   - Gemarkung (required)
//   ?fieldNumber=3           - Flur number (optional)
//   ?bbox=minLon,minLat,maxLon,maxLat  - Bounding box (optional)
//   ?maxFeatures=500         - Max features (default 500)
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const serviceKey = searchParams.get("service");
    const cadastralDistrict = searchParams.get("cadastralDistrict");
    const fieldNumber = searchParams.get("fieldNumber");
    const bboxStr = searchParams.get("bbox");
    const maxFeatures = parseInt(searchParams.get("maxFeatures") ?? "500", 10);

    if (!serviceKey || !WFS_SERVICES[serviceKey]) {
      return NextResponse.json(
        {
          error: "Unbekannter WFS-Service",
          availableServices: Object.keys(WFS_SERVICES).map((k) => ({
            key: k,
            label: WFS_SERVICES[k].label,
          })),
        },
        { status: 400 },
      );
    }

    if (!cadastralDistrict && !bboxStr) {
      return NextResponse.json(
        { error: "cadastralDistrict oder bbox ist erforderlich" },
        { status: 400 },
      );
    }

    // Check cache first
    if (cadastralDistrict) {
      const cached = await prisma.wfsCadastralCache.findMany({
        where: {
          tenantId: check.tenantId!,
          serviceUrl: WFS_SERVICES[serviceKey].url,
          cadastralDistrict,
          ...(fieldNumber ? { fieldNumber } : {}),
          fetchedAt: {
            gte: new Date(Date.now() - WFS_CACHE_DURATION_MS),
          },
        },
      });

      if (cached.length > 0) {
        logger.info(
          { service: serviceKey, cadastralDistrict, cacheHits: cached.length },
          "WFS cache hit",
        );
        return NextResponse.json({
          type: "FeatureCollection",
          features: cached.map((c) => ({
            type: "Feature",
            geometry: c.geometry,
            properties: {
              cadastralDistrict: c.cadastralDistrict,
              fieldNumber: c.fieldNumber,
              plotNumber: c.plotNumber ?? "",
              ...(c.properties as Record<string, unknown>),
            },
          })),
          meta: { source: "cache", count: cached.length },
        });
      }
    }

    // Query WFS service
    const bbox = bboxStr
      ? (bboxStr.split(",").map(Number) as [number, number, number, number])
      : undefined;

    const features = await fetchWfsParcels({
      serviceKey,
      cadastralDistrict: cadastralDistrict ?? undefined,
      fieldNumber: fieldNumber ?? undefined,
      bbox,
      maxFeatures,
    });

    // Cache results
    if (cadastralDistrict && features.length > 0) {
      try {
        for (const feature of features) {
          const fn = feature.properties.fieldNumber || fieldNumber || "";
          const pn = feature.properties.plotNumber || "";

          await prisma.wfsCadastralCache.upsert({
            where: {
              tenantId_serviceUrl_cadastralDistrict_fieldNumber_plotNumber: {
                tenantId: check.tenantId!,
                serviceUrl: WFS_SERVICES[serviceKey].url,
                cadastralDistrict,
                fieldNumber: fn,
                plotNumber: pn,
              },
            },
            create: {
              tenantId: check.tenantId!,
              serviceUrl: WFS_SERVICES[serviceKey].url,
              cadastralDistrict,
              fieldNumber: fn,
              plotNumber: pn,
              geometry: feature.geometry as object,
              properties: feature.properties.raw as object,
            },
            update: {
              geometry: feature.geometry as object,
              properties: feature.properties.raw as object,
              fetchedAt: new Date(),
            },
          });
        }
      } catch (cacheErr) {
        logger.warn({ err: cacheErr }, "Failed to cache WFS results");
      }
    }

    return NextResponse.json({
      type: "FeatureCollection",
      features,
      meta: { source: "wfs", count: features.length, service: serviceKey },
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler bei WFS-Abfrage");
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Fehler bei der Katasterabfrage", details: errMsg },
      { status: 500 },
    );
  }
}
