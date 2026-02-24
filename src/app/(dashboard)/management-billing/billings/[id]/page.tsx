"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { formatCurrency } from "@/lib/format";
import {
  ArrowLeft,
  Calendar,
  Download,
  FileText,
  Loader2,
  Receipt,
  Building2,
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
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CalculationDetail {
  fundName: string;
  revenueShareEur: number;
  feeAmountEur: number;
}

interface BillingDetail {
  id: string;
  stakeholderId: string;
  year: number;
  month: number | null;
  baseRevenueEur: number;
  feePercentageUsed: number;
  feeAmountNetEur: number;
  taxRate: number;
  taxAmountEur: number;
  feeAmountGrossEur: number;
  calculationDetails: {
    details: CalculationDetail[];
  } | null;
  status: "DRAFT" | "CALCULATED" | "INVOICED" | "CANCELLED";
  invoiceId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  stakeholder: {
    role: string;
    parkId: string;
    parkTenantId: string;
    stakeholderTenant: { name: string };
  };
  parkName: string;
  providerName?: string;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  DRAFT: {
    label: "Entwurf",
    className:
      "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  },
  CALCULATED: {
    label: "Berechnet",
    className:
      "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  },
  INVOICED: {
    label: "Fakturiert",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  },
  CANCELLED: {
    label: "Storniert",
    className:
      "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  },
};

function getStatusBadge(status: string) {
  return (
    STATUS_CONFIG[status] || { label: status, className: "" }
  );
}

const ROLE_LABELS: Record<string, string> = {
  OPERATOR: "Betreiber",
  SERVICE_PROVIDER: "Dienstleister",
  GRID_OPERATOR: "Netzbetreiber",
  DIRECT_MARKETER: "Direktvermarkter",
  LANDOWNER: "Grundstueckseigentuemer",
  OTHER: "Sonstiges",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPeriod(year: number, month: number | null): string {
  if (month) {
    return `${String(month).padStart(2, "0")}/${year}`;
  }
  return String(year);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BillingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [billing, setBilling] = useState<BillingDetail | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(
    null
  );

  async function fetchBilling() {
    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/management-billing/billings/${id}`
      );
      if (!response.ok) {
        if (response.status === 404) {
          toast.error("Abrechnung nicht gefunden");
          router.push("/management-billing/billings");
          return;
        }
        throw new Error("Fehler beim Laden");
      }
      const data = await response.json();
      setBilling(data.billing);
    } catch {
      toast.error("Fehler beim Laden der Abrechnung");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchBilling();
  }, [id]);

  // Create invoice
  async function handleCreateInvoice() {
    try {
      setActionLoading("invoice");
      const response = await fetch(
        `/api/management-billing/billings/${id}/create-invoice`,
        { method: "POST" }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || "Fehler beim Erstellen der Rechnung"
        );
      }

      toast.success("Rechnung erfolgreich erstellt");
      fetchBilling();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Erstellen der Rechnung"
      );
    } finally {
      setActionLoading(null);
    }
  }

  // Download PDF
  async function handleDownloadPdf() {
    if (!billing) return;

    try {
      setActionLoading("pdf");
      const period = formatPeriod(billing.year, billing.month);

      const res = await fetch(
        `/api/management-billing/billings/${id}/pdf`
      );
      if (!res.ok) {
        throw new Error("Fehler beim Herunterladen des PDFs");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `BF-Rechnung-${period}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("PDF heruntergeladen");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Herunterladen"
      );
    } finally {
      setActionLoading(null);
    }
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-40 mt-2" />
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  // Not found
  if (!billing) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          Abrechnung nicht gefunden
        </p>
      </div>
    );
  }

  const period = formatPeriod(billing.year, billing.month);
  const providerName =
    billing.providerName ||
    billing.stakeholder.stakeholderTenant.name;
  const badge = getStatusBadge(billing.status);
  const details = billing.calculationDetails?.details || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/management-billing/billings">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">
                BF-Abrechnung {period}
              </h1>
              <Badge
                variant="secondary"
                className={badge.className}
              >
                {badge.label}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {providerName} &mdash; {billing.parkName}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {billing.status === "CALCULATED" && (
            <Button
              onClick={handleCreateInvoice}
              disabled={actionLoading === "invoice"}
            >
              {actionLoading === "invoice" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              Rechnung erstellen
            </Button>
          )}
          {billing.status === "INVOICED" && (
            <Button
              variant="outline"
              onClick={handleDownloadPdf}
              disabled={actionLoading === "pdf"}
            >
              {actionLoading === "pdf" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              PDF herunterladen
            </Button>
          )}
        </div>
      </div>

      {/* Info Cards - 2 Column Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Left: Abrechnungsdetails */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4" />
              Abrechnungsdetails
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">
                Status
              </span>
              <Badge
                variant="secondary"
                className={badge.className}
              >
                {badge.label}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">
                Zeitraum
              </span>
              <span className="font-mono">{period}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">
                Dienstleister
              </span>
              <span>{providerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">
                Park
              </span>
              <span>{billing.parkName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">
                Rolle
              </span>
              <span>
                {ROLE_LABELS[billing.stakeholder.role] ||
                  billing.stakeholder.role}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">
                Erstellt am
              </span>
              <span>
                {format(
                  new Date(billing.createdAt),
                  "dd.MM.yyyy HH:mm",
                  { locale: de }
                )}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Right: Berechnung */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-4 w-4" />
              Berechnung
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                Basis-Erlös
              </span>
              <span className="text-lg font-medium">
                {formatCurrency(billing.baseRevenueEur)}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                x Gebührensatz
              </span>
              <span>
                {billing.feePercentageUsed
                  .toFixed(2)
                  .replace(".", ",")}
                %
              </span>
            </div>

            <Separator />

            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                = Netto-Betrag
              </span>
              <span className="font-medium">
                {formatCurrency(billing.feeAmountNetEur)}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                + MwSt. (
                {billing.taxRate
                  .toFixed(0)
                  .replace(".", ",")}
                %)
              </span>
              <span>
                {formatCurrency(billing.taxAmountEur)}
              </span>
            </div>

            <Separator className="border-t-2" />

            <div className="flex justify-between items-center">
              <span className="font-bold">
                = Brutto-Betrag
              </span>
              <span className="text-xl font-bold">
                {formatCurrency(billing.feeAmountGrossEur)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Details pro Gesellschaft */}
      {details.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" />
              Details pro Gesellschaft
            </CardTitle>
            <CardDescription>
              Aufschluesselung der Erlösanteile pro Gesellschaft
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Gesellschaft</TableHead>
                    <TableHead className="text-right">
                      Erlösanteil
                    </TableHead>
                    <TableHead className="text-right">
                      Gebühr
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {details.map((detail, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">
                        {detail.fundName}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(detail.revenueShareEur)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(detail.feeAmountEur)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rechnungsdaten */}
      {billing.invoiceId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              Rechnungsdaten
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                Verknuepfte Rechnung:
              </span>
              <Link
                href={`/invoices/${billing.invoiceId}`}
                className="text-primary hover:underline font-medium"
              >
                Rechnung anzeigen
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notizen */}
      {billing.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notizen</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-line">
              {billing.notes}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
