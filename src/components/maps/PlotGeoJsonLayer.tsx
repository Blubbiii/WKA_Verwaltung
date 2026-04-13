"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { GeoJSON, Tooltip } from "react-leaflet";
import type { Layer, PathOptions } from "leaflet";
import type { Feature, Geometry } from "geojson";

// --- Public types ---

export interface PlotFeature {
  id: string;
  plotNumber: string;
  cadastralDistrict: string;
  fieldNumber: string;
  areaSqm: number | null;
  geometry: GeoJSON.Geometry;
  lessorName: string | null;
  lessorId: string | null;
  leaseStatus: string | null; // "ACTIVE", "DRAFT", "EXPIRED", "TERMINATED", null
  leaseId: string | null;
}

interface PlotGeoJsonLayerProps {
  plots: PlotFeature[];
  visible: boolean;
  showLabels: boolean;
  hiddenOwnerIds?: Set<string>;
}

// --- Color palette ---

// 12 distinguishable colors for owner color-coding
const OWNER_PALETTE = [
  "#3b82f6", // blue
  "#22c55e", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#4075BF", // warm navy
  "#a855f7", // purple
  "#84cc16", // lime
  "#e11d48", // rose
  "#0ea5e9", // sky
];

const NO_CONTRACT_COLOR = "#ef4444"; // red
const EXPIRED_COLOR = "#9ca3af"; // gray

// --- Helpers ---

/** Build a deterministic color map: sorted unique lessorIds -> palette index */
function buildOwnerColorMap(plots: PlotFeature[]): Map<string, string> {
  const uniqueIds = Array.from(
    new Set(plots.map((p) => p.lessorId).filter(Boolean) as string[])
  ).sort();

  const map = new Map<string, string>();
  uniqueIds.forEach((id, idx) => {
    map.set(id, OWNER_PALETTE[idx % OWNER_PALETTE.length]);
  });
  return map;
}

type LeaseStatusTranslator = (status: string | null) => string;

function getLeaseStatusBadgeClasses(status: string | null): string {
  switch (status) {
    case "ACTIVE":
      return "background:#22c55e;color:#fff;";
    case "DRAFT":
      return "background:#f59e0b;color:#fff;";
    case "EXPIRED":
    case "TERMINATED":
      return "background:#9ca3af;color:#fff;";
    default:
      return "background:#ef4444;color:#fff;";
  }
}

// --- Component ---

export function PlotGeoJsonLayer({
  plots,
  visible,
  showLabels,
  hiddenOwnerIds,
}: PlotGeoJsonLayerProps) {
  const t = useTranslations("maps.plotLayer");

  const getLeaseStatusLabel: LeaseStatusTranslator = (status) => {
    switch (status) {
      case "ACTIVE":
        return t("statusActive");
      case "DRAFT":
        return t("statusDraft");
      case "EXPIRED":
        return t("statusExpired");
      case "TERMINATED":
        return t("statusTerminated");
      default:
        return t("statusNoContract");
    }
  };

  // Build color map once when plots change
  const ownerColorMap = useMemo(() => buildOwnerColorMap(plots), [plots]);

  // Filter plots by hidden owners
  const visiblePlots = useMemo(() => {
    if (!hiddenOwnerIds || hiddenOwnerIds.size === 0) return plots;
    return plots.filter(
      (p) => !p.lessorId || !hiddenOwnerIds.has(p.lessorId)
    );
  }, [plots, hiddenOwnerIds]);

  // Convert PlotFeature[] to a GeoJSON FeatureCollection
  const geojsonData = useMemo(() => {
    const features: Feature<Geometry>[] = visiblePlots.map((plot) => ({
      type: "Feature" as const,
      geometry: plot.geometry,
      properties: {
        id: plot.id,
        plotNumber: plot.plotNumber,
        cadastralDistrict: plot.cadastralDistrict,
        fieldNumber: plot.fieldNumber,
        areaSqm: plot.areaSqm,
        lessorName: plot.lessorName,
        lessorId: plot.lessorId,
        leaseStatus: plot.leaseStatus,
        leaseId: plot.leaseId,
      },
    }));

    return {
      type: "FeatureCollection" as const,
      features,
    };
  }, [visiblePlots]);

  // Unique key that forces GeoJSON re-render when data or visibility changes
  const geoJsonKey = useMemo(
    () => visiblePlots.map((p) => `${p.id}-${p.leaseStatus}`).join("|"),
    [visiblePlots]
  );

  // Style function for each feature
  const styleFeature = useMemo(() => {
    return (feature: Feature | undefined): PathOptions => {
      if (!feature || !feature.properties) {
        return {};
      }

      const { lessorId, leaseStatus } = feature.properties;
      const ownerColor = lessorId ? ownerColorMap.get(lessorId) : null;

      switch (leaseStatus) {
        case "ACTIVE":
          return {
            color: ownerColor || OWNER_PALETTE[0],
            weight: 2,
            fillColor: ownerColor || OWNER_PALETTE[0],
            fillOpacity: 0.3,
            dashArray: undefined,
          };
        case "DRAFT":
          return {
            color: ownerColor || OWNER_PALETTE[0],
            weight: 2,
            fillColor: ownerColor || OWNER_PALETTE[0],
            fillOpacity: 0.2,
            dashArray: "8 4",
          };
        case "EXPIRED":
        case "TERMINATED":
          return {
            color: EXPIRED_COLOR,
            weight: 2,
            fillColor: EXPIRED_COLOR,
            fillOpacity: 0.15,
            dashArray: undefined,
          };
        default:
          // No contract
          return {
            color: NO_CONTRACT_COLOR,
            weight: 2,
            fillColor: NO_CONTRACT_COLOR,
            fillOpacity: 0.2,
            dashArray: "8 4",
          };
      }
    };
  }, [ownerColorMap]);

  // Bind popup to each feature
  const onEachFeature = useMemo(() => {
    return (feature: Feature, layer: Layer) => {
      if (!feature.properties) return;

      const {
        cadastralDistrict,
        fieldNumber,
        plotNumber,
        areaSqm,
        lessorName,
        leaseStatus,
      } = feature.properties;

      const areaHa =
        areaSqm != null ? (areaSqm / 10000).toFixed(4) : t("unknown");

      const statusBadge = `<span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:500;${getLeaseStatusBadgeClasses(leaseStatus)}">${getLeaseStatusLabel(leaseStatus)}</span>`;

      const html = `
        <div style="min-width:180px;font-size:13px;line-height:1.5;">
          <div style="font-weight:600;margin-bottom:4px;">
            ${t("plot")}: ${cadastralDistrict || ""} ${fieldNumber || ""}/${plotNumber || ""}
          </div>
          <div>${t("area")}: ${areaHa} ha</div>
          <div>${t("owner")}: ${lessorName || t("unassigned")}</div>
          <div style="margin-top:4px;">${t("contract")}: ${statusBadge}</div>
        </div>
      `;

      layer.bindPopup(html);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  if (!visible || visiblePlots.length === 0) {
    return null;
  }

  return (
    <GeoJSON
      key={geoJsonKey}
      data={geojsonData}
      style={styleFeature}
      onEachFeature={onEachFeature}
    >
      {showLabels &&
        visiblePlots.map((plot) => {
          // Calculate a rough center for the tooltip from the geometry
          // For polygons, use the first coordinate ring centroid
          const center = getCentroid(plot.geometry);
          if (!center) return null;

          return (
            <Tooltip
              key={`tooltip-${plot.id}`}
              permanent
              direction="center"
              className="plot-label-tooltip"
            >
              {plot.fieldNumber}/{plot.plotNumber}
            </Tooltip>
          );
        })}
    </GeoJSON>
  );
}

/** Compute a rough centroid for a GeoJSON geometry (for tooltip placement). */
function getCentroid(
  geometry: GeoJSON.Geometry
): [number, number] | null {
  let coords: number[][] = [];

  if (geometry.type === "Polygon") {
    coords = geometry.coordinates[0] as number[][];
  } else if (geometry.type === "MultiPolygon") {
    // Use the first polygon's outer ring
    coords = geometry.coordinates[0]?.[0] as number[][];
  } else {
    return null;
  }

  if (!coords || coords.length === 0) return null;

  let latSum = 0;
  let lngSum = 0;
  for (const coord of coords) {
    lngSum += coord[0];
    latSum += coord[1];
  }

  return [latSum / coords.length, lngSum / coords.length];
}

// Re-export the palette and helper for use in MapLayerControl
export { OWNER_PALETTE, buildOwnerColorMap };
