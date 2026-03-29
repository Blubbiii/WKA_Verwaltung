"use client";

import dynamic from "next/dynamic";

const GISClient = dynamic(
  () => import("@/components/gis/GISClient").then((m) => m.GISClient),
  { ssr: false, loading: () => <div className="flex-1 bg-muted animate-pulse" style={{ height: "calc(100vh - 64px)" }} /> }
);

export function GISPageClient() {
  return (
    <div className="-m-6 -mb-12 overflow-hidden" style={{ height: "calc(100vh - 64px)" }}>
      <GISClient />
    </div>
  );
}
