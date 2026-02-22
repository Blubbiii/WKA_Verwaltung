"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ANALYTICS_MODULES } from "@/types/analytics";

// =============================================================================
// Types & Constants
// =============================================================================

interface CreateReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultParkId?: string;
}

interface Park {
  id: string;
  name: string;
}

// Classic report modules (from the original report system)
const CLASSIC_MODULES: Record<string, string> = {
  kpiSummary: "KPI-Zusammenfassung",
  production: "Produktion",
  powerCurve: "Leistungskurve",
  windRose: "Windrose",
  dailyProfile: "Tagesverlauf",
  turbineComparison: "Anlagenvergleich (klassisch)",
};

// Group analytics modules for display
const moduleGroups = (() => {
  const groups = new Map<string, Array<{ key: string; label: string }>>();
  for (const [key, meta] of Object.entries(ANALYTICS_MODULES)) {
    const group = meta.group;
    const arr = groups.get(group) || [];
    arr.push({ key, label: meta.label });
    groups.set(group, arr);
  }
  return groups;
})();

// =============================================================================
// Component
// =============================================================================

export function CreateReportDialog({
  open,
  onOpenChange,
  defaultParkId,
}: CreateReportDialogProps) {
  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());
  const [parkId, setParkId] = useState<string>(defaultParkId || "all");
  const [interval, setInterval] = useState("month");
  const [portalVisible, setPortalVisible] = useState(false);
  const [portalLabel, setPortalLabel] = useState("");
  const [saving, setSaving] = useState(false);

  // Parks list
  const [parks, setParks] = useState<Park[]>([]);

  useEffect(() => {
    if (open) {
      fetch("/api/parks")
        .then((res) => res.json())
        .then((data) => setParks(Array.isArray(data) ? data : data.data || []))
        .catch(() => setParks([]));
    }
  }, [open]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setSelectedModules(new Set());
      setParkId(defaultParkId || "all");
      setInterval("month");
      setPortalVisible(false);
      setPortalLabel("");
    }
  }, [open, defaultParkId]);

  // Module toggle
  const toggleModule = (mod: string) => {
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(mod)) next.delete(mod);
      else next.add(mod);
      return next;
    });
  };

  // Group toggle
  const toggleGroup = (modules: Array<{ key: string }>) => {
    const allSelected = modules.every((m) => selectedModules.has(m.key));
    setSelectedModules((prev) => {
      const next = new Set(prev);
      for (const m of modules) {
        if (allSelected) next.delete(m.key);
        else next.add(m.key);
      }
      return next;
    });
  };

  // Classic modules as group items
  const classicItems = useMemo(
    () => Object.entries(CLASSIC_MODULES).map(([key, label]) => ({ key, label })),
    []
  );

  // Submit
  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Bitte geben Sie einen Berichtsnamen ein");
      return;
    }
    if (selectedModules.size === 0) {
      toast.error("Bitte waehlen Sie mindestens ein Modul aus");
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
          modules: Array.from(selectedModules),
          parkId: parkId !== "all" ? parkId : null,
          interval,
          portalVisible,
          portalLabel: portalVisible && portalLabel.trim() ? portalLabel.trim() : null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(err.error || "Fehler beim Erstellen");
      }

      toast.success("Bericht erstellt");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Erstellen des Berichts"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bericht erstellen</DialogTitle>
          <DialogDescription>
            Konfigurieren Sie einen neuen Energiebericht mit den gewuenschten Modulen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="report-name">Berichtsname *</Label>
            <input
              id="report-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Monatsbericht WP Norddeich"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="report-desc">Beschreibung</Label>
            <textarea
              id="report-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optionale Beschreibung..."
              rows={2}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {/* Module Selection - Analytics Groups */}
          <div className="space-y-4">
            <Label>Module auswaehlen *</Label>

            {Array.from(moduleGroups.entries()).map(([groupName, items]) => {
              const allSelected = items.every((m) => selectedModules.has(m.key));
              return (
                <div key={groupName} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">
                      {groupName}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => toggleGroup(items)}
                    >
                      {allSelected ? "Alle abwaehlen" : "Alle auswaehlen"}
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {items.map((m) => (
                      <label
                        key={m.key}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedModules.has(m.key)}
                          onCheckedChange={() => toggleModule(m.key)}
                        />
                        <span className="text-sm">{m.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Classic Modules */}
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  Klassische Module
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => toggleGroup(classicItems)}
                >
                  {classicItems.every((m) => selectedModules.has(m.key))
                    ? "Alle abwaehlen"
                    : "Alle auswaehlen"}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {classicItems.map((m) => (
                  <label
                    key={m.key}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedModules.has(m.key)}
                      onCheckedChange={() => toggleModule(m.key)}
                    />
                    <span className="text-sm">{m.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Park + Interval */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Park</Label>
              <Select value={parkId} onValueChange={setParkId}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle Parks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Parks</SelectItem>
                  {parks.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Standard-Intervall</Label>
              <Select value={interval} onValueChange={setInterval}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Tag</SelectItem>
                  <SelectItem value="month">Monat</SelectItem>
                  <SelectItem value="year">Jahr</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Portal Visibility */}
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center gap-3">
              <Switch
                checked={portalVisible}
                onCheckedChange={setPortalVisible}
                id="portal-visible"
              />
              <Label htmlFor="portal-visible">Im Anleger-Portal sichtbar</Label>
            </div>
            {portalVisible && (
              <div className="space-y-2 ml-10">
                <Label htmlFor="portal-label">Portal-Anzeigename</Label>
                <input
                  id="portal-label"
                  type="text"
                  value={portalLabel}
                  onChange={(e) => setPortalLabel(e.target.value)}
                  placeholder="z.B. Monatsbericht"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Bericht erstellen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
