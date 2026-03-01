"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Download,
  Loader2,
  Inbox,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OcrFieldEditor } from "@/components/inbox/ocr-field-editor";
import { SplitEditor } from "@/components/inbox/split-editor";

// ============================================================================
// Types
// ============================================================================

interface Split {
  id: string;
  fundId: string;
  fundName?: string;
  splitPercent: string | null;
  splitAmount: string | null;
  description: string | null;
  datevAccount: string | null;
  outgoingInvoiceId: string | null;
  fund: { id: string; name: string };
}

interface InvoiceDetail {
  id: string;
  invoiceType: "INVOICE" | "CREDIT_NOTE";
  status: string;
  ocrStatus: string;
  vendorId: string | null;
  vendorNameFallback: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  netAmount: string | null;
  vatAmount: string | null;
  grossAmount: string | null;
  vatRate: string | null;
  currency: string;
  iban: string | null;
  bic: string | null;
  paymentReference: string | null;
  recipientFundId: string | null;
  datevAccount: string | null;
  notes: string | null;
  fileUrl: string;
  fileName: string;
  paidAt: string | null;
  paidAmount: string | null;
  vendor: { id: string; name: string; iban: string | null; bic: string | null } | null;
  recipientFund: { id: string; name: string } | null;
  splits: Split[];
}

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  INBOX: { label: "Posteingang", variant: "secondary" },
  OCR_PROCESSING: { label: "OCR läuft", variant: "secondary" },
  REVIEW: { label: "In Prüfung", variant: "outline" },
  APPROVED: { label: "Genehmigt", variant: "default" },
  PAID: { label: "Bezahlt", variant: "default" },
  CANCELLED: { label: "Storniert", variant: "destructive" },
};

// ============================================================================
// Pay Dialog
// ============================================================================

function PayDialog({
  open,
  onClose,
  onPaid,
  invoiceId,
  grossAmount,
}: {
  open: boolean;
  onClose: () => void;
  onPaid: () => void;
  invoiceId: string;
  grossAmount: number | null;
}) {
  const [paidAmount, setPaidAmount] = useState(grossAmount?.toFixed(2) ?? "");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/inbox/${invoiceId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paidAt: new Date(paidAt).toISOString(),
          paidAmount: paidAmount ? parseFloat(paidAmount) : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Fehler");
      }
      toast.success("Als bezahlt markiert");
      onPaid();
      onClose();
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Als bezahlt markieren</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Zahlungsdatum</Label>
            <Input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
            />
          </div>
          <div>
            <Label>Bezahlter Betrag €</Label>
            <Input
              type="number"
              step="0.01"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Speichere..." : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function InboxDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { flags } = useFeatureFlags();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [sepaExporting, setSepaExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/inbox/${id}`);
      if (res.ok) {
        setInvoice(await res.json());
      } else if (res.status === 404) {
        router.push("/inbox");
      }
    } catch {
      toast.error("Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    if (flags.inbox) load();
  }, [flags.inbox, load]);

  const approve = async () => {
    if (!invoice) return;
    setApproving(true);
    try {
      const res = await fetch(`/api/inbox/${id}/approve`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Fehler");
      }
      toast.success("Rechnung genehmigt");
      load();
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    } finally {
      setApproving(false);
    }
  };

  const exportSepa = async () => {
    if (!invoice) return;
    setSepaExporting(true);
    try {
      const res = await fetch("/api/inbox/export/sepa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceIds: [id] }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Fehler");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sepa-${id.slice(0, 8)}.xml`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("SEPA XML heruntergeladen");
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    } finally {
      setSepaExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!invoice) return null;

  const badgeInfo = STATUS_BADGE[invoice.status] ?? { label: invoice.status, variant: "secondary" as const };
  const grossNum = invoice.grossAmount ? parseFloat(invoice.grossAmount) : null;
  const isEditable = ["INBOX", "REVIEW"].includes(invoice.status);
  const canApprove = ["INBOX", "REVIEW"].includes(invoice.status);
  const canPay = invoice.status === "APPROVED";
  const canSepa = invoice.status === "APPROVED" && !!invoice.iban;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">
              {invoice.vendor?.name ?? invoice.vendorNameFallback ?? invoice.fileName}
            </h1>
            <Badge variant={badgeInfo.variant}>{badgeInfo.label}</Badge>
          </div>
          {invoice.invoiceNumber && (
            <p className="text-muted-foreground text-sm">Re. {invoice.invoiceNumber}</p>
          )}
        </div>
      </div>

      {/* 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: PDF preview + field editor */}
        <div className="space-y-4">
          {/* PDF link */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Inbox className="h-4 w-4" />
                Datei
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm truncate text-muted-foreground">{invoice.fileName}</span>
                <Button variant="outline" size="sm" asChild>
                  <a href={`/api/documents/file?url=${encodeURIComponent(invoice.fileUrl)}`} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Öffnen
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* OCR fields */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Rechnungsfelder</CardTitle>
            </CardHeader>
            <CardContent>
              <OcrFieldEditor
                invoiceId={id}
                fields={{
                  invoiceType: invoice.invoiceType,
                  vendorId: invoice.vendorId,
                  vendorName: invoice.vendor?.name ?? null,
                  vendorNameFallback: invoice.vendorNameFallback,
                  invoiceNumber: invoice.invoiceNumber,
                  invoiceDate: invoice.invoiceDate,
                  dueDate: invoice.dueDate,
                  grossAmount: grossNum,
                  netAmount: invoice.netAmount ? parseFloat(invoice.netAmount) : null,
                  vatAmount: invoice.vatAmount ? parseFloat(invoice.vatAmount) : null,
                  vatRate: invoice.vatRate ? parseFloat(invoice.vatRate) : null,
                  iban: invoice.iban,
                  bic: invoice.bic,
                  paymentReference: invoice.paymentReference,
                  recipientFundId: invoice.recipientFundId,
                  datevAccount: invoice.datevAccount,
                  notes: invoice.notes,
                  ocrStatus: invoice.ocrStatus,
                }}
                onSaved={() => load()}
                disabled={!isEditable}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right: Actions + splits */}
        <div className="space-y-4">
          {/* Action buttons */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Aktionen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {canApprove && (
                <Button className="w-full" onClick={approve} disabled={approving}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  {approving ? "Genehmigt..." : "Genehmigen"}
                </Button>
              )}

              {canPay && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setPayDialogOpen(true)}
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  Als bezahlt markieren
                </Button>
              )}

              {canSepa && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={exportSepa}
                  disabled={sepaExporting}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {sepaExporting ? "Exportiert..." : "SEPA XML exportieren"}
                </Button>
              )}

              {invoice.status === "PAID" && invoice.paidAt && (
                <div className="text-sm text-muted-foreground flex flex-col gap-0.5">
                  <span>Bezahlt am {format(new Date(invoice.paidAt), "dd.MM.yyyy", { locale: de })}</span>
                  {invoice.paidAmount && (
                    <span>
                      Betrag:{" "}
                      {parseFloat(invoice.paidAmount).toLocaleString("de-DE", {
                        style: "currency",
                        currency: "EUR",
                      })}
                    </span>
                  )}
                </div>
              )}

              <Separator />

              {/* Summary */}
              {grossNum !== null && (
                <div className="text-center py-2">
                  <div className="text-2xl font-bold">
                    {grossNum.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {invoice.invoiceType === "CREDIT_NOTE" ? "Gutschrift" : "Brutto"}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Splits */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Kostenaufteilung</CardTitle>
            </CardHeader>
            <CardContent>
              <SplitEditor
                invoiceId={id}
                grossAmount={grossNum}
                initialSplits={invoice.splits.map((s) => ({
                  id: s.id,
                  fundId: s.fund.id,
                  fundName: s.fund.name,
                  splitPercent: s.splitPercent ? parseFloat(s.splitPercent) : null,
                  splitAmount: s.splitAmount ? parseFloat(s.splitAmount) : null,
                  description: s.description ?? "",
                  datevAccount: s.datevAccount ?? "",
                  outgoingInvoiceId: s.outgoingInvoiceId,
                }))}
                onSaved={load}
                disabled={!isEditable}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <PayDialog
        open={payDialogOpen}
        onClose={() => setPayDialogOpen(false)}
        onPaid={load}
        invoiceId={id}
        grossAmount={grossNum}
      />
    </div>
  );
}
