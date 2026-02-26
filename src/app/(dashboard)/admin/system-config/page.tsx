"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Settings,
  Mail,
  Cloud,
  Database,
  Cog,
  ToggleLeft,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmailConfigForm } from "@/components/admin/system-config/email-config-form";
import { WeatherConfigForm } from "@/components/admin/system-config/weather-config-form";
import { StorageConfigForm } from "@/components/admin/system-config/storage-config-form";
import { GeneralConfigForm } from "@/components/admin/system-config/general-config-form";
import { FeaturesConfigForm } from "@/components/admin/system-config/features-config-form";

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

interface ConfigResponse {
  configs: ConfigValue[];
  grouped: Record<string, ConfigValue[]>;
  availableKeys: Array<{
    key: string;
    category: string;
    label: string;
    encrypted: boolean;
    envFallback?: string;
    defaultValue?: string;
  }>;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function SystemConfigPage() {
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState<ConfigValue[]>([]);
  const [grouped, setGrouped] = useState<Record<string, ConfigValue[]>>({});
  const [availableKeys, setAvailableKeys] = useState<ConfigResponse["availableKeys"]>([]);

  // Load configurations
  const loadConfigs = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/system-config");

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Laden");
      }

      const data: ConfigResponse = await response.json();
      setConfigs(data.configs);
      setGrouped(data.grouped);
      setAvailableKeys(data.availableKeys);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Laden der Konfiguration"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  // Get configs for a specific category
  const getConfigsForCategory = (category: string): ConfigValue[] => {
    return grouped[category] || [];
  };

  // Get available keys for a category
  const getKeysForCategory = (category: string) => {
    return availableKeys.filter((k) => k.category === category);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            System-Konfiguration
          </h1>
          <p className="text-muted-foreground">
            Zentrale Einstellungen für E-Mail, Wetter-API, Storage und mehr
          </p>
        </div>
        <Button variant="outline" onClick={loadConfigs} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Aktualisieren
        </Button>
      </div>

      {/* Info Alert */}
      <Alert>
        <Settings className="h-4 w-4" />
        <AlertDescription>
          <strong>Hinweis:</strong> Änderungen an der System-Konfiguration
          werden sofort wirksam. Sensitive Werte (Passwörter, API-Keys) werden
          verschluesselt gespeichert und nie im Klartext angezeigt.
          Umgebungsvariablen dienen als Fallback, wenn keine Datenbankwerte
          gesetzt sind.
        </AlertDescription>
      </Alert>

      {/* Configuration Tabs */}
      <Tabs defaultValue="email" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="email" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            E-Mail
          </TabsTrigger>
          <TabsTrigger value="weather" className="flex items-center gap-2">
            <Cloud className="h-4 w-4" />
            Wetter
          </TabsTrigger>
          <TabsTrigger value="storage" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Storage
          </TabsTrigger>
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Cog className="h-4 w-4" />
            Allgemein
          </TabsTrigger>
          <TabsTrigger value="features" className="flex items-center gap-2">
            <ToggleLeft className="h-4 w-4" />
            Features
          </TabsTrigger>
        </TabsList>

        {/* Email Configuration Tab */}
        <TabsContent value="email">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                E-Mail-Konfiguration
              </CardTitle>
              <CardDescription>
                SMTP-Server-Einstellungen für den Versand von System-E-Mails
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EmailConfigForm
                configs={getConfigsForCategory("email")}
                availableKeys={getKeysForCategory("email")}
                onSave={loadConfigs}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Weather Configuration Tab */}
        <TabsContent value="weather">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cloud className="h-5 w-5" />
                Wetter-API-Konfiguration
              </CardTitle>
              <CardDescription>
                OpenWeatherMap API-Einstellungen für Wetterdaten
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WeatherConfigForm
                configs={getConfigsForCategory("weather")}
                availableKeys={getKeysForCategory("weather")}
                onSave={loadConfigs}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Storage Configuration Tab */}
        <TabsContent value="storage">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Storage-Konfiguration
              </CardTitle>
              <CardDescription>
                Dateispeicher-Einstellungen (Lokal oder S3/MinIO)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StorageConfigForm
                configs={getConfigsForCategory("storage")}
                availableKeys={getKeysForCategory("storage")}
                onSave={loadConfigs}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* General Configuration Tab */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cog className="h-5 w-5" />
                Allgemeine Konfiguration
              </CardTitle>
              <CardDescription>
                Grundlegende System-Einstellungen
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GeneralConfigForm
                configs={getConfigsForCategory("general")}
                availableKeys={getKeysForCategory("general")}
                onSave={loadConfigs}
              />
            </CardContent>
          </Card>
        </TabsContent>
        {/* Features Configuration Tab */}
        <TabsContent value="features">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ToggleLeft className="h-5 w-5" />
                Feature-Konfiguration
              </CardTitle>
              <CardDescription>
                Optionale Module und Funktionen aktivieren oder deaktivieren
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FeaturesConfigForm
                configs={getConfigsForCategory("features")}
                availableKeys={getKeysForCategory("features")}
                onSave={loadConfigs}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
