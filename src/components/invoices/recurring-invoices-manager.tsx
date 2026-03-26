"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/format";
import { useApiQuery, useInvalidateQuery } from "@/hooks/useApiQuery";
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
  const t = useTranslations("recurringInvoices");
  const tc = useTranslations("common");
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
      toast.error(t("validation.nameRequired"));
      return;
    }
    if (!formData.recipientName.trim()) {
      toast.error(t("validation.recipientRequired"));
      return;
    }
    if (formData.positions.length === 0) {
      toast.error(t("validation.positionRequired"));
      return;
    }
    if (formData.positions.some((p) => !p.description.trim())) {
      toast.error(t("validation.descriptionRequired"));
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
          .catch(() => ({ error: t("toast.unknownError") }));
        throw new Error(err.error || t("toast.saveError"));
      }

      toast.success(
        editingInvoice
          ? t("toast.updated")
          : t("toast.created")
      );
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("toast.saveError")
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
              ? t("editTitle")
              : t("createTitle")}
          </DialogTitle>
          <DialogDescription>
            {editingInvoice
              ? t("editDescription")
              : t("createDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="ri-name">{t("nameLabel")}</Label>
            <Input
              id="ri-name"
              placeholder={t("namePlaceholder")}
              value={formData.name}
              onChange={(e) => updateField("name", e.target.value)}
            />
          </div>

          {/* Recipient */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("recipientTypeLabel")}</Label>
              <Select
                value={formData.recipientType}
                onValueChange={(v) => updateField("recipientType", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shareholder">{t("recipientType.shareholder")}</SelectItem>
                  <SelectItem value="lessor">{t("recipientType.lessor")}</SelectItem>
                  <SelectItem value="fund">{t("recipientType.fund")}</SelectItem>
                  <SelectItem value="custom">{t("recipientType.custom")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("invoiceTypeLabel")}</Label>
              <Select
                value={formData.invoiceType}
                onValueChange={(v) => updateField("invoiceType", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INVOICE">{t("invoiceType.INVOICE")}</SelectItem>
                  <SelectItem value="CREDIT_NOTE">{t("invoiceType.CREDIT_NOTE")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ri-recipient-name">{t("recipientLabel")}</Label>
              <Input
                id="ri-recipient-name"
                placeholder={t("recipientNamePlaceholder")}
                value={formData.recipientName}
                onChange={(e) => updateField("recipientName", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ri-recipient-address">{t("addressLabel")}</Label>
              <Input
                id="ri-recipient-address"
                placeholder={t("addressPlaceholder")}
                value={formData.recipientAddress}
                onChange={(e) => updateField("recipientAddress", e.target.value)}
              />
            </div>
          </div>

          {/* Positions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("positionsLabel")}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addPosition}
              >
                <Plus className="mr-1 h-3 w-3" />
                {t("addPosition")}
              </Button>
            </div>

            <div className="space-y-3">
              {formData.positions.map((pos, index) => (
                <div
                  key={`position-${index}-${pos.description}`}
                  className="grid grid-cols-12 gap-2 items-end rounded-md border p-3"
                >
                  <div className="col-span-4 space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {t("descriptionLabel")}
                    </Label>
                    <Input
                      value={pos.description}
                      onChange={(e) =>
                        updatePosition(index, "description", e.target.value)
                      }
                      placeholder={t("descriptionLabel")}
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {t("quantityLabel")}
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
                      {t("unitPriceLabel")}
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
                      {t("vatLabel")}
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
              {t("netTotal")}: <span className="font-medium text-foreground">{formatCurrency(previewTotal)}</span>
            </div>
          </div>

          {/* Schedule */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>{t("frequencyLabel")}</Label>
              <Select
                value={formData.frequency}
                onValueChange={(v) => updateField("frequency", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MONTHLY">{t("frequency.MONTHLY")}</SelectItem>
                  <SelectItem value="QUARTERLY">{t("frequency.QUARTERLY")}</SelectItem>
                  <SelectItem value="SEMI_ANNUAL">{t("frequency.SEMI_ANNUAL")}</SelectItem>
                  <SelectItem value="ANNUAL">{t("frequency.ANNUAL")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ri-day">{t("dayOfMonthLabel")}</Label>
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
              <Label htmlFor="ri-start">{t("startDateLabel")}</Label>
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
              <Label htmlFor="ri-end">{t("endDateLabel")}</Label>
              <Input
                id="ri-end"
                type="date"
                value={formData.endDate}
                onChange={(e) => updateField("endDate", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("endDateHint")}
              </p>
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch
                checked={formData.enabled}
                onCheckedChange={(checked) =>
                  updateField("enabled", checked)
                }
              />
              <Label>{t("activeLabel")}</Label>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="ri-notes">{t("notesLabel")}</Label>
            <Textarea
              id="ri-notes"
              placeholder={t("notesPlaceholder")}
              value={formData.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editingInvoice ? t("save") : t("createAction")}
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
  const t = useTranslations("recurringInvoices");
  const tc = useTranslations("common");
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
        throw new Error(t("toast.toggleError"));
      }

      toast.success(
        ri.enabled
          ? t("toast.paused", { name: ri.name })
          : t("toast.activated", { name: ri.name })
      );
      invalidate(["recurring-invoices"]);
    } catch (error) {
      toast.error(t("toast.toggleError"));
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
        throw new Error(t("toast.deleteError"));
      }

      toast.success(t("toast.deactivated"));
      setDeleteId(null);
      invalidate(["recurring-invoices"]);
    } catch (error) {
      toast.error(t("toast.deleteError"));
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
              {t("loadError")}
            </p>
            <Button
              onClick={() => refetch()}
              variant="outline"
              className="mt-4"
            >
              {t("retry")}
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
                {t("title")}
              </CardTitle>
              <CardDescription>
                {t("description", { activeCount, totalGenerated })}
              </CardDescription>
            </div>
            <Button onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              {t("create")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("tableHeader.name")}</TableHead>
                  <TableHead>{t("tableHeader.recipient")}</TableHead>
                  <TableHead className="text-right">{t("tableHeader.amountNet")}</TableHead>
                  <TableHead>{t("tableHeader.frequency")}</TableHead>
                  <TableHead>{t("tableHeader.nextRun")}</TableHead>
                  <TableHead>{t("tableHeader.status")}</TableHead>
                  <TableHead>{t("tableHeader.generated")}</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={`skeleton-${i}`}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={`skeleton-cell-${i}-${j}`}>
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
                        <p>{t("emptyState")}</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCreate}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          {t("emptyStateAction")}
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
                              ? t("invoiceType.CREDIT_NOTE")
                              : t("invoiceType.INVOICE")}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div>{ri.recipientName}</div>
                          <div className="text-xs text-muted-foreground">
                            {t(`recipientType.${ri.recipientType}` as Parameters<typeof t>[0])}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(ri.totalNet)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {t(`frequency.${ri.frequency}` as Parameters<typeof t>[0])}
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
                              ri.enabled ? t("deactivate") : t("activeLabel")
                            }
                          />
                          <span className="text-xs">
                            {ri.enabled ? (
                              <Badge
                                variant="secondary"
                                className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                              >
                                {t("statusActive")}
                              </Badge>
                            ) : (
                              <Badge variant="secondary">{t("statusPaused")}</Badge>
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
                              {tc("edit")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeleteId(ri.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {t("deactivate")}
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
              {t("lastRun")}:{" "}
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
        title={t("deleteTitle")}
        description={t("deleteDescription")}
      />
    </>
  );
}
