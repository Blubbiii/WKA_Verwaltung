"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { ParkData } from "./types";

const ANNOTATION_TYPES = [
  { value: "CABLE_ROUTE", label: "Kabeltrasse", color: "#F44336" },
  { value: "ACCESS_ROAD", label: "Zuwegung", color: "#FF9800" },
  { value: "COMPENSATION_AREA", label: "Ausgleichsfläche", color: "#9C27B0" },
  { value: "EXCLUSION_ZONE", label: "Sperrzone", color: "#ef4444" },
  { value: "CUSTOM", label: "Sonstiges", color: "#6366f1" },
] as const;

interface GISAnnotationCreatePanelProps {
  geometry: GeoJSON.Geometry;
  parks: ParkData[];
  onSaved: () => void;
  onCancel: () => void;
}

export function GISAnnotationCreatePanel({
  geometry,
  parks,
  onSaved,
  onCancel,
}: GISAnnotationCreatePanelProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("CABLE_ROUTE");
  const [description, setDescription] = useState("");
  const [parkId, setParkId] = useState(parks.length === 1 ? parks[0].id : "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name ist erforderlich");
      return;
    }
    if (!parkId) {
      toast.error("Bitte einen Park auswählen");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/gis/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type,
          geometry,
          description: description.trim() || undefined,
          parkId,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Fehler beim Erstellen");
      }

      toast.success("Zeichnung gespeichert");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  const selectedType = ANNOTATION_TYPES.find((t) => t.value === type);

  return (
    <div className="bg-background border-l shadow-xl w-72 flex flex-col overflow-hidden rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-2">
          {selectedType && (
            <span
              className="inline-block h-3 w-3 rounded-full shrink-0"
              style={{ background: selectedType.color }}
            />
          )}
          <h2 className="font-semibold text-sm">Neue Zeichnung</h2>
        </div>
        <button
          onClick={onCancel}
          className="p-1 rounded hover:bg-muted transition-colors"
          aria-label="Panel schließen"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {/* Type */}
        <div>
          <Label className="text-xs">Typ *</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-8 text-sm mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[2000]">
              {ANNOTATION_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: t.color }}
                    />
                    {t.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Name */}
        <div>
          <Label className="text-xs">Name *</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z.B. Kabel WEA 1-3"
            className="h-8 text-sm mt-1"
          />
        </div>

        {/* Park */}
        <div>
          <Label className="text-xs">Park *</Label>
          <Select value={parkId} onValueChange={setParkId}>
            <SelectTrigger className="h-8 text-sm mt-1">
              <SelectValue placeholder="Park auswählen" />
            </SelectTrigger>
            <SelectContent className="z-[2000]">
              {parks.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.shortName || p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Description */}
        <div>
          <Label className="text-xs">Beschreibung</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
            className="h-8 text-sm mt-1"
          />
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
          disabled={saving || !name.trim() || !parkId}
          className="flex-1"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
          Speichern
        </Button>
      </div>
    </div>
  );
}
