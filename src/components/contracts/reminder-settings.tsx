"use client";

import { useState, useEffect } from "react";
import { Bell, Save, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

interface ReminderSettingsProps {
  contractId: string;
  initialReminderDays: number[];
  endDate: string | null;
  onUpdate?: (reminderDays: number[]) => void;
}

// Vordefinierte Erinnerungs-Optionen
const PRESET_REMINDERS = [
  { days: 14, label: "14 Tage vorher" },
  { days: 30, label: "30 Tage vorher" },
  { days: 60, label: "60 Tage vorher" },
  { days: 90, label: "90 Tage vorher" },
  { days: 180, label: "6 Monate vorher" },
  { days: 365, label: "1 Jahr vorher" },
];

export function ReminderSettings({
  contractId,
  initialReminderDays,
  endDate,
  onUpdate,
}: ReminderSettingsProps) {
  const { toast } = useToast();
  const [selectedDays, setSelectedDays] = useState<number[]>(initialReminderDays);
  const [customDays, setCustomDays] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Pruefe ob sich etwas geändert hat
  useEffect(() => {
    const sortedInitial = [...initialReminderDays].sort((a, b) => a - b);
    const sortedCurrent = [...selectedDays].sort((a, b) => a - b);
    const changed =
      sortedInitial.length !== sortedCurrent.length ||
      sortedInitial.some((v, i) => v !== sortedCurrent[i]);
    setHasChanges(changed);
  }, [selectedDays, initialReminderDays]);

  function toggleDay(days: number) {
    setSelectedDays((prev) => {
      if (prev.includes(days)) {
        return prev.filter((d) => d !== days);
      }
      return [...prev, days].sort((a, b) => b - a);
    });
  }

  function addCustomDays() {
    const days = parseInt(customDays, 10);
    if (isNaN(days) || days <= 0 || days > 3650) {
      toast({
        variant: "destructive",
        title: "Ungültige Eingabe",
        description: "Bitte geben Sie eine Zahl zwischen 1 und 3650 ein",
      });
      return;
    }

    if (selectedDays.includes(days)) {
      toast({
        variant: "destructive",
        title: "Bereits vorhanden",
        description: `${days} Tage ist bereits ausgewaehlt`,
      });
      return;
    }

    setSelectedDays((prev) => [...prev, days].sort((a, b) => b - a));
    setCustomDays("");
  }

  function removeDay(days: number) {
    setSelectedDays((prev) => prev.filter((d) => d !== days));
  }

  async function handleSave() {
    try {
      setSaving(true);
      const response = await fetch(`/api/contracts/${contractId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reminderDays: selectedDays }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Fehler beim Speichern");
      }

      toast({
        title: "Erfolg",
        description: "Erinnerungs-Einstellungen wurden gespeichert",
      });

      onUpdate?.(selectedDays);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: error instanceof Error ? error.message : "Einstellungen konnten nicht gespeichert werden",
      });
    } finally {
      setSaving(false);
    }
  }

  // Berechne Erinnerungsdaten basierend auf Enddatum
  function getReminderDate(daysBeforeEnd: number): string | null {
    if (!endDate) return null;
    const end = new Date(endDate);
    const reminder = new Date(end);
    reminder.setDate(reminder.getDate() - daysBeforeEnd);
    return reminder.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  // Pruefe ob Erinnerungsdatum bereits vergangen ist
  function isDatePassed(daysBeforeEnd: number): boolean {
    if (!endDate) return false;
    const end = new Date(endDate);
    const reminder = new Date(end);
    reminder.setDate(reminder.getDate() - daysBeforeEnd);
    return reminder < new Date();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Erinnerungs-Einstellungen
        </CardTitle>
        <CardDescription>
          {endDate
            ? "Konfigurieren Sie, wann Sie an diesen Vertrag erinnert werden möchten."
            : "Dieser Vertrag hat kein Enddatum. Erinnerungen können trotzdem konfiguriert werden."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Vordefinierte Optionen */}
        <div>
          <Label className="text-base font-medium">Standard-Erinnerungen</Label>
          <p className="text-sm text-muted-foreground mb-4">
            Waehlen Sie vordefinierte Zeitraeume für Erinnerungen aus.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {PRESET_REMINDERS.map(({ days, label }) => {
              const isSelected = selectedDays.includes(days);
              const isPassed = isDatePassed(days);
              const reminderDate = getReminderDate(days);

              return (
                <div
                  key={days}
                  className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-muted hover:border-muted-foreground/25"
                  } ${isPassed ? "opacity-60" : ""}`}
                >
                  <Checkbox
                    id={`reminder-${days}`}
                    checked={isSelected}
                    onCheckedChange={() => toggleDay(days)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 space-y-1">
                    <Label
                      htmlFor={`reminder-${days}`}
                      className="text-sm font-medium cursor-pointer"
                    >
                      {label}
                    </Label>
                    {endDate && (
                      <p className={`text-xs ${isPassed ? "text-red-500" : "text-muted-foreground"}`}>
                        {isPassed ? "Bereits vergangen: " : ""}
                        {reminderDate}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Benutzerdefinierte Erinnerung */}
        <div>
          <Label className="text-base font-medium">Benutzerdefinierte Erinnerung</Label>
          <p className="text-sm text-muted-foreground mb-4">
            Fuegen Sie eine individuelle Erinnerungsfrist hinzu.
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1 max-w-[200px]">
              <Input
                type="number"
                min="1"
                max="3650"
                placeholder="Anzahl Tage"
                value={customDays}
                onChange={(e) => setCustomDays(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomDays();
                  }
                }}
              />
            </div>
            <Button variant="outline" onClick={addCustomDays} disabled={!customDays}>
              Hinzufügen
            </Button>
          </div>
        </div>

        <Separator />

        {/* Aktive Erinnerungen */}
        <div>
          <Label className="text-base font-medium mb-4 block">
            Aktive Erinnerungen ({selectedDays.length})
          </Label>
          {selectedDays.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Keine Erinnerungen konfiguriert
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedDays.map((days) => {
                const preset = PRESET_REMINDERS.find((p) => p.days === days);
                const isPassed = isDatePassed(days);

                return (
                  <Badge
                    key={days}
                    variant={isPassed ? "secondary" : "default"}
                    className={`text-sm py-1.5 px-3 ${
                      isPassed ? "line-through opacity-60" : ""
                    }`}
                  >
                    {preset?.label || `${days} Tage vorher`}
                    <button
                      onClick={() => removeDay(days)}
                      className="ml-2 hover:text-destructive"
                      title="Entfernen"
                    >
                      x
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}
        </div>

        {/* Speichern Button */}
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={handleSave} disabled={!hasChanges || saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : hasChanges ? (
              <Save className="mr-2 h-4 w-4" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            {saving ? "Speichere..." : hasChanges ? "Speichern" : "Gespeichert"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
