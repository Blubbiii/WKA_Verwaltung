"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

// =============================================================================
// Types
// =============================================================================

export interface ReportConfig {
  modules: string[];
  parkId: string;
  turbineId: string;
  from: string;
  to: string;
  interval: string;
}

interface SaveConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: ReportConfig;
}

// =============================================================================
// Component
// =============================================================================

export function SaveConfigDialog({
  open,
  onOpenChange,
  config,
}: SaveConfigDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [portalVisible, setPortalVisible] = useState(false);
  const [portalLabel, setPortalLabel] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Bitte geben Sie einen Namen ein.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/energy/reports/configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          portalVisible,
          portalLabel: portalVisible ? portalLabel.trim() || null : null,
          config,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(data.error || "Fehler beim Speichern");
      }

      toast.success("Konfiguration gespeichert");
      onOpenChange(false);
      resetForm();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Speichern der Konfiguration"
      );
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setName("");
    setDescription("");
    setPortalVisible(false);
    setPortalLabel("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value);
        if (!value) resetForm();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="h-5 w-5" />
            Konfiguration speichern
          </DialogTitle>
          <DialogDescription>
            Speichern Sie die aktuelle Berichtskonfiguration zur späteren
            Wiederverwendung.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="config-name">Name *</Label>
            <Input
              id="config-name"
              placeholder="z.B. Monatsbericht WP Nord"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="config-description">Beschreibung</Label>
            <Input
              id="config-description"
              placeholder="Optionale Beschreibung"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
            />
          </div>

          {/* Portal Visible */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="portal-visible"
              checked={portalVisible}
              onCheckedChange={(checked) =>
                setPortalVisible(checked === true)
              }
              disabled={saving}
            />
            <Label htmlFor="portal-visible" className="cursor-pointer">
              Im Portal sichtbar
            </Label>
          </div>

          {/* Portal Label */}
          {portalVisible && (
            <div className="space-y-2">
              <Label htmlFor="portal-label">Portal-Bezeichnung</Label>
              <Input
                id="portal-label"
                placeholder="Bezeichnung im Portal"
                value={portalLabel}
                onChange={(e) => setPortalLabel(e.target.value)}
                disabled={saving}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
