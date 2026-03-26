"use client";

import { X, ExternalLink, MapPin, Zap, PenLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import type { SelectedFeature, GISPlotFeature, TurbineData, ParkData, AnnotationData } from "./types";
import { PLOT_AREA_COLORS, PLOT_AREA_LABELS } from "./types";

interface GISFeatureInfoProps {
  feature: SelectedFeature | null;
  onClose: () => void;
}

function getLeaseStatusBadgeVariant(status: string | null): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "ACTIVE": return "default";
    case "EXPIRING": return "secondary";
    case "DRAFT": return "secondary";
    case "EXPIRED":
    case "TERMINATED": return "outline";
    default: return "destructive";
  }
}

function getLeaseStatusLabel(status: string | null): string {
  switch (status) {
    case "ACTIVE": return "Aktiv";
    case "EXPIRING": return "Läuft aus";
    case "DRAFT": return "Entwurf";
    case "EXPIRED": return "Abgelaufen";
    case "TERMINATED": return "Beendet";
    default: return "Kein Vertrag";
  }
}

function getTurbineStatusLabel(status: string): string {
  switch (status) {
    case "ACTIVE": return "Aktiv";
    case "INACTIVE": return "Inaktiv";
    case "ARCHIVED": return "Archiviert";
    default: return status;
  }
}

function getAnnotationTypeLabel(type: string): string {
  switch (type) {
    case "CABLE_ROUTE": return "Kabeltrasse";
    case "COMPENSATION_AREA": return "Ausgleichsfläche";
    case "ACCESS_ROAD": return "Zuwegung";
    case "EXCLUSION_ZONE": return "Sperrzone";
    case "CUSTOM": return "Sonstiges";
    default: return type;
  }
}

function PlotInfo({ plot }: { plot: GISPlotFeature }) {
  const totalAssigned = plot.plotAreas.reduce((s, a) => s + a.areaSqm, 0);
  const totalArea = plot.areaSqm ?? 0;

  return (
    <div className="space-y-3">
      {/* Title */}
      <div>
        <h3 className="font-semibold text-sm leading-tight">
          {plot.cadastralDistrict} {plot.fieldNumber}/{plot.plotNumber}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">Flurstück</p>
      </div>

      {/* Area */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">Gesamtfläche</p>
          <p className="font-medium">{totalArea ? `${totalArea.toLocaleString("de-DE")} m²` : "—"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">In Hektar</p>
          <p className="font-medium">{totalArea ? `${(totalArea / 10000).toFixed(4)} ha` : "—"}</p>
        </div>
      </div>

      {/* Lease status */}
      <div>
        <p className="text-xs text-muted-foreground mb-1">Pachtstatus</p>
        <div className="flex items-center gap-2">
          <Badge variant={getLeaseStatusBadgeVariant(plot.activeLease?.status ?? null)}>
            {getLeaseStatusLabel(plot.activeLease?.status ?? null)}
          </Badge>
          {plot.activeLease?.leaseId && (
            <Link
              href={`/leases/${plot.activeLease.leaseId}`}
              className="text-xs text-primary hover:underline flex items-center gap-0.5"
            >
              <ExternalLink className="h-3 w-3" />
              Vertrag
            </Link>
          )}
        </div>
        {plot.activeLease?.lessorName && (
          <p className="text-xs text-gray-600 mt-1">Verpächter: {plot.activeLease.lessorName}</p>
        )}
      </div>

      {/* Plot areas breakdown */}
      {plot.plotAreas.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Flächenaufteilung</p>
          <div className="space-y-2">
            {plot.plotAreas.map((area, idx) => {
              const pct = totalArea > 0 ? Math.round((area.areaSqm / totalArea) * 100) : 0;
              const color = PLOT_AREA_COLORS[area.areaType] ?? "#757575";
              return (
                <div key={idx}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 rounded-sm shrink-0"
                        style={{ background: color }}
                      />
                      <span className="text-gray-700">{PLOT_AREA_LABELS[area.areaType] ?? area.areaType}</span>
                    </div>
                    <span className="text-muted-foreground font-medium">
                      {area.areaSqm.toLocaleString("de-DE")} m²
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                </div>
              );
            })}
            {totalArea > 0 && (
              <p className="text-xs text-muted-foreground">
                Zugeordnet: {totalAssigned.toLocaleString("de-DE")} / {totalArea.toLocaleString("de-DE")} m²
              </p>
            )}
          </div>
        </div>
      )}

      {/* Park link */}
      {plot.park && (
        <div className="pt-1 border-t">
          <Link
            href={`/parks/${plot.park.id}`}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <MapPin className="h-3 w-3" />
            {plot.park.name}
          </Link>
        </div>
      )}
    </div>
  );
}

function TurbineInfo({ turbine }: { turbine: TurbineData }) {
  const powerStr = turbine.ratedPowerKw
    ? turbine.ratedPowerKw >= 1000
      ? `${(turbine.ratedPowerKw / 1000).toFixed(1)} MW`
      : `${turbine.ratedPowerKw} kW`
    : "—";

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold text-sm">{turbine.designation}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Turbine</p>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">Nennleistung</p>
          <p className="font-medium flex items-center gap-1">
            <Zap className="h-3 w-3 text-yellow-500" />
            {powerStr}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Status</p>
          <Badge variant={turbine.status === "ACTIVE" ? "default" : "outline"} className="text-xs">
            {getTurbineStatusLabel(turbine.status)}
          </Badge>
        </div>
      </div>
      <div className="pt-1 border-t">
        <Link
          href={`/parks/${turbine.parkId}`}
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          <MapPin className="h-3 w-3" />
          Park öffnen
        </Link>
      </div>
    </div>
  );
}

function ParkInfo({ park }: { park: ParkData }) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold text-sm">{park.name}</h3>
        {park.shortName && (
          <p className="text-xs text-muted-foreground mt-0.5">{park.shortName}</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">Turbinen</p>
          <p className="font-medium">{park._count.turbines}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Status</p>
          <Badge variant={park.status === "ACTIVE" ? "default" : "outline"} className="text-xs">
            {park.status === "ACTIVE" ? "Aktiv" : "Inaktiv"}
          </Badge>
        </div>
      </div>
      <div className="pt-1 border-t">
        <Link
          href={`/parks/${park.id}`}
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          <ExternalLink className="h-3 w-3" />
          Park öffnen
        </Link>
      </div>
    </div>
  );
}

function AnnotationInfo({ annotation }: { annotation: AnnotationData }) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold text-sm">{annotation.name}</h3>
        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
          <PenLine className="h-3 w-3" />
          {getAnnotationTypeLabel(annotation.type)}
        </p>
      </div>
      {annotation.description && (
        <p className="text-xs text-gray-600">{annotation.description}</p>
      )}
    </div>
  );
}

export function GISFeatureInfo({ feature, onClose }: GISFeatureInfoProps) {
  return (
    <div className="bg-white/95 backdrop-blur-sm border rounded-lg shadow-lg p-4 w-72">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {feature ? "Auswahl" : "Info"}
        </p>
        {feature && (
          <button
            onClick={onClose}
            className="p-0.5 rounded hover:bg-muted transition-colors -mt-0.5"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {!feature ? (
        <div className="py-6 text-center">
          <MapPin className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Kein Feature ausgewählt</p>
          <p className="text-xs text-muted-foreground mt-1">
            Klicke auf ein Objekt in der Karte
          </p>
        </div>
      ) : feature.type === "plot" ? (
        <PlotInfo plot={feature.data as GISPlotFeature} />
      ) : feature.type === "turbine" ? (
        <TurbineInfo turbine={feature.data as TurbineData} />
      ) : feature.type === "park" ? (
        <ParkInfo park={feature.data as ParkData} />
      ) : (
        <AnnotationInfo annotation={feature.data as AnnotationData} />
      )}
    </div>
  );
}
