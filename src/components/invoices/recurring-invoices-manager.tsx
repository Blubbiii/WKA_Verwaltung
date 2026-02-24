"use client";

import { useState, useCallback } from "react";
import { formatCurrency } from "@/lib/format";
import { useApiQuery, useApiMutation, useInvalidateQuery } from "@/hooks/useApiQuery";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Plus,
  Trash2,
  Pencil,
  CalendarClock,
  MoreHorizontal,
  Loader2,
  Clock,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { toast } from "sonner";

// ============================================================================
// Types
// ============================================================================

interface Position {
  description: string;
  quantity: number;
  unitPrice: number;
  taxType: "STANDARD" | "REDUCED" | "EXEMPT";
  unit?: string;
}

interface RecurringInvoice {
  id: string;
  name: string;
  recipientType: string;
  recipientId: string | null;
  recipientName: string;
  recipientAddress: string | null;
  invoiceType: string;
  positions: Position[];
  frequency: string;
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  nextRunAt: string;
  lastRunAt: string | null;
  enabled: boolean;
  notes: string | null;
  totalNet: number;
  totalGenerated: number;
  lastInvoiceId: string | null;
  fundId: string | null;
  parkId: string | null;
  createdBy: {
    id: string;
    firstName: string | null;
    lastName: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

interface RecurringInvoicesResponse {
  data: RecurringInvoice[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================================================
// Constants
// ============================================================================

const FREQUENCY_LABELS: Record<string, string> = {
  MONTHLY: "Monatlich",
  QUARTERLY: "Quartalweise",
  SEMI_ANNUAL: "Halbjährlich",
  ANNUAL: "Jährlich",
};

const RECIPIENT_TYPE_LABELS: Record<string, string> = {
  shareholder: "Gesellschafter",
  lessor: "Verpachter",
  fund: "Gesellschaft",
  custom: "Benutzerdefiniert",
};

const TAX_TYPE_LABELS: Record<string, string> = {
  STANDARD: "19% MwSt",
  REDUCED: "7% MwSt",
  EXEMPT: "Steuerfrei",
};

// ============================================================================
// Empty Position Template
// ============================================================================

function createEmptyPosition(): Position {
  return {
    description: "",
    quantity: 1,
    unitPrice: 0,
    taxType: "STANDARD",
    unit: "pauschal",
  };
}

// ============================================================================
// Create/Edit Dialog
// ============================================================================

interface RecurringInvoiceFormData {
  name: string;
  recipientType: string;
  recipientId: string;
  recipientName: string;
  recipientAddress: string;
  invoiceType: string;
  positions: Position[];
  frequency: string;
  dayOfMonth: string;
  startDate: string;
  endDate: string;
  notes: string;
  enabled: boolean;
}

function getDefaultFormData(): RecurringInvoiceFormData {
  return {
    name: "",
    recipientType: "custom",
    recipientId: "",
    recipientName: "",
    recipientAddress: "",
    invoiceType: "INVOICE",
    positions: [createEmptyPosition()],
    frequency: "MONTHLY",
    dayOfMonth: "1",
    startDate: format(new Date(), "yyyy-MM-dd"),
    endDate: "",
    notes: "",
    enabled: true,
  };
}

function formDataFromExisting(ri: RecurringInvoice): RecurringInvoiceFormData {
  return {
    name: ri.name,
    recipientType: ri.recipientType,
    recipientId: ri.recipientId || "",
    recipientName: ri.recipientName,
    recipientAddress: ri.recipientAddress || "",
    invoiceType: ri.invoiceType,
    positions:
      ri.positions.length > 0
        ? ri.positions
        : [createEmptyPosition()],
    frequency: ri.frequency,
    dayOfMonth: ri.dayOfMonth?.toString() || "1",
    startDate: ri.startDate.split("T")[0],
    endDate: ri.endDate ? ri.endDate.split("T")[0] : "",
    notes: ri.notes || "",
    enabled: ri.enabled,
  };
}

interface CreateEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingInvoice: RecurringInvoice | null;
  onSaved: () => void;
}

function CreateEditDialog({
  open,
  onOpenChange,
  editingInvoice,
  onSaved,
}: CreateEditDialogProps) {
  const [formData, setFormData] = useState<RecurringInvoiceFormData>(
    getDefaultFormData()
  );
  const [saving, setSaving] = useState(false);

  // Reset form when dialog opens
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (isOpen) {
        setFormData(
          editingInvoice
            ? formDataFromExisting(editingInvoice)
            : getDefaultFormData()
        );
      }
      onOpenChange(isOpen);
    },
    [editingInvoice, onOpenChange]
  );

  function updateField<K extends keyof RecurringInvoiceFormData>(
    field: K,
    value: RecurringInvoiceFormData[K]
  ) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  function addPosition() {
    setFormData((prev) => ({
      ...prev,
      positions: [...prev.positions, createEmptyPosition()],
    }));
  }

  function removePosition(index: number) {
    setFormData((prev) => ({
      ...prev,
      positions: prev.positions.filter((_, i) => i !== index),
    }));
  }

  function updatePosition(index: number, field: keyof Position, value: string | number) {
    setFormData((prev) => {
      const newPositions = [...prev.positions];
      newPositions[index] = { ...newPositions[index], [field]: value };
      return { ...prev, positions: newPositions };
    });
  }

  async function handleSubmit() {
    // Basic client-side validation
    if (!formData.name.trim()) {
      toast.error("Name ist erforderlich");
      return;
    }
    if (!formData.recipientName.trim()) {
      toast.error("Empfängername ist erforderlich");
      return;
    }
    if (formData.positions.length === 0) {
      toast.error("Mindestens eine Position ist erforderlich");
      return;
    }
    if (formData.positions.some((p) => !p.description.trim())) {
      toast.error("Alle Positionen muessen eine Beschreibung haben");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formData.name,
        recipientType: formData.recipientType,
        recipientId: formData.recipientId || null,
        recipientName: formData.recipientName,
        recipientAddress: formData.recipientAddress || null,
        invoiceType: formData.invoiceType,
        positions: formData.positions.map((p) => ({
          description: p.description,
          quantity: Number(p.quantity),
          unitPrice: Number(p.unitPrice),
          taxType: p.taxType,
          unit: p.unit || "pauschal",
        })),
        frequency: formData.frequency,
        dayOfMonth: formData.dayOfMonth ? parseInt(formData.dayOfMonth, 10) : null,
        startDate: formData.startDate,
        endDate: formData.endDate || null,
        notes: formData.notes || null,
        enabled: formData.enabled,
      };

      const url = editingInvoice
        ? `/api/admin/recurring-invoices/${editingInvoice.id}`
        : "/api/admin/recurring-invoices";
      const method = editingInvoice ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response
          .json()
          .catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(err.error || "Fehler beim Speichern");
      }

      toast.success(
        editingInvoice
          ? "Wiederkehrende Rechnung aktualisiert"
          : "Wiederkehrende Rechnung erstellt"
      );
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Speichern"
      );
    } finally {
      setSaving(false);
    }
  }

  // Calculate preview total
  const previewTotal = formData.positions.reduce(
    (sum, p) => sum + Number(p.quantity || 0) * Number(p.unitPrice || 0),
    0
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingInvoice
              ? "Wiederkehrende Rechnung bearbeiten"
              : "Neue wiederkehrende Rechnung"}
          </DialogTitle>
          <DialogDescription>
            {editingInvoice
              ? "Aendern Sie die Einstellungen der wiederkehrenden Rechnung."
              : "Erstellen Sie eine Rechnung, die automatisch nach Zeitplan generiert wird."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="ri-name">Name *</Label>
            <Input
              id="ri-name"
              placeholder="z.B. Monatliche Verwaltungsgebühr"
              value={formData.name}
              onChange={(e) => updateField("name", e.target.value)}
            />
          </div>

          {/* Recipient */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Empfängertyp</Label>
              <Select
                value={formData.recipientType}
                onValueChange={(v) => updateField("recipientType", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shareholder">Gesellschafter</SelectItem>
                  <SelectItem value="lessor">Verpachter</SelectItem>
                  <SelectItem value="fund">Gesellschaft</SelectItem>
                  <SelectItem value="custom">Benutzerdefiniert</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Rechnungstyp</Label>
              <Select
                value={formData.invoiceType}
                onValueChange={(v) => updateField("invoiceType", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INVOICE">Rechnung</SelectItem>
                  <SelectItem value="CREDIT_NOTE">Gutschrift</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ri-recipient-name">Empfänger *</Label>
              <Input
                id="ri-recipient-name"
                placeholder="Name des Empfängers"
                value={formData.recipientName}
                onChange={(e) => updateField("recipientName", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ri-recipient-address">Adresse</Label>
              <Input
                id="ri-recipient-address"
                placeholder="Strasse, PLZ Ort"
                value={formData.recipientAddress}
                onChange={(e) => updateField("recipientAddress", e.target.value)}
              />
            </div>
          </div>

          {/* Positions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Positionen *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addPosition}
              >
                <Plus className="mr-1 h-3 w-3" />
                Position
              </Button>
            </div>

            <div className="space-y-3">
              {formData.positions.map((pos, index) => (
                <div
                  key={index}
                  className="grid grid-cols-12 gap-2 items-end rounded-md border p-3"
                >
                  <div className="col-span-4 space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Beschreibung
                    </Label>
                    <Input
                      value={pos.description}
                      onChange={(e) =>
                        updatePosition(index, "description", e.target.value)
                      }
                      placeholder="Beschreibung"
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Menge
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={pos.quantity}
                      onChange={(e) =>
                        updatePosition(index, "quantity", parseFloat(e.target.value) || 0)
                      }
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Einzelpreis
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={pos.unitPrice}
                      onChange={(e) =>
                        updatePosition(index, "unitPrice", parseFloat(e.target.value) || 0)
                      }
                    />
                  </div>
                  <div className="col-span-3 space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      MwSt
                    </Label>
                    <Select
                      value={pos.taxType}
                      onValueChange={(v) =>
                        updatePosition(index, "taxType", v)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="STANDARD">19%</SelectItem>
                        <SelectItem value="REDUCED">7%</SelectItem>
                        <SelectItem value="EXEMPT">0%</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {formData.positions.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => removePosition(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Total preview */}
            <div className="text-right text-sm text-muted-foreground">
              Netto-Summe: <span className="font-medium text-foreground">{formatCurrency(previewTotal)}</span>
            </div>
          </div>

          {/* Schedule */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Frequenz</Label>
              <Select
                value={formData.frequency}
                onValueChange={(v) => updateField("frequency", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MONTHLY">Monatlich</SelectItem>
                  <SelectItem value="QUARTERLY">Quartalweise</SelectItem>
                  <SelectItem value="SEMI_ANNUAL">Halbjährlich</SelectItem>
                  <SelectItem value="ANNUAL">Jährlich</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ri-day">Tag im Monat</Label>
              <Input
                id="ri-day"
                type="number"
                min="1"
                max="28"
                value={formData.dayOfMonth}
                onChange={(e) => updateField("dayOfMonth", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ri-start">Startdatum *</Label>
              <Input
                id="ri-start"
                type="date"
                value={formData.startDate}
                onChange={(e) => updateField("startDate", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ri-end">Enddatum (optional)</Label>
              <Input
                id="ri-end"
                type="date"
                value={formData.endDate}
                onChange={(e) => updateField("endDate", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Leer lassen für unbefristete Laufzeit
              </p>
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch
                checked={formData.enabled}
                onCheckedChange={(checked) =>
                  updateField("enabled", checked)
                }
              />
              <Label>Aktiv</Label>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="ri-notes">Notizen</Label>
            <Textarea
              id="ri-notes"
              placeholder="Optionale Notizen..."
              value={formData.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editingInvoice ? "Speichern" : "Erstellen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function RecurringInvoicesManager() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<RecurringInvoice | null>(
    null
  );
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const invalidate = useInvalidateQuery();

  const {
    data: response,
    isLoading: loading,
    error,
    refetch,
  } = useApiQuery<RecurringInvoicesResponse>(
    ["recurring-invoices"],
    "/api/admin/recurring-invoices?limit=100"
  );

  const recurringInvoices = response?.data ?? [];

  function handleCreate() {
    setEditingInvoice(null);
    setDialogOpen(true);
  }

  function handleEdit(ri: RecurringInvoice) {
    setEditingInvoice(ri);
    setDialogOpen(true);
  }

  function handleSaved() {
    invalidate(["recurring-invoices"]);
  }

  async function handleToggleEnabled(ri: RecurringInvoice) {
    try {
      const response = await fetch(
        `/api/admin/recurring-invoices/${ri.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: !ri.enabled }),
        }
      );

      if (!response.ok) {
        throw new Error("Fehler beim Aktualisieren");
      }

      toast.success(
        ri.enabled
          ? `"${ri.name}" pausiert`
          : `"${ri.name}" aktiviert`
      );
      invalidate(["recurring-invoices"]);
    } catch (error) {
      toast.error("Fehler beim Aktualisieren des Status");
    }
  }

  async function handleDelete() {
    if (!deleteId) return;

    try {
      const response = await fetch(
        `/api/admin/recurring-invoices/${deleteId}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        throw new Error("Fehler beim Löschen");
      }

      toast.success("Wiederkehrende Rechnung deaktiviert");
      setDeleteId(null);
      invalidate(["recurring-invoices"]);
    } catch (error) {
      toast.error("Fehler beim Löschen der wiederkehrenden Rechnung");
    }
  }

  // Stats
  const activeCount = recurringInvoices.filter((ri) => ri.enabled).length;
  const totalGenerated = recurringInvoices.reduce(
    (sum, ri) => sum + ri.totalGenerated,
    0
  );

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <p className="text-destructive">
              Fehler beim Laden der wiederkehrenden Rechnungen
            </p>
            <Button
              onClick={() => refetch()}
              variant="outline"
              className="mt-4"
            >
              Erneut versuchen
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5" />
                Wiederkehrende Rechnungen
              </CardTitle>
              <CardDescription>
                {activeCount} aktiv, {totalGenerated} insgesamt generiert
              </CardDescription>
            </div>
            <Button onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Neue wiederkehrende Rechnung
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Empfänger</TableHead>
                  <TableHead className="text-right">Betrag (Netto)</TableHead>
                  <TableHead>Frequenz</TableHead>
                  <TableHead>Nächste Ausführung</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Generiert</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-5 w-20" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : recurringInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="h-32 text-center text-muted-foreground"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <RefreshCw className="h-8 w-8 text-muted-foreground/50" />
                        <p>Keine wiederkehrenden Rechnungen vorhanden</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCreate}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Erste wiederkehrende Rechnung erstellen
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  recurringInvoices.map((ri) => (
                    <TableRow key={ri.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{ri.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {ri.invoiceType === "CREDIT_NOTE"
                              ? "Gutschrift"
                              : "Rechnung"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div>{ri.recipientName}</div>
                          <div className="text-xs text-muted-foreground">
                            {RECIPIENT_TYPE_LABELS[ri.recipientType] ||
                              ri.recipientType}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(ri.totalNet)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {FREQUENCY_LABELS[ri.frequency] || ri.frequency}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {ri.enabled ? (
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>
                              {format(
                                new Date(ri.nextRunAt),
                                "dd.MM.yyyy",
                                { locale: de }
                              )}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={ri.enabled}
                            onCheckedChange={() => handleToggleEnabled(ri)}
                            aria-label={
                              ri.enabled ? "Deaktivieren" : "Aktivieren"
                            }
                          />
                          <span className="text-xs">
                            {ri.enabled ? (
                              <Badge
                                variant="secondary"
                                className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                              >
                                Aktiv
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Pausiert</Badge>
                            )}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {ri.totalGenerated}x
                        </span>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => handleEdit(ri)}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Bearbeiten
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeleteId(ri.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Deaktivieren
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Last run info */}
          {recurringInvoices.some((ri) => ri.lastRunAt) && (
            <div className="mt-3 text-xs text-muted-foreground">
              Letzte Ausführung:{" "}
              {(() => {
                const lastRun = recurringInvoices
                  .filter((ri) => ri.lastRunAt)
                  .sort(
                    (a, b) =>
                      new Date(b.lastRunAt!).getTime() -
                      new Date(a.lastRunAt!).getTime()
                  )[0];
                return lastRun
                  ? format(
                      new Date(lastRun.lastRunAt!),
                      "dd.MM.yyyy HH:mm",
                      { locale: de }
                    )
                  : "-";
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <CreateEditDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingInvoice={editingInvoice}
        onSaved={handleSaved}
      />

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
        onConfirm={handleDelete}
        title="Wiederkehrende Rechnung deaktivieren"
        description="Die wiederkehrende Rechnung wird deaktiviert. Bereits generierte Rechnungen bleiben erhalten."
      />
    </>
  );
}
