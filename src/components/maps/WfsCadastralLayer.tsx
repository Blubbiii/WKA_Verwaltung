"use client";

import { GeoJSON, Popup } from "react-leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { PathOptions } from "leaflet";

// Match status type from parcel-matcher
type MatchStatus =
  | "matched_active"
  | "matched_expiring"
  | "matched_expired"
  | "matched_draft"
  | "unmatched";

interface WfsFeatureProperties {
  cadastralDistrict: string;
  fieldNumber: string;
  plotNumber: string;
  area?: number;
  matchStatus?: MatchStatus;
  lessorName?: string;
  leaseStatus?: string;
  leaseEndDate?: string;
  [key: string]: unknown;
}

interface WfsCadastralLayerProps {
  features: Feature<Geometry>[];
  visible?: boolean;
}

// Color mapping for match statuses
const STATUS_STYLES: Record<MatchStatus, PathOptions> = {
  matched_active: {
    color: "#16a34a",
    fillColor: "#22c55e",
    fillOpacity: 0.3,
    weight: 2,
  },
  matched_expiring: {
    color: "#d97706",
    fillColor: "#f59e0b",
    fillOpacity: 0.3,
    weight: 2,
  },
  matched_expired: {
    color: "#6b7280",
    fillColor: "#9ca3af",
    fillOpacity: 0.2,
    weight: 1.5,
    dashArray: "4 4",
  },
  matched_draft: {
    color: "#2563eb",
    fillColor: "#3b82f6",
    fillOpacity: 0.2,
    weight: 1.5,
    dashArray: "6 3",
  },
  unmatched: {
    color: "#dc2626",
    fillColor: "#ef4444",
    fillOpacity: 0.2,
    weight: 2,
  },
};

const DEFAULT_STYLE: PathOptions = {
  color: "#6b7280",
  fillColor: "#9ca3af",
  fillOpacity: 0.15,
  weight: 1,
};

const STATUS_LABELS: Record<MatchStatus, string> = {
  matched_active: "Vertrag aktiv",
  matched_expiring: "Vertrag läuft aus",
  matched_expired: "Vertrag abgelaufen",
  matched_draft: "Vertrag (Entwurf)",
  unmatched: "Kein Vertrag",
};

export function WfsCadastralLayer({ features, visible = true }: WfsCadastralLayerProps) {
  if (!visible || features.length === 0) return null;

  const featureCollection: FeatureCollection = {
    type: "FeatureCollection",
    features,
  };

  return (
    <GeoJSON
      key={JSON.stringify(features.map((f) => f.properties?.plotNumber)).slice(0, 200)}
      data={featureCollection}
      style={(feature) => {
        const props = feature?.properties as WfsFeatureProperties | undefined;
        const status = props?.matchStatus;
        return status ? STATUS_STYLES[status] : DEFAULT_STYLE;
      }}
      onEachFeature={(feature, layer) => {
        const props = feature.properties as WfsFeatureProperties;
        const status = props.matchStatus;

        const popupContent = `
          <div style="min-width: 180px;">
            <div style="font-weight: 600; margin-bottom: 4px;">
              Flur ${props.fieldNumber}, Flurstück ${props.plotNumber}
            </div>
            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">
              Gemarkung: ${props.cadastralDistrict}
            </div>
            ${props.area ? `<div style="font-size: 12px;">Fläche: ${props.area.toLocaleString("de-DE")} m²</div>` : ""}
            ${status ? `
              <div style="margin-top: 6px; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; display: inline-block;
                background: ${STATUS_STYLES[status].fillColor}20; color: ${STATUS_STYLES[status].color}; border: 1px solid ${STATUS_STYLES[status].color}40;">
                ${STATUS_LABELS[status]}
              </div>
            ` : ""}
            ${props.lessorName ? `<div style="font-size: 12px; margin-top: 4px;">Verpächter: ${props.lessorName}</div>` : ""}
            ${props.leaseEndDate ? `<div style="font-size: 12px;">Enddatum: ${new Date(props.leaseEndDate).toLocaleDateString("de-DE")}</div>` : ""}
          </div>
        `;

        layer.bindPopup(popupContent);
      }}
    />
  );
}

/** Legend data for the WFS layer */
export const WFS_STATUS_LEGEND = [
  { label: "Vertrag aktiv", color: "#22c55e" },
  { label: "Vertrag läuft aus", color: "#f59e0b" },
  { label: "Kein Vertrag", color: "#ef4444" },
  { label: "Abgelaufen", color: "#9ca3af" },
  { label: "Entwurf", color: "#3b82f6" },
];
