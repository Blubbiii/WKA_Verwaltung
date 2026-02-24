"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Loader2,
  Save,
  Mail,
  Vote,
  FileText,
  Receipt,
  FileSignature,
  Bell,
  Info,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

// =============================================================================
// Types
// =============================================================================

interface EmailPreferences {
  votes: boolean;
  documents: boolean;
  invoices: boolean;
  contracts: boolean;
  system: boolean;
}

const DEFAULT_PREFERENCES: EmailPreferences = {
  votes: true,
  documents: true,
  invoices: true,
  contracts: true,
  system: true,
};

// =============================================================================
// API Functions
// =============================================================================

async function fetchPreferences(): Promise<EmailPreferences> {
  const response = await fetch("/api/user/email-preferences");
  if (!response.ok) {
    throw new Error("Fehler beim Laden der Benachrichtigungseinstellungen");
  }
  const data = await response.json();
  return data.preferences || DEFAULT_PREFERENCES;
}

async function updatePreferences(
  preferences: EmailPreferences
): Promise<void> {
  const response = await fetch("/api/user/email-preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ preferences }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Fehler beim Speichern");
  }
}

// =============================================================================
// Preference Item Component
// =============================================================================

interface PreferenceItemProps {
  id: keyof EmailPreferences;
  label: string;
  description: string;
  icon: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (id: keyof EmailPreferences, checked: boolean) => void;
}

function PreferenceItem({
  id,
  label,
  description,
  icon,
  checked,
  disabled = false,
  onChange,
}: PreferenceItemProps) {
  return (
    <div className="flex items-start justify-between py-4">
      <div className="flex gap-3">
        <div className="mt-0.5 text-muted-foreground">{icon}</div>
        <div className="space-y-1">
          <Label
            htmlFor={id}
            className={`font-medium ${disabled ? "text-muted-foreground" : ""}`}
          >
            {label}
          </Label>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(checked) => onChange(id, checked)}
      />
    </div>
  );
}

// =============================================================================
// Skeleton Component
// =============================================================================

function PreferencesSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-start justify-between py-4">
            <div className="flex gap-3">
              <Skeleton className="h-5 w-5" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
            <Skeleton className="h-6 w-10 rounded-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function NotificationPreferences() {
  const [preferences, setPreferences] =
    useState<EmailPreferences>(DEFAULT_PREFERENCES);
  const [initialPreferences, setInitialPreferences] =
    useState<EmailPreferences>(DEFAULT_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load preferences on mount
  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        setError(null);
        const prefs = await fetchPreferences();
        setPreferences(prefs);
        setInitialPreferences(prefs);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unbekannter Fehler");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  // Check if there are unsaved changes
  const hasChanges =
    JSON.stringify(preferences) !== JSON.stringify(initialPreferences);

  const handleChange = (id: keyof EmailPreferences, checked: boolean) => {
    setPreferences((prev) => ({ ...prev, [id]: checked }));
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await updatePreferences(preferences);
      setInitialPreferences(preferences);
      toast.success("Benachrichtigungseinstellungen gespeichert");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Fehler beim Speichern"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setPreferences(initialPreferences);
  };

  const handleEnableAll = () => {
    setPreferences({
      votes: true,
      documents: true,
      invoices: true,
      contracts: true,
      system: true,
    });
  };

  const handleDisableAll = () => {
    // Keep system notifications enabled (important for security)
    setPreferences({
      votes: false,
      documents: false,
      invoices: false,
      contracts: false,
      system: true,
    });
  };

  if (isLoading) {
    return <PreferencesSkeleton />;
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-red-600">
            <p>{error}</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => window.location.reload()}
            >
              Erneut versuchen
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">
              E-Mail-Benachrichtigungen
            </CardTitle>
          </div>
          <CardDescription>
            Waehlen Sie, über welche Ereignisse Sie per E-Mail benachrichtigt
            werden möchten.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Quick Actions */}
          <div className="flex gap-2 mb-4">
            <Button variant="outline" size="sm" onClick={handleEnableAll}>
              Alle aktivieren
            </Button>
            <Button variant="outline" size="sm" onClick={handleDisableAll}>
              Alle deaktivieren
            </Button>
          </div>

          <Separator />

          {/* Preference Items */}
          <div className="divide-y">
            <PreferenceItem
              id="votes"
              label="Abstimmungen"
              description="Benachrichtigungen über neue Abstimmungen, Erinnerungen und Ergebnisse."
              icon={<Vote className="h-5 w-5" />}
              checked={preferences.votes}
              onChange={handleChange}
            />

            <PreferenceItem
              id="documents"
              label="Dokumente"
              description="Benachrichtigungen über neue oder aktualisierte Dokumente."
              icon={<FileText className="h-5 w-5" />}
              checked={preferences.documents}
              onChange={handleChange}
            />

            <PreferenceItem
              id="invoices"
              label="Rechnungen & Gutschriften"
              description="Benachrichtigungen über neue Rechnungen und Gutschriften."
              icon={<Receipt className="h-5 w-5" />}
              checked={preferences.invoices}
              onChange={handleChange}
            />

            <PreferenceItem
              id="contracts"
              label="Verträge"
              description="Benachrichtigungen über Vertragsfristen und -änderungen."
              icon={<FileSignature className="h-5 w-5" />}
              checked={preferences.contracts}
              onChange={handleChange}
            />

            <PreferenceItem
              id="system"
              label="Systemmeldungen"
              description="Wichtige Sicherheits- und Systembenachrichtigungen (empfohlen)."
              icon={<Bell className="h-5 w-5" />}
              checked={preferences.system}
              onChange={handleChange}
            />
          </div>

          {/* Info Note */}
          <Alert className="mt-6">
            <Info className="h-4 w-4" />
            <AlertDescription>
              Systemmeldungen enthalten wichtige Sicherheitsinformationen wie
              Anmeldebenachrichtigungen und Passwortänderungen. Wir empfehlen,
              diese aktiviert zu lassen.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 sticky bottom-4">
        {hasChanges && (
          <Button variant="outline" onClick={handleReset} disabled={isSaving}>
            Zurücksetzen
          </Button>
        )}
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

export default NotificationPreferences;
