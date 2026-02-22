"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Mail,
  Send,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle,
  XCircle,
  Server,
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
import { Switch } from "@/components/ui/switch";
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

interface EmailConfigFormProps {
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

export function EmailConfigForm({
  configs,
  availableKeys,
  onSave,
}: EmailConfigFormProps) {
  // Get initial values from configs
  const getConfigValue = (key: string): string => {
    const config = configs.find((c) => c.key === key);
    return config?.value || "";
  };

  // Form state
  const [smtpHost, setSmtpHost] = useState(getConfigValue("email.smtp.host"));
  const [smtpPort, setSmtpPort] = useState(getConfigValue("email.smtp.port") || "587");
  const [smtpUser, setSmtpUser] = useState(getConfigValue("email.smtp.user"));
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpSecure, setSmtpSecure] = useState(
    getConfigValue("email.smtp.secure") === "true"
  );
  const [fromAddress, setFromAddress] = useState(getConfigValue("email.from.address"));
  const [fromName, setFromName] = useState(getConfigValue("email.from.name") || "WindparkManager");

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // Check if password has value (masked)
  const hasExistingPassword = configs.some(
    (c) => c.key === "email.smtp.password" && c.value && c.value !== ""
  );

  // Save configuration
  async function handleSave() {
    try {
      setSaving(true);

      // Build configs array
      const configsToSave = [
        { key: "email.smtp.host", value: smtpHost, category: "email" },
        { key: "email.smtp.port", value: smtpPort, category: "email" },
        { key: "email.smtp.user", value: smtpUser, category: "email" },
        { key: "email.smtp.secure", value: smtpSecure ? "true" : "false", category: "email" },
        { key: "email.from.address", value: fromAddress, category: "email" },
        { key: "email.from.name", value: fromName, category: "email" },
      ];

      // Only include password if a new one was entered
      if (smtpPassword) {
        configsToSave.push({
          key: "email.smtp.password",
          value: smtpPassword,
          category: "email",
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

      toast.success("E-Mail-Konfiguration gespeichert");
      setSmtpPassword(""); // Clear password field after save
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

  // Test SMTP connection
  async function handleTest(withEmail: boolean = false) {
    try {
      setTesting(true);
      setTestResult(null);

      const body: { type: string; testParams?: Record<string, string> } = {
        type: "email",
      };

      if (withEmail && testEmail) {
        body.testParams = { recipient: testEmail };
      }

      const response = await fetch("/api/admin/system-config/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
        message: "Verbindungstest fehlgeschlagen",
        details: error instanceof Error ? error.message : undefined,
      });
      toast.error("Fehler beim Testen der Verbindung");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Server Settings */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-medium">SMTP-Server</h3>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="smtp-host">
              SMTP-Server (Host)
              <Badge variant="outline" className="ml-2 text-xs">
                SMTP_HOST
              </Badge>
            </Label>
            <Input
              id="smtp-host"
              placeholder="smtp.beispiel.de"
              value={smtpHost}
              onChange={(e) => setSmtpHost(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtp-port">
              SMTP-Port
              <Badge variant="outline" className="ml-2 text-xs">
                SMTP_PORT
              </Badge>
            </Label>
            <Select value={smtpPort} onValueChange={setSmtpPort}>
              <SelectTrigger id="smtp-port">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25 (Standard)</SelectItem>
                <SelectItem value="465">465 (SSL)</SelectItem>
                <SelectItem value="587">587 (TLS)</SelectItem>
                <SelectItem value="2525">2525 (Alternativ)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between p-3 border rounded-lg">
          <div>
            <Label htmlFor="smtp-secure" className="cursor-pointer">
              TLS/SSL aktivieren
            </Label>
            <p className="text-sm text-muted-foreground">
              Sichere Verbindung zum SMTP-Server
            </p>
          </div>
          <Switch
            id="smtp-secure"
            checked={smtpSecure}
            onCheckedChange={setSmtpSecure}
          />
        </div>
      </div>

      <Separator />

      {/* Authentication */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-medium">Authentifizierung</h3>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="smtp-user">
              SMTP-Benutzername
              <Badge variant="outline" className="ml-2 text-xs">
                SMTP_USER
              </Badge>
            </Label>
            <Input
              id="smtp-user"
              placeholder="benutzer@beispiel.de"
              value={smtpUser}
              onChange={(e) => setSmtpUser(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtp-password">
              SMTP-Passwort
              <Badge variant="outline" className="ml-2 text-xs">
                SMTP_PASS
              </Badge>
              {hasExistingPassword && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  Gespeichert
                </Badge>
              )}
            </Label>
            <div className="relative">
              <Input
                id="smtp-password"
                type={showPassword ? "text" : "password"}
                placeholder={hasExistingPassword ? "Neues Passwort eingeben..." : "********"}
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            {hasExistingPassword && !smtpPassword && (
              <p className="text-xs text-muted-foreground">
                Leer lassen um das bestehende Passwort beizubehalten
              </p>
            )}
          </div>
        </div>
      </div>

      <Separator />

      {/* Sender Settings */}
      <div className="space-y-4">
        <h3 className="font-medium">Absender-Einstellungen</h3>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="from-address">
              Absender E-Mail-Adresse
              <Badge variant="outline" className="ml-2 text-xs">
                EMAIL_FROM_ADDRESS
              </Badge>
            </Label>
            <Input
              id="from-address"
              type="email"
              placeholder="noreply@beispiel.de"
              value={fromAddress}
              onChange={(e) => setFromAddress(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="from-name">
              Absender-Name
              <Badge variant="outline" className="ml-2 text-xs">
                EMAIL_FROM_NAME
              </Badge>
            </Label>
            <Input
              id="from-name"
              placeholder="WindparkManager"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Test Section */}
      <div className="space-y-4">
        <h3 className="font-medium">Verbindung testen</h3>

        <div className="flex gap-4">
          <div className="flex-1 space-y-2">
            <Label htmlFor="test-email">Test-Empfaenger (optional)</Label>
            <Input
              id="test-email"
              type="email"
              placeholder="test@beispiel.de"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button
              variant="outline"
              onClick={() => handleTest(false)}
              disabled={testing}
            >
              {testing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Server className="mr-2 h-4 w-4" />
              )}
              Verbindung pruefen
            </Button>
            <Button
              variant="outline"
              onClick={() => handleTest(true)}
              disabled={testing || !testEmail}
            >
              {testing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Test-E-Mail senden
            </Button>
          </div>
        </div>

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
