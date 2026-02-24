"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { formatCurrency } from "@/lib/format";
import {
  ArrowLeft,
  Pencil,
  Send,
  CheckCircle,
  XCircle,
  Download,
  Loader2,
  Trash2,
  Receipt,
  FileText,
  FileCode2,
  Building2,
  Calendar,
  CreditCard,
  Eye,
  Scissors,
  History,
  Printer,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  TableFooter,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { InvoicePreviewDialog, PartialCancelDialog, CorrectionDialog, SettlementDetailsCard } from "@/components/invoices";
import { INVOICE_STATUS, getStatusBadge } from "@/lib/status-config";
import { getSkontoStatus, getSkontoStatusLabel, getSkontoStatusBadgeClass } from "@/lib/invoices/skonto";

interface InvoiceItem {
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
  netAmount: number;
  taxRate: number;
  taxAmount: number | null;
  grossAmount: number;
  status: "DRAFT" | "SENT" | "PAID" | "CANCELLED";
  sentAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  notes: string | null;
  // Skonto fields
  skontoPercent: number | null;
  skontoDays: number | null;
  skontoDeadline: string | null;
  skontoAmount: number | null;
  skontoPaid: boolean;
  // Delivery tracking
  printedAt: string | null;
  printedById: string | null;
  emailedAt: string | null;
  emailedById: string | null;
  emailedTo: string | null;
  createdAt: string;
  items: InvoiceItem[];
  fund: { id: string; name: string } | null;
  park: {
    id: string;
    name: string;
    billingEntityFund?: {
      id: string;
      name: string;
      legalForm: string | null;
      address: string | null;
    } | null;
  } | null;
  lease: { id: string } | null;
  tenant: {
    id: string;
    name: string;
    street: string | null;
    houseNumber: string | null;
    postalCode: string | null;
    city: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    bankName: string | null;
    iban: string | null;
    bic: string | null;
    taxId: string | null;
    vatId: string | null;
  } | null;
  cancelledInvoice: { id: string; invoiceNumber: string } | null;
  cancellingInvoice: { id: string; invoiceNumber: string } | null;
  // Settlement calculation details (JSON)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  calculationDetails: Record<string, any> | null;
  // E-Invoice fields
  leitwegId: string | null;
  einvoiceFormat: string | null;
  einvoiceGeneratedAt: string | null;
}

interface CorrectionHistoryEntry {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  correctionType: string;
  netAmount: number;
  grossAmount: number;
  reason: string | null;
}

interface CorrectionHistory {
  originalInvoice: {
    id: string;
    invoiceNumber: string;
    netAmount: number;
    grossAmount: number;
    status: string;
  };
  corrections: CorrectionHistoryEntry[];
  netEffect: {
    originalNet: number;
    originalGross: number;
    totalCorrectionNet: number;
    totalCorrectionGross: number;
    effectiveNet: number;
    effectiveGross: number;
  };
}

const taxTypeLabels: Record<string, string> = {
  STANDARD: "19% MwSt",
  REDUCED: "7% MwSt",
  EXEMPT: "Steuerfrei",
};

const correctionTypeLabels: Record<string, string> = {
  FULL_CANCEL: "Vollstorno",
  PARTIAL_CANCEL: "Teilstorno",
  CORRECTION: "Korrektur",
};

export default function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [showPartialCancelDialog, setShowPartialCancelDialog] = useState(false);
  const [showCorrectionDialog, setShowCorrectionDialog] = useState(false);
  const [correctionHistory, setCorrectionHistory] = useState<CorrectionHistory | null>(null);

  useEffect(() => {
    fetchInvoice();
  }, [id]);

  async function fetchInvoice() {
    try {
      setLoading(true);
      const response = await fetch(`/api/invoices/${id}`);
      if (!response.ok) {
        if (response.status === 404) {
          router.push("/invoices");
          return;
        }
        throw new Error("Fehler beim Laden");
      }
      const data = await response.json();
      setInvoice(data);
      // Also fetch correction history
      fetchCorrectionHistory();
    } catch (error) {
      toast.error("Fehler beim Laden der Rechnung");
    } finally {
      setLoading(false);
    }
  }

  async function fetchCorrectionHistory() {
    try {
      const response = await fetch(`/api/invoices/${id}/corrections`);
      if (response.ok) {
        const data = await response.json();
        setCorrectionHistory(data);
      }
    } catch {
      // Silently fail - corrections section is optional
    }
  }

  async function handleSend() {
    try {
      setActionLoading("send");
      const response = await fetch(`/api/invoices/${id}/send`, {
        method: "POST",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Versenden");
      }
      toast.success("Rechnung als versendet markiert");
      fetchInvoice();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Versenden");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleMarkPaid(applySkonto = false) {
    try {
      setActionLoading("paid");
      const response = await fetch(`/api/invoices/${id}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applySkonto }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler");
      }
      toast.success(
        applySkonto
          ? "Rechnung mit Skonto als bezahlt markiert"
          : "Rechnung als bezahlt markiert"
      );
      fetchInvoice();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCancel() {
    if (!cancelReason.trim()) {
      toast.error("Bitte geben Sie einen Storno-Grund an");
      return;
    }

    try {
      setActionLoading("cancel");
      const response = await fetch(`/api/invoices/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Stornieren");
      }
      const result = await response.json();
      toast.success("Rechnung storniert");
      setShowCancelDialog(false);
      setCancelReason("");
      // Zur Storno-Rechnung navigieren
      if (result.stornoInvoice) {
        router.push(`/invoices/${result.stornoInvoice.id}`);
      } else {
        fetchInvoice();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Stornieren");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDownloadXRechnung(format: "xrechnung" | "zugferd" = "xrechnung") {
    try {
      setActionLoading("xrechnung");
      const response = await fetch(`/api/invoices/${id}/xrechnung?format=${format}`);
      if (!response.ok) {
        const error = await response.json();
        if (error.validationErrors) {
          const errorMessages = error.validationErrors
            .map((e: { message: string }) => e.message)
            .join(", ");
          throw new Error(`Validierungsfehler: ${errorMessages}`);
        }
        throw new Error(error.error || "Fehler bei der XRechnung-Generierung");
      }
      // Download the XML file
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const disposition = response.headers.get("Content-Disposition");
      const filenameMatch = disposition?.match(/filename="(.+)"/);
      link.download = filenameMatch?.[1] || `${invoice?.invoiceNumber || "rechnung"}_${format.toUpperCase()}.xml`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(format === "zugferd" ? "ZUGFeRD-XML heruntergeladen" : "XRechnung heruntergeladen");
      // Refresh to show updated einvoice status
      fetchInvoice();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler bei der XRechnung-Generierung");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSaveLeitwegId(newLeitwegId: string) {
    try {
      setActionLoading("leitweg");
      const response = await fetch(`/api/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leitwegId: newLeitwegId || null }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Speichern");
      }
      toast.success("Leitweg-ID gespeichert");
      fetchInvoice();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Speichern der Leitweg-ID");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete() {
    try {
      setActionLoading("delete");
      const response = await fetch(`/api/invoices/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Löschen");
      }
      toast.success("Entwurf gelöscht");
      router.push("/invoices");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Löschen");
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePrint() {
    try {
      setActionLoading("print");
      const response = await fetch(`/api/invoices/${id}/print`, { method: "POST" });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Fehler beim Drucken" }));
        throw new Error(error.error || "Fehler beim Drucken");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = response.headers.get("Content-Disposition");
      const filename = disposition?.match(/filename="(.+)"/)?.[1] || "rechnung.pdf";
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("PDF heruntergeladen und als gedruckt markiert");
      fetchInvoice();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Drucken");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleEmailSend() {
    try {
      setActionLoading("email-send");
      const response = await fetch(`/api/invoices/${id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Fehler beim Versenden" }));
        throw new Error(error.error || "Fehler beim E-Mail-Versand");
      }
      const result = await response.json();
      toast.success(`E-Mail versendet an ${result.emailedTo || "Empfänger"}`);
      fetchInvoice();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim E-Mail-Versand");
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
        <Skeleton className="h-64" />
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

  const isInvoice = invoice.invoiceType === "INVOICE";
  const typeLabel = isInvoice ? "Rechnung" : "Gutschrift";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/invoices">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{invoice.invoiceNumber}</h1>
              <Badge variant="outline">
                {typeLabel}
              </Badge>
              <Badge className={getStatusBadge(INVOICE_STATUS, invoice.status).className}>
                {getStatusBadge(INVOICE_STATUS, invoice.status).label}
              </Badge>
              {getSkontoStatus(invoice) !== "NONE" && (
                <Badge variant="outline" className={getSkontoStatusBadgeClass(getSkontoStatus(invoice))}>
                  {getSkontoStatusLabel(getSkontoStatus(invoice))}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              Erstellt am {format(new Date(invoice.createdAt), "dd.MM.yyyy HH:mm", { locale: de })}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {invoice.status === "DRAFT" && (
            <>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Löschen
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Entwurf löschen?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Dieser Entwurf wird unwiderruflich gelöscht. Diese Aktion kann nicht rueckgaengig gemacht werden.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {actionLoading === "delete" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-2 h-4 w-4" />
                      )}
                      Löschen
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button variant="outline" asChild>
                <Link href={`/invoices/${id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Bearbeiten
                </Link>
              </Button>
              <Button
                onClick={handleSend}
                disabled={actionLoading === "send"}
              >
                {actionLoading === "send" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Versenden
              </Button>
            </>
          )}
          {(invoice.status === "SENT" || invoice.status === "PAID") && (
            <>
              {invoice.status === "SENT" && (
                getSkontoStatus(invoice) === "ELIGIBLE" ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        disabled={actionLoading === "paid"}
                      >
                        {actionLoading === "paid" ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle className="mr-2 h-4 w-4" />
                        )}
                        Bezahlt
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleMarkPaid(false)}>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Ohne Skonto bezahlt
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleMarkPaid(true)}>
                        <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                        Mit Skonto bezahlt ({formatCurrency(invoice.grossAmount - Number(invoice.skontoAmount))})
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => handleMarkPaid(false)}
                    disabled={actionLoading === "paid"}
                  >
                    {actionLoading === "paid" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="mr-2 h-4 w-4" />
                    )}
                    Bezahlt
                  </Button>
                )
              )}
              <Button
                variant="outline"
                onClick={() => setShowPartialCancelDialog(true)}
              >
                <Scissors className="mr-2 h-4 w-4" />
                Teilstorno
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowCorrectionDialog(true)}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Korrektur
              </Button>
              {invoice.status === "SENT" && (
              <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
                <DialogTrigger asChild>
                  <Button variant="destructive">
                    <XCircle className="mr-2 h-4 w-4" />
                    Vollstorno
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Rechnung stornieren</DialogTitle>
                    <DialogDescription>
                      Es wird eine Storno-Gutschrift für die gesamte Rechnung erstellt. Dieser Vorgang kann nicht rueckgaengig gemacht werden.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="cancelReason">Storno-Grund</Label>
                      <Input
                        id="cancelReason"
                        placeholder="z.B. Fehlerhafte Rechnungsstellung"
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
                      Abbrechen
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleCancel}
                      disabled={actionLoading === "cancel" || !cancelReason.trim()}
                    >
                      {actionLoading === "cancel" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <XCircle className="mr-2 h-4 w-4" />
                      )}
                      Vollstorno
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              )}
            </>
          )}
          <Button variant="outline" onClick={() => setShowPreviewDialog(true)}>
            <Eye className="mr-2 h-4 w-4" />
            Vorschau
          </Button>
          <Button variant="outline" asChild>
            <a href={`/api/invoices/${id}/pdf`} download>
              <Download className="mr-2 h-4 w-4" />
              PDF
            </a>
          </Button>
          {/* XRechnung / ZUGFeRD Download */}
          {invoice.status !== "CANCELLED" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  disabled={actionLoading === "xrechnung"}
                >
                  {actionLoading === "xrechnung" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileCode2 className="mr-2 h-4 w-4" />
                  )}
                  XRechnung
                  {invoice.einvoiceFormat && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {invoice.einvoiceFormat}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleDownloadXRechnung("xrechnung")}>
                  <FileCode2 className="mr-2 h-4 w-4" />
                  XRechnung (UBL 2.1) herunterladen
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDownloadXRechnung("zugferd")}>
                  <FileText className="mr-2 h-4 w-4" />
                  ZUGFeRD (CII) herunterladen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Invoice Preview Dialog */}
      <InvoicePreviewDialog
        open={showPreviewDialog}
        onOpenChange={setShowPreviewDialog}
        invoiceId={id}
        invoiceNumber={invoice?.invoiceNumber}
      />

      {/* Storno-Hinweise */}
      {invoice.cancelledInvoice && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-4">
            <p className="text-orange-800">
              Diese Gutschrift ist eine Stornierung von{" "}
              <Link href={`/invoices/${invoice.cancelledInvoice.id}`} className="font-medium underline">
                {invoice.cancelledInvoice.invoiceNumber}
              </Link>
            </p>
          </CardContent>
        </Card>
      )}
      {invoice.cancellingInvoice && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4">
            <p className="text-red-800">
              Diese Rechnung wurde storniert durch{" "}
              <Link href={`/invoices/${invoice.cancellingInvoice.id}`} className="font-medium underline">
                {invoice.cancellingInvoice.invoiceNumber}
              </Link>
              {invoice.cancelReason && (
                <span className="block mt-1 text-sm">Grund: {invoice.cancelReason}</span>
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Absender & Empfänger */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Absender / Aussteller */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              {isInvoice ? "Rechnungssteller" : "Gutschrift von"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {invoice.park?.billingEntityFund ? (
              <div className="space-y-1">
                <p className="font-medium">
                  {invoice.park.billingEntityFund.name}
                  {invoice.park.billingEntityFund.legalForm && (
                    <span className="text-muted-foreground font-normal ml-1">
                      ({invoice.park.billingEntityFund.legalForm})
                    </span>
                  )}
                </p>
                {invoice.park.billingEntityFund.address ? (
                  <p className="text-sm text-muted-foreground whitespace-pre-line">
                    {invoice.park.billingEntityFund.address}
                  </p>
                ) : (
                  <p className="text-xs text-amber-600">Keine Adresse hinterlegt</p>
                )}
                <p className="text-xs text-muted-foreground pt-1 border-t mt-2">
                  Abrechnungsgesellschaft von Park{" "}
                  <Link href={`/parks/${invoice.park.id}`} className="text-primary hover:underline">
                    {invoice.park.name}
                  </Link>
                </p>
              </div>
            ) : invoice.tenant ? (
              <div className="space-y-1">
                <p className="font-medium">{invoice.tenant.name}</p>
                {(invoice.tenant.street || invoice.tenant.postalCode) && (
                  <div className="text-sm text-muted-foreground">
                    {invoice.tenant.street && (
                      <p>{invoice.tenant.street}{invoice.tenant.houseNumber ? ` ${invoice.tenant.houseNumber}` : ""}</p>
                    )}
                    {(invoice.tenant.postalCode || invoice.tenant.city) && (
                      <p>{invoice.tenant.postalCode} {invoice.tenant.city}</p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Kein Aussteller hinterlegt</p>
            )}
          </CardContent>
        </Card>

        {/* Empfänger */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              {isInvoice ? "Rechnungsempfänger" : "Gutschrift an"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <p className="font-medium">{invoice.recipientName || "-"}</p>
              {invoice.recipientAddress ? (
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {invoice.recipientAddress}
                </p>
              ) : (
                <p className="text-xs text-amber-600">Keine Adresse hinterlegt</p>
              )}
              {invoice.fund && (
                <p className="text-xs text-muted-foreground pt-1 border-t mt-2">
                  Gesellschaft:{" "}
                  <Link href={`/funds/${invoice.fund.id}`} className="text-primary hover:underline">
                    {invoice.fund.name}
                  </Link>
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Datum & Betrag */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Datum */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Datum
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">{isInvoice ? "Rechnungsdatum" : "Gutschriftdatum"}</span>
              <span>{format(new Date(invoice.invoiceDate), "dd.MM.yyyy", { locale: de })}</span>
            </div>
            {invoice.dueDate && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Fällig am</span>
                <span>{format(new Date(invoice.dueDate), "dd.MM.yyyy", { locale: de })}</span>
              </div>
            )}
            {invoice.serviceStartDate && invoice.serviceEndDate && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Leistungszeitraum</span>
                <span>
                  {format(new Date(invoice.serviceStartDate), "dd.MM.yyyy", { locale: de })} -{" "}
                  {format(new Date(invoice.serviceEndDate), "dd.MM.yyyy", { locale: de })}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Betrag */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Betrag
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Netto</span>
              <span>{formatCurrency(invoice.netAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">
                MwSt ({invoice.taxRate}%)
              </span>
              <span>{formatCurrency(invoice.taxAmount || 0)}</span>
            </div>
            <Separator className="my-2" />
            <div className="flex justify-between font-medium">
              <span>Brutto</span>
              <span className="text-lg">{formatCurrency(invoice.grossAmount)}</span>
            </div>
            {invoice.skontoPercent && invoice.skontoAmount && (
              <>
                <Separator className="my-2" />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Skonto ({Number(invoice.skontoPercent).toFixed(2).replace(".", ",")}%)
                  </span>
                  <span className="text-green-700">
                    -{formatCurrency(Number(invoice.skontoAmount))}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-medium">
                  <span className="text-muted-foreground">Bei Skonto</span>
                  <span className="text-green-700">
                    {formatCurrency(invoice.grossAmount - Number(invoice.skontoAmount))}
                  </span>
                </div>
                {invoice.skontoDeadline && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Skonto-Frist: {format(new Date(invoice.skontoDeadline), "dd.MM.yyyy", { locale: de })}
                    {invoice.skontoPaid && " (angewandt)"}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Positionen */}
      <Card>
        <CardHeader>
          <CardTitle>Positionen</CardTitle>
          <CardDescription>{invoice.items.length} Position(en)</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Pos.</TableHead>
                <TableHead>Beschreibung</TableHead>
                <TableHead className="text-right">Menge</TableHead>
                <TableHead>Einheit</TableHead>
                <TableHead className="text-right">Einzelpreis</TableHead>
                <TableHead className="text-right">Netto</TableHead>
                <TableHead>Steuer</TableHead>
                <TableHead className="text-right">Brutto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.position}</TableCell>
                  <TableCell>{item.description}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell>{item.unit || "-"}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.netAmount)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {taxTypeLabels[item.taxType] || `${item.taxRate}%`}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(item.grossAmount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={5}></TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(invoice.netAmount)}
                </TableCell>
                <TableCell></TableCell>
                <TableCell className="text-right font-bold">
                  {formatCurrency(invoice.grossAmount)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      {/* Referenzen & Notizen */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Referenzen */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Referenzen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {invoice.paymentReference && (
              <div>
                <span className="text-muted-foreground">Zahlungsreferenz: </span>
                <span className="font-mono">{invoice.paymentReference}</span>
              </div>
            )}
            {invoice.internalReference && (
              <div>
                <span className="text-muted-foreground">Interne Referenz: </span>
                <span>{invoice.internalReference}</span>
              </div>
            )}
            {invoice.park && (
              <div>
                <span className="text-muted-foreground">Windpark: </span>
                <Link href={`/parks/${invoice.park.id}`} className="text-primary hover:underline">
                  {invoice.park.name}
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notizen */}
        {invoice.notes && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Notizen</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-line">{invoice.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Zustellung */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Send className="h-4 w-4" />
            Zustellung
          </CardTitle>
          <CardDescription>
            Druck- und E-Mail-Versand dieser {isInvoice ? "Rechnung" : "Gutschrift"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Druck-Status */}
            <div className="flex items-start gap-3">
              <Printer className={`h-5 w-5 mt-0.5 ${invoice.printedAt ? "text-green-600" : "text-muted-foreground/40"}`} />
              <div>
                <p className="text-sm font-medium">
                  {invoice.printedAt
                    ? `Gedruckt am ${format(new Date(invoice.printedAt), "dd.MM.yyyy HH:mm", { locale: de })}`
                    : "Noch nicht gedruckt"}
                </p>
              </div>
            </div>
            {/* E-Mail-Status */}
            <div className="flex items-start gap-3">
              <Mail className={`h-5 w-5 mt-0.5 ${invoice.emailedAt ? "text-green-600" : "text-muted-foreground/40"}`} />
              <div>
                <p className="text-sm font-medium">
                  {invoice.emailedAt
                    ? `Per E-Mail versendet am ${format(new Date(invoice.emailedAt), "dd.MM.yyyy HH:mm", { locale: de })}`
                    : "Noch nicht per E-Mail versendet"}
                </p>
                {invoice.emailedTo && (
                  <p className="text-xs text-muted-foreground">an {invoice.emailedTo}</p>
                )}
              </div>
            </div>
          </div>
          <Separator />
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              disabled={actionLoading === "print"}
            >
              {actionLoading === "print" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Printer className="mr-2 h-4 w-4" />
              )}
              {invoice.printedAt ? "Erneut drucken" : "Drucken"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleEmailSend}
              disabled={actionLoading === "email-send"}
            >
              {actionLoading === "email-send" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Mail className="mr-2 h-4 w-4" />
              )}
              {invoice.emailedAt ? "Erneut per E-Mail senden" : "Per E-Mail senden"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Correction History */}
      {correctionHistory && correctionHistory.corrections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <History className="h-4 w-4" />
              Korrekturen / Stornierungen
            </CardTitle>
            <CardDescription>
              {correctionHistory.corrections.length} Korrektur(en) zu dieser Rechnung
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Typ</TableHead>
                  <TableHead>Belegnummer</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead className="text-right">Netto</TableHead>
                  <TableHead className="text-right">Brutto</TableHead>
                  <TableHead>Grund</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {correctionHistory.corrections.map((corr) => (
                  <TableRow key={corr.id}>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {correctionTypeLabels[corr.correctionType] || corr.correctionType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/invoices/${corr.id}`}
                        className="text-primary hover:underline font-medium"
                      >
                        {corr.invoiceNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {format(new Date(corr.invoiceDate), "dd.MM.yyyy", { locale: de })}
                    </TableCell>
                    <TableCell className="text-right text-red-600">
                      {formatCurrency(corr.netAmount)}
                    </TableCell>
                    <TableCell className="text-right text-red-600 font-medium">
                      {formatCurrency(corr.grossAmount)}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                      {corr.reason || "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="font-medium">
                    Effektiver Betrag (Original + Korrekturen)
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(correctionHistory.netEffect.effectiveNet)}
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {formatCurrency(correctionHistory.netEffect.effectiveGross)}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Settlement calculation details (Berechnungsnachweis) */}
      {invoice.calculationDetails && (
        <SettlementDetailsCard calculationDetails={invoice.calculationDetails} />
      )}

      {/* E-Invoice (XRechnung / ZUGFeRD) - Pflicht seit 2025 für B2B */}
      {invoice.status !== "CANCELLED" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <FileCode2 className="h-4 w-4" />
              E-Rechnung (XRechnung / ZUGFeRD)
            </CardTitle>
            <CardDescription>
              Pflicht seit 2025 für B2B-Rechnungen (EN 16931)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Status:</span>
                {invoice.einvoiceFormat ? (
                  <Badge variant="default" className="bg-green-600">
                    {invoice.einvoiceFormat} verfügbar
                  </Badge>
                ) : (
                  <Badge variant="secondary">Noch nicht generiert</Badge>
                )}
              </div>
              {invoice.einvoiceGeneratedAt && (
                <span className="text-xs text-muted-foreground">
                  Generiert am{" "}
                  {format(new Date(invoice.einvoiceGeneratedAt), "dd.MM.yyyy HH:mm", { locale: de })}
                </span>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="leitwegId" className="text-sm">
                Leitweg-ID (optional, für oeffentliche Auftraggeber)
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="leitwegId"
                  placeholder="z.B. 04011000-12345-67"
                  defaultValue={invoice.leitwegId || ""}
                  className="max-w-xs font-mono"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== (invoice.leitwegId || "")) handleSaveLeitwegId(v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  disabled={invoice.status !== "DRAFT" || actionLoading === "leitweg"}
                />
                {actionLoading === "leitweg" && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              {invoice.status !== "DRAFT" && invoice.leitwegId && (
                <p className="text-sm font-mono text-muted-foreground">{invoice.leitwegId}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Die Leitweg-ID wird als Kaeufer-Referenz (BT-10) in der XRechnung verwendet.
                {invoice.status !== "DRAFT" && " Änderung nur im Entwurfs-Status moeglich."}
              </p>
            </div>
            <Separator />
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownloadXRechnung("xrechnung")}
                disabled={actionLoading === "xrechnung"}
              >
                {actionLoading === "xrechnung" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileCode2 className="mr-2 h-4 w-4" />
                )}
                XRechnung (UBL 2.1)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownloadXRechnung("zugferd")}
                disabled={actionLoading === "xrechnung"}
              >
                {actionLoading === "xrechnung" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-2 h-4 w-4" />
                )}
                ZUGFeRD (CII)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Partial Cancel Dialog */}
      {invoice && (
        <PartialCancelDialog
          open={showPartialCancelDialog}
          onOpenChange={setShowPartialCancelDialog}
          invoiceId={invoice.id}
          invoiceNumber={invoice.invoiceNumber}
          items={invoice.items}
          onSuccess={(creditNoteId) => {
            router.push(`/invoices/${creditNoteId}`);
          }}
        />
      )}

      {/* Correction Dialog */}
      {invoice && (
        <CorrectionDialog
          open={showCorrectionDialog}
          onOpenChange={setShowCorrectionDialog}
          invoiceId={invoice.id}
          invoiceNumber={invoice.invoiceNumber}
          items={invoice.items}
          onSuccess={(creditNoteId) => {
            router.push(`/invoices/${creditNoteId}`);
          }}
        />
      )}

    </div>
  );
}
