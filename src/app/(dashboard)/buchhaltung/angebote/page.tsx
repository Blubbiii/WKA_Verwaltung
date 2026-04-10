"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Plus,
  RefreshCw,
  Send,
  Check,
  X,
  ArrowRight,
  Trash2,
  Clock,
} from "lucide-react";

interface QuoteItem {
  id: string;
  position: number;
  description: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  netAmount: number;
  taxType: string;
  taxRate: number;
  taxAmount: number;
  grossAmount: number;
}

interface Quote {
  id: string;
  quoteNumber: string;
  quoteDate: string;
  validUntil: string;
  status: string;
  recipientType: string | null;
  recipientName: string | null;
  recipientAddress: string | null;
  netAmount: number;
  taxAmount: number;
  grossAmount: number;
  notes: string | null;
  internalReference: string | null;
  serviceStartDate: string | null;
  serviceEndDate: string | null;
  fundId: string | null;
  parkId: string | null;
  fund: { id: string; name: string } | null;
  park: { id: string; name: string } | null;
  convertedInvoice: { id: string; invoiceNumber: string } | null;
  items: QuoteItem[];
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  SENT: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  ACCEPTED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  INVOICED: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  EXPIRED: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  CANCELLED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

const STATUS_KEYS = ["DRAFT", "SENT", "ACCEPTED", "INVOICED", "EXPIRED", "CANCELLED"] as const;

function fmt(n: number | string): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  return num.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("de-DE");
}

interface NewItemRow {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxType: "STANDARD" | "REDUCED" | "EXEMPT";
}

const emptyItem = (): NewItemRow => ({
  description: "",
  quantity: 1,
  unit: "Stk",
  unitPrice: 0,
  taxType: "STANDARD",
});

export default function AngebotePage() {
  const t = useTranslations("buchhaltung.angebote");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // New quote form
  const [recipientName, setRecipientName] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<NewItemRow[]>([emptyItem()]);

  const statusLabel = useCallback(
    (status: string): string => {
      switch (status) {
        case "DRAFT": return t("statusDraft");
        case "SENT": return t("statusSent");
        case "ACCEPTED": return t("statusAccepted");
        case "INVOICED": return t("statusInvoiced");
        case "EXPIRED": return t("statusExpired");
        case "CANCELLED": return t("statusCancelled");
        default: return status;
      }
    },
    [t]
  );

  const statusOptions = useMemo(
    () => STATUS_KEYS.map((key) => ({ key, label: statusLabel(key) })),
    [statusLabel]
  );

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/buchhaltung/angebote?${params}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setQuotes(json.data || []);
    } catch {
      toast.error(t("toastLoadError"));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, t]);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  async function createQuote() {
    if (!recipientName.trim() || items.some((it) => !it.description.trim() || it.unitPrice <= 0)) {
      toast.error(t("toastValidation"));
      return;
    }

    setSaving(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const res = await fetch("/api/buchhaltung/angebote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteDate: today,
          validUntil: validUntil || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          recipientName,
          recipientAddress: recipientAddress || null,
          notes: notes || null,
          items: items.map((it) => ({
            description: it.description,
            quantity: it.quantity,
            unit: it.unit || undefined,
            unitPrice: it.unitPrice,
            taxType: it.taxType,
          })),
        }),
      });

      if (!res.ok) throw new Error();
      toast.success(t("toastCreateSuccess"));
      setDialogOpen(false);
      resetForm();
      fetchQuotes();
    } catch {
      toast.error(t("toastCreateError"));
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setRecipientName("");
    setRecipientAddress("");
    setValidUntil("");
    setNotes("");
    setItems([emptyItem()]);
  }

  async function performAction(quoteId: string, action: string, confirmMsg: string) {
    if (!confirm(confirmMsg)) return;
    try {
      const res = await fetch(`/api/buchhaltung/angebote/${quoteId}/${action}`, { method: "POST" });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || t("toastActionError"));
      }
      toast.success(t("toastActionSuccess"));
      fetchQuotes();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toastActionError"));
    }
  }

  async function deleteQuote(quoteId: string) {
    if (!confirm(t("confirmDelete"))) return;
    try {
      const res = await fetch(`/api/buchhaltung/angebote/${quoteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success(t("toastDeleteSuccess"));
      fetchQuotes();
    } catch {
      toast.error(t("toastDeleteError"));
    }
  }

  function updateItem(index: number, field: keyof NewItemRow, value: string | number) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
      />

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 mb-6 items-end">
            <div className="space-y-1 min-w-[160px]">
              <Label>{t("labelStatus")}</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("filterAll")}</SelectItem>
                  {statusOptions.map((opt) => (
                    <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={fetchQuotes}>
              <RefreshCw className="h-4 w-4 mr-2" />{t("refreshBtn")}
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" />{t("newBtn")}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{t("dialogTitle")}</DialogTitle>
                  <DialogDescription>{t("dialogDescription")}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label>{t("labelRecipient")}</Label>
                      <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder={t("recipientPlaceholder")} />
                    </div>
                    <div className="space-y-1">
                      <Label>{t("labelValidUntil")}</Label>
                      <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>{t("labelAddress")}</Label>
                    <Input value={recipientAddress} onChange={(e) => setRecipientAddress(e.target.value)} placeholder={t("addressPlaceholder")} />
                  </div>

                  <div className="space-y-2">
                    <Label>{t("labelItems")}</Label>
                    {items.map((item, i) => (
                      <div key={i} className="flex gap-2 items-start">
                        <Input
                          className="flex-1"
                          placeholder={t("itemDescriptionPlaceholder")}
                          value={item.description}
                          onChange={(e) => updateItem(i, "description", e.target.value)}
                        />
                        <Input
                          className="w-20"
                          type="number"
                          min={0.01}
                          step={0.01}
                          value={item.quantity}
                          onChange={(e) => updateItem(i, "quantity", parseFloat(e.target.value) || 0)}
                        />
                        <Input
                          className="w-20"
                          placeholder={t("itemUnitPlaceholder")}
                          value={item.unit}
                          onChange={(e) => updateItem(i, "unit", e.target.value)}
                        />
                        <Input
                          className="w-28"
                          type="number"
                          min={0}
                          step={0.01}
                          placeholder={t("itemPricePlaceholder")}
                          value={item.unitPrice || ""}
                          onChange={(e) => updateItem(i, "unitPrice", parseFloat(e.target.value) || 0)}
                        />
                        <Select
                          value={item.taxType}
                          onValueChange={(v) => updateItem(i, "taxType", v)}
                        >
                          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="STANDARD">19%</SelectItem>
                            <SelectItem value="REDUCED">7%</SelectItem>
                            <SelectItem value="EXEMPT">0%</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" onClick={() => removeItem(i)} disabled={items.length <= 1}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={addItem}>
                      <Plus className="h-3 w-3 mr-1" />{t("addItemBtn")}
                    </Button>
                  </div>

                  <div className="space-y-1">
                    <Label>{t("labelNotes")}</Label>
                    <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("notesPlaceholder")} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("btnCancel")}</Button>
                  <Button onClick={createQuote} disabled={saving}>
                    {saving ? t("btnCreating") : t("btnCreate")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : quotes.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              {t("emptyState")}
            </div>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("colNumber")}</TableHead>
                    <TableHead>{t("colRecipient")}</TableHead>
                    <TableHead>{t("colDate")}</TableHead>
                    <TableHead>{t("colValidUntil")}</TableHead>
                    <TableHead>{t("colStatus")}</TableHead>
                    <TableHead className="text-right">{t("colGross")}</TableHead>
                    <TableHead className="text-right">{t("colActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotes.map((q) => {
                    const color = STATUS_COLORS[q.status] || "";
                    const isExpired = q.status === "SENT" && new Date(q.validUntil) < new Date();
                    return (
                      <TableRow key={q.id}>
                        <TableCell className="font-mono text-sm">{q.quoteNumber}</TableCell>
                        <TableCell>
                          <div className="font-medium">{q.recipientName || "-"}</div>
                          {q.fund && <div className="text-xs text-muted-foreground">{q.fund.name}</div>}
                        </TableCell>
                        <TableCell className="text-sm">{fmtDate(q.quoteDate)}</TableCell>
                        <TableCell className={`text-sm ${isExpired ? "text-red-600 dark:text-red-400" : ""}`}>
                          {fmtDate(q.validUntil)}
                          {isExpired && <Clock className="inline h-3 w-3 ml-1" />}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={color}>{statusLabel(q.status)}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">{fmt(q.grossAmount)} €</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {q.status === "DRAFT" && (
                              <Button variant="ghost" size="icon" title={t("actionSend")} onClick={() => performAction(q.id, "send", t("confirmSend"))}>
                                <Send className="h-4 w-4" />
                              </Button>
                            )}
                            {q.status === "SENT" && (
                              <>
                                <Button variant="ghost" size="icon" title={t("actionAccept")} onClick={() => performAction(q.id, "accept", t("confirmAccept"))}>
                                  <Check className="h-4 w-4 text-green-600" />
                                </Button>
                                <Button variant="ghost" size="icon" title={t("actionExpire")} onClick={() => performAction(q.id, "expire", t("confirmExpire"))}>
                                  <Clock className="h-4 w-4 text-orange-600" />
                                </Button>
                              </>
                            )}
                            {q.status === "ACCEPTED" && (
                              <Button variant="ghost" size="icon" title={t("actionConvert")} onClick={() => performAction(q.id, "convert", t("confirmConvert"))}>
                                <ArrowRight className="h-4 w-4 text-purple-600" />
                              </Button>
                            )}
                            {q.convertedInvoice && (
                              <span className="text-xs text-muted-foreground px-2 py-1">
                                → {q.convertedInvoice.invoiceNumber}
                              </span>
                            )}
                            {["DRAFT", "SENT", "ACCEPTED"].includes(q.status) && (
                              <Button variant="ghost" size="icon" title={t("actionCancel")} onClick={() => performAction(q.id, "cancel", t("confirmCancel"))}>
                                <X className="h-4 w-4 text-red-600" />
                              </Button>
                            )}
                            {q.status === "DRAFT" && (
                              <Button variant="ghost" size="icon" title={t("actionDelete")} onClick={() => deleteQuote(q.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
