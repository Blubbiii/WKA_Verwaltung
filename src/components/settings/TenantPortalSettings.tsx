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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Loader2, Save, Globe, Phone, Eye } from "lucide-react";
import { useTenantSettings } from "@/hooks/useTenantSettings";

// =============================================================================
// TYPES
// =============================================================================

interface PortalFormData {
  portalEnabled: boolean;
  portalWelcomeText: string;
  portalContactEmail: string;
  portalContactPhone: string;
  portalVisibleSections: string[];
}

const PORTAL_SECTIONS = [
  {
    id: "distributions",
    label: "Ausschuettungen",
    description: "Gesellschafter sehen ihre Ausschuettungen",
  },
  {
    id: "documents",
    label: "Dokumente",
    description: "Zugriff auf freigegebene Dokumente",
  },
  {
    id: "votes",
    label: "Abstimmungen",
    description: "Teilnahme an Gesellschafterabstimmungen",
  },
  {
    id: "reports",
    label: "Berichte",
    description: "Einsicht in Berichte und Auswertungen",
  },
  {
    id: "energyReports",
    label: "Energieberichte",
    description: "Zugriff auf SCADA-Energieberichte und Auswertungen",
  },
  {
    id: "proxies",
    label: "Vollmachten",
    description: "Verwaltung von Stimmrechtsvollmachten",
  },
] as const;

// =============================================================================
// SKELETON
// =============================================================================

function PortalSettingsSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// COMPONENT
// =============================================================================

export function TenantPortalSettings() {
  const { settings, isLoading, isError, updateSettings } =
    useTenantSettings();
  const [formData, setFormData] = useState<PortalFormData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (settings) {
      setFormData({
        portalEnabled: settings.portalEnabled,
        portalWelcomeText: settings.portalWelcomeText,
        portalContactEmail: settings.portalContactEmail,
        portalContactPhone: settings.portalContactPhone,
        portalVisibleSections: settings.portalVisibleSections,
      });
      setHasChanges(false);
    }
  }, [settings]);

  const handleChange = <K extends keyof PortalFormData>(
    key: K,
    value: PortalFormData[K]
  ) => {
    if (formData) {
      setFormData({ ...formData, [key]: value });
      setHasChanges(true);
    }
  };

  const handleSectionToggle = (sectionId: string, checked: boolean) => {
    if (!formData) return;
    const current = formData.portalVisibleSections;
    const updated = checked
      ? [...current, sectionId]
      : current.filter((s) => s !== sectionId);
    handleChange("portalVisibleSections", updated);
  };

  const handleSave = async () => {
    if (!formData) return;

    if (
      formData.portalContactEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.portalContactEmail)
    ) {
      toast.error("Bitte geben Sie eine gueltige Kontakt-E-Mail-Adresse ein");
      return;
    }

    try {
      setIsSaving(true);
      await updateSettings(formData);
      toast.success("Portal-Einstellungen gespeichert");
      setHasChanges(false);
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
        Fehler beim Laden der Portal-Einstellungen
      </div>
    );
  }

  if (isLoading || !formData) {
    return <PortalSettingsSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Portal Aktivierung */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">
              Kommanditisten-Portal
            </CardTitle>
          </div>
          <CardDescription>
            Konfigurieren Sie das Selbstbedienungsportal fuer Gesellschafter
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Portal aktiviert */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="portalEnabled">Portal aktiviert</Label>
              <p className="text-sm text-muted-foreground">
                Gesellschafter koennen sich am Portal anmelden und
                Informationen einsehen
              </p>
            </div>
            <Switch
              id="portalEnabled"
              checked={formData.portalEnabled}
              onCheckedChange={(checked) =>
                handleChange("portalEnabled", checked)
              }
            />
          </div>

          <Separator />

          {/* Begruesungstext */}
          <div className="space-y-2">
            <Label htmlFor="portalWelcomeText">Begruesungstext</Label>
            <Textarea
              id="portalWelcomeText"
              value={formData.portalWelcomeText}
              onChange={(e) =>
                handleChange("portalWelcomeText", e.target.value)
              }
              placeholder="Willkommen im Gesellschafterportal. Hier finden Sie alle relevanten Informationen zu Ihren Beteiligungen."
              rows={4}
              disabled={!formData.portalEnabled}
            />
            <p className="text-xs text-muted-foreground">
              Wird auf der Startseite des Portals angezeigt (max. 2000 Zeichen)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Kontaktinformationen */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">
              Kontaktinformationen im Portal
            </CardTitle>
          </div>
          <CardDescription>
            Diese Kontaktdaten werden den Gesellschaftern im Portal angezeigt
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Kontakt-E-Mail */}
          <div className="space-y-2">
            <Label htmlFor="portalContactEmail">Kontakt-E-Mail</Label>
            <Input
              id="portalContactEmail"
              type="email"
              value={formData.portalContactEmail}
              onChange={(e) =>
                handleChange("portalContactEmail", e.target.value)
              }
              placeholder="portal@windpark-beispiel.de"
              disabled={!formData.portalEnabled}
            />
          </div>

          {/* Kontakt-Telefon */}
          <div className="space-y-2">
            <Label htmlFor="portalContactPhone">Kontakt-Telefon</Label>
            <Input
              id="portalContactPhone"
              type="tel"
              value={formData.portalContactPhone}
              onChange={(e) =>
                handleChange("portalContactPhone", e.target.value)
              }
              placeholder="+49 123 456789"
              disabled={!formData.portalEnabled}
            />
          </div>
        </CardContent>
      </Card>

      {/* Sichtbare Bereiche */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Sichtbare Bereiche</CardTitle>
          </div>
          <CardDescription>
            Waehlen Sie, welche Bereiche den Gesellschaftern im Portal
            angezeigt werden
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {PORTAL_SECTIONS.map((section) => (
            <div
              key={section.id}
              className="flex items-start space-x-3 space-y-0"
            >
              <Checkbox
                id={`section-${section.id}`}
                checked={formData.portalVisibleSections.includes(section.id)}
                onCheckedChange={(checked) =>
                  handleSectionToggle(section.id, checked === true)
                }
                disabled={!formData.portalEnabled}
              />
              <div className="space-y-1 leading-none">
                <Label
                  htmlFor={`section-${section.id}`}
                  className="cursor-pointer"
                >
                  {section.label}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {section.description}
                </p>
              </div>
            </div>
          ))}
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
