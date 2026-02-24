"use client";

import { useState, useEffect, useCallback } from "react";
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
  Trash2,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// =============================================================================
// TYPES
// =============================================================================

interface TenantEmailConfig {
  isCustom: boolean;
  config: {
    smtpHost: string;
    smtpPort: string;
    smtpUser: string;
    hasPassword: boolean;
    smtpSecure: boolean;
    fromAddress: string;
    fromName: string;
  };
}

interface TestResult {
  success: boolean;
  message: string;
}

// =============================================================================
// SKELETON
// =============================================================================

function EmailServerSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-4 w-96" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}

// =============================================================================
// COMPONENT
// =============================================================================

export function TenantEmailServerSettings() {
  // Data state
  const [data, setData] = useState<TenantEmailConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  // Form state
  const [useCustom, setUseCustom] = useState(false);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [fromAddress, setFromAddress] = useState("");
  const [fromName, setFromName] = useState("");

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Load configuration
  const loadConfig = useCallback(async () => {
    try {
      setIsLoading(true);
      setIsError(false);
      const response = await fetch("/api/admin/tenant-email");
      if (!response.ok) throw new Error("Failed to load");
      const result: TenantEmailConfig = await response.json();
      setData(result);
      setUseCustom(result.isCustom);
      if (result.isCustom) {
        setSmtpHost(result.config.smtpHost);
        setSmtpPort(result.config.smtpPort);
        setSmtpUser(result.config.smtpUser);
        setSmtpSecure(result.config.smtpSecure);
        setFromAddress(result.config.fromAddress);
        setFromName(result.config.fromName);
      }
    } catch {
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Save configuration
  async function handleSave() {
    if (!smtpHost || !smtpUser || !fromAddress) {
      toast.error("Bitte fuellen Sie alle Pflichtfelder aus");
      return;
    }

    if (!data?.config.hasPassword && !smtpPassword) {
      toast.error("Bitte geben Sie ein SMTP-Passwort ein");
      return;
    }

    try {
      setSaving(true);

      const body: Record<string, unknown> = {
        smtpHost,
        smtpPort,
        smtpUser,
        smtpSecure,
        fromAddress,
        fromName: fromName || undefined,
      };

      // Only include password if entered
      if (smtpPassword) {
        body.smtpPassword = smtpPassword;
      }

      const response = await fetch("/api/admin/tenant-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Speichern");
      }

      toast.success("E-Mail-Server-Konfiguration gespeichert");
      setSmtpPassword(""); // Clear password field
      await loadConfig(); // Reload to get fresh state
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Speichern"
      );
    } finally {
      setSaving(false);
    }
  }

  // Delete configuration (reset to system default)
  async function handleDelete() {
    try {
      setDeleting(true);
      const response = await fetch("/api/admin/tenant-email", {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Entfernen");
      }

      toast.success("Eigene Konfiguration entfernt - System-Standard wird verwendet");
      setUseCustom(false);
      setSmtpHost("");
      setSmtpPort("587");
      setSmtpUser("");
      setSmtpPassword("");
      setSmtpSecure(false);
      setFromAddress("");
      setFromName("");
      await loadConfig();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Entfernen"
      );
    } finally {
      setDeleting(false);
    }
  }

  // Test connection or send test email
  async function handleTest(type: "connection" | "email") {
    try {
      setTesting(true);
      setTestResult(null);

      const body: Record<string, string> = { type };
      if (type === "email") {
        if (!testEmail) {
          toast.error("Bitte geben Sie eine Test-E-Mail-Adresse ein");
          setTesting(false);
          return;
        }
        body.recipient = testEmail;
      }

      const response = await fetch("/api/admin/tenant-email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      setTestResult({
        success: result.success,
        message: result.message || result.error || "Unbekanntes Ergebnis",
      });

      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.error || "Test fehlgeschlagen");
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : "Verbindungsfehler",
      });
      toast.error("Fehler beim Testen");
    } finally {
      setTesting(false);
    }
  }

  // Error state
  if (isError) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="p-4 text-red-600 bg-red-50 rounded-md">
            Fehler beim Laden der E-Mail-Server-Konfiguration
          </div>
        </CardContent>
      </Card>
    );
  }

  // Loading state
  if (isLoading) {
    return <EmailServerSkeleton />;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-lg">E-Mail-Server</CardTitle>
              <CardDescription>
                Eigenen SMTP-Server für den E-Mail-Versand konfigurieren
              </CardDescription>
            </div>
          </div>
          {data?.isCustom && (
            <Badge variant="default" className="bg-blue-600">
              Eigene Konfiguration
            </Badge>
          )}
          {!data?.isCustom && (
            <Badge variant="secondary">System-Standard</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Toggle */}
        <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
          <div className="space-y-0.5">
            <Label className="text-base font-semibold cursor-pointer">
              Eigenen E-Mail-Server verwenden
            </Label>
            <p className="text-sm text-muted-foreground">
              {useCustom
                ? "E-Mails werden über Ihren eigenen SMTP-Server versendet"
                : "E-Mails werden über die Systemkonfiguration versendet"}
            </p>
          </div>
          <Switch checked={useCustom} onCheckedChange={setUseCustom} />
        </div>

        {!useCustom && !data?.isCustom && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              E-Mails werden über den vom System bereitgestellten E-Mail-Server
              versendet. Aktivieren Sie den Schalter oben, um einen eigenen
              SMTP-Server zu konfigurieren.
            </AlertDescription>
          </Alert>
        )}

        {/* SMTP Form - visible when toggle is on */}
        {useCustom && (
          <>
            {/* Server Settings */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-medium">SMTP-Server</h3>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="tenant-smtp-host">SMTP-Server (Host) *</Label>
                  <Input
                    id="tenant-smtp-host"
                    placeholder="smtp.beispiel.de"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tenant-smtp-port">SMTP-Port</Label>
                  <Select value={smtpPort} onValueChange={setSmtpPort}>
                    <SelectTrigger id="tenant-smtp-port">
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
                  <Label htmlFor="tenant-smtp-secure" className="cursor-pointer">
                    TLS/SSL aktivieren
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Sichere Verbindung zum SMTP-Server
                  </p>
                </div>
                <Switch
                  id="tenant-smtp-secure"
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
                  <Label htmlFor="tenant-smtp-user">SMTP-Benutzername *</Label>
                  <Input
                    id="tenant-smtp-user"
                    placeholder="benutzer@beispiel.de"
                    value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tenant-smtp-password">
                    SMTP-Passwort *
                    {data?.config.hasPassword && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        Gespeichert
                      </Badge>
                    )}
                  </Label>
                  <div className="relative">
                    <Input
                      id="tenant-smtp-password"
                      type={showPassword ? "text" : "password"}
                      placeholder={
                        data?.config.hasPassword
                          ? "Neues Passwort eingeben..."
                          : "Passwort eingeben"
                      }
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
                  {data?.config.hasPassword && !smtpPassword && (
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
                  <Label htmlFor="tenant-from-address">
                    Absender E-Mail-Adresse *
                  </Label>
                  <Input
                    id="tenant-from-address"
                    type="email"
                    placeholder="noreply@beispiel.de"
                    value={fromAddress}
                    onChange={(e) => setFromAddress(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tenant-from-name">Absender-Name</Label>
                  <Input
                    id="tenant-from-name"
                    placeholder="Windpark Beispiel GmbH"
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
                  <Label htmlFor="tenant-test-email">
                    Test-Empfänger (optional)
                  </Label>
                  <Input
                    id="tenant-test-email"
                    type="email"
                    placeholder="test@beispiel.de"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleTest("connection")}
                    disabled={testing || !data?.isCustom}
                  >
                    {testing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Server className="mr-2 h-4 w-4" />
                    )}
                    Verbindung prüfen
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleTest("email")}
                    disabled={testing || !testEmail || !data?.isCustom}
                  >
                    {testing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Test-E-Mail
                  </Button>
                </div>
              </div>

              {!data?.isCustom && useCustom && (
                <p className="text-xs text-muted-foreground">
                  Speichern Sie die Konfiguration zuerst, bevor Sie die
                  Verbindung testen.
                </p>
              )}

              {testResult && (
                <Alert
                  variant={testResult.success ? "default" : "destructive"}
                >
                  {testResult.success ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  <AlertDescription>{testResult.message}</AlertDescription>
                </Alert>
              )}
            </div>

            <Separator />

            {/* Actions */}
            <div className="flex items-center justify-between">
              {data?.isCustom && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="text-destructive">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Eigene Konfiguration entfernen
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Eigene Konfiguration entfernen?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Alle eigenen SMTP-Einstellungen werden gelöscht.
                        E-Mails werden danach über den System-Standard
                        versendet. Diese Aktion kann nicht rueckgaengig gemacht
                        werden.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        disabled={deleting}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {deleting && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Entfernen
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              <div className="ml-auto">
                <Button onClick={handleSave} disabled={saving}>
                  {saving && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Konfiguration speichern
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
