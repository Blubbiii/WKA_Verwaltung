"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface LocationPreviewMapProps {
  latitude: number | null;
  longitude: number | null;
  label?: string;
  height?: string;
}

// Marker icon
const createLocationIcon = () =>
  L.divIcon({
    className: "custom-location-marker",
    html: `<div style="
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    ">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
        <circle cx="12" cy="10" r="3"/>
      </svg>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });

// Component to recenter map when coordinates change
function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();

  useEffect(() => {
    map.setView([lat, lng], map.getZoom() < 8 ? 12 : map.getZoom(), {
      animate: true,
    });
  }, [map, lat, lng]);

  return null;
}

export function LocationPreviewMap({
  latitude,
  longitude,
  label = "Standort",
  height = "280px",
}: LocationPreviewMapProps) {
  const locationIcon = useMemo(() => createLocationIcon(), []);

  const hasValidCoords =
    latitude != null &&
    longitude != null &&
    !isNaN(latitude) &&
    !isNaN(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180;

  if (!hasValidCoords) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border bg-muted"
        style={{ height }}
      >
        <div className="text-center text-muted-foreground px-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mx-auto mb-2 opacity-50"
          >
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <p className="text-sm">Koordinaten eingeben um Standort zu sehen</p>
          <p className="text-xs mt-1">Format: WGS84 Dezimalgrad</p>
        </div>
      </div>
    );
  }

  return (
    <MapContainer
      center={[latitude!, longitude!]}
      zoom={12}
      className="rounded-lg border"
      style={{ height, width: "100%" }}
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png"
      />
      <RecenterMap lat={latitude!} lng={longitude!} />
      <Marker position={[latitude!, longitude!]} icon={locationIcon}>
        <Popup>
          <div className="font-semibold">{label}</div>
          <div className="text-xs text-muted-foreground">
            {latitude!.toFixed(6)}, {longitude!.toFixed(6)}
          </div>
        </Popup>
      </Marker>
    </MapContainer>
  );
}
