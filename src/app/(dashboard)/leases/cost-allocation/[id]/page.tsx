"use client";

import { useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { toast } from "sonner";
import {
  ArrowLeft,
  Receipt,
  Loader2,
  FileText,
  ExternalLink,
  Euro,
  BarChart3,
  Download,
  Lock,
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/format";
import {
  ALLOCATION_STATUS_LABELS,
  SETTLEMENT_STATUS_LABELS,
  type ParkCostAllocationStatus,
  type ParkCostAllocationResponse,
  type ParkCostAllocationItemResponse,
} from "@/types/billing";

// =============================================================================
// CONSTANTS & HELPERS
// =============================================================================

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Fehler beim Laden");
    return res.json();
  });

const ALLOCATION_STATUS_COLORS: Record<ParkCostAllocationStatus, string> = {
  DRAFT: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100/80",
  INVOICED: "bg-green-100 text-green-800 hover:bg-green-100/80",
  CLOSED: "bg-slate-100 text-slate-800 hover:bg-slate-100/80",
};

function formatPercent(pct: number): string {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(pct);
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function CostAllocationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [actionLoading, setActionLoading] = useState(false);
  const [closeLoading, setCloseLoading] = useState(false);

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------
  const {
    data: allocation,
    isLoading,
    error: isError,
    mutate,
  } = useSWR<ParkCostAllocationResponse>(
    `/api/leases/cost-allocation/${id}`,
    fetcher
  );

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  async function handleCreateInvoices() {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/leases/cost-allocation/${id}/invoice`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err.message || "Fehler beim Erstellen der Rechnungen"
        );
      }
      toast.success("Rechnungen wurden erfolgreich erzeugt");
      mutate();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Erstellen der Rechnungen"
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function handleClose() {
    try {
      setCloseLoading(true);
      const res = await fetch(`/api/leases/cost-allocation/${id}/close`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Fehler beim Abschliessen");
      }
      toast.success("Kostenaufteilung wurde abgeschlossen");
      mutate();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Abschliessen"
      );
    } finally {
      setCloseLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Loading State
  // ---------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error / Not Found
  // ---------------------------------------------------------------------------
  if (isError || !allocation) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/leases/cost-allocation">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">
            Kostenaufteilung nicht gefunden
          </h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Die angeforderte Kostenaufteilung konnte nicht geladen werden.
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------
  const settlement = allocation.leaseRevenueSettlement;
  const parkName = settlement?.park?.name || "Unbekannt";
  const year = settlement?.year || "-";
  const title = `Kostenaufteilung ${parkName} ${year}`;
  const items = allocation.items || [];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/leases/cost-allocation">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{title}</h1>
              <Badge
                variant="secondary"
                className={ALLOCATION_STATUS_COLORS[allocation.status]}
              >
                {ALLOCATION_STATUS_LABELS[allocation.status]}
              </Badge>
            </div>
            {allocation.periodLabel && (
              <p className="text-muted-foreground">
                Periode: {allocation.periodLabel}
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 flex-wrap">
          {allocation.status === "DRAFT" && (
            <Button
              onClick={handleCreateInvoices}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Receipt className="mr-2 h-4 w-4" />
              )}
              Rechnungen erzeugen
            </Button>
          )}
          {allocation.status === "INVOICED" && (
            <>
              <Button variant="outline" asChild>
                <Link href="/invoices">
                  <FileText className="mr-2 h-4 w-4" />
                  Rechnungen anzeigen
                </Link>
              </Button>
              <Button
                variant="secondary"
                onClick={handleClose}
                disabled={closeLoading}
              >
                {closeLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="mr-2 h-4 w-4" />
                )}
                Abschliessen
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Euro className="h-4 w-4" />
              Gesamtkosten
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {formatCurrency(Number(allocation.totalUsageFeeEur))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Nutzungsentgelt gesamt
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Steuerpflichtig (19%)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {formatCurrency(Number(allocation.totalTaxableEur))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Anteil mit Umsatzsteuer
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Steuerfrei (Paragraph 4/12)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {formatCurrency(Number(allocation.totalExemptEur))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Anteil ohne Umsatzsteuer
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Linked Settlement Info */}
      {settlement && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Zugehoerige Abrechnung
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    Abrechnung:
                  </span>
                  <span className="font-medium">
                    {parkName} - {year}
                  </span>
                  <Badge variant="outline">
                    {SETTLEMENT_STATUS_LABELS[
                      settlement.status as keyof typeof SETTLEMENT_STATUS_LABELS
                    ] || settlement.status}
                  </Badge>
                </div>
                {settlement.actualFeeEur !== undefined && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      Nutzungsentgelt (berechnet):
                    </span>
                    <span className="font-mono font-medium">
                      {formatCurrency(Number(settlement.actualFeeEur))}
                    </span>
                  </div>
                )}
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/leases/usage-fees/${settlement.id}`}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Zur Abrechnung
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Allocation Items Table (per Operator) */}
      {items.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Aufteilung nach Betreiber</CardTitle>
            <CardDescription>
              {items.length} Betreibergesellschaft(en) - Nutzungsentgelt-Verteilung
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Betreiber</TableHead>
                    <TableHead className="text-right">Anteil (%)</TableHead>
                    <TableHead>Schluessel</TableHead>
                    <TableHead className="text-right">
                      MIT MwSt (19%)
                    </TableHead>
                    <TableHead className="text-right">
                      OHNE MwSt
                    </TableHead>
                    <TableHead className="text-right">
                      Direktabrechnung
                    </TableHead>
                    <TableHead className="text-right">
                      Netto zahlbar
                    </TableHead>
                    <TableHead>Rechnungen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item: ParkCostAllocationItemResponse) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.operatorFund.name}
                        {item.operatorFund.legalForm && (
                          <span className="text-muted-foreground ml-1">
                            ({item.operatorFund.legalForm})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatPercent(Number(item.allocationSharePercent))}%
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.allocationBasis}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(
                          Number(item.taxableAmountEur) +
                            Number(item.taxableVatEur)
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(Number(item.exemptAmountEur))}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(Number(item.directSettlementEur))}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatCurrency(Number(item.netPayableEur))}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {item.vatInvoice ? (
                            <div className="flex items-center gap-1">
                              <Link
                                href={`/invoices/${item.vatInvoice.id}`}
                                className="text-primary hover:underline text-sm"
                              >
                                {item.vatInvoice.invoiceNumber}
                              </Link>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() =>
                                  window.open(
                                    `/api/invoices/${item.vatInvoice!.id}/pdf`,
                                    "_blank"
                                  )
                                }
                                title="PDF herunterladen"
                              >
                                <Download className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : item.vatInvoiceId ? (
                            <span className="text-sm text-muted-foreground">
                              MwSt-Rechnung vorhanden
                            </span>
                          ) : null}
                          {item.exemptInvoice ? (
                            <div className="flex items-center gap-1">
                              <Link
                                href={`/invoices/${item.exemptInvoice.id}`}
                                className="text-primary hover:underline text-sm"
                              >
                                {item.exemptInvoice.invoiceNumber}
                              </Link>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() =>
                                  window.open(
                                    `/api/invoices/${item.exemptInvoice!.id}/pdf`,
                                    "_blank"
                                  )
                                }
                                title="PDF herunterladen"
                              >
                                <Download className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : item.exemptInvoiceId ? (
                            <span className="text-sm text-muted-foreground">
                              Steuerfreie Rechnung vorhanden
                            </span>
                          ) : null}
                          {!item.vatInvoiceId && !item.exemptInvoiceId && (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-bold">Gesamt</TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell className="text-right font-mono font-bold">
                      {formatCurrency(
                        items.reduce(
                          (sum: number, item: ParkCostAllocationItemResponse) =>
                            sum +
                            Number(item.taxableAmountEur) +
                            Number(item.taxableVatEur),
                          0
                        )
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold">
                      {formatCurrency(
                        items.reduce(
                          (sum: number, item: ParkCostAllocationItemResponse) =>
                            sum + Number(item.exemptAmountEur),
                          0
                        )
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold">
                      {formatCurrency(
                        items.reduce(
                          (sum: number, item: ParkCostAllocationItemResponse) =>
                            sum + Number(item.directSettlementEur),
                          0
                        )
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold">
                      {formatCurrency(
                        items.reduce(
                          (sum: number, item: ParkCostAllocationItemResponse) =>
                            sum + Number(item.netPayableEur),
                          0
                        )
                      )}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        // Empty Items State
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">
              Noch keine Aufteilungspositionen
            </h3>
            <p className="text-muted-foreground">
              Die Kostenaufteilung enthaelt noch keine Positionen.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {allocation.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Notizen</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-line">{allocation.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
