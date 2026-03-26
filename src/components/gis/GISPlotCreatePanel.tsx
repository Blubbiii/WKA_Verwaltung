"use client";

import { useState, useEffect, useCallback } from "react";
import { X, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { ParkData } from "./types";
import { PLOT_AREA_COLORS, PLOT_AREA_LABELS } from "./types";

// Geodesic area calculation (same as PlotDrawDialog.tsx)
function calcPolygonAreaSqm(geometry: GeoJSON.Geometry): number {
  if (geometry.type !== "Polygon") return 0;
  const ring = geometry.coordinates[0];
  const n = ring.length;
  if (n < 3) return 0;
  const R = 6378137;
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

const AREA_TYPES = ["WEA_STANDORT", "POOL", "WEG", "AUSGLEICH", "KABEL"] as const;
type AreaType = typeof AREA_TYPES[number];

interface PersonSearchResult {
  id: string;
  personType: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
}

interface LeaseSearchResult {
  id: string;
  status: string;
  lessor: PersonSearchResult;
}

interface GISPlotCreatePanelProps {
  geometry: GeoJSON.Geometry | null;
  parks: ParkData[];
  onSaved: (plotId: string) => void;
  onCancel: () => void;
}

function getPersonName(p: PersonSearchResult): string {
  if (p.personType === "legal") return p.companyName ?? "Unbekannt";
  return [p.firstName, p.lastName].filter(Boolean).join(" ") || "Unbekannt";
}

export function GISPlotCreatePanel({
  geometry,
  parks,
  onSaved,
  onCancel,
}: GISPlotCreatePanelProps) {
  // Basic form state
  const [cadastralDistrict, setCadastralDistrict] = useState("");
  const [fieldNumber, setFieldNumber] = useState("0");
  const [plotNumber, setPlotNumber] = useState("");
  const [parkId, setParkId] = useState("");

  // Plot areas
  const [areasOpen, setAreasOpen] = useState(false);
  const [areaValues, setAreaValues] = useState<Record<AreaType, string>>({
    WEA_STANDORT: "",
    POOL: "",
    WEG: "",
    AUSGLEICH: "",
    KABEL: "",
  });

  // Lease section
  const [leaseOpen, setLeaseOpen] = useState(false);
  const [createLease, setCreateLease] = useState(false);
  const [lessorSearch, setLessorSearch] = useState("");
  const [lessorResults, setLessorResults] = useState<PersonSearchResult[]>([]);
  const [selectedLessorId, setSelectedLessorId] = useState<string | null>(null);
  // fundId is included in lease POST but no UI field yet (future: fund selector)
  const [fundId] = useState("");
  const [leaseStartDate, setLeaseStartDate] = useState("");
  const [leaseEndDate, setLeaseEndDate] = useState("");
  const [useExistingLease, setUseExistingLease] = useState(false);
  const [existingLeases, setExistingLeases] = useState<LeaseSearchResult[]>([]);
  const [selectedLeaseId, setSelectedLeaseId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  const calculatedArea = geometry ? Math.round(calcPolygonAreaSqm(geometry)) : 0;

  const totalAssigned = AREA_TYPES.reduce((sum, type) => {
    const v = parseFloat(areaValues[type]);
    return sum + (isNaN(v) ? 0 : v);
  }, 0);

  // Search lessors
  const searchLessors = useCallback(async (q: string) => {
    if (q.length < 2) { setLessorResults([]); return; }
    try {
      const res = await fetch(`/api/persons?search=${encodeURIComponent(q)}&limit=10`);
      if (!res.ok) return;
      const data = await res.json();
      setLessorResults(data.data || data || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchLessors(lessorSearch), 300);
    return () => clearTimeout(t);
  }, [lessorSearch, searchLessors]);

  // Load existing leases when needed
  useEffect(() => {
    if (!useExistingLease) return;
    fetch("/api/leases?limit=50")
      .then((r) => r.json())
      .then((d) => setExistingLeases(d.data || d || []))
      .catch(() => {});
  }, [useExistingLease]);

  const handleSave = async () => {
    if (!cadastralDistrict.trim()) {
      toast.error("Gemarkung ist erforderlich");
      return;
    }
    if (!plotNumber.trim()) {
      toast.error("Flurstücknummer ist erforderlich");
      return;
    }
    if (!geometry) {
      toast.error("Keine Geometrie vorhanden");
      return;
    }

    setSaving(true);
    try {
      // Build plot areas array
      const plotAreas = AREA_TYPES.flatMap((type) => {
        const v = parseFloat(areaValues[type]);
        if (isNaN(v) || v <= 0) return [];
        return [{ areaType: type, areaSqm: v }];
      });

      // Create plot
      const plotRes = await fetch("/api/plots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cadastralDistrict: cadastralDistrict.trim(),
          fieldNumber: fieldNumber.trim() || "0",
          plotNumber: plotNumber.trim(),
          parkId: parkId || undefined,
          areaSqm: calculatedArea || undefined,
          geometry,
          plotAreas: plotAreas.length > 0 ? plotAreas : undefined,
        }),
      });

      if (!plotRes.ok) {
        const err = await plotRes.json().catch(() => ({}));
        throw new Error(err.error || "Fehler beim Erstellen des Flurstücks");
      }

      const newPlot = await plotRes.json();
      const plotId: string = newPlot.id;

      // Handle lease assignment
      if (leaseOpen && !useExistingLease && createLease && selectedLessorId && leaseStartDate) {
        await fetch("/api/leases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lessorId: selectedLessorId,
            fundId: fundId || undefined,
            startDate: leaseStartDate,
            endDate: leaseEndDate || undefined,
            plotIds: [plotId],
          }),
        });
      } else if (leaseOpen && useExistingLease && selectedLeaseId) {
        await fetch(`/api/leases/${selectedLeaseId}/plots`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plotIds: [plotId] }),
        });
      }

      toast.success("Flurstück gespeichert");
      onSaved(plotId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border-l shadow-xl w-80 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <h2 className="font-semibold text-sm">Neues Flurstück</h2>
        <button
          onClick={onCancel}
          className="p-1 rounded hover:bg-muted transition-colors"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Area display */}
        {calculatedArea > 0 && (
          <div className="bg-muted/50 rounded-md px-3 py-2 text-sm">
            <span className="text-muted-foreground text-xs">Berechnete Fläche: </span>
            <span className="font-semibold">{calculatedArea.toLocaleString("de-DE")} m²</span>
            <span className="text-muted-foreground text-xs ml-2">
              ({(calculatedArea / 10000).toFixed(4)} ha)
            </span>
          </div>
        )}

        {/* Basic fields */}
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Gemarkung *</Label>
            <Input
              value={cadastralDistrict}
              onChange={(e) => setCadastralDistrict(e.target.value)}
              placeholder="z.B. Musterburg"
              className="h-8 text-sm mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Flur</Label>
              <Input
                value={fieldNumber}
                onChange={(e) => setFieldNumber(e.target.value)}
                placeholder="0"
                className="h-8 text-sm mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Flurstück-Nr. *</Label>
              <Input
                value={plotNumber}
                onChange={(e) => setPlotNumber(e.target.value)}
                placeholder="z.B. 12/3"
                className="h-8 text-sm mt-1"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Park</Label>
            <Select value={parkId} onValueChange={setParkId}>
              <SelectTrigger className="h-8 text-sm mt-1">
                <SelectValue placeholder="Park auswählen (optional)" />
              </SelectTrigger>
              <SelectContent className="z-[2000]">
                <SelectItem value="">Kein Park</SelectItem>
                {parks.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Plot areas section */}
        <div className="border rounded-md overflow-hidden">
          <button
            type="button"
            onClick={() => setAreasOpen(!areasOpen)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-left hover:bg-muted/50 transition-colors"
          >
            <span>Flächenaufteilung</span>
            {areasOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {areasOpen && (
            <div className="px-3 pb-3 pt-1 space-y-2 border-t">
              {AREA_TYPES.map((type) => (
                <div key={type} className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                    style={{ background: PLOT_AREA_COLORS[type] }}
                  />
                  <span className="text-xs text-gray-700 flex-1">{PLOT_AREA_LABELS[type]}</span>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={areaValues[type]}
                    onChange={(e) =>
                      setAreaValues((prev) => ({ ...prev, [type]: e.target.value }))
                    }
                    placeholder="m²"
                    className="h-7 text-xs w-24"
                  />
                </div>
              ))}
              {calculatedArea > 0 && totalAssigned > 0 && (
                <div className="pt-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>Zugeordnet</span>
                    <span>
                      {Math.round(totalAssigned).toLocaleString("de-DE")} / {calculatedArea.toLocaleString("de-DE")} m²
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min(100, (totalAssigned / calculatedArea) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Lease section */}
        <div className="border rounded-md overflow-hidden">
          <button
            type="button"
            onClick={() => setLeaseOpen(!leaseOpen)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-left hover:bg-muted/50 transition-colors"
          >
            <span>Pachtvertrag zuordnen</span>
            {leaseOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {leaseOpen && (
            <div className="px-3 pb-3 pt-1 border-t space-y-3">
              {/* Toggle between new/existing */}
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setUseExistingLease(false)}
                  className={`px-2 py-1 rounded border text-xs transition-colors ${!useExistingLease ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                >
                  Neuer Vertrag
                </button>
                <button
                  type="button"
                  onClick={() => setUseExistingLease(true)}
                  className={`px-2 py-1 rounded border text-xs transition-colors ${useExistingLease ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                >
                  Bestehend zuordnen
                </button>
              </div>

              {!useExistingLease && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="create-lease"
                      checked={createLease}
                      onCheckedChange={(v) => setCreateLease(!!v)}
                    />
                    <label htmlFor="create-lease" className="text-xs cursor-pointer">
                      Pachtvertrag anlegen
                    </label>
                  </div>
                  {createLease && (
                    <div className="space-y-2 pl-5">
                      <div>
                        <Label className="text-xs">Verpächter suchen</Label>
                        <Input
                          value={lessorSearch}
                          onChange={(e) => setLessorSearch(e.target.value)}
                          placeholder="Name suchen..."
                          className="h-7 text-xs mt-1"
                        />
                        {lessorResults.length > 0 && !selectedLessorId && (
                          <div className="border rounded-md mt-1 max-h-32 overflow-y-auto">
                            {lessorResults.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted transition-colors"
                                onClick={() => {
                                  setSelectedLessorId(p.id);
                                  setLessorSearch(getPersonName(p));
                                  setLessorResults([]);
                                }}
                              >
                                {getPersonName(p)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Von</Label>
                          <Input
                            type="date"
                            value={leaseStartDate}
                            onChange={(e) => setLeaseStartDate(e.target.value)}
                            className="h-7 text-xs mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Bis</Label>
                          <Input
                            type="date"
                            value={leaseEndDate}
                            onChange={(e) => setLeaseEndDate(e.target.value)}
                            className="h-7 text-xs mt-1"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {useExistingLease && (
                <div>
                  <Label className="text-xs">Bestehender Pachtvertrag</Label>
                  <Select
                    value={selectedLeaseId || ""}
                    onValueChange={(v) => setSelectedLeaseId(v || null)}
                  >
                    <SelectTrigger className="h-7 text-xs mt-1">
                      <SelectValue placeholder="Vertrag auswählen..." />
                    </SelectTrigger>
                    <SelectContent className="z-[2000]">
                      {existingLeases.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {getPersonName(l.lessor)} ({l.status})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex gap-2 px-4 py-3 border-t shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={saving}
          className="flex-1"
        >
          Abbrechen
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving || !cadastralDistrict.trim() || !plotNumber.trim()}
          className="flex-1"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
          Speichern
        </Button>
      </div>
    </div>
  );
}
