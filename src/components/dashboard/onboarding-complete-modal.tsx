"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin, PartyPopper } from "lucide-react";
import dynamic from "next/dynamic";

// Lazy-load map to avoid SSR issues with Leaflet
const LazyMap = dynamic(
  () => import("react-leaflet").then((mod) => {
    const { MapContainer, TileLayer, Marker, Popup } = mod;
    return function ParkMap({ parks }: { parks: { id: string; name: string; lat: number; lng: number; status: string }[] }) {
      // Calculate center from parks
      const center = parks.length > 0
        ? { lat: parks.reduce((s, p) => s + p.lat, 0) / parks.length, lng: parks.reduce((s, p) => s + p.lng, 0) / parks.length }
        : { lat: 52.5, lng: 10.5 }; // Germany center
      return (
        <MapContainer center={[center.lat, center.lng]} zoom={parks.length > 1 ? 7 : 10} className="h-[400px] w-full rounded-lg">
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
          {parks.map((park) => (
            <Marker key={park.id} position={[park.lat, park.lng]}>
              <Popup>{park.name}</Popup>
            </Marker>
          ))}
        </MapContainer>
      );
    };
  }),
  { ssr: false, loading: () => <div className="h-[400px] w-full rounded-lg bg-muted animate-pulse" /> }
);

interface Park {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
}

export function OnboardingCompleteModal() {
  const [open, setOpen] = useState(false);
  const [parks, setParks] = useState<Park[]>([]);

  useEffect(() => {
    // Only show once
    const shown = localStorage.getItem("wpm:onboarding-wow-shown");
    if (shown === "true") return;

    // Check if onboarding is complete
    fetch("/api/admin/onboarding-status")
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data?.steps) return;
        const s = data.steps;
        // All 5 steps must be complete
        if (s.park && s.fund && s.turbine) {
          // Fetch parks for the map
          fetch("/api/parks")
            .then(res => res.ok ? res.json() : null)
            .then(parksData => {
              const parkList = (parksData?.parks || parksData || []) as Park[];
              const withCoords = parkList.filter(p => p.latitude && p.longitude);
              if (withCoords.length > 0) {
                setParks(withCoords);
                setOpen(true);
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  const handleClose = () => {
    setOpen(false);
    localStorage.setItem("wpm:onboarding-wow-shown", "true");
  };

  const mapParks = parks.map(p => ({
    id: p.id,
    name: p.name,
    lat: Number(p.latitude),
    lng: Number(p.longitude),
    status: p.status,
  }));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-2xl">
        <div className="text-center space-y-3 mb-4">
          <div className="flex justify-center">
            <div className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 p-3">
              <PartyPopper className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <DialogTitle className="text-2xl font-bold">
            Ihr Portfolio auf einen Blick
          </DialogTitle>
          <p className="text-muted-foreground">
            {parks.length} {parks.length === 1 ? "Windpark" : "Windparks"} erfolgreich eingerichtet
          </p>
        </div>

        <LazyMap parks={mapParks} />

        <div className="flex justify-center mt-4">
          <Button onClick={handleClose} size="lg">
            <MapPin className="mr-2 h-4 w-4" />
            Dashboard oeffnen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
