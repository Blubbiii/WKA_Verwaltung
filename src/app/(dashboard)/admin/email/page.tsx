"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import {
  Mail,
  Send,
  FileText,
  Bell,
  Loader2,
  CheckCircle,
  XCircle,
  Pencil,
  Eye,
  RotateCcw,
  Save,
  Server,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TenantEmailServerSettings } from "@/components/settings/TenantEmailServerSettings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Skeleton } from "@/components/ui/skeleton";

// Dynamic import for Rich Text Editor (SSR-incompatible)
const RichTextEditor = dynamic(
  () =>
    import("@/components/ui/rich-text-editor").then(
      (mod) => mod.RichTextEditor
    ),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-md border bg-background">
        <div className="flex items-center gap-1 border-b p-2 bg-muted/30">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-8" />
          ))}
        </div>
        <Skeleton className="h-[300px] m-4" />
      </div>
    ),
  }
);

// =============================================================================
// TYPES
// =============================================================================

interface EmailTemplate {
  key: string;
  name: string;
  subject: string;
  isActive: boolean;
  isCustomized: boolean;
  updatedAt: string | null;
}

interface TemplateDetail {
  key: string;
  subject: string;
  htmlContent: string;
  isActive: boolean;
  isCustomized: boolean;
  placeholders: string[];
  updatedAt: string | null;
}

interface NotificationSettings {
  systemEmailsEnabled: boolean;
  welcomeEmail: boolean;
  passwordReset: boolean;
  newVote: boolean;
  voteReminder: boolean;
  newCredit: boolean;
  contractWarning: boolean;
}

interface TestEmailResult {
  success: boolean;
  message: string;
}

// =============================================================================
// DEFAULT VALUES
// =============================================================================

const defaultNotificationSettings: NotificationSettings = {
  systemEmailsEnabled: true,
  welcomeEmail: true,
  passwordReset: true,
  newVote: true,
  voteReminder: true,
  newCredit: true,
  contractWarning: true,
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function EmailConfigPage() {
  // Notification state
  const [notificationSettings, setNotificationSettings] =
    useState<NotificationSettings>(defaultNotificationSettings);

  // Template state
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);

  // Test email state
  const [testEmail, setTestEmail] = useState("");

  // General state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<TestEmailResult | null>(null);

  // Template editor dialog state
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string | null>(
    null
  );
  const [templateDetail, setTemplateDetail] = useState<TemplateDetail | null>(
    null
  );
  const [editSubject, setEditSubject] = useState("");
  const [editHtmlContent, setEditHtmlContent] = useState("");
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  // Ref for editor content (avoids stale closure issues)
  const editHtmlContentRef = useRef(editHtmlContent);
  editHtmlContentRef.current = editHtmlContent;

  // =========================================================================
  // LOAD DATA
  // =========================================================================

  // Load notification settings (legacy API)
  useEffect(() => {
    loadNotificationConfig();
  }, []);

  // Load templates from new API
  const loadTemplates = useCallback(async () => {
    try {
      setTemplatesLoading(true);
      const response = await fetch("/api/admin/email-templates");
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
      }
    } catch {
      toast.error("Fehler beim Laden der Vorlagen");
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  async function loadNotificationConfig() {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/email");
      if (response.ok) {
        const data = await response.json();
        if (data.notifications) {
          setNotificationSettings(data.notifications);
        }
      }
    } catch {
      toast.error("Fehler beim Laden der E-Mail-Konfiguration");
    } finally {
      setLoading(false);
    }
  }

  // =========================================================================
  // NOTIFICATION SETTINGS
  // =========================================================================

  async function saveConfig() {
    try {
      setSaving(true);
      const response = await fetch("/api/admin/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notifications: notificationSettings,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Speichern");
      }

      toast.success("E-Mail-Konfiguration gespeichert");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Speichern"
      );
    } finally {
      setSaving(false);
    }
  }

  // =========================================================================
  // TEST EMAIL
  // =========================================================================

  async function sendTestEmail() {
    if (!testEmail) {
      toast.error("Bitte geben Sie eine E-Mail-Adresse ein");
      return;
    }

    try {
      setSendingTest(true);
      setTestResult(null);

      const response = await fetch("/api/admin/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          recipient: testEmail,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setTestResult({
          success: true,
          message: data.message || "Test-E-Mail wurde gesendet",
        });
        toast.success("Test-E-Mail wurde gesendet");
      } else {
        setTestResult({
          success: false,
          message: data.error || "Fehler beim Senden",
        });
        toast.error(data.error || "Fehler beim Senden der Test-E-Mail");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Fehler beim Senden";
      setTestResult({ success: false, message });
      toast.error(message);
    } finally {
      setSendingTest(false);
    }
  }

  function handleNotificationChange(
    field: keyof NotificationSettings,
    value: boolean
  ) {
    setNotificationSettings((prev) => ({ ...prev, [field]: value }));
  }

  // =========================================================================
  // TEMPLATE EDITOR
  // =========================================================================

  async function openTemplateEditor(template: EmailTemplate) {
    setSelectedTemplateKey(template.key);
    setShowTemplateDialog(true);
    setTemplateDetail(null);
    setShowPreview(false);
    setPreviewHtml("");

    try {
      setTemplateLoading(true);
      const response = await fetch(
        `/api/admin/email-templates/${template.key}`
      );

      if (!response.ok) {
        throw new Error("Fehler beim Laden der Vorlage");
      }

      const detail: TemplateDetail = await response.json();
      setTemplateDetail(detail);
      setEditSubject(detail.subject);
      setEditHtmlContent(detail.htmlContent);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Laden der Vorlage"
      );
      setShowTemplateDialog(false);
    } finally {
      setTemplateLoading(false);
    }
  }

  async function handleTemplateSave() {
    if (!selectedTemplateKey) return;

    try {
      setTemplateSaving(true);

      const response = await fetch(
        `/api/admin/email-templates/${selectedTemplateKey}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: editSubject,
            htmlContent: editHtmlContentRef.current,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Speichern");
      }

      toast.success("Vorlage gespeichert");
      setShowTemplateDialog(false);
      loadTemplates(); // Refresh the list
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Speichern"
      );
    } finally {
      setTemplateSaving(false);
    }
  }

  async function handleTemplateReset() {
    if (!selectedTemplateKey) return;

    try {
      setTemplateSaving(true);

      const response = await fetch(
        `/api/admin/email-templates/${selectedTemplateKey}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Zurücksetzen");
      }

      toast.success("Vorlage auf Standard zurückgesetzt");
      setShowTemplateDialog(false);
      loadTemplates();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Zurücksetzen"
      );
    } finally {
      setTemplateSaving(false);
    }
  }

  async function handleTemplatePreview() {
    if (!selectedTemplateKey) return;

    try {
      setPreviewLoading(true);

      const response = await fetch(
        `/api/admin/email-templates/${selectedTemplateKey}/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: editSubject,
            htmlContent: editHtmlContentRef.current,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Fehler beim Erstellen der Vorschau");
      }

      const data = await response.json();
      setPreviewHtml(data.html);
      setShowPreview(true);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Erstellen der Vorschau"
      );
    } finally {
      setPreviewLoading(false);
    }
  }

  function insertPlaceholder(placeholder: string) {
    // We insert the placeholder text at cursor position
    // The RichTextEditor onChange will update our state
    setEditHtmlContent((prev) => {
      // Simple append approach - the rich text editor will handle it
      // In practice, users click in the editor first, then click a placeholder
      return prev + `{{${placeholder}}}`;
    });
  }

  // =========================================================================
  // RENDER
  // =========================================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          E-Mail-Verwaltung
        </h1>
        <p className="text-muted-foreground">
          E-Mail-Vorlagen, Benachrichtigungen und Test-E-Mails verwalten
        </p>
      </div>

      <Tabs defaultValue="templates" className="space-y-6">
        <TabsList>
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            E-Mail-Vorlagen
          </TabsTrigger>
          <TabsTrigger value="smtp" className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            SMTP-Server
          </TabsTrigger>
          <TabsTrigger
            value="notifications"
            className="flex items-center gap-2"
          >
            <Bell className="h-4 w-4" />
            Benachrichtigungen
          </TabsTrigger>
          <TabsTrigger value="test" className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            Test-E-Mail
          </TabsTrigger>
        </TabsList>

        {/* Email Templates Tab */}
        <TabsContent value="templates" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                E-Mail-Vorlagen
              </CardTitle>
              <CardDescription>
                Verwalten und bearbeiten Sie die Vorlagen für System-E-Mails
              </CardDescription>
            </CardHeader>
            <CardContent>
              {templatesLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Betreff</TableHead>
                      <TableHead className="text-center">Typ</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="w-[80px]">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates.map((template) => (
                      <TableRow key={template.key}>
                        <TableCell className="font-medium">
                          {template.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground max-w-[250px] truncate">
                          {template.subject}
                        </TableCell>
                        <TableCell className="text-center">
                          {template.isCustomized ? (
                            <Badge variant="default" className="bg-blue-600">
                              Angepasst
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Standard</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={
                              template.isActive ? "default" : "secondary"
                            }
                          >
                            {template.isActive ? "Aktiv" : "Inaktiv"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openTemplateEditor(template)}
                            title="Bearbeiten"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SMTP Server Tab */}
        <TabsContent value="smtp" className="space-y-6">
          <TenantEmailServerSettings />
        </TabsContent>

        {/* Notification Settings Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Benachrichtigungs-Einstellungen
              </CardTitle>
              <CardDescription>
                Aktivieren oder deaktivieren Sie einzelne
                Benachrichtigungstypen
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Master Switch */}
              <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                <div className="space-y-0.5">
                  <Label className="text-base font-semibold">
                    System-E-Mails aktiviert
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Haupt-Schalter für alle E-Mail-Benachrichtigungen
                  </p>
                </div>
                <Switch
                  checked={notificationSettings.systemEmailsEnabled}
                  onCheckedChange={(checked) =>
                    handleNotificationChange("systemEmailsEnabled", checked)
                  }
                />
              </div>

              <Separator />

              {/* Individual Settings */}
              <div className="space-y-4">
                <NotificationSwitch
                  label="Willkommens-E-Mail"
                  description="E-Mail nach Registrierung eines neuen Benutzers"
                  checked={notificationSettings.welcomeEmail}
                  disabled={!notificationSettings.systemEmailsEnabled}
                  onCheckedChange={(checked) =>
                    handleNotificationChange("welcomeEmail", checked)
                  }
                />
                <NotificationSwitch
                  label="Passwort-Reset"
                  description="E-Mail zum Zurücksetzen des Passworts"
                  checked={notificationSettings.passwordReset}
                  disabled={!notificationSettings.systemEmailsEnabled}
                  onCheckedChange={(checked) =>
                    handleNotificationChange("passwordReset", checked)
                  }
                />
                <NotificationSwitch
                  label="Neue Abstimmung"
                  description="Benachrichtigung wenn eine neue Abstimmung erstellt wird"
                  checked={notificationSettings.newVote}
                  disabled={!notificationSettings.systemEmailsEnabled}
                  onCheckedChange={(checked) =>
                    handleNotificationChange("newVote", checked)
                  }
                />
                <NotificationSwitch
                  label="Abstimmungs-Erinnerung"
                  description="Erinnerung vor Ablauf einer Abstimmungsfrist"
                  checked={notificationSettings.voteReminder}
                  disabled={!notificationSettings.systemEmailsEnabled}
                  onCheckedChange={(checked) =>
                    handleNotificationChange("voteReminder", checked)
                  }
                />
                <NotificationSwitch
                  label="Neue Gutschrift"
                  description="Benachrichtigung bei neuer Gutschrift"
                  checked={notificationSettings.newCredit}
                  disabled={!notificationSettings.systemEmailsEnabled}
                  onCheckedChange={(checked) =>
                    handleNotificationChange("newCredit", checked)
                  }
                />
                <NotificationSwitch
                  label="Vertragsfrist-Warnung"
                  description="Warnung wenn eine Vertragsfrist bald abläuft"
                  checked={notificationSettings.contractWarning}
                  disabled={!notificationSettings.systemEmailsEnabled}
                  onCheckedChange={(checked) =>
                    handleNotificationChange("contractWarning", checked)
                  }
                />
              </div>

              <div className="flex justify-end pt-4">
                <Button onClick={saveConfig} disabled={saving}>
                  {saving && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Einstellungen speichern
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Test Email Tab */}
        <TabsContent value="test" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Test-E-Mail senden
              </CardTitle>
              <CardDescription>
                Überprüfen Sie die SMTP-Konfiguration durch Senden einer
                Test-E-Mail
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="test-email">Empfänger-Adresse</Label>
                  <Input
                    id="test-email"
                    type="email"
                    placeholder="test@beispiel.de"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={sendTestEmail}
                    disabled={sendingTest || !testEmail}
                  >
                    {sendingTest ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Test-E-Mail senden
                  </Button>
                </div>
              </div>

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
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Template Editor Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              E-Mail-Vorlage bearbeiten
            </DialogTitle>
            <DialogDescription>
              {templateDetail
                ? `Bearbeiten Sie den Betreff und Inhalt der Vorlage`
                : "Vorlage wird geladen..."}
            </DialogDescription>
          </DialogHeader>

          {templateLoading ? (
            <div className="space-y-4 py-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-[300px] w-full" />
            </div>
          ) : templateDetail ? (
            <div className="space-y-4 py-4">
              {/* Subject */}
              <div className="space-y-2">
                <Label htmlFor="template-subject">Betreff</Label>
                <Input
                  id="template-subject"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  placeholder="E-Mail Betreff..."
                />
              </div>

              {/* Placeholders */}
              <div className="space-y-2">
                <Label>Verfügbare Platzhalter</Label>
                <div className="flex flex-wrap gap-2">
                  {templateDetail.placeholders.map((placeholder) => (
                    <Badge
                      key={placeholder}
                      variant="outline"
                      className="cursor-pointer hover:bg-muted transition-colors"
                      onClick={() => insertPlaceholder(placeholder)}
                      title="Klicken zum Einfuegen"
                    >
                      {`{{${placeholder}}}`}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Klicken Sie auf einen Platzhalter, um ihn am Ende des Inhalts
                  einzufuegen
                </p>
              </div>

              <Separator />

              {/* Editor / Preview Toggle */}
              {showPreview ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Vorschau (mit Beispieldaten)</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPreview(false)}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Zurück zum Editor
                    </Button>
                  </div>
                  <div className="rounded-md border bg-white p-0 min-h-[400px]">
                    <iframe
                      srcDoc={previewHtml}
                      className="w-full min-h-[400px] border-0"
                      title="E-Mail Vorschau"
                      sandbox="allow-same-origin"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Inhalt</Label>
                  <RichTextEditor
                    value={editHtmlContent}
                    onChange={setEditHtmlContent}
                    placeholder="E-Mail-Inhalt bearbeiten..."
                    className="min-h-[300px]"
                  />
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <div className="flex gap-2">
              {/* Preview Button */}
              <Button
                variant="outline"
                onClick={handleTemplatePreview}
                disabled={previewLoading || templateLoading}
              >
                {previewLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="mr-2 h-4 w-4" />
                )}
                Vorschau
              </Button>

              {/* Reset to Default Button */}
              {templateDetail?.isCustomized && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline">
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Auf Standard zurücksetzen
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Vorlage zurücksetzen?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Alle Anpassungen an dieser Vorlage werden entfernt. Die
                        Standard-Vorlage wird wiederhergestellt. Diese Aktion
                        kann nicht rueckgaengig gemacht werden.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleTemplateReset}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Zurücksetzen
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowTemplateDialog(false)}
              >
                Abbrechen
              </Button>
              <Button
                onClick={handleTemplateSave}
                disabled={templateSaving || templateLoading}
              >
                {templateSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Speichern
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

function NotificationSwitch({
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div className="space-y-0.5">
        <Label className={disabled ? "text-muted-foreground" : ""}>
          {label}
        </Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
