"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import {
  Plus,
  Pencil,
  Trash2,
  Send,
  Copy,
  Check,
  X,
  Radio,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import {
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_CATEGORIES,
} from "@/lib/webhooks/events";
import type { WebhookEventType } from "@/lib/webhooks/events";
import { AlertTriangle } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Webhook {
  id: string;
  url: string;
  secret: string;
  events: WebhookEventType[];
  description: string | null;
  active: boolean;
  lastDeliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  statusCode: number | null;
  success: boolean;
  durationMs: number | null;
  createdAt: string;
  error: string | null;
}

interface WebhookFormData {
  url: string;
  secret: string;
  events: WebhookEventType[];
  description: string;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateUrl(url: string, maxLen = 40): string {
  if (url.length <= maxLen) return url;
  return url.slice(0, maxLen) + "...";
}

function emptyFormData(): WebhookFormData {
  return {
    url: "",
    secret: "",
    events: [],
    description: "",
    active: true,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminWebhooksPage() {
  const { data: session } = useSession();

  // -- State ----------------------------------------------------------------

  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [formData, setFormData] = useState<WebhookFormData>(emptyFormData());
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingWebhook, setDeletingWebhook] = useState<Webhook | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Delivery log
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const [deliveryWebhook, setDeliveryWebhook] = useState<Webhook | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);

  // Test sending
  const [testingId, setTestingId] = useState<string | null>(null);

  // Clipboard feedback
  const [copiedSecret, setCopiedSecret] = useState(false);

  // -- Data fetching --------------------------------------------------------

  const fetchWebhooks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/webhooks");
      if (!res.ok) throw new Error("Fehler beim Laden der Webhooks");
      const data = await res.json();
      setWebhooks(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Fehler beim Laden der Webhooks"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  const fetchDeliveries = useCallback(async (webhookId: string) => {
    try {
      setDeliveriesLoading(true);
      const res = await fetch(`/api/admin/webhooks/${webhookId}/deliveries`);
      if (!res.ok) throw new Error("Fehler beim Laden der Zustellungen");
      const data = await res.json();
      setDeliveries(data);
    } catch {
      toast.error("Zustellungen konnten nicht geladen werden");
      setDeliveries([]);
    } finally {
      setDeliveriesLoading(false);
    }
  }, []);

  // -- Handlers -------------------------------------------------------------

  const handleOpenCreate = () => {
    setEditingWebhook(null);
    setFormData(emptyFormData());
    setCopiedSecret(false);
    setDialogOpen(true);
  };

  const handleOpenEdit = (webhook: Webhook) => {
    setEditingWebhook(webhook);
    setFormData({
      url: webhook.url,
      secret: webhook.secret,
      events: [...webhook.events],
      description: webhook.description ?? "",
      active: webhook.active,
    });
    setCopiedSecret(false);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    // Validation
    if (!formData.url.trim()) {
      toast.error("Bitte eine URL eingeben");
      return;
    }
    try {
      new URL(formData.url);
    } catch {
      toast.error("Bitte eine gueltige URL eingeben");
      return;
    }
    if (formData.events.length === 0) {
      toast.error("Bitte mindestens ein Event auswaehlen");
      return;
    }

    setSaving(true);
    try {
      const isEdit = !!editingWebhook;
      const url = isEdit
        ? `/api/admin/webhooks/${editingWebhook!.id}`
        : "/api/admin/webhooks";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: formData.url,
          events: formData.events,
          description: formData.description || null,
          active: formData.active,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Fehler beim Speichern");
      }

      toast.success(isEdit ? "Webhook aktualisiert" : "Webhook erstellt");
      setDialogOpen(false);
      fetchWebhooks();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Fehler beim Speichern"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingWebhook) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/webhooks/${deletingWebhook.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Fehler beim Loeschen");
      toast.success("Webhook geloescht");
      setDeleteDialogOpen(false);
      setDeletingWebhook(null);
      fetchWebhooks();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Fehler beim Loeschen"
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleTest = async (webhook: Webhook) => {
    setTestingId(webhook.id);
    try {
      const res = await fetch(`/api/admin/webhooks/${webhook.id}/test`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Test fehlgeschlagen");
      }
      toast.success("Test-Webhook erfolgreich gesendet");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Test fehlgeschlagen"
      );
    } finally {
      setTestingId(null);
    }
  };

  const handleOpenDeliveries = (webhook: Webhook) => {
    setDeliveryWebhook(webhook);
    setDeliveryDialogOpen(true);
    fetchDeliveries(webhook.id);
  };

  const handleCopySecret = async () => {
    try {
      await navigator.clipboard.writeText(formData.secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
      toast.success("Secret in Zwischenablage kopiert");
    } catch {
      toast.error("Kopieren fehlgeschlagen");
    }
  };

  const toggleEvent = (event: WebhookEventType) => {
    setFormData((prev) => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter((e) => e !== event)
        : [...prev.events, event],
    }));
  };

  const toggleCategory = (events: WebhookEventType[]) => {
    const allSelected = events.every((e) => formData.events.includes(e));
    setFormData((prev) => ({
      ...prev,
      events: allSelected
        ? prev.events.filter((e) => !events.includes(e))
        : [...new Set([...prev.events, ...events])],
    }));
  };

  // -- Permission check -----------------------------------------------------

  if (session?.user?.role !== "SUPERADMIN") {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground gap-2">
        <AlertTriangle className="h-8 w-8" />
        <p>Nur SuperAdmins koennen Webhooks verwalten.</p>
      </div>
    );
  }

  // -- Render ---------------------------------------------------------------

  return (
    <div className="space-y-6">
      <PageHeader
        title="Webhooks"
        description="HTTP-Callbacks bei Business-Events an externe URLs senden"
        actions={
          <Button onClick={handleOpenCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Webhook erstellen
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              <p>{error}</p>
              <Button variant="outline" size="sm" onClick={fetchWebhooks}>
                Erneut versuchen
              </Button>
            </div>
          ) : webhooks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <Radio className="h-8 w-8" />
              <p>Keine Webhooks konfiguriert</p>
              <Button variant="outline" size="sm" onClick={handleOpenCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Ersten Webhook erstellen
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Letzte Zustellung</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhooks.map((webhook) => (
                  <TableRow key={webhook.id}>
                    <TableCell className="font-mono text-sm max-w-[300px]">
                      <span title={webhook.url}>
                        {truncateUrl(webhook.url)}
                      </span>
                      {webhook.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 font-sans">
                          {webhook.description}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {webhook.events.length}{" "}
                        {webhook.events.length === 1 ? "Event" : "Events"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={webhook.active ? "default" : "outline"}
                        className={
                          webhook.active
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                            : ""
                        }
                      >
                        {webhook.active ? "Aktiv" : "Inaktiv"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {webhook.lastDeliveredAt
                        ? formatDistanceToNow(
                            new Date(webhook.lastDeliveredAt),
                            { addSuffix: true, locale: de }
                          )
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Testen"
                          onClick={() => handleTest(webhook)}
                          disabled={testingId === webhook.id}
                        >
                          {testingId === webhook.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Zustellungen anzeigen"
                          onClick={() => handleOpenDeliveries(webhook)}
                        >
                          <Radio className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Bearbeiten"
                          onClick={() => handleOpenEdit(webhook)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Loeschen"
                          onClick={() => {
                            setDeletingWebhook(webhook);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Create / Edit Dialog                                                */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingWebhook ? "Webhook bearbeiten" : "Webhook erstellen"}
            </DialogTitle>
            <DialogDescription>
              {editingWebhook
                ? "Einstellungen des Webhooks anpassen."
                : "Neuen Webhook fuer Event-Benachrichtigungen einrichten."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* URL */}
            <div className="space-y-2">
              <Label htmlFor="webhook-url">URL *</Label>
              <Input
                id="webhook-url"
                type="url"
                placeholder="https://example.com/webhook"
                value={formData.url}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, url: e.target.value }))
                }
              />
            </div>

            {/* Secret */}
            {editingWebhook && (
              <div className="space-y-2">
                <Label>Secret</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={formData.secret}
                    className="font-mono text-sm bg-muted"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleCopySecret}
                    title="Secret kopieren"
                  >
                    {copiedSecret ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Wird zur HMAC-SHA256-Signaturpruefung der Payloads verwendet.
                </p>
              </div>
            )}

            {/* Events */}
            <div className="space-y-3">
              <Label>Events *</Label>
              <p className="text-xs text-muted-foreground">
                Waehlen Sie die Events, bei denen der Webhook ausgeloest werden
                soll.
              </p>
              <div className="space-y-2">
                {Object.entries(WEBHOOK_EVENT_CATEGORIES).map(
                  ([key, category]) => (
                    <EventCategoryGroup
                      key={key}
                      label={category.label}
                      events={category.events}
                      selectedEvents={formData.events}
                      onToggleEvent={toggleEvent}
                      onToggleCategory={() => toggleCategory(category.events)}
                    />
                  )
                )}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="webhook-description">
                Beschreibung (optional)
              </Label>
              <Textarea
                id="webhook-description"
                placeholder="z.B. Benachrichtigung an Buchhaltungssystem"
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                rows={2}
              />
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label htmlFor="webhook-active" className="text-sm font-medium">
                  Aktiv
                </Label>
                <p className="text-xs text-muted-foreground">
                  Inaktive Webhooks empfangen keine Zustellungen.
                </p>
              </div>
              <Switch
                id="webhook-active"
                checked={formData.active}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, active: checked }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingWebhook ? "Speichern" : "Erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------------ */}
      {/* Delete Confirmation                                                 */}
      {/* ------------------------------------------------------------------ */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Webhook loeschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Der Webhook{" "}
              <span className="font-mono text-sm">
                {deletingWebhook?.url ? truncateUrl(deletingWebhook.url, 50) : ""}
              </span>{" "}
              wird unwiderruflich geloescht. Alle zugehoerigen Zustellungsprotokolle
              werden ebenfalls entfernt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Loeschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ------------------------------------------------------------------ */}
      {/* Delivery Log Dialog                                                 */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={deliveryDialogOpen} onOpenChange={setDeliveryDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Zustellungsprotokoll</DialogTitle>
            <DialogDescription>
              Letzte Zustellungen fuer{" "}
              <span className="font-mono text-sm">
                {deliveryWebhook?.url
                  ? truncateUrl(deliveryWebhook.url, 50)
                  : ""}
              </span>
            </DialogDescription>
          </DialogHeader>

          {deliveriesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : deliveries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
              <Radio className="h-6 w-6" />
              <p>Noch keine Zustellungen vorhanden</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>HTTP-Code</TableHead>
                  <TableHead>Dauer</TableHead>
                  <TableHead>Zeitpunkt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.map((delivery) => (
                  <TableRow key={delivery.id}>
                    <TableCell className="font-mono text-sm">
                      {delivery.event}
                    </TableCell>
                    <TableCell>
                      {delivery.success ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <span className="flex items-center gap-1">
                          <X className="h-4 w-4 text-destructive" />
                          {delivery.error && (
                            <span
                              className="text-xs text-muted-foreground truncate max-w-[150px]"
                              title={delivery.error}
                            >
                              {delivery.error}
                            </span>
                          )}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {delivery.statusCode ?? "-"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {delivery.durationMs != null
                        ? `${delivery.durationMs} ms`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(delivery.createdAt), {
                        addSuffix: true,
                        locale: de,
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event Category Group (collapsible checkbox group)
// ---------------------------------------------------------------------------

interface EventCategoryGroupProps {
  label: string;
  events: WebhookEventType[];
  selectedEvents: WebhookEventType[];
  onToggleEvent: (event: WebhookEventType) => void;
  onToggleCategory: () => void;
}

function EventCategoryGroup({
  label,
  events,
  selectedEvents,
  onToggleEvent,
  onToggleCategory,
}: EventCategoryGroupProps) {
  const [open, setOpen] = useState(true);
  const selectedCount = events.filter((e) => selectedEvents.includes(e)).length;
  const allSelected = selectedCount === events.length;
  const someSelected = selectedCount > 0 && !allSelected;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border">
        <div className="flex items-center gap-3 px-3 py-2">
          <Checkbox
            checked={allSelected ? true : someSelected ? "indeterminate" : false}
            onCheckedChange={() => onToggleCategory()}
            aria-label={`Alle ${label}-Events`}
          />
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 flex-1 text-sm font-medium hover:text-foreground transition-colors text-left">
              {open ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              {label}
              <Badge variant="secondary" className="ml-auto text-xs">
                {selectedCount}/{events.length}
              </Badge>
            </button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <div className="border-t px-3 py-2 space-y-2">
            {events.map((event) => (
              <label
                key={event}
                className="flex items-center gap-3 cursor-pointer py-1 hover:bg-muted/50 rounded px-2 -mx-2"
              >
                <Checkbox
                  checked={selectedEvents.includes(event)}
                  onCheckedChange={() => onToggleEvent(event)}
                />
                <span className="text-sm">
                  <span className="font-mono text-xs text-muted-foreground mr-2">
                    {event}
                  </span>
                  {WEBHOOK_EVENTS[event]}
                </span>
              </label>
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
