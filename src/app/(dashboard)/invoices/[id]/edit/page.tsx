"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/format";
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
  isNew?: boolean; // Marker fuer neue Items
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
            toast.error("Rechnung nicht gefunden");
            router.push("/invoices");
            return;
          }
          throw new Error("Fehler beim Laden");
        }

        const data: Invoice = await response.json();

        // Nur DRAFT-Rechnungen koennen bearbeitet werden
        if (data.status !== "DRAFT") {
          toast.error("Nur Entwuerfe koennen bearbeitet werden");
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
      } catch (error) {
        toast.error("Fehler beim Laden der Rechnung");
      } finally {
        setLoading(false);
      }
    }

    fetchInvoice();
  }, [id, router]);

  // Lade Parks und Gesellschaften
  useEffect(() => {
    fetch("/api/parks?limit=100")
      .then((res) => res.json())
      .then((data) => setParks(data.data || []))
      .catch(() => { /* silently ignore */ });

    fetch("/api/funds?limit=100")
      .then((res) => res.json())
      .then((data) => setFunds(data.data || []))
      .catch(() => { /* silently ignore */ });
  }, []);

  function handleAddItem() {
    setItems([
      ...items,
      {
        id: crypto.randomUUID(),
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
      toast.error("Mindestens eine Position erforderlich");
      return;
    }

    const item = items.find((i) => i.id === itemId);
    if (item && !item.isNew) {
      // Bestehende Items merken zum Loeschen
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
      toast.error("Empfaengername erforderlich");
      return;
    }

    if (items.some((item) => !item.description.trim())) {
      toast.error("Alle Positionen benoetigen eine Beschreibung");
      return;
    }

    if (items.some((item) => item.unitPrice <= 0)) {
      toast.error("Alle Positionen benoetigen einen positiven Preis");
      return;
    }

    try {
      setSaving(true);

      // 1. Geloeschte Items entfernen
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
        throw new Error(error.error || "Fehler beim Speichern");
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

      toast.success("Rechnung gespeichert");
      router.push(`/invoices/${id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Speichern");
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
        <p className="text-muted-foreground">Rechnung nicht gefunden</p>
      </div>
    );
  }

  const typeLabel = invoice.invoiceType === "INVOICE" ? "Rechnung" : "Gutschrift";

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
              <Badge variant="secondary">Entwurf</Badge>
            </div>
            <p className="text-muted-foreground">
              {typeLabel} bearbeiten
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Abbrechen
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Speichern
          </Button>
        </div>
      </div>

      {/* Hinweis */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Entwurf bearbeiten</AlertTitle>
        <AlertDescription>
          Sie bearbeiten einen Entwurf. Die Rechnungsnummer ({invoice.invoiceNumber}) bleibt unveraendert.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Linke Spalte */}
        <div className="space-y-6 lg:col-span-2">
          {/* Empfaenger */}
          <Card>
            <CardHeader>
              <CardTitle>Empfaenger</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="recipientType">Typ</Label>
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
                      <SelectItem value="PERSON">Person</SelectItem>
                      <SelectItem value="COMPANY">Unternehmen</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recipientName">Name *</Label>
                  <div className="relative">
                    <Input
                      id="recipientName"
                      value={formData.recipientName}
                      onChange={(e) =>
                        setFormData({ ...formData, recipientName: e.target.value })
                      }
                      placeholder="Name des Empfaengers"
                      required
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full w-10"
                      onClick={() => setRecipientDialogOpen(true)}
                      title="Kontakt suchen"
                    >
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="recipientAddress">Adresse</Label>
                <Textarea
                  id="recipientAddress"
                  value={formData.recipientAddress}
                  onChange={(e) =>
                    setFormData({ ...formData, recipientAddress: e.target.value })
                  }
                  placeholder="Strasse, PLZ Ort"
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
                  <CardTitle>Positionen</CardTitle>
                  <CardDescription>{items.length} Position(en)</CardDescription>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
                  <Plus className="mr-2 h-4 w-4" />
                  Position
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[300px]">Beschreibung</TableHead>
                    <TableHead className="w-20">Menge</TableHead>
                    <TableHead className="w-24">Einheit</TableHead>
                    <TableHead className="w-32">Einzelpreis</TableHead>
                    <TableHead className="w-32">
                      <div className="flex items-center gap-1">
                        Steuer
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-3 w-3 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Steuerfrei: Gem. Paragraph 4 Nr.12 UStG</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </TableHead>
                    <TableHead className="text-right">Netto</TableHead>
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
                              placeholder="Beschreibung"
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
                              title="Vorlage auswaehlen"
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
                              <SelectItem value="Stueck">Stueck</SelectItem>
                              <SelectItem value="Stunden">Stunden</SelectItem>
                              <SelectItem value="Tage">Tage</SelectItem>
                              <SelectItem value="pauschal">pauschal</SelectItem>
                              <SelectItem value="kWh">kWh</SelectItem>
                              <SelectItem value="MWh">MWh</SelectItem>
                              <SelectItem value="m2">m2</SelectItem>
                              <SelectItem value="ha">ha</SelectItem>
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
                              <SelectItem value="EXEMPT">0% (steuerfrei)</SelectItem>
                              <SelectItem value="REDUCED">7% MwSt</SelectItem>
                              <SelectItem value="STANDARD">19% MwSt</SelectItem>
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
                      Netto
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(totals.netAmount)}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={5} className="text-right">
                      MwSt
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.taxAmount)}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={5} className="text-right font-bold">
                      Brutto
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
              <CardTitle>Notizen</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Interne Notizen oder Zahlungshinweise"
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
              <CardTitle>Datum</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invoiceDate">Rechnungsdatum *</Label>
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
                <Label htmlFor="dueDate">Faelligkeitsdatum</Label>
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
                <Label htmlFor="serviceStartDate">Leistungszeitraum von</Label>
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
                <Label htmlFor="serviceEndDate">Leistungszeitraum bis</Label>
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
                  Skonto
                </CardTitle>
                <Switch
                  checked={skontoEnabled}
                  onCheckedChange={setSkontoEnabled}
                  aria-label="Skonto aktivieren"
                />
              </div>
              <CardDescription>
                Rabatt bei fruehzeitiger Zahlung
              </CardDescription>
            </CardHeader>
            {skontoEnabled && (
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="skontoPercent">Skonto %</Label>
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
                  <Label htmlFor="skontoDays">Skonto-Tage</Label>
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
                      Skonto-Betrag: {formatCurrency(calculateSkontoDiscount(totals.grossAmount, skontoPercent))}
                    </p>
                    <p className="text-green-700">
                      Zahlbar bis: {
                        formData.invoiceDate
                          ? new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
                              .format(calculateSkontoDeadline(new Date(formData.invoiceDate), skontoDays))
                          : "-"
                      }
                    </p>
                    <p className="text-green-700">
                      Zahlbetrag bei Skonto: {formatCurrency(totals.grossAmount - calculateSkontoDiscount(totals.grossAmount, skontoPercent))}
                    </p>
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          {/* Referenzen */}
          <Card>
            <CardHeader>
              <CardTitle>Referenzen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="paymentReference">Zahlungsreferenz</Label>
                <Input
                  id="paymentReference"
                  value={formData.paymentReference}
                  onChange={(e) =>
                    setFormData({ ...formData, paymentReference: e.target.value })
                  }
                  placeholder="z.B. Verwendungszweck"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="internalReference">Interne Referenz</Label>
                <Input
                  id="internalReference"
                  value={formData.internalReference}
                  onChange={(e) =>
                    setFormData({ ...formData, internalReference: e.target.value })
                  }
                  placeholder="z.B. Projektnummer"
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="parkId">Windpark</Label>
                <Select
                  value={formData.parkId || "none"}
                  onValueChange={(value) =>
                    setFormData({ ...formData, parkId: value === "none" ? "" : value })
                  }
                >
                  <SelectTrigger id="parkId">
                    <SelectValue placeholder="Optional zuordnen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Keine Zuordnung</SelectItem>
                    {parks.map((park) => (
                      <SelectItem key={park.id} value={park.id}>
                        {park.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fundId">Gesellschaft</Label>
                <Select
                  value={formData.fundId || "none"}
                  onValueChange={(value) =>
                    setFormData({ ...formData, fundId: value === "none" ? "" : value })
                  }
                >
                  <SelectTrigger id="fundId">
                    <SelectValue placeholder="Optional zuordnen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Keine Zuordnung</SelectItem>
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
