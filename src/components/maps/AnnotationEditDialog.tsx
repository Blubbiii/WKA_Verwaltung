"use client";

import { useEffect, useState } from "react";
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
import type { MapAnnotationData } from "./MapAnnotationLayer";

const ANNOTATION_TYPES = [
  { value: "CABLE_ROUTE", label: "Kabeltrasse", color: "#eab308" },
  { value: "COMPENSATION_AREA", label: "Ausgleichsfläche", color: "#22c55e" },
  { value: "ACCESS_ROAD", label: "Zuwegung", color: "#d97706" },
  { value: "EXCLUSION_ZONE", label: "Sperrzone", color: "#ef4444" },
  { value: "CUSTOM", label: "Sonstiges", color: "#6366f1" },
] as const;

interface AnnotationEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  annotation: MapAnnotationData | null;
  parkId: string;
  onSaved: () => void;
}

export function AnnotationEditDialog({
  open,
  onOpenChange,
  annotation,
  parkId,
  onSaved,
}: AnnotationEditDialogProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("CUSTOM");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // Pre-fill form when annotation changes
  useEffect(() => {
    if (annotation) {
      setName(annotation.name);
      setType(annotation.type);
      setDescription(annotation.description ?? "");
    }
  }, [annotation]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Bitte einen Namen eingeben");
      return;
    }
    if (!annotation) return;

    setSaving(true);
    try {
      const res = await fetch(
        `/api/parks/${parkId}/annotations/${annotation.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            type,
            description: description.trim() || null,
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Fehler beim Speichern");
      }

      toast.success("Zeichnung aktualisiert");
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
          <DialogTitle>Zeichnung bearbeiten</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-anno-name">Name *</Label>
            <Input
              id="edit-anno-name"
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
            <Label htmlFor="edit-anno-desc">Beschreibung</Label>
            <Textarea
              id="edit-anno-desc"
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
            Aktualisieren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
