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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Loader2, Save, Mail, Eye } from "lucide-react";
import { useTenantSettings } from "@/hooks/useTenantSettings";

// =============================================================================
// TYPES
// =============================================================================

interface EmailFormData {
  emailSignature: string;
  emailFromName: string;
}

// =============================================================================
// SKELETON
// =============================================================================

function EmailSettingsSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// COMPONENT
// =============================================================================

export function TenantEmailSettings() {
  const { settings, isLoading, isError, updateSettings } =
    useTenantSettings();
  const [formData, setFormData] = useState<EmailFormData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (settings) {
      setFormData({
        emailSignature: settings.emailSignature,
        emailFromName: settings.emailFromName,
      });
      setHasChanges(false);
    }
  }, [settings]);

  const handleChange = <K extends keyof EmailFormData>(
    key: K,
    value: EmailFormData[K]
  ) => {
    if (formData) {
      setFormData({ ...formData, [key]: value });
      setHasChanges(true);
    }
  };

  const handleSave = async () => {
    if (!formData) return;

    if (formData.emailFromName && formData.emailFromName.length > 100) {
      toast.error("Absender-Name darf maximal 100 Zeichen haben");
      return;
    }

    if (formData.emailSignature && formData.emailSignature.length > 5000) {
      toast.error("E-Mail-Signatur darf maximal 5000 Zeichen haben");
      return;
    }

    try {
      setIsSaving(true);
      await updateSettings(formData);
      toast.success("E-Mail-Einstellungen gespeichert");
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
        Fehler beim Laden der E-Mail-Einstellungen
      </div>
    );
  }

  if (isLoading || !formData) {
    return <EmailSettingsSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Absender-Konfiguration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Absender-Konfiguration</CardTitle>
          </div>
          <CardDescription>
            Konfigurieren Sie den Absendernamen für alle E-Mails, die über
            das System versendet werden
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Absender-Name */}
          <div className="space-y-2">
            <Label htmlFor="emailFromName">Absender-Name</Label>
            <Input
              id="emailFromName"
              value={formData.emailFromName}
              onChange={(e) => handleChange("emailFromName", e.target.value)}
              placeholder="Windpark Beispiel GmbH"
            />
            <p className="text-xs text-muted-foreground">
              Dieser Name wird als Absender in E-Mails angezeigt (z.B.
              &quot;Windpark Beispiel GmbH&quot;). Wenn leer, wird der
              Mandantenname verwendet.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* E-Mail-Signatur */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-lg">E-Mail-Signatur</CardTitle>
                <CardDescription>
                  Standard-Signatur, die an alle ausgehenden E-Mails angehaengt
                  wird
                </CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
            >
              <Eye className="mr-2 h-4 w-4" />
              {showPreview ? "Editor anzeigen" : "Vorschau"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showPreview ? (
            /* Signatur-Vorschau */
            <div className="space-y-2">
              <Label>Vorschau</Label>
              <div className="rounded-md border bg-white p-4 min-h-[160px]">
                {formData.emailSignature ? (
                  <pre className="text-sm whitespace-pre-wrap font-sans text-gray-700">
                    {formData.emailSignature}
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    Keine Signatur definiert
                  </p>
                )}
              </div>
            </div>
          ) : (
            /* Signatur-Editor */
            <div className="space-y-2">
              <Label htmlFor="emailSignature">Signatur-Text</Label>
              <Textarea
                id="emailSignature"
                value={formData.emailSignature}
                onChange={(e) =>
                  handleChange("emailSignature", e.target.value)
                }
                placeholder={`Mit freundlichen Gruessen\n\nWindpark Beispiel GmbH\nMusterstrasse 1\n12345 Musterstadt\nTel: +49 123 456789\nwww.windpark-beispiel.de`}
                rows={8}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Einfacher Text. Zeilenumbrueche werden beibehalten (max. 5000
                Zeichen).
              </p>
            </div>
          )}

          <Separator />

          {/* Hinweis */}
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-sm text-muted-foreground">
              Die Signatur wird automatisch an alle E-Mails angehaengt, die
              über das System versendet werden (z.B. Rechnungsversand,
              Benachrichtigungen, Abstimmungseinladungen).
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
