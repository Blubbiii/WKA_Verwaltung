"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Cloud,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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

interface WeatherConfigFormProps {
  configs: ConfigValue[];
  availableKeys: AvailableKey[];
  onSave: () => void;
}

interface TestResult {
  success: boolean;
  message: string;
  details?: string;
  testData?: {
    location: string;
    temperature: number;
    windSpeed: number;
    description: string;
  };
}

// =============================================================================
// COMPONENT
// =============================================================================

export function WeatherConfigForm({
  configs,
  availableKeys,
  onSave,
}: WeatherConfigFormProps) {
  // Get initial values from configs
  const getConfigValue = (key: string): string => {
    const config = configs.find((c) => c.key === key);
    return config?.value || "";
  };

  // Form state
  const [apiKey, setApiKey] = useState("");
  const [syncInterval, setSyncInterval] = useState(
    getConfigValue("weather.sync.interval") || "60"
  );
  const [cacheTtl, setCacheTtl] = useState(
    getConfigValue("weather.cache.ttl") || "15"
  );

  // UI state
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // Check if API key has value (masked)
  const hasExistingApiKey = configs.some(
    (c) => c.key === "weather.api.key" && c.value && c.value !== ""
  );

  // Save configuration
  async function handleSave() {
    try {
      setSaving(true);

      // Build configs array
      const configsToSave = [
        { key: "weather.sync.interval", value: syncInterval, category: "weather" },
        { key: "weather.cache.ttl", value: cacheTtl, category: "weather" },
      ];

      // Only include API key if a new one was entered
      if (apiKey) {
        configsToSave.push({
          key: "weather.api.key",
          value: apiKey,
          category: "weather",
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

      toast.success("Wetter-Konfiguration gespeichert");
      setApiKey(""); // Clear API key field after save
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

  // Test Weather API
  async function handleTest() {
    try {
      setTesting(true);
      setTestResult(null);

      const response = await fetch("/api/admin/system-config/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "weather" }),
      });

      const data = await response.json();

      setTestResult({
        success: data.success,
        message: data.message || data.error,
        details: data.details,
        testData: data.testData,
      });

      if (data.success) {
        toast.success(data.message);
      } else {
        toast.error(data.error || "Test fehlgeschlagen");
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: "API-Test fehlgeschlagen",
        details: error instanceof Error ? error.message : undefined,
      });
      toast.error("Fehler beim Testen der API");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* API Key */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Cloud className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-medium">OpenWeatherMap API</h3>
        </div>

        <div className="space-y-2">
          <Label htmlFor="api-key">
            API Key
            <Badge variant="outline" className="ml-2 text-xs">
              OPENWEATHERMAP_API_KEY
            </Badge>
            {hasExistingApiKey && (
              <Badge variant="secondary" className="ml-2 text-xs">
                Gespeichert
              </Badge>
            )}
          </Label>
          <div className="relative">
            <Input
              id="api-key"
              type={showApiKey ? "text" : "password"}
              placeholder={hasExistingApiKey ? "Neuen API Key eingeben..." : "Ihr OpenWeatherMap API Key"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full px-3"
              onClick={() => setShowApiKey(!showApiKey)}
            >
              {showApiKey ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
          {hasExistingApiKey && !apiKey && (
            <p className="text-xs text-muted-foreground">
              Leer lassen um den bestehenden API Key beizubehalten
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Einen kostenlosen API Key erhalten Sie unter{" "}
            <a
              href="https://openweathermap.org/api"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              openweathermap.org/api
            </a>
          </p>
        </div>
      </div>

      <Separator />

      {/* Sync Settings */}
      <div className="space-y-4">
        <h3 className="font-medium">Synchronisierung</h3>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sync-interval">
              Sync-Intervall (Minuten)
              <Badge variant="outline" className="ml-2 text-xs">
                WEATHER_SYNC_INTERVAL
              </Badge>
            </Label>
            <Input
              id="sync-interval"
              type="number"
              min="5"
              max="1440"
              value={syncInterval}
              onChange={(e) => setSyncInterval(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Wie oft sollen Wetterdaten aktualisiert werden? (5-1440 Minuten)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cache-ttl">
              Cache TTL (Minuten)
              <Badge variant="outline" className="ml-2 text-xs">
                WEATHER_CACHE_TTL
              </Badge>
            </Label>
            <Input
              id="cache-ttl"
              type="number"
              min="1"
              max="60"
              value={cacheTtl}
              onChange={(e) => setCacheTtl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Wie lange werden Wetterdaten im Cache behalten? (1-60 Minuten)
            </p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Test Section */}
      <div className="space-y-4">
        <h3 className="font-medium">API testen</h3>

        <Button
          variant="outline"
          onClick={handleTest}
          disabled={testing}
        >
          {testing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          API-Verbindung testen
        </Button>

        {testResult && (
          <Alert variant={testResult.success ? "default" : "destructive"}>
            {testResult.success ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            <AlertDescription>
              <strong>{testResult.message}</strong>
              {testResult.details && (
                <p className="mt-1 text-sm opacity-80">{testResult.details}</p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {testResult?.success && testResult.testData && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Test-Ergebnis (Berlin)</CardTitle>
              <CardDescription className="text-xs">
                Aktuelle Wetterdaten vom API
              </CardDescription>
            </CardHeader>
            <CardContent className="py-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Standort:</span>
                  <span className="ml-2 font-medium">{testResult.testData.location}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Temperatur:</span>
                  <span className="ml-2 font-medium">
                    {testResult.testData.temperature?.toFixed(1)}°C
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Wind:</span>
                  <span className="ml-2 font-medium">
                    {testResult.testData.windSpeed?.toFixed(1)} m/s
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Wetter:</span>
                  <span className="ml-2 font-medium">{testResult.testData.description}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Separator />

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Konfiguration speichern
        </Button>
      </div>
    </div>
  );
}
