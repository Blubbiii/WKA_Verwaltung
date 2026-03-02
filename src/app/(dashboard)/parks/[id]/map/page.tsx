"use client";

import { useState, useEffect, use } from "react";
import { ParkMapContainer } from "@/components/maps";
import type { PlotFeature } from "@/components/maps";
import type { MapAnnotationData } from "@/components/maps/MapAnnotationLayer";
import { Loader2 } from "lucide-react";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ParkMapPage({ params }: PageProps) {
  const { id } = use(params);

  const [loading, setLoading] = useState(true);
  const [parkName, setParkName] = useState("");
  const [parkLatitude, setParkLatitude] = useState<number | null>(null);
  const [parkLongitude, setParkLongitude] = useState<number | null>(null);
  const [turbines, setTurbines] = useState<
    { id: string; designation: string; latitude: number | null; longitude: number | null; status: "ACTIVE" | "INACTIVE" | "ARCHIVED"; ratedPowerKw: number | null }[]
  >([]);
  const [plotFeatures, setPlotFeatures] = useState<PlotFeature[]>([]);
  const [annotations, setAnnotations] = useState<MapAnnotationData[]>([]);

  useEffect(() => {
    fetchData();
  }, [id]);

  async function fetchData() {
    try {
      // Load park data
      const parkRes = await fetch(`/api/parks/${id}`);
      if (!parkRes.ok) return;
      const park = await parkRes.json();

      setParkName(park.name);
      setParkLatitude(park.latitude);
      setParkLongitude(park.longitude);
      setTurbines(
        (park.turbines ?? []).map((t: { id: string; designation: string; latitude: number | null; longitude: number | null; status: string; ratedPowerKw: number | null }) => ({
          id: t.id,
          designation: t.designation,
          latitude: t.latitude,
          longitude: t.longitude,
          status: t.status as "ACTIVE" | "INACTIVE" | "ARCHIVED",
          ratedPowerKw: t.ratedPowerKw,
        }))
      );

      // Load plots
      try {
        const plotsRes = await fetch(`/api/plots?parkId=${id}&includeGeometry=true&limit=1000`);
        if (plotsRes.ok) {
          const plotsData = await plotsRes.json();
          const features: PlotFeature[] = ((plotsData.data ?? plotsData) as Array<{
            id: string;
            plotNumber: string;
            cadastralDistrict: string;
            fieldNumber: string;
            areaSqm: number | string | null;
            geometry: GeoJSON.Geometry | null;
            activeLease?: {
              leaseId: string;
              status: string;
              lessorName: string | null;
              lessor?: { id: string };
            } | null;
          }>)
            .map((plot) => {
              const al = plot.activeLease;
              return {
                id: plot.id,
                plotNumber: plot.plotNumber,
                cadastralDistrict: plot.cadastralDistrict,
                fieldNumber: plot.fieldNumber,
                areaSqm: plot.areaSqm ? Number(plot.areaSqm) : null,
                geometry: plot.geometry as GeoJSON.Geometry,
                lessorName: al?.lessorName || null,
                lessorId: al?.lessor?.id || null,
                leaseStatus: al?.status || null,
                leaseId: al?.leaseId || null,
              };
            })
            .filter((p): p is PlotFeature => p.geometry !== null);
          setPlotFeatures(features);
        }
      } catch {
        // non-critical
      }

      // Load annotations
      try {
        const annoRes = await fetch(`/api/parks/${id}/annotations`);
        if (annoRes.ok) {
          const annoData = await annoRes.json();
          setAnnotations(annoData.data ?? []);
        }
      } catch {
        // non-critical
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)]">
      <ParkMapContainer
        parkName={parkName}
        parkId={id}
        parkLatitude={parkLatitude}
        parkLongitude={parkLongitude}
        turbines={turbines}
        plots={plotFeatures}
        annotations={annotations}
        onAnnotationSaved={() => fetchData()}
        height="calc(100vh - 64px)"
      />
    </div>
  );
}
