"use client";

import { useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Link from "next/link";

interface ParkLocation {
  id: string;
  name: string;
  shortName: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  _count?: {
    turbines: number;
  };
}

interface ParksOverviewMapProps {
  parks: ParkLocation[];
  height?: string;
  className?: string;
}

// Custom DivIcon for park
const createParkIcon = (status: string) =>
  L.divIcon({
    className: "custom-park-overview-marker",
    html: `<div style="
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, ${status === "ACTIVE" ? "#3b82f6 0%, #1d4ed8" : "#9ca3af 0%, #6b7280"} 100%);
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    ">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
      </svg>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });

export function ParksOverviewMap({
  parks,
  height = "500px",
  className,
}: ParksOverviewMapProps) {
  // Filter parks with valid coordinates
  const parksWithCoords = useMemo(
    () => parks.filter((p) => p.latitude != null && p.longitude != null),
    [parks]
  );

  // Create icons
  const activeIcon = useMemo(() => createParkIcon("ACTIVE"), []);
  const inactiveIcon = useMemo(() => createParkIcon("INACTIVE"), []);

  if (parksWithCoords.length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border bg-muted ${className || ""}`}
        style={{ height }}
      >
        <div className="text-center text-muted-foreground">
          <p className="text-sm">Keine Parks mit Koordinaten verfügbar</p>
          <p className="text-xs mt-1">
            Fügen Sie Koordinaten zu Ihren Parks hinzu
          </p>
        </div>
      </div>
    );
  }

  // Calculate bounds to fit all parks
  const bounds = L.latLngBounds(
    parksWithCoords.map(
      (p) => [Number(p.latitude), Number(p.longitude)] as [number, number]
    )
  );

  return (
    <MapContainer
      bounds={bounds}
      boundsOptions={{ padding: [50, 50] }}
      className={`rounded-lg border ${className || ""}`}
      style={{ height, width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> Mitwirkende'
        url="https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png"
      />

      {parksWithCoords.map((park) => (
        <Marker
          key={park.id}
          position={[Number(park.latitude), Number(park.longitude)]}
          icon={park.status === "ACTIVE" ? activeIcon : inactiveIcon}
        >
          <Popup>
            <div className="space-y-1 min-w-[150px]">
              <Link
                href={`/parks/${park.id}`}
                className="font-semibold text-blue-600 hover:underline block"
              >
                {park.name}
                {park.shortName && (
                  <span className="text-muted-foreground ml-1">
                    ({park.shortName})
                  </span>
                )}
              </Link>
              {park.city && (
                <div className="text-xs text-muted-foreground">{park.city}</div>
              )}
              {park._count && (
                <div className="text-xs">
                  {park._count.turbines} Anlage
                  {park._count.turbines !== 1 ? "n" : ""}
                </div>
              )}
              <div className="text-xs">
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${
                    park.status === "ACTIVE"
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {park.status === "ACTIVE" ? "Aktiv" : "Inaktiv"}
                </span>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
