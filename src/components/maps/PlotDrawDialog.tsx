"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Lease {
  id: string;
  lessorName: string;
  status: string;
}

interface PlotDrawDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  geometry: GeoJSON.Geometry | null;
  parkId: string;
  onSaved: () => void;
}

/** Compute geodesic area in m² for a GeoJSON Polygon using the spherical excess formula. */
function calcPolygonAreaSqm(geometry: GeoJSON.Geometry): number {
  if (geometry.type !== "Polygon") return 0;
  const ring = geometry.coordinates[0]; // outer ring: [lng, lat]
  const n = ring.length;
  if (n < 3) return 0;

  const R = 6378137; // WGS84 equatorial radius in metres
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const lng1 = (ring[i][0] * Math.PI) / 180;
    const lat1 = (ring[i][1] * Math.PI) / 180;
    const lng2 = (ring[j][0] * Math.PI) / 180;
    const lat2 = (ring[j][1] * Math.PI) / 180;
    area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return Math.abs((area * R * R) / 2);
}

function getLessorName(lease: {
  lessor?: {
    personType: string;
    firstName?: string | null;
    lastName?: string | null;
    companyName?: string | null;
  };
}): string {
  const l = lease.lessor;
  if (!l) return "Unbekannt";
  if (l.personType === "legal") return l.companyName || "Unbekannt";
  return [l.firstName, l.lastName].filter(Boolean).join(" ") || "Unbekannt";
}

export function PlotDrawDialog({
  open,
  onOpenChange,
  geometry,
  parkId,
  onSaved,
}: PlotDrawDialogProps) {
  const [cadastralDistrict, setCadastralDistrict] = useState("");
  const [fieldNumber, setFieldNumber] = useState("");
  const [plotNumber, setPlotNumber] = useState("");
  const [leaseId, setLeaseId] = useState<string>("none");
  const [leases, setLeases] = useState<Lease[]>([]);
  const [saving, setSaving] = useState(false);

  // Auto-compute area from geometry
  const areaSqm = geometry ? Math.round(calcPolygonAreaSqm(geometry)) : 0;

  // Fetch leases for this park when dialog opens
  useEffect(() => {
    if (!open) return;
    fetch(`/api/leases?parkId=${parkId}&limit=200`)
      .then((r) => r.json())
      .then((data) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = (data.leases ?? data.data ?? []).map((l: any) => ({
          id: l.id,
          lessorName: getLessorName(l),
          status: l.status,
        }));
        setLeases(items);
      })
      .catch(() => {
        // Non-critical: proceed without lease list
      });
  }, [open, parkId]);

  const handleSave = async () => {
    if (!cadastralDistrict.trim()) {
      toast.error("Bitte Gemarkung eingeben");
      return;
    }
    if (!plotNumber.trim()) {
      toast.error("Bitte Flurstücknummer eingeben");
      return;
    }
    if (!geometry) return;

    setSaving(true);
    try {
      // 1. Create the plot with geometry
      const plotRes = await fetch("/api/plots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parkId,
          cadastralDistrict: cadastralDistrict.trim(),
          fieldNumber: fieldNumber.trim() || "0",
          plotNumber: plotNumber.trim(),
          areaSqm: areaSqm || undefined,
          geometry,
        }),
      });

      if (!plotRes.ok) {
        const err = await plotRes.json().catch(() => ({}));
        throw new Error(err.error || "Fehler beim Speichern des Flurstücks");
      }

      const plot = await plotRes.json();

      // 2. If a lease was selected, link the plot
      if (leaseId !== "none") {
        const linkRes = await fetch(`/api/leases/${leaseId}/plots`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plotIds: [plot.id] }),
        });
        if (!linkRes.ok) {
          // Plot was saved — just warn about the link failure
          toast.warning("Flurstück gespeichert, aber Pachtvertrag konnte nicht verknüpft werden");
        } else {
          toast.success("Flurstück gespeichert und Pachtvertrag zugeordnet");
        }
      } else {
        toast.success("Flurstück gespeichert");
      }

      // Reset form
      setCadastralDistrict("");
      setFieldNumber("");
      setPlotNumber("");
      setLeaseId("none");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setCadastralDistrict("");
      setFieldNumber("");
      setPlotNumber("");
      setLeaseId("none");
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Flurstück einzeichnen</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {areaSqm > 0 && (
            <div className="rounded-md bg-muted px-3 py-2 text-sm">
              <span className="text-muted-foreground">Berechnete Fläche: </span>
              <span className="font-medium">
                {areaSqm >= 10000
                  ? `${(areaSqm / 10000).toFixed(4)} ha`
                  : `${areaSqm.toLocaleString("de-DE")} m²`}
              </span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="plot-district">Gemarkung *</Label>
            <Input
              id="plot-district"
              placeholder="z.B. Hohenlohe"
              value={cadastralDistrict}
              onChange={(e) => setCadastralDistrict(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="plot-field">Flur</Label>
              <Input
                id="plot-field"
                placeholder="z.B. 3"
                value={fieldNumber}
                onChange={(e) => setFieldNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plot-number">Flurstück-Nr. *</Label>
              <Input
                id="plot-number"
                placeholder="z.B. 42/1"
                value={plotNumber}
                onChange={(e) => setPlotNumber(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Pachtvertrag</Label>
            <Select value={leaseId} onValueChange={setLeaseId}>
              <SelectTrigger>
                <SelectValue placeholder="Keinem Vertrag zuordnen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Keinem Vertrag zuordnen</SelectItem>
                {leases.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.lessorName}
                    {l.status !== "ACTIVE" && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({l.status})
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Abbrechen
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !cadastralDistrict.trim() || !plotNumber.trim()}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
