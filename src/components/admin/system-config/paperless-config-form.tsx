"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  FileArchive,
  Loader2,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

// =============================================================================
// TYPES
// =============================================================================

interface ConfigValue {
  key: string;
  value: string;
  encrypted: boolean;
  category: string;
  label: string | null;
  tenantId: string | null;
  updatedAt: string;
}

interface AvailableKey {
  key: string;
  category: string;
  label: string;
  encrypted: boolean;
  envFallback?: string;
  defaultValue?: string;
}

interface PaperlessConfigFormProps {
  configs: ConfigValue[];
  availableKeys: AvailableKey[];
  onSave: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function PaperlessConfigForm({
  configs,
  onSave,
}: PaperlessConfigFormProps) {
  const getConfigValue = (key: string): string => {
    const config = configs.find((c) => c.key === key);
    return config?.value || "";
  };

  const isConfigSaved = (key: string): boolean => {
    const config = configs.find((c) => c.key === key);
    return !!(config?.value && config.value !== "" && config.value !== "***");
  };

  // Form state
  const [url, setUrl] = useState(getConfigValue("paperless.url"));
  const [token, setToken] = useState("");
  const [autoArchive, setAutoArchive] = useState(
    getConfigValue("paperless.auto-archive") !== "false"
  );
  const [defaultDocumentType, setDefaultDocumentType] = useState(
    getConfigValue("paperless.default-document-type")
  );

  // UI state
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message?: string;
    error?: string;
    documentCount?: number;
  } | null>(null);

  const tokenSaved = isConfigSaved("paperless.token");

  async function handleSave() {
    try {
      setSaving(true);

      const configsToSave: Array<{ key: string; value: string; category: string }> = [
        { key: "paperless.url", value: url, category: "paperless" },
        { key: "paperless.auto-archive", value: autoArchive ? "true" : "false", category: "paperless" },
        { key: "paperless.default-document-type", value: defaultDocumentType, category: "paperless" },
      ];

      // Only send token if changed (not empty)
      if (token) {
        configsToSave.push({
          key: "paperless.token",
          value: token,
          category: "paperless",
        });
      }

      const response = await fetch("/api/admin/system-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configs: configsToSave }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Speichern");
      }

      toast.success("Paperless-ngx Konfiguration gespeichert");
      setToken(""); // Clear token field after save
      onSave();
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

  async function handleTest() {
    try {
      setTesting(true);
      setTestResult(null);

      const response = await fetch("/api/admin/system-config/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "paperless" }),
      });

      const data = await response.json();
      setTestResult({
        success: data.success,
        message: data.message,
        error: data.error || data.details,
        documentCount: data.testData?.documentCount,
      });

      if (data.success) {
        toast.success("Paperless-ngx Verbindung erfolgreich");
      } else {
        toast.error(data.error || "Verbindungstest fehlgeschlagen");
      }
    } catch (error) {
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
      toast.error("Verbindungstest fehlgeschlagen");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Server Connection */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <FileArchive className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-medium">Serververbindung</h3>
        </div>

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="paperless-url">Paperless-ngx URL</Label>
            <Input
              id="paperless-url"
              type="url"
              placeholder="http://192.168.178.71:8000"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Vollstaendige URL inkl. Port, z.B. http://192.168.178.71:8000
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="paperless-token">API Token</Label>
              {tokenSaved && (
                <Badge variant="secondary" className="text-xs">
                  Gespeichert
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="paperless-token"
                  type={showToken ? "text" : "password"}
                  placeholder={tokenSaved ? "Neuen Token eingeben um zu ändern..." : "API Token eingeben..."}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowToken(!showToken)}
                  type="button"
                >
                  {showToken ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Paperless Profil → API Token kopieren
            </p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Options */}
      <div className="space-y-4">
        <h3 className="font-medium">Optionen</h3>

        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div>
            <Label htmlFor="auto-archive" className="cursor-pointer">
              Automatische Archivierung
            </Label>
            <p className="text-sm text-muted-foreground">
              Dokumente werden bei Upload automatisch an Paperless gesendet
            </p>
          </div>
          <Switch
            id="auto-archive"
            checked={autoArchive}
            onCheckedChange={setAutoArchive}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="default-doc-type">Standard-Dokumenttyp (optional)</Label>
          <Input
            id="default-doc-type"
            placeholder="z.B. Rechnung, Vertrag..."
            value={defaultDocumentType}
            onChange={(e) => setDefaultDocumentType(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Wird als Standard-Typ in Paperless gesetzt, wenn kein spezifischer Typ zugeordnet ist
          </p>
        </div>
      </div>

      <Separator />

      {/* Test Result */}
      {testResult && (
        <div
          className={`p-4 rounded-lg border ${
            testResult.success
              ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800"
              : "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {testResult.success ? (
              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
            ) : (
              <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            )}
            <span className="font-medium">
              {testResult.success ? testResult.message : testResult.error}
            </span>
          </div>
          {testResult.success && testResult.documentCount !== undefined && (
            <p className="mt-1 text-sm text-muted-foreground">
              {testResult.documentCount} Dokumente in Paperless vorhanden
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={handleTest}
          disabled={testing || !url}
        >
          {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Verbindung testen
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Konfiguration speichern
        </Button>
      </div>
    </div>
  );
}
