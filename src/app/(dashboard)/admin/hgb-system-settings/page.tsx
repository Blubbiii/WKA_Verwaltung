"use client";

/**
 * P24: Super-Admin SystemSettings (gesetzliche Werte).
 *
 * Pflege der 15 gesetzlich vorgegebenen Werte (GWG, GewSt, Verzugszins,
 * Kleinbetragsrechnung, AfA-Cutoff). Bei Gesetzesänderung sieht
 * jeder Tenant innerhalb von 10 Min den neuen Wert (Cache-TTL).
 */

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  Edit3,
  Info,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

interface SettingRow {
  key: string;
  value: unknown;
  category: string;
  description: string | null;
  validFrom: string | null;
  validTo: string | null;
  updatedAt: string;
}

interface SettingDefault {
  value: unknown;
  category: string;
  description: string;
}

const CATEGORIES = ["GWG", "AFA", "GEWST", "VERZUGSZINS", "USTG"];
const CATEGORY_LABELS: Record<string, string> = {
  GWG: "GWG-Schwellen (§6 EStG)",
  AFA: "AfA (§7 EStG)",
  GEWST: "Gewerbesteuer (§8 GewStG)",
  VERZUGSZINS: "Verzugszinsen (§288 BGB)",
  USTG: "Umsatzsteuer (§33 UStDV)",
};

function formatValue(v: unknown): string {
  if (typeof v === "number") return v.toString();
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

export default function HgbSystemSettingsPage() {
  const [rows, setRows] = useState<SettingRow[]>([]);
  const [defaults, setDefaults] = useState<Record<string, SettingDefault>>({});
  const [isLoading, setIsLoading] = useState(true);

  const [editRow, setEditRow] = useState<SettingRow | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/superadmin/system-settings");
      if (!res.ok) throw new Error("Fehler beim Laden");
      const json = await res.json();
      setRows(json.data ?? []);
      setDefaults(json.defaults ?? {});
    } catch {
      toast.error("System-Einstellungen konnten nicht geladen werden");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openEdit = (row: SettingRow) => {
    setEditRow(row);
    setEditValue(formatValue(row.value));
  };

  const handleSave = async () => {
    if (!editRow) return;
    setIsSaving(true);
    try {
      // Wert je nach Typ parsen
      const def = defaults[editRow.key];
      let parsedValue: unknown = editValue;
      if (def && typeof def.value === "number") {
        parsedValue = Number(editValue);
        if (isNaN(parsedValue as number)) {
          throw new Error("Bitte gültige Zahl eingeben");
        }
      }

      const res = await fetch(
        `/api/superadmin/system-settings/${encodeURIComponent(editRow.key)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: parsedValue }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Speichern fehlgeschlagen");
      }
      toast.success("Wert aktualisiert — Cache-TTL 10 min");
      setEditRow(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async (row: SettingRow) => {
    const def = defaults[row.key];
    if (!def) return;
    setIsSaving(true);
    try {
      const res = await fetch(
        `/api/superadmin/system-settings/${encodeURIComponent(row.key)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: def.value }),
        },
      );
      if (!res.ok) throw new Error("Reset fehlgeschlagen");
      toast.success("Auf Default zurückgesetzt");
      await load();
    } catch {
      toast.error("Reset fehlgeschlagen");
    } finally {
      setIsSaving(false);
    }
  };

  const grouped = new Map<string, SettingRow[]>();
  for (const row of rows) {
    const arr = grouped.get(row.category) ?? [];
    arr.push(row);
    grouped.set(row.category, arr);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="HGB-System-Einstellungen"
        description="Gesetzlich vorgegebene Werte für alle Mandanten. Änderungen wirken nach 10 min Cache-TTL."
      />

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Diese Werte sind für alle Tenants gleich (Bundesgesetz). Bei einer
          Gesetzesänderung (z.B. GWG-Schwelle 800→1.000 €) hier ändern — der
          Cache läuft nach 10 Minuten ab, dann sehen alle Tenants den neuen
          Wert ohne Code-Deploy.
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Aktualisieren
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : (
        <Tabs defaultValue={CATEGORIES[0]}>
          <TabsList>
            {CATEGORIES.map((cat) => (
              <TabsTrigger key={cat} value={cat}>
                {CATEGORY_LABELS[cat] || cat}
              </TabsTrigger>
            ))}
          </TabsList>
          {CATEGORIES.map((cat) => (
            <TabsContent key={cat} value={cat} className="space-y-3">
              {(grouped.get(cat) ?? []).map((row) => {
                const def = defaults[row.key];
                const isDefault =
                  def && formatValue(row.value) === formatValue(def.value);
                return (
                  <Card key={row.key}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 flex-1">
                          <CardTitle className="text-base font-mono">
                            {row.key}
                          </CardTitle>
                          {def?.description && (
                            <CardDescription>{def.description}</CardDescription>
                          )}
                        </div>
                        <Badge variant={isDefault ? "secondary" : "default"}>
                          {isDefault ? "Default" : "Custom"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-mono text-2xl font-bold">
                            {formatValue(row.value)}
                          </div>
                          {def && !isDefault && (
                            <div className="text-xs text-muted-foreground">
                              Default: {formatValue(def.value)}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {def && !isDefault && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void handleReset(row)}
                              disabled={isSaving}
                            >
                              Default
                            </Button>
                          )}
                          <Button size="sm" onClick={() => openEdit(row)}>
                            <Edit3 className="mr-2 h-4 w-4" />
                            Bearbeiten
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </TabsContent>
          ))}
        </Tabs>
      )}

      <Dialog open={editRow !== null} onOpenChange={(o) => !o && setEditRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-mono">{editRow?.key}</DialogTitle>
            <DialogDescription>
              {editRow && defaults[editRow.key]?.description}
            </DialogDescription>
          </DialogHeader>

          {editRow && (
            <div className="py-2 space-y-3">
              <div className="space-y-2">
                <Label>Wert</Label>
                <Input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="font-mono text-lg"
                />
                <p className="text-xs text-muted-foreground">
                  Default: {formatValue(defaults[editRow.key]?.value)}
                </p>
              </div>
              <Alert>
                <ShieldCheck className="h-4 w-4" />
                <AlertDescription>
                  Diese Änderung wirkt für ALLE Tenants. Cache wird sofort
                  invalidiert (Auswirkung in &lt; 10 min spürbar).
                </AlertDescription>
              </Alert>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditRow(null)}
              disabled={isSaving}
            >
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
