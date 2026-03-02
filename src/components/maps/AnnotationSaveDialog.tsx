"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const ANNOTATION_TYPES = [
  { value: "CABLE_ROUTE", label: "Kabeltrasse", color: "#eab308" },
  { value: "COMPENSATION_AREA", label: "Ausgleichsfläche", color: "#22c55e" },
  { value: "ACCESS_ROAD", label: "Zuwegung", color: "#d97706" },
  { value: "EXCLUSION_ZONE", label: "Sperrzone", color: "#ef4444" },
  { value: "CUSTOM", label: "Sonstiges", color: "#6366f1" },
] as const;

interface AnnotationSaveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  geometry: GeoJSON.Geometry | null;
  parkId: string;
  onSaved: () => void;
}

export function AnnotationSaveDialog({
  open,
  onOpenChange,
  geometry,
  parkId,
  onSaved,
}: AnnotationSaveDialogProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("CUSTOM");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Bitte einen Namen eingeben");
      return;
    }
    if (!geometry) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/parks/${parkId}/annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type,
          geometry,
          description: description.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Fehler beim Speichern");
      }

      toast.success("Zeichnung gespeichert");
      setName("");
      setType("CUSTOM");
      setDescription("");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Zeichnung speichern</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="anno-name">Name *</Label>
            <Input
              id="anno-name"
              placeholder="z.B. Kabeltrasse Nord"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
          </div>

          <div className="space-y-2">
            <Label>Typ</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ANNOTATION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block w-3 h-3 rounded-full"
                        style={{ backgroundColor: t.color }}
                      />
                      {t.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="anno-desc">Beschreibung</Label>
            <Textarea
              id="anno-desc"
              placeholder="Optionale Beschreibung..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
