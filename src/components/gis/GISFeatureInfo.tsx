"use client";

import { useState } from "react";
import { X, ExternalLink, MapPin, Zap, PenLine, Trash2, Clock, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Link from "next/link";
import { toast } from "sonner";
import type {
  SelectedFeature,
  GISPlotFeature,
  TurbineData,
  ParkData,
  AnnotationData,
} from "./types";
import { PLOT_AREA_COLORS, PLOT_AREA_LABELS, LEASE_STATUS_COLORS } from "./types";

interface GISFeatureInfoProps {
  feature: SelectedFeature | null;
  onClose: () => void;
  onAnnotationDeleted?: () => void;
  onRefresh?: () => void;
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

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

// -- Plot info with lease timeline --
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

      {/* Active lease status */}
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
          <p className="text-xs text-muted-foreground mt-1">Verpächter: {plot.activeLease.lessorName}</p>
        )}
        {plot.activeLease && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatDate(plot.activeLease.startDate)} — {formatDate(plot.activeLease.endDate)}
          </p>
        )}
      </div>

      {/* Lease timeline (all leases) */}
      {plot.allLeases && plot.allLeases.length > 1 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Vertragshistorie ({plot.allLeases.length})
          </p>
          <div className="relative pl-3 border-l-2 border-muted space-y-2">
            {plot.allLeases.map((lease, idx) => (
              <div key={idx} className="relative">
                <div
                  className="absolute -left-[calc(0.75rem+1px)] top-1 h-2 w-2 rounded-full border-2 border-white"
                  style={{ background: LEASE_STATUS_COLORS[lease.status] ?? "#9ca3af" }}
                />
                <div className="text-xs">
                  <div className="flex items-center gap-1.5">
                    <Badge variant={getLeaseStatusBadgeVariant(lease.status)} className="text-[10px] px-1.5 py-0">
                      {getLeaseStatusLabel(lease.status)}
                    </Badge>
                    <Link
                      href={`/leases/${lease.leaseId}`}
                      className="text-primary hover:underline text-[10px]"
                    >
                      <ExternalLink className="h-2.5 w-2.5 inline" />
                    </Link>
                  </div>
                  {lease.lessorName && (
                    <p className="text-muted-foreground mt-0.5">{lease.lessorName}</p>
                  )}
                  <p className="text-gray-400">
                    {formatDate(lease.startDate)} — {formatDate(lease.endDate)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                      <span className="text-foreground">{PLOT_AREA_LABELS[area.areaType] ?? area.areaType}</span>
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

      {/* Actions */}
      <div className="pt-1 border-t">
        <Link
          href={`/plots/${plot.id}`}
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          <ExternalLink className="h-3 w-3" />
          Flurstück öffnen
        </Link>
      </div>
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

function AnnotationInfo({
  annotation,
  onDelete,
}: {
  annotation: AnnotationData;
  onDelete?: () => void;
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/gis/annotations/${annotation.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Fehler beim Löschen");
      toast.success("Zeichnung gelöscht");
      onDelete?.();
    } catch {
      toast.error("Fehler beim Löschen der Zeichnung");
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

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
        <p className="text-xs text-muted-foreground">{annotation.description}</p>
      )}

      {/* Actions */}
      <div className="pt-2 border-t flex gap-2">
        <Button
          variant="destructive"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => setShowDeleteConfirm(true)}
          disabled={deleting}
          aria-label="Zeichnung löschen"
        >
          <Trash2 className="h-3 w-3" />
          Löschen
        </Button>
      </div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Zeichnung löschen?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie die Zeichnung &quot;{annotation.name}&quot; wirklich löschen?
              Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function GISFeatureInfo({ feature, onClose, onAnnotationDeleted }: GISFeatureInfoProps) {
  return (
    <div className="bg-background/95 backdrop-blur-sm border rounded-lg shadow-lg p-4 w-72 max-h-[calc(100vh-160px)] overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {feature ? "Auswahl" : "Info"}
        </p>
        {feature && (
          <button
            onClick={onClose}
            aria-label="Auswahl schließen"
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
      ) : feature.type === "annotation" ? (
        <AnnotationInfo
          annotation={feature.data as AnnotationData}
          onDelete={onAnnotationDeleted}
        />
      ) : null}
    </div>
  );
}
