"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Database,
  HardDrive,
  Cloud,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

interface StorageConfigFormProps {
  configs: ConfigValue[];
  availableKeys: AvailableKey[];
  onSave: () => void;
}

interface TestResult {
  success: boolean;
  message: string;
  details?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function StorageConfigForm({
  configs,
  availableKeys,
  onSave,
}: StorageConfigFormProps) {
  // Get initial values from configs
  const getConfigValue = (key: string): string => {
    const config = configs.find((c) => c.key === key);
    return config?.value || "";
  };

  // Form state
  const [provider, setProvider] = useState(
    getConfigValue("storage.provider") || "local"
  );
  const [s3Endpoint, setS3Endpoint] = useState(getConfigValue("storage.s3.endpoint"));
  const [s3Bucket, setS3Bucket] = useState(getConfigValue("storage.s3.bucket"));
  const [s3AccessKey, setS3AccessKey] = useState("");
  const [s3SecretKey, setS3SecretKey] = useState("");
  const [s3Region, setS3Region] = useState(
    getConfigValue("storage.s3.region") || "eu-central-1"
  );

  // UI state
  const [showAccessKey, setShowAccessKey] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // Check if keys have values (masked)
  const hasExistingAccessKey = configs.some(
    (c) => c.key === "storage.s3.accessKey" && c.value && c.value !== ""
  );
  const hasExistingSecretKey = configs.some(
    (c) => c.key === "storage.s3.secretKey" && c.value && c.value !== ""
  );

  // Save configuration
  async function handleSave() {
    try {
      setSaving(true);

      // Build configs array
      const configsToSave = [
        { key: "storage.provider", value: provider, category: "storage" },
      ];

      if (provider === "s3") {
        configsToSave.push(
          { key: "storage.s3.endpoint", value: s3Endpoint, category: "storage" },
          { key: "storage.s3.bucket", value: s3Bucket, category: "storage" },
          { key: "storage.s3.region", value: s3Region, category: "storage" }
        );

        // Only include keys if new ones were entered
        if (s3AccessKey) {
          configsToSave.push({
            key: "storage.s3.accessKey",
            value: s3AccessKey,
            category: "storage",
          });
        }
        if (s3SecretKey) {
          configsToSave.push({
            key: "storage.s3.secretKey",
            value: s3SecretKey,
            category: "storage",
          });
        }
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

      toast.success("Storage-Konfiguration gespeichert");
      setS3AccessKey(""); // Clear fields after save
      setS3SecretKey("");
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

  // Test Storage Connection
  async function handleTest() {
    try {
      setTesting(true);
      setTestResult(null);

      const response = await fetch("/api/admin/system-config/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "storage" }),
      });

      const data = await response.json();

      setTestResult({
        success: data.success,
        message: data.message || data.error,
        details: data.details,
      });

      if (data.success) {
        toast.success(data.message);
      } else {
        toast.error(data.error || "Test fehlgeschlagen");
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: "Storage-Test fehlgeschlagen",
        details: error instanceof Error ? error.message : undefined,
      });
      toast.error("Fehler beim Testen der Storage-Verbindung");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Provider Selection */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-medium">Storage Provider</h3>
        </div>

        <div className="space-y-2">
          <Label htmlFor="provider">
            Provider
            <Badge variant="outline" className="ml-2 text-xs">
              STORAGE_PROVIDER
            </Badge>
          </Label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger id="provider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="local">
                <div className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4" />
                  Lokal (Dateisystem)
                </div>
              </SelectItem>
              <SelectItem value="s3">
                <div className="flex items-center gap-2">
                  <Cloud className="h-4 w-4" />
                  S3 / MinIO
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {provider === "local" && (
        <Alert>
          <HardDrive className="h-4 w-4" />
          <AlertDescription>
            <strong>Lokaler Speicher</strong>
            <p className="mt-1 text-sm">
              Dateien werden im lokalen Dateisystem gespeichert. Dies ist fuer
              Entwicklung und kleine Deployments geeignet. Fuer Produktion wird
              S3/MinIO empfohlen.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {provider === "s3" && (
        <>
          <Separator />

          {/* S3 Configuration */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Cloud className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-medium">S3 / MinIO Konfiguration</h3>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="s3-endpoint">
                  Endpoint URL
                  <Badge variant="outline" className="ml-2 text-xs">
                    S3_ENDPOINT
                  </Badge>
                </Label>
                <Input
                  id="s3-endpoint"
                  placeholder="https://s3.eu-central-1.amazonaws.com"
                  value={s3Endpoint}
                  onChange={(e) => setS3Endpoint(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="s3-bucket">
                  Bucket Name
                  <Badge variant="outline" className="ml-2 text-xs">
                    S3_BUCKET
                  </Badge>
                </Label>
                <Input
                  id="s3-bucket"
                  placeholder="windparkmanager-files"
                  value={s3Bucket}
                  onChange={(e) => setS3Bucket(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="s3-region">
                Region
                <Badge variant="outline" className="ml-2 text-xs">
                  S3_REGION
                </Badge>
              </Label>
              <Select value={s3Region} onValueChange={setS3Region}>
                <SelectTrigger id="s3-region">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="eu-central-1">eu-central-1 (Frankfurt)</SelectItem>
                  <SelectItem value="eu-west-1">eu-west-1 (Irland)</SelectItem>
                  <SelectItem value="us-east-1">us-east-1 (N. Virginia)</SelectItem>
                  <SelectItem value="us-west-2">us-west-2 (Oregon)</SelectItem>
                  <SelectItem value="auto">auto (MinIO)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* S3 Credentials */}
            <div className="space-y-4">
              <h3 className="font-medium">Zugangsdaten</h3>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="s3-access-key">
                    Access Key
                    <Badge variant="outline" className="ml-2 text-xs">
                      S3_ACCESS_KEY
                    </Badge>
                    {hasExistingAccessKey && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        Gespeichert
                      </Badge>
                    )}
                  </Label>
                  <div className="relative">
                    <Input
                      id="s3-access-key"
                      type={showAccessKey ? "text" : "password"}
                      placeholder={hasExistingAccessKey ? "Neuen Key eingeben..." : "AKIAIOSFODNN7EXAMPLE"}
                      value={s3AccessKey}
                      onChange={(e) => setS3AccessKey(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowAccessKey(!showAccessKey)}
                    >
                      {showAccessKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="s3-secret-key">
                    Secret Key
                    <Badge variant="outline" className="ml-2 text-xs">
                      S3_SECRET_KEY
                    </Badge>
                    {hasExistingSecretKey && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        Gespeichert
                      </Badge>
                    )}
                  </Label>
                  <div className="relative">
                    <Input
                      id="s3-secret-key"
                      type={showSecretKey ? "text" : "password"}
                      placeholder={hasExistingSecretKey ? "Neuen Key eingeben..." : "wJalrXUtnFEMI/K7MDENG/..."}
                      value={s3SecretKey}
                      onChange={(e) => setS3SecretKey(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowSecretKey(!showSecretKey)}
                    >
                      {showSecretKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {(hasExistingAccessKey || hasExistingSecretKey) && (
                <p className="text-xs text-muted-foreground">
                  Leer lassen um die bestehenden Zugangsdaten beizubehalten
                </p>
              )}
            </div>
          </div>
        </>
      )}

      <Separator />

      {/* Test Section */}
      <div className="space-y-4">
        <h3 className="font-medium">Verbindung testen</h3>

        <Button
          variant="outline"
          onClick={handleTest}
          disabled={testing}
        >
          {testing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Database className="mr-2 h-4 w-4" />
          )}
          Storage-Verbindung testen
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
