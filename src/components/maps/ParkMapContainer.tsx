"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { ComponentProps } from "react";

// Types for the map components
type ParkMapProps = ComponentProps<typeof import("./ParkMap").ParkMap>;
type ParksOverviewMapProps = ComponentProps<
  typeof import("./ParksOverviewMap").ParksOverviewMap
>;
type LocationPreviewMapProps = ComponentProps<
  typeof import("./LocationPreviewMap").LocationPreviewMap
>;

// Loading skeleton component
function MapLoadingSkeleton({ height = "400px" }: { height?: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-lg border bg-muted"
      style={{ height }}
    >
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  );
}

// Dynamic import for ParkMap (park detail page)
const ParkMapDynamic = dynamic(
  () => import("./ParkMap").then((mod) => mod.ParkMap),
  {
    ssr: false,
    loading: () => <MapLoadingSkeleton height="400px" />,
  }
);

// Dynamic import for ParksOverviewMap (parks list page)
const ParksOverviewMapDynamic = dynamic(
  () => import("./ParksOverviewMap").then((mod) => mod.ParksOverviewMap),
  {
    ssr: false,
    loading: () => <MapLoadingSkeleton height="500px" />,
  }
);

// Wrapper component for ParkMap
export function ParkMapContainer(props: ParkMapProps) {
  return <ParkMapDynamic {...props} />;
}

// Wrapper component for ParksOverviewMap
export function ParksOverviewMapContainer(props: ParksOverviewMapProps) {
  return <ParksOverviewMapDynamic {...props} />;
}

// Dynamic import for LocationPreviewMap (park form live preview)
const LocationPreviewMapDynamic = dynamic(
  () =>
    import("./LocationPreviewMap").then((mod) => mod.LocationPreviewMap),
  {
    ssr: false,
    loading: () => <MapLoadingSkeleton height="280px" />,
  }
);

// Wrapper component for LocationPreviewMap
export function LocationPreviewMapContainer(props: LocationPreviewMapProps) {
  return <LocationPreviewMapDynamic {...props} />;
}
