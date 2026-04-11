"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Save,
  HelpCircle,
  AlertTriangle,
  Search,
  Percent,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { RecipientSearchDialog, type RecipientSelection, PositionTemplateDialog, type PositionTemplateSelection } from "@/components/invoices";
import { calculateSkontoDiscount, calculateSkontoDeadline } from "@/lib/invoices/skonto";

interface InvoiceItem {
  id: string;
  isNew?: boolean; // Marker für neue Items
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxType: "STANDARD" | "REDUCED" | "EXEMPT";
}

interface Invoice {
  id: string;
  invoiceType: "INVOICE" | "CREDIT_NOTE";
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  recipientType: string | null;
  recipientName: string | null;
  recipientAddress: string | null;
  serviceStartDate: string | null;
  serviceEndDate: string | null;
  paymentReference: string | null;
  internalReference: string | null;
  notes: string | null;
  status: "DRAFT" | "SENT" | "PAID" | "CANCELLED";
  parkId: string | null;
  fundId: string | null;
  // Skonto fields
  skontoPercent: number | null;
  skontoDays: number | null;
  skontoDeadline: string | null;
  skontoAmount: number | null;
  skontoPaid: boolean;
  items: Array<{
    id: string;
    position: number;
    description: string;
    quantity: number;
    unit: string | null;
    unitPrice: number;
    taxType: string;
  }>;
}

const TAX_RATES = {
  STANDARD: 19,
  REDUCED: 7,
  EXEMPT: 0,
};

function calculateItemAmounts(item: InvoiceItem) {
  const netAmount = item.quantity * item.unitPrice;
  const taxRate = TAX_RATES[item.taxType];
  const taxAmount = netAmount * (taxRate / 100);
  const grossAmount = netAmount + taxAmount;
  return { netAmount, taxAmount, grossAmount, taxRate };
}

function formatDateForInput(dateString: string | null): string {
  if (!dateString) return "";
  try {
    return format(new Date(dateString), "yyyy-MM-dd");
  } catch {
    return "";
  }
}

export default function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const t = useTranslations("invoices.edit");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invoice, setInvoice] = useState<Invoice | null>(null);

  const [formData, setFormData] = useState({
    invoiceDate: "",
    dueDate: "",
    recipientType: "PERSON",
    recipientName: "",
    recipientAddress: "",
    serviceStartDate: "",
    serviceEndDate: "",
    paymentReference: "",
    internalReference: "",
    notes: "",
    parkId: "",
    fundId: "",
  });

  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [deletedItemIds, setDeletedItemIds] = useState<string[]>([]);

  // Skonto state
  const [skontoEnabled, setSkontoEnabled] = useState(false);
  const [skontoPercent, setSkontoPercent] = useState(2);
  const [skontoDays, setSkontoDays] = useState(7);

  const [parks, setParks] = useState<Array<{ id: string; name: string }>>([]);
  const [funds, setFunds] = useState<Array<{ id: string; name: string }>>([]);
  const [recipientDialogOpen, setRecipientDialogOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateTargetItemId, setTemplateTargetItemId] = useState<string | null>(null);

  // Lade Invoice Daten
  useEffect(() => {
    async function fetchInvoice() {
      try {
        const response = await fetch(`/api/invoices/${id}`);
        if (!response.ok) {
          if (response.status === 404) {
            toast.error(t("loadErrorNotFound"));
            router.push("/invoices");
            return;
          }
          throw new Error(t("errorLoad"));
        }

        const data: Invoice = await response.json();

        // Nur DRAFT-Rechnungen können bearbeitet werden
        if (data.status !== "DRAFT") {
          toast.error(t("loadErrorOnlyDraft"));
          router.push(`/invoices/${id}`);
          return;
        }

        setInvoice(data);

        // Formular mit Daten befuellen
        setFormData({
          invoiceDate: formatDateForInput(data.invoiceDate),
          dueDate: formatDateForInput(data.dueDate),
          recipientType: data.recipientType || "PERSON",
          recipientName: data.recipientName || "",
          recipientAddress: data.recipientAddress || "",
          serviceStartDate: formatDateForInput(data.serviceStartDate),
          serviceEndDate: formatDateForInput(data.serviceEndDate),
          paymentReference: data.paymentReference || "",
          internalReference: data.internalReference || "",
          notes: data.notes || "",
          parkId: data.parkId || "",
          fundId: data.fundId || "",
        });

        // Skonto befuellen
        if (data.skontoPercent && data.skontoDays) {
          setSkontoEnabled(true);
          setSkontoPercent(Number(data.skontoPercent));
          setSkontoDays(data.skontoDays);
        }

        // Items befuellen
        setItems(
          data.items.map((item) => ({
            id: item.id,
            description: item.description,
            quantity: Number(item.quantity),
            unit: item.unit || "Stueck",
            unitPrice: Number(item.unitPrice),
            taxType: item.taxType as "STANDARD" | "REDUCED" | "EXEMPT",
          }))
        );
      } catch {
        toast.error(t("errorLoad"));
      } finally {
        setLoading(false);
      }
    }

    fetchInvoice();
  }, [id, router, t]);

  // Lade Parks und Gesellschaften
  useEffect(() => {
    fetch("/api/parks?limit=100")
      .then((res) => res.ok ? res.json() : Promise.reject())
      .then((data) => setParks(data.data || []))
      .catch(() => { /* silently ignore */ });

    fetch("/api/funds?limit=100")
      .then((res) => res.ok ? res.json() : Promise.reject())
      .then((data) => setFunds(data.data || []))
      .catch(() => { /* silently ignore */ });
  }, []);

  function handleAddItem() {
    setItems([
      ...items,
      {
        id: Math.random().toString(36).slice(2),
        isNew: true,
        description: "",
        quantity: 1,
        unit: "Stueck",
        unitPrice: 0,
        taxType: "EXEMPT",
      },
    ]);
  }

  function handleRemoveItem(itemId: string) {
    if (items.length === 1) {
      toast.error(t("validationItemMin"));
      return;
    }

    const item = items.find((i) => i.id === itemId);
    if (item && !item.isNew) {
      // Bestehende Items merken zum Löschen
      setDeletedItemIds([...deletedItemIds, itemId]);
    }

    setItems(items.filter((i) => i.id !== itemId));
  }

  function handleItemChange(itemId: string, field: keyof InvoiceItem, value: string | number) {
    setItems(
      items.map((item) =>
        item.id === itemId ? { ...item, [field]: value } : item
      )
    );
  }

  function handleTemplateSelect(selection: PositionTemplateSelection) {
    if (!templateTargetItemId) return;
    setItems(
      items.map((item) =>
        item.id === templateTargetItemId
          ? {
              ...item,
              description: selection.description,
              unit: selection.unit,
              taxType: selection.taxType,
              unitPrice: selection.unitPrice ?? item.unitPrice,
            }
          : item
      )
    );
  }

  function handleRecipientSelect(recipient: RecipientSelection) {
    setFormData({
      ...formData,
      recipientType: recipient.recipientType,
      recipientName: recipient.recipientName,
      recipientAddress: recipient.recipientAddress,
    });
  }

  // Berechne Summen
  const totals = items.reduce(
    (acc, item) => {
      const { netAmount, taxAmount, grossAmount } = calculateItemAmounts(item);
      return {
        netAmount: acc.netAmount + netAmount,
        taxAmount: acc.taxAmount + taxAmount,
        grossAmount: acc.grossAmount + grossAmount,
      };
    },
    { netAmount: 0, taxAmount: 0, grossAmount: 0 }
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.recipientName.trim()) {
      toast.error(t("validationRecipient"));
      return;
    }

    if (items.some((item) => !item.description.trim())) {
      toast.error(t("validationItemDescription"));
      return;
    }

    if (items.some((item) => item.unitPrice <= 0)) {
      toast.error(t("validationItemPrice"));
      return;
    }

    try {
      setSaving(true);

      // 1. Gelöschte Items entfernen
      for (const itemId of deletedItemIds) {
        await fetch(`/api/invoices/${id}/items/${itemId}`, {
          method: "DELETE",
        });
      }

      // 2. Invoice-Metadaten aktualisieren
      const avgTaxRate =
        totals.netAmount > 0 ? (totals.taxAmount / totals.netAmount) * 100 : 0;

      const invoicePayload = {
        invoiceDate: new Date(formData.invoiceDate).toISOString(),
        dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : null,
        recipientType: formData.recipientType,
        recipientName: formData.recipientName,
        recipientAddress: formData.recipientAddress || null,
        serviceStartDate: formData.serviceStartDate
          ? new Date(formData.serviceStartDate).toISOString()
          : null,
        serviceEndDate: formData.serviceEndDate
          ? new Date(formData.serviceEndDate).toISOString()
          : null,
        paymentReference: formData.paymentReference || null,
        internalReference: formData.internalReference || null,
        notes: formData.notes || null,
        parkId: formData.parkId || null,
        fundId: formData.fundId || null,
        // Skonto fields
        skontoPercent: skontoEnabled && skontoPercent > 0 ? skontoPercent : null,
        skontoDays: skontoEnabled && skontoDays > 0 ? skontoDays : null,
        netAmount: totals.netAmount,
        taxRate: avgTaxRate,
        taxAmount: totals.taxAmount,
        grossAmount: totals.grossAmount,
      };

      const invoiceResponse = await fetch(`/api/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invoicePayload),
      });

      if (!invoiceResponse.ok) {
        const error = await invoiceResponse.json();
        throw new Error(error.error || t("errorSave"));
      }

      // 3. Items aktualisieren/erstellen
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const { netAmount, taxAmount, grossAmount, taxRate } = calculateItemAmounts(item);

        const itemPayload = {
          position: i + 1,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          netAmount,
          taxType: item.taxType,
          taxRate,
          taxAmount,
          grossAmount,
        };

        if (item.isNew) {
          // Neues Item erstellen
          await fetch(`/api/invoices/${id}/items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(itemPayload),
          });
        } else {
          // Bestehendes Item aktualisieren
          await fetch(`/api/invoices/${id}/items/${item.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(itemPayload),
          });
        }
      }

      toast.success(t("successSaved"));
      router.push(`/invoices/${id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("errorSave"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32 mt-2" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-48" />
            <Skeleton className="h-64" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t("loadErrorNotFound")}</p>
      </div>
    );
  }

  const typeLabel =
    invoice.invoiceType === "INVOICE" ? t("typeInvoice") : t("typeCreditNote");
  const subtitleLabel =
    invoice.invoiceType === "INVOICE"
      ? t("headerSubtitleInvoice")
      : t("headerSubtitleCreditNote");

  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild type="button">
            <Link href={`/invoices/${id}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{invoice.invoiceNumber}</h1>
              <Badge variant="outline">{typeLabel}</Badge>
              <Badge variant="secondary">{t("statusDraft")}</Badge>
            </div>
            <p className="text-muted-foreground">{subtitleLabel}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            {t("cancelButton")}
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {t("saveButton")}
          </Button>
        </div>
      </div>

      {/* Hinweis */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>{t("headerEditDraft")}</AlertTitle>
        <AlertDescription>
          {t("headerEditNote", { number: invoice.invoiceNumber })}
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Linke Spalte */}
        <div className="space-y-6 lg:col-span-2">
          {/* Empfänger */}
          <Card>
            <CardHeader>
              <CardTitle>{t("cardRecipientTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="recipientType">{t("fieldRecipientType")}</Label>
                  <Select
                    value={formData.recipientType}
                    onValueChange={(value) =>
                      setFormData({ ...formData, recipientType: value })
                    }
                  >
                    <SelectTrigger id="recipientType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERSON">{t("recipientTypePerson")}</SelectItem>
                      <SelectItem value="COMPANY">{t("recipientTypeCompany")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recipientName">{t("fieldRecipientName")}</Label>
                  <div className="relative">
                    <Input
                      id="recipientName"
                      value={formData.recipientName}
                      onChange={(e) =>
                        setFormData({ ...formData, recipientName: e.target.value })
                      }
                      placeholder={t("placeholderRecipientName")}
                      required
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full w-10"
                      onClick={() => setRecipientDialogOpen(true)}
                      title={t("tooltipFindContact")}
                    >
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="recipientAddress">{t("fieldRecipientAddress")}</Label>
                <Textarea
                  id="recipientAddress"
                  value={formData.recipientAddress}
                  onChange={(e) =>
                    setFormData({ ...formData, recipientAddress: e.target.value })
                  }
                  placeholder={t("placeholderRecipientAddress")}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Positionen */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{t("cardItemsTitle")}</CardTitle>
                  <CardDescription>
                    {t("cardItemsDescription", { count: items.length })}
                  </CardDescription>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("addPositionButton")}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[300px]">{t("tableDescription")}</TableHead>
                    <TableHead className="w-20">{t("tableQuantity")}</TableHead>
                    <TableHead className="w-24">{t("tableUnit")}</TableHead>
                    <TableHead className="w-32">{t("tableUnitPrice")}</TableHead>
                    <TableHead className="w-32">
                      <div className="flex items-center gap-1">
                        {t("tableTax")}
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-3 w-3 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{t("tableTaxTooltip")}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </TableHead>
                    <TableHead className="text-right">{t("tableNet")}</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const { netAmount } = calculateItemAmounts(item);
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="relative">
                            <Input
                              value={item.description}
                              onChange={(e) =>
                                handleItemChange(item.id, "description", e.target.value)
                              }
                              placeholder={t("placeholderItemDescription")}
                              className="pr-10"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full w-10"
                              onClick={() => {
                                setTemplateTargetItemId(item.id);
                                setTemplateDialogOpen(true);
                              }}
                              title={t("tooltipPickTemplate")}
                            >
                              <Search className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={item.quantity}
                            onChange={(e) =>
                              handleItemChange(item.id, "quantity", parseFloat(e.target.value) || 0)
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={item.unit}
                            onValueChange={(value) => handleItemChange(item.id, "unit", value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Stueck">{t("unitPiece")}</SelectItem>
                              <SelectItem value="Stunden">{t("unitHours")}</SelectItem>
                              <SelectItem value="Tage">{t("unitDays")}</SelectItem>
                              <SelectItem value="pauschal">{t("unitFlat")}</SelectItem>
                              <SelectItem value="kWh">{t("unitKwh")}</SelectItem>
                              <SelectItem value="MWh">{t("unitMwh")}</SelectItem>
                              <SelectItem value="m2">{t("unitSqm")}</SelectItem>
                              <SelectItem value="ha">{t("unitHectare")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) =>
                              handleItemChange(item.id, "unitPrice", parseFloat(e.target.value) || 0)
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={item.taxType}
                            onValueChange={(value) =>
                              handleItemChange(item.id, "taxType", value as "STANDARD" | "REDUCED" | "EXEMPT")
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="EXEMPT">{t("taxExempt")}</SelectItem>
                              <SelectItem value="REDUCED">{t("taxReduced")}</SelectItem>
                              <SelectItem value="STANDARD">{t("taxStandard")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(netAmount)}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveItem(item.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={5} className="text-right">
                      {t("footerNet")}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(totals.netAmount)}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={5} className="text-right">
                      {t("footerTax")}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.taxAmount)}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={5} className="text-right font-bold">
                      {t("footerGross")}
                    </TableCell>
                    <TableCell className="text-right font-bold text-lg">
                      {formatCurrency(totals.grossAmount)}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>

          {/* Notizen */}
          <Card>
            <CardHeader>
              <CardTitle>{t("cardNotesTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder={t("placeholderNotes")}
                rows={3}
              />
            </CardContent>
          </Card>
        </div>

        {/* Rechte Spalte */}
        <div className="space-y-6">
          {/* Datum */}
          <Card>
            <CardHeader>
              <CardTitle>{t("cardDateTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invoiceDate">{t("fieldInvoiceDate")}</Label>
                <Input
                  id="invoiceDate"
                  type="date"
                  value={formData.invoiceDate}
                  onChange={(e) =>
                    setFormData({ ...formData, invoiceDate: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dueDate">{t("fieldDueDate")}</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) =>
                    setFormData({ ...formData, dueDate: e.target.value })
                  }
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="serviceStartDate">{t("fieldServiceStart")}</Label>
                <Input
                  id="serviceStartDate"
                  type="date"
                  value={formData.serviceStartDate}
                  onChange={(e) =>
                    setFormData({ ...formData, serviceStartDate: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="serviceEndDate">{t("fieldServiceEnd")}</Label>
                <Input
                  id="serviceEndDate"
                  type="date"
                  value={formData.serviceEndDate}
                  onChange={(e) =>
                    setFormData({ ...formData, serviceEndDate: e.target.value })
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* Skonto */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Percent className="h-4 w-4" />
                  {t("cardSkontoTitle")}
                </CardTitle>
                <Switch
                  checked={skontoEnabled}
                  onCheckedChange={setSkontoEnabled}
                  aria-label={t("skontoToggleAria")}
                />
              </div>
              <CardDescription>{t("cardSkontoDescription")}</CardDescription>
            </CardHeader>
            {skontoEnabled && (
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="skontoPercent">{t("fieldSkontoPercent")}</Label>
                  <Input
                    id="skontoPercent"
                    type="number"
                    min="0.01"
                    max="99.99"
                    step="0.01"
                    value={skontoPercent}
                    onChange={(e) => setSkontoPercent(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="skontoDays">{t("fieldSkontoDays")}</Label>
                  <Input
                    id="skontoDays"
                    type="number"
                    min="1"
                    max="365"
                    step="1"
                    value={skontoDays}
                    onChange={(e) => setSkontoDays(parseInt(e.target.value) || 0)}
                  />
                </div>
                {totals.grossAmount > 0 && skontoPercent > 0 && skontoDays > 0 && (
                  <div className="rounded-md bg-green-50 p-3 text-sm space-y-1">
                    <p className="font-medium text-green-800">
                      {t("skontoAmountLabel", {
                        value: formatCurrency(
                          calculateSkontoDiscount(totals.grossAmount, skontoPercent),
                        ),
                      })}
                    </p>
                    <p className="text-green-700">
                      {t("skontoDeadlineLabel", {
                        date: formData.invoiceDate
                          ? formatDate(
                              calculateSkontoDeadline(
                                new Date(formData.invoiceDate),
                                skontoDays,
                              ),
                            )
                          : "-",
                      })}
                    </p>
                    <p className="text-green-700">
                      {t("skontoNetPayLabel", {
                        value: formatCurrency(
                          totals.grossAmount -
                            calculateSkontoDiscount(totals.grossAmount, skontoPercent),
                        ),
                      })}
                    </p>
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          {/* Referenzen */}
          <Card>
            <CardHeader>
              <CardTitle>{t("cardReferencesTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="paymentReference">{t("fieldPaymentReference")}</Label>
                <Input
                  id="paymentReference"
                  value={formData.paymentReference}
                  onChange={(e) =>
                    setFormData({ ...formData, paymentReference: e.target.value })
                  }
                  placeholder={t("placeholderPaymentReference")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="internalReference">{t("fieldInternalReference")}</Label>
                <Input
                  id="internalReference"
                  value={formData.internalReference}
                  onChange={(e) =>
                    setFormData({ ...formData, internalReference: e.target.value })
                  }
                  placeholder={t("placeholderInternalReference")}
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="parkId">{t("fieldPark")}</Label>
                <Select
                  value={formData.parkId || "none"}
                  onValueChange={(value) =>
                    setFormData({ ...formData, parkId: value === "none" ? "" : value })
                  }
                >
                  <SelectTrigger id="parkId">
                    <SelectValue placeholder={t("selectNoneAssign")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("selectNone")}</SelectItem>
                    {parks.map((park) => (
                      <SelectItem key={park.id} value={park.id}>
                        {park.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fundId">{t("fieldFund")}</Label>
                <Select
                  value={formData.fundId || "none"}
                  onValueChange={(value) =>
                    setFormData({ ...formData, fundId: value === "none" ? "" : value })
                  }
                >
                  <SelectTrigger id="fundId">
                    <SelectValue placeholder={t("selectNoneAssign")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("selectNone")}</SelectItem>
                    {funds.map((fund) => (
                      <SelectItem key={fund.id} value={fund.id}>
                        {fund.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>

      <RecipientSearchDialog
        open={recipientDialogOpen}
        onOpenChange={setRecipientDialogOpen}
        onSelect={handleRecipientSelect}
      />
      <PositionTemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        onSelect={handleTemplateSelect}
      />
    </>
  );
}
