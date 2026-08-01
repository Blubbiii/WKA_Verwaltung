"use client";

import dynamic from "next/dynamic";

const GISClient = dynamic(
  () => import("@/components/gis/GISClient").then((m) => m.GISClient),
  { ssr: false, loading: () => <div className="flex-1 bg-muted animate-pulse" style={{ height: "calc(100vh - 64px)" }} /> }
);

export function GISPageClient() {
  return (
    <div className="-m-6 -mb-12 overflow-hidden" style={{ height: "calc(100vh - 64px)" }}>
      {/* The map is full-bleed by design, so there is no visible page header.
          Without any heading at all, screen-reader users navigating by
          headings land on a page that announces nothing — this is the only
          page in the app with that gap. Visually hidden, functionally there. */}
      <h1 className="sr-only">Geodaten-Karte</h1>
      <GISClient />
    </div>
  );
}
