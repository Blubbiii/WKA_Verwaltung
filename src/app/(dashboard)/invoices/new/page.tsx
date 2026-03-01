"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/format";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Save,
  HelpCircle,
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
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { RecipientSearchDialog, type RecipientSelection, PositionTemplateDialog, type PositionTemplateSelection } from "@/components/invoices";
import { calculateSkontoDiscount, calculateSkontoDeadline } from "@/lib/invoices/skonto";

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxType: "STANDARD" | "REDUCED" | "EXEMPT";
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

function NewInvoiceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const type = searchParams.get("type") === "CREDIT_NOTE" ? "CREDIT_NOTE" : "INVOICE";

  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    invoiceDate: format(new Date(), "yyyy-MM-dd"),
    dueDate: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"),
    recipientType: "PERSON",
    recipientName: "",
    recipientStreet: "",
    recipientHouseNumber: "",
    recipientPostalCode: "",
    recipientCity: "",
    serviceStartDate: "",
    serviceEndDate: "",
    paymentReference: "",
    internalReference: "",
    notes: "",
    parkId: "",
    fundId: "",
  });

  const [items, setItems] = useState<InvoiceItem[]>([
    {
      id: crypto.randomUUID(),
      description: "",
      quantity: 1,
      unit: "Stueck",
      unitPrice: 0,
      taxType: "EXEMPT",
    },
  ]);

  // Skonto state
  const [skontoEnabled, setSkontoEnabled] = useState(false);
  const [skontoPercent, setSkontoPercent] = useState(2);
  const [skontoDays, setSkontoDays] = useState(7);

  const [parks, setParks] = useState<Array<{ id: string; name: string }>>([]);
  const [funds, setFunds] = useState<Array<{ id: string; name: string }>>([]);
  const [recipientDialogOpen, setRecipientDialogOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateTargetItemId, setTemplateTargetItemId] = useState<string | null>(null);

  useEffect(() => {
    // Lade Parks und Gesellschaften für Dropdown
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
        description: "",
        quantity: 1,
        unit: "Stueck",
        unitPrice: 0,
        taxType: "EXEMPT",
      },
    ]);
  }

  function handleRemoveItem(id: string) {
    if (items.length === 1) {
      toast.error("Mindestens eine Position erforderlich");
      return;
    }
    setItems(items.filter((item) => item.id !== id));
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
    // Address comes as "Straße Hausnr\nPLZ Ort"
    const lines = (recipient.recipientAddress || "").split("\n").map(l => l.trim()).filter(Boolean);
    const streetLine = lines[0] || "";
    const plzCity = lines[1] || "";
    const plzMatch = plzCity.match(/^(\d{4,5})\s*(.*)/);
    // Split street line into street + housenumber (last token if it looks like a number)
    const streetParts = streetLine.split(/\s+/);
    const lastPart = streetParts[streetParts.length - 1] || "";
    const looksLikeNumber = /^\d/.test(lastPart);
    const street = looksLikeNumber ? streetParts.slice(0, -1).join(" ") : streetLine;
    const houseNumber = looksLikeNumber ? lastPart : "";

    setFormData({
      ...formData,
      recipientType: recipient.recipientType,
      recipientName: recipient.recipientName,
      recipientStreet: street,
      recipientHouseNumber: houseNumber,
      recipientPostalCode: plzMatch ? plzMatch[1] : "",
      recipientCity: plzMatch ? plzMatch[2] : plzCity,
    });
  }

  function handleItemChange(id: string, field: keyof InvoiceItem, value: string | number) {
    setItems(
      items.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
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

    // Validierung
    if (!formData.recipientName.trim()) {
      toast.error("Empfängername erforderlich");
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

      // Bereite Items vor
      const preparedItems = items.map((item, index) => {
        const { netAmount, taxAmount, grossAmount, taxRate } = calculateItemAmounts(item);
        return {
          position: index + 1,
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
      });

      // Durchschnittlicher Steuersatz (gewichtet nach Nettobetrag)
      const avgTaxRate =
        totals.netAmount > 0 ? (totals.taxAmount / totals.netAmount) * 100 : 0;

      const payload = {
        invoiceType: type,
        invoiceDate: new Date(formData.invoiceDate).toISOString(),
        dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : null,
        recipientType: formData.recipientType,
        recipientName: formData.recipientName,
        recipientAddress: [
          [formData.recipientStreet, formData.recipientHouseNumber].filter(Boolean).join(" "),
          [formData.recipientPostalCode, formData.recipientCity].filter(Boolean).join(" "),
        ].filter(Boolean).join("\n") || null,
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
        netAmount: totals.netAmount,
        taxRate: avgTaxRate,
        taxAmount: totals.taxAmount,
        grossAmount: totals.grossAmount,
        // Skonto fields (only if enabled)
        ...(skontoEnabled && skontoPercent > 0 && skontoDays > 0
          ? { skontoPercent, skontoDays }
          : {}),
        items: preparedItems,
      };

      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Speichern");
      }

      const invoice = await response.json();
      toast.success(type === "INVOICE" ? "Rechnung erstellt" : "Gutschrift erstellt");
      router.push(`/invoices/${invoice.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  const typeLabel = type === "INVOICE" ? "Rechnung" : "Gutschrift";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild type="button">
            <Link href="/invoices">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Neue {typeLabel}</h1>
            <p className="text-muted-foreground">
              Erstellen Sie eine neue {typeLabel}
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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Linke Spalte: Empfänger & Datum */}
        <div className="space-y-6 lg:col-span-2">
          {/* Empfänger */}
          <Card>
            <CardHeader>
              <CardTitle>Empfänger</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="recipientName">Name *</Label>
                  <Input
                    id="recipientName"
                    value={formData.recipientName}
                    onChange={(e) =>
                      setFormData({ ...formData, recipientName: e.target.value })
                    }
                    placeholder="Name des Empfängers"
                    required
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRecipientDialogOpen(true)}
                >
                  <Search className="mr-2 h-4 w-4" />
                  Suchen / Anlegen
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-4">
                <div className="space-y-2 sm:col-span-3">
                  <Label htmlFor="recipientStreet">Strasse</Label>
                  <Input
                    id="recipientStreet"
                    value={formData.recipientStreet}
                    onChange={(e) =>
                      setFormData({ ...formData, recipientStreet: e.target.value })
                    }
                    placeholder="Musterstrasse"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recipientHouseNumber">Hausnr.</Label>
                  <Input
                    id="recipientHouseNumber"
                    value={formData.recipientHouseNumber}
                    onChange={(e) =>
                      setFormData({ ...formData, recipientHouseNumber: e.target.value })
                    }
                    placeholder="12a"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="recipientPostalCode">PLZ</Label>
                  <Input
                    id="recipientPostalCode"
                    value={formData.recipientPostalCode}
                    onChange={(e) =>
                      setFormData({ ...formData, recipientPostalCode: e.target.value })
                    }
                    placeholder="12345"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="recipientCity">Ort</Label>
                  <Input
                    id="recipientCity"
                    value={formData.recipientCity}
                    onChange={(e) =>
                      setFormData({ ...formData, recipientCity: e.target.value })
                    }
                    placeholder="Musterstadt"
                  />
                </div>
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

        {/* Rechte Spalte: Datum & Referenzen */}
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
                <Label htmlFor="dueDate">Fälligkeitsdatum</Label>
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
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" asChild>
                  <Link href="/funds/new" target="_blank">
                    <Plus className="mr-1 h-3 w-3" />
                    Neue Gesellschaft anlegen
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
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
    </form>
  );
}

export default function NewInvoicePage() {
  return (
    <Suspense fallback={<div>Laden...</div>}>
      <NewInvoiceContent />
    </Suspense>
  );
}
