"use client";

import { GeoJSON } from "react-leaflet";
import type { FeatureCollection, Geometry } from "geojson";
import type { PathOptions } from "leaflet";

// Matches MapAnnotationType enum from Prisma
type AnnotationType =
  | "CABLE_ROUTE"
  | "COMPENSATION_AREA"
  | "ACCESS_ROAD"
  | "EXCLUSION_ZONE"
  | "CUSTOM";

export interface MapAnnotationData {
  id: string;
  name: string;
  type: AnnotationType;
  geometry: Geometry;
  style?: PathOptions | null;
  description?: string | null;
  createdBy?: { firstName?: string | null; lastName?: string | null };
}

interface MapAnnotationLayerProps {
  annotations: MapAnnotationData[];
  visible?: boolean;
}

// Default styles per annotation type
const TYPE_STYLES: Record<AnnotationType, PathOptions> = {
  CABLE_ROUTE: {
    color: "#eab308",
    weight: 3,
    dashArray: "8 6",
    fillOpacity: 0,
  },
  COMPENSATION_AREA: {
    color: "#16a34a",
    fillColor: "#22c55e",
    fillOpacity: 0.15,
    weight: 2,
  },
  ACCESS_ROAD: {
    color: "#92400e",
    weight: 3,
    fillColor: "#d97706",
    fillOpacity: 0.1,
  },
  EXCLUSION_ZONE: {
    color: "#dc2626",
    fillColor: "#ef4444",
    fillOpacity: 0.1,
    weight: 2,
    dashArray: "4 4",
  },
  CUSTOM: {
    color: "#6366f1",
    fillColor: "#818cf8",
    fillOpacity: 0.15,
    weight: 2,
  },
};

const TYPE_LABELS: Record<AnnotationType, string> = {
  CABLE_ROUTE: "Kabeltrasse",
  COMPENSATION_AREA: "Ausgleichsfläche",
  ACCESS_ROAD: "Zuwegung",
  EXCLUSION_ZONE: "Sperrzone",
  CUSTOM: "Sonstiges",
};

export function MapAnnotationLayer({
  annotations,
  visible = true,
}: MapAnnotationLayerProps) {
  if (!visible || annotations.length === 0) return null;

  const featureCollection: FeatureCollection = {
    type: "FeatureCollection",
    features: annotations.map((a) => ({
      type: "Feature" as const,
      geometry: a.geometry,
      properties: {
        id: a.id,
        name: a.name,
        type: a.type,
        description: a.description,
        customStyle: a.style,
        createdByName: a.createdBy
          ? [a.createdBy.firstName, a.createdBy.lastName].filter(Boolean).join(" ")
          : undefined,
      },
    })),
  };

  return (
    <GeoJSON
      key={annotations.map((a) => a.id).join(",")}
      data={featureCollection}
      style={(feature) => {
        const props = feature?.properties;
        const customStyle = props?.customStyle as PathOptions | null;
        const typeStyle = TYPE_STYLES[props?.type as AnnotationType] ?? TYPE_STYLES.CUSTOM;
        return customStyle ? { ...typeStyle, ...customStyle } : typeStyle;
      }}
      onEachFeature={(feature, layer) => {
        const props = feature.properties;
        const typeLabel = TYPE_LABELS[props?.type as AnnotationType] ?? props?.type;

        const popupContent = `
          <div style="min-width: 160px;">
            <div style="font-weight: 600;">${props?.name || "Annotation"}</div>
            <div style="font-size: 12px; color: #6b7280;">${typeLabel}</div>
            ${props?.description ? `<div style="font-size: 12px; margin-top: 4px;">${props.description}</div>` : ""}
            ${props?.createdByName ? `<div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">von ${props.createdByName}</div>` : ""}
          </div>
        `;

        layer.bindPopup(popupContent);
      }}
    />
  );
}

export { TYPE_LABELS as ANNOTATION_TYPE_LABELS };
