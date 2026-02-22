"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Loader2,
  Save,
  Building2,
  Shield,
  Bell,
  AlertTriangle,
  Calendar,
} from "lucide-react";
import { useGeneralSettings, updateGeneralSettings, GeneralSettings as GeneralSettingsType } from "@/hooks/useGeneralSettings";

// Timezone options
const TIMEZONES = [
  { value: "Europe/Berlin", label: "Europe/Berlin (CET/CEST)" },
  { value: "Europe/Vienna", label: "Europe/Vienna (CET/CEST)" },
  { value: "Europe/Zurich", label: "Europe/Zurich (CET/CEST)" },
  { value: "Europe/London", label: "Europe/London (GMT/BST)" },
  { value: "Europe/Paris", label: "Europe/Paris (CET/CEST)" },
  { value: "Europe/Amsterdam", label: "Europe/Amsterdam (CET/CEST)" },
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "America/New_York (EST/EDT)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PST/PDT)" },
];

// Language options
const LANGUAGES = [
  { value: "de", label: "Deutsch" },
  { value: "en", label: "English" },
];

// Date format options
const DATE_FORMATS = [
  { value: "DD.MM.YYYY", label: "DD.MM.YYYY (31.12.2026)" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD (2026-12-31)" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY (12/31/2026)" },
];

// Currency options
const CURRENCIES = [
  { value: "EUR", label: "EUR - Euro" },
  { value: "USD", label: "USD - US Dollar" },
  { value: "CHF", label: "CHF - Schweizer Franken" },
];

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function GeneralSettings() {
  const { settings, isLoading, isError, mutate } = useGeneralSettings();
  const [formData, setFormData] = useState<GeneralSettingsType | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize form data when settings load
  useEffect(() => {
    if (settings) {
      setFormData(settings);
      setHasChanges(false);
    }
  }, [settings]);

  const handleChange = <K extends keyof GeneralSettingsType>(
    key: K,
    value: GeneralSettingsType[K]
  ) => {
    if (formData) {
      setFormData({ ...formData, [key]: value });
      setHasChanges(true);
    }
  };

  const handleSave = async () => {
    if (!formData) return;

    // Validation
    if (!formData.applicationName.trim()) {
      toast.error("Anwendungsname darf nicht leer sein");
      return;
    }

    if (formData.sessionTimeoutMinutes < 5 || formData.sessionTimeoutMinutes > 1440) {
      toast.error("Session-Timeout muss zwischen 5 und 1440 Minuten liegen");
      return;
    }

    if (formData.maxLoginAttempts < 1 || formData.maxLoginAttempts > 10) {
      toast.error("Maximale Login-Versuche muss zwischen 1 und 10 liegen");
      return;
    }

    if (formData.minPasswordLength < 6 || formData.minPasswordLength > 32) {
      toast.error("Passwort-Mindestlaenge muss zwischen 6 und 32 Zeichen liegen");
      return;
    }

    if (formData.emailNotificationsEnabled && !formData.adminEmail) {
      toast.error("Admin-E-Mail ist erforderlich wenn Benachrichtigungen aktiviert sind");
      return;
    }

    if (formData.adminEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.adminEmail)) {
      toast.error("Bitte geben Sie eine gueltige E-Mail-Adresse ein");
      return;
    }

    try {
      setIsSaving(true);
      await updateGeneralSettings(formData);
      toast.success("Einstellungen gespeichert");
      setHasChanges(false);
      mutate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Speichern"
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isError) {
    return (
      <div className="p-4 text-red-600 bg-red-50 rounded-md">
        Fehler beim Laden der Einstellungen
      </div>
    );
  }

  if (isLoading || !formData) {
    return <SettingsSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Anwendungseinstellungen */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Anwendungseinstellungen</CardTitle>
          </div>
          <CardDescription>
            Grundlegende Einstellungen fuer die Anwendung
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Anwendungsname */}
          <div className="space-y-2">
            <Label htmlFor="applicationName">Anwendungsname</Label>
            <Input
              id="applicationName"
              value={formData.applicationName}
              onChange={(e) => handleChange("applicationName", e.target.value)}
              placeholder="Windpark Manager"
            />
          </div>

          {/* Standard-Zeitzone */}
          <div className="space-y-2">
            <Label htmlFor="timezone">Standard-Zeitzone</Label>
            <Select
              value={formData.defaultTimezone}
              onValueChange={(value) => handleChange("defaultTimezone", value)}
            >
              <SelectTrigger id="timezone">
                <SelectValue placeholder="Zeitzone waehlen" />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Standard-Sprache */}
          <div className="space-y-2">
            <Label htmlFor="language">Standard-Sprache</Label>
            <Select
              value={formData.defaultLanguage}
              onValueChange={(value) => handleChange("defaultLanguage", value)}
            >
              <SelectTrigger id="language">
                <SelectValue placeholder="Sprache waehlen" />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang.value} value={lang.value}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Datumsformat */}
          <div className="space-y-2">
            <Label htmlFor="dateFormat">Datumsformat</Label>
            <Select
              value={formData.dateFormat}
              onValueChange={(value) => handleChange("dateFormat", value)}
            >
              <SelectTrigger id="dateFormat">
                <SelectValue placeholder="Datumsformat waehlen" />
              </SelectTrigger>
              <SelectContent>
                {DATE_FORMATS.map((format) => (
                  <SelectItem key={format.value} value={format.value}>
                    {format.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Waehrung */}
          <div className="space-y-2">
            <Label htmlFor="currency">Waehrung</Label>
            <Select
              value={formData.currency}
              onValueChange={(value) => handleChange("currency", value)}
            >
              <SelectTrigger id="currency">
                <SelectValue placeholder="Waehrung waehlen" />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((curr) => (
                  <SelectItem key={curr.value} value={curr.value}>
                    {curr.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Wartungsmodus */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Wartungsmodus</CardTitle>
          </div>
          <CardDescription>
            Aktivieren Sie den Wartungsmodus, um Benutzer ueber geplante Wartungsarbeiten zu informieren
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Wartungsmodus aktiv */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="maintenanceMode">Wartungsmodus aktiv</Label>
              <p className="text-sm text-muted-foreground">
                Benutzer sehen eine Wartungsmeldung und koennen sich nicht anmelden
              </p>
            </div>
            <Switch
              id="maintenanceMode"
              checked={formData.maintenanceModeEnabled}
              onCheckedChange={(checked) =>
                handleChange("maintenanceModeEnabled", checked)
              }
            />
          </div>

          <Separator />

          {/* Wartungsmeldung */}
          <div className="space-y-2">
            <Label htmlFor="maintenanceMessage">Wartungsmeldung</Label>
            <Textarea
              id="maintenanceMessage"
              value={formData.maintenanceMessage}
              onChange={(e) => handleChange("maintenanceMessage", e.target.value)}
              placeholder="Das System wird gewartet. Bitte versuchen Sie es spaeter erneut."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Diese Meldung wird Benutzern angezeigt, wenn der Wartungsmodus aktiv ist
            </p>
          </div>

          {/* Geplante Wartung */}
          <div className="space-y-2">
            <Label htmlFor="scheduledMaintenance">Geplante Wartung</Label>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Input
                id="scheduledMaintenance"
                type="datetime-local"
                value={formData.scheduledMaintenanceTime || ""}
                onChange={(e) =>
                  handleChange("scheduledMaintenanceTime", e.target.value || null)
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Optional: Datum und Uhrzeit der geplanten Wartung
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Sicherheitseinstellungen */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Sicherheitseinstellungen</CardTitle>
          </div>
          <CardDescription>
            Konfigurieren Sie Sicherheitsrichtlinien fuer Benutzerkonten
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Session-Timeout */}
          <div className="space-y-2">
            <Label htmlFor="sessionTimeout">Session-Timeout (in Minuten)</Label>
            <Input
              id="sessionTimeout"
              type="number"
              min={5}
              max={1440}
              value={formData.sessionTimeoutMinutes}
              onChange={(e) =>
                handleChange("sessionTimeoutMinutes", parseInt(e.target.value, 10) || 30)
              }
            />
            <p className="text-xs text-muted-foreground">
              Benutzer werden nach dieser Zeit der Inaktivitaet automatisch abgemeldet (5-1440 Minuten)
            </p>
          </div>

          {/* Maximale Login-Versuche */}
          <div className="space-y-2">
            <Label htmlFor="maxLoginAttempts">Maximale Login-Versuche</Label>
            <Input
              id="maxLoginAttempts"
              type="number"
              min={1}
              max={10}
              value={formData.maxLoginAttempts}
              onChange={(e) =>
                handleChange("maxLoginAttempts", parseInt(e.target.value, 10) || 5)
              }
            />
            <p className="text-xs text-muted-foreground">
              Konto wird nach dieser Anzahl fehlgeschlagener Versuche gesperrt (1-10)
            </p>
          </div>

          <Separator />

          {/* Passwort-Mindestlaenge */}
          <div className="space-y-2">
            <Label htmlFor="minPasswordLength">Passwort-Mindestlaenge</Label>
            <Input
              id="minPasswordLength"
              type="number"
              min={6}
              max={32}
              value={formData.minPasswordLength}
              onChange={(e) =>
                handleChange("minPasswordLength", parseInt(e.target.value, 10) || 8)
              }
            />
            <p className="text-xs text-muted-foreground">
              Mindestanzahl der Zeichen fuer neue Passwoerter (6-32)
            </p>
          </div>

          {/* Passwort erfordert Sonderzeichen */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="requireSpecialChars">Passwort erfordert Sonderzeichen</Label>
              <p className="text-sm text-muted-foreground">
                Passwoerter muessen mindestens ein Sonderzeichen enthalten (!@#$%^&*)
              </p>
            </div>
            <Switch
              id="requireSpecialChars"
              checked={formData.passwordRequiresSpecialChar}
              onCheckedChange={(checked) =>
                handleChange("passwordRequiresSpecialChar", checked)
              }
            />
          </div>

          {/* Passwort erfordert Zahlen */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="requireNumbers">Passwort erfordert Zahlen</Label>
              <p className="text-sm text-muted-foreground">
                Passwoerter muessen mindestens eine Zahl enthalten (0-9)
              </p>
            </div>
            <Switch
              id="requireNumbers"
              checked={formData.passwordRequiresNumber}
              onCheckedChange={(checked) =>
                handleChange("passwordRequiresNumber", checked)
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Benachrichtigungen */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Benachrichtigungen</CardTitle>
          </div>
          <CardDescription>
            E-Mail-Benachrichtigungen fuer Systemereignisse konfigurieren
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* E-Mail-Benachrichtigungen aktiviert */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="emailNotifications">E-Mail-Benachrichtigungen aktiviert</Label>
              <p className="text-sm text-muted-foreground">
                Systembenachrichtigungen per E-Mail versenden
              </p>
            </div>
            <Switch
              id="emailNotifications"
              checked={formData.emailNotificationsEnabled}
              onCheckedChange={(checked) =>
                handleChange("emailNotificationsEnabled", checked)
              }
            />
          </div>

          <Separator />

          {/* Admin-E-Mail */}
          <div className="space-y-2">
            <Label htmlFor="adminEmail">Admin-E-Mail fuer Systembenachrichtigungen</Label>
            <Input
              id="adminEmail"
              type="email"
              value={formData.adminEmail}
              onChange={(e) => handleChange("adminEmail", e.target.value)}
              placeholder="admin@example.com"
              disabled={!formData.emailNotificationsEnabled}
            />
            <p className="text-xs text-muted-foreground">
              An diese Adresse werden wichtige Systemmeldungen gesendet
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Speichern Button */}
      <div className="flex justify-end sticky bottom-4">
        <Button
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
          size="lg"
          className="shadow-lg"
        >
          {isSaving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Einstellungen speichern
        </Button>
      </div>
    </div>
  );
}
