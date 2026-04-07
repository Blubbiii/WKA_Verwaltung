"use client";

import { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet-draw/dist/leaflet.draw.css";

// leaflet-draw requires window.L to be set (it uses IIFE referencing global L).
// Webpack resolves leaflet's ESM module which does NOT set window.L,
// so we must assign it manually before dynamically importing leaflet-draw.
if (typeof window !== "undefined") {
  window.L = L;
}

interface DrawControlProps {
  /** Called when a shape is created (GeoJSON geometry) */
  onCreated: (geometry: GeoJSON.Geometry) => void;
}

export function DrawControl({ onCreated }: DrawControlProps) {
  const map = useMap();
  const drawControlRef = useRef<L.Control.Draw | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup>(new L.FeatureGroup());
  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;
  const [drawReady, setDrawReady] = useState(false);

  // Dynamically import leaflet-draw after window.L is set
  useEffect(() => {
    let cancelled = false;
    import("leaflet-draw").then(() => {
      if (!cancelled) setDrawReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!map || !drawReady) return;

    const drawnItems = drawnItemsRef.current;
    map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
      position: "topleft",
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          shapeOptions: {
            color: "#6366f1",
            weight: 2,
            fillOpacity: 0.15,
          },
        },
        polyline: {
          shapeOptions: {
            color: "#eab308",
            weight: 3,
          },
        },
        rectangle: {
          shapeOptions: {
            color: "#6366f1",
            weight: 2,
            fillOpacity: 0.15,
          },
        },
        circle: false,
        circlemarker: false,
        marker: false,
      },
      edit: {
        featureGroup: drawnItems,
        remove: true,
      },
    });

    drawControlRef.current = drawControl;
    map.addControl(drawControl);

    const handleCreated = (e: L.LeafletEvent) => {
      const event = e as L.DrawEvents.Created;
      const layer = event.layer;
      drawnItems.addLayer(layer);

      // Convert to GeoJSON
      const geoJson = (layer as L.Polygon | L.Polyline).toGeoJSON();
      onCreatedRef.current(geoJson.geometry);

      // Remove from drawn items after callback (parent will handle persistence)
      setTimeout(() => {
        drawnItems.removeLayer(layer);
      }, 100);
    };

    map.on(L.Draw.Event.CREATED, handleCreated);

    return () => {
      map.off(L.Draw.Event.CREATED, handleCreated);
      if (drawControlRef.current) {
        map.removeControl(drawControlRef.current);
        drawControlRef.current = null;
      }
      map.removeLayer(drawnItems);
    };
  }, [map, drawReady]);

  return null;
}
