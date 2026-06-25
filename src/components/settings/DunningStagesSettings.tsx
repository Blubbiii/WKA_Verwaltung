"use client";

/**
 * P23: Mahn-Eskalationsstufen-Editor.
 *
 * 3-Stufen-Verwaltung mit Live-Preview:
 *  - Stufe 1 (Zahlungserinnerung)
 *  - Stufe 2 (1. Mahnung)
 *  - Stufe 3 (2. Mahnung / Inkasso)
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
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  AlertCircle,
  ChevronRight,
  Clock,
  Coins,
  Info,
  Loader2,
  Save,
} from "lucide-react";
import { LOCALE_DE } from "@/lib/format";

interface DunningSettings {
  reminderEnabled: boolean;
  reminderDays1: number;
  reminderDays2: number;
  reminderDays3: number;
  reminderFee1: number;
  reminderFee2: number;
  reminderFee3: number;
}

const STAGE_NAMES = ["Zahlungserinnerung", "1. Mahnung", "2. Mahnung"];
const STAGE_DESCRIPTIONS = [
  "Freundlicher Hinweis nach Fristablauf — typisch 7 Tage, ohne Gebühr",
  "Erste förmliche Mahnung — typisch 21 Tage nach Fälligkeit, mit Gebühr",
  "Letzte Mahnung vor Inkasso — typisch 42 Tage, mit höherer Gebühr",
];

const DEFAULTS: DunningSettings = {
  reminderEnabled: true,
  reminderDays1: 7,
  reminderDays2: 21,
  reminderDays3: 42,
  reminderFee1: 0,
  reminderFee2: 5,
  reminderFee3: 10,
};

function formatEur(n: number): string {
  return n.toLocaleString(LOCALE_DE, { minimumFractionDigits: 2 });
}

export function DunningStagesSettings() {
  const [form, setForm] = useState<DunningSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    fetch("/api/admin/tenant-settings")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => {
        setForm({
          reminderEnabled: d.reminderEnabled ?? DEFAULTS.reminderEnabled,
          reminderDays1: d.reminderDays1 ?? DEFAULTS.reminderDays1,
          reminderDays2: d.reminderDays2 ?? DEFAULTS.reminderDays2,
          reminderDays3: d.reminderDays3 ?? DEFAULTS.reminderDays3,
          reminderFee1: d.reminderFee1 ?? DEFAULTS.reminderFee1,
          reminderFee2: d.reminderFee2 ?? DEFAULTS.reminderFee2,
          reminderFee3: d.reminderFee3 ?? DEFAULTS.reminderFee3,
        });
        setHasChanges(false);
      })
      .catch(() => {
        setForm(DEFAULTS);
        toast.error("Einstellungen konnten nicht geladen werden");
      })
      .finally(() => setIsLoading(false));
  }, []);

  const set = <K extends keyof DunningSettings>(k: K, v: DunningSettings[K]) => {
    if (!form) return;
    setForm({ ...form, [k]: v });
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!form) return;
    if (form.reminderDays1 >= form.reminderDays2 || form.reminderDays2 >= form.reminderDays3) {
      toast.error("Stufentage müssen strikt aufsteigend sein");
      return;
    }
    setIsSaving(true);
    try {
      const r = await fetch("/api/admin/tenant-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || "Speichern fehlgeschlagen");
      }
      toast.success("Mahn-Stufen aktualisiert");
      setHasChanges(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !form) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const days = [form.reminderDays1, form.reminderDays2, form.reminderDays3];
  const fees = [form.reminderFee1, form.reminderFee2, form.reminderFee3];
  const sequenceValid = days[0] < days[1] && days[1] < days[2];

  return (
    <div className="space-y-6">
      {/* Master-Switch */}
      <Card>
        <CardHeader>
          <CardTitle>Mahnwesen-Status</CardTitle>
          <CardDescription>
            Bei deaktiviertem Mahnwesen werden keine automatischen
            Mahn-Vorschläge erzeugt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <Label htmlFor="enabled" className="text-base">
              Automatisches Mahnwesen
            </Label>
            <Switch
              id="enabled"
              checked={form.reminderEnabled}
              onCheckedChange={(v) => set("reminderEnabled", v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Sequenz-Validierung */}
      {!sequenceValid && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Sequenz ungültig</AlertTitle>
          <AlertDescription>
            Tage müssen strikt aufsteigend sein:{" "}
            <span className="font-mono">
              {days[0]} → {days[1]} → {days[2]}
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* 3 Stufen */}
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Badge variant="default" className="rounded-full w-7 h-7 justify-center p-0">
                {i + 1}
              </Badge>
              {STAGE_NAMES[i]}
            </CardTitle>
            <CardDescription>{STAGE_DESCRIPTIONS[i]}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Tage nach Fälligkeit
                </Label>
                <Input
                  type="number"
                  min="1"
                  max="365"
                  value={days[i]}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (i === 0) set("reminderDays1", v);
                    if (i === 1) set("reminderDays2", v);
                    if (i === 2) set("reminderDays3", v);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Coins className="h-3 w-3" />
                  Mahngebühr (EUR)
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="999.99"
                  step="0.01"
                  value={fees[i]}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (i === 0) set("reminderFee1", v);
                    if (i === 1) set("reminderFee2", v);
                    if (i === 2) set("reminderFee3", v);
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Live-Preview Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Vorschau</CardTitle>
          <CardDescription>So sieht der Eskalations-Verlauf aus</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <Badge variant="outline">Fälligkeit</Badge>
            {[0, 1, 2].map((i) => (
              <span key={i} className="flex items-center gap-2">
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                <Badge variant={sequenceValid ? "default" : "destructive"}>
                  +{days[i]}d · {STAGE_NAMES[i]}{" "}
                  {fees[i] > 0 && (
                    <span className="ml-1">({formatEur(fees[i])} €)</span>
                  )}
                </Badge>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Zusätzlich werden Verzugszinsen nach §288 BGB automatisch berechnet:
          B2C +5%-Pkt, B2B +9%-Pkt über Basiszinssatz + 40€-Pauschale (einmalig).
          Basiszinssatz wird halbjährlich aus Bundesbank gepflegt.
        </AlertDescription>
      </Alert>

      <Separator />

      <div className="flex justify-end">
        <Button
          onClick={() => void handleSave()}
          disabled={isSaving || !hasChanges || !sequenceValid}
          size="lg"
        >
          {isSaving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Speichern
        </Button>
      </div>
    </div>
  );
}
