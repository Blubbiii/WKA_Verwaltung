"use client";

import { useState, use, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { toast } from "sonner";
import {
  ArrowLeft,
  Calculator,
  FileText,
  Send,
  Loader2,
  ExternalLink,
  Euro,
  Percent,
  Shield,
  Scale,
  Trash2,
  Layers,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import {
  SETTLEMENT_STATUS_LABELS,
  ALLOCATION_STATUS_LABELS,
  type LeaseRevenueSettlementResponse,
  type LeaseRevenueSettlementItemResponse,
  type ParkCostAllocationResponse,
} from "@/types/billing";

// =============================================================================
// SWR FETCHER
// =============================================================================

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
    throw new Error(error.error || "Fehler beim Laden");
  }
  return res.json();
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getStatusColor(status: string): string {
  switch (status) {
    case "OPEN":
      return "bg-gray-100 text-gray-800 border-gray-200";
    case "ADVANCE_CREATED":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "CALCULATED":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "SETTLED":
      return "bg-green-100 text-green-800 border-green-200";
    case "CLOSED":
      return "bg-slate-100 text-slate-800 border-slate-200";
    case "CANCELLED":
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "";
  }
}

function getAllocationStatusColor(status: string): string {
  switch (status) {
    case "DRAFT":
      return "bg-gray-100 text-gray-800 border-gray-200";
    case "INVOICED":
      return "bg-green-100 text-green-800 border-green-200";
    case "CLOSED":
      return "bg-slate-100 text-slate-800 border-slate-200";
    default:
      return "";
  }
}

function formatPercent(pct: number | null | undefined): string {
  if (pct == null) return "-";
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(pct);
}

function formatArea(sqm: number | null | undefined): string {
  if (sqm == null) return "-";
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(sqm);
}

function getLessorName(
  person: {
    firstName: string | null;
    lastName: string | null;
    companyName: string | null;
  } | null
): string {
  if (!person) return "-";
  if (person.companyName) return person.companyName;
  const parts = [person.firstName, person.lastName].filter(Boolean);
  return parts.join(" ") || "-";
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function UsageFeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------
  const {
    data: settlement,
    isLoading,
    error,
    mutate,
  } = useSWR<LeaseRevenueSettlementResponse>(
    `/api/leases/usage-fees/${id}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const isError = !!error;

  // ---------------------------------------------------------------------------
  // Action State
  // ---------------------------------------------------------------------------
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // ---------------------------------------------------------------------------
  // Computed Values
  // ---------------------------------------------------------------------------
  const items: LeaseRevenueSettlementItemResponse[] = settlement?.items || [];
  const costAllocations: ParkCostAllocationResponse[] =
    settlement?.costAllocations || [];

  // Calculate totals from items
  const totals = useMemo(() => {
    if (!items.length) {
      return {
        poolFeeEur: 0,
        standortFeeEur: 0,
        sealedAreaFeeEur: 0,
        roadUsageFeeEur: 0,
        cableFeeEur: 0,
        subtotalEur: 0,
        advancePaidEur: 0,
        remainderEur: 0,
      };
    }
    return items.reduce(
      (acc, item) => ({
        poolFeeEur: acc.poolFeeEur + Number(item.poolFeeEur || 0),
        standortFeeEur: acc.standortFeeEur + Number(item.standortFeeEur || 0),
        sealedAreaFeeEur:
          acc.sealedAreaFeeEur + Number(item.sealedAreaFeeEur || 0),
        roadUsageFeeEur:
          acc.roadUsageFeeEur + Number(item.roadUsageFeeEur || 0),
        cableFeeEur: acc.cableFeeEur + Number(item.cableFeeEur || 0),
        subtotalEur: acc.subtotalEur + Number(item.subtotalEur || 0),
        advancePaidEur: acc.advancePaidEur + Number(item.advancePaidEur || 0),
        remainderEur: acc.remainderEur + Number(item.remainderEur || 0),
      }),
      {
        poolFeeEur: 0,
        standortFeeEur: 0,
        sealedAreaFeeEur: 0,
        roadUsageFeeEur: 0,
        cableFeeEur: 0,
        subtotalEur: 0,
        advancePaidEur: 0,
        remainderEur: 0,
      }
    );
  }, [items]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function handleCalculate() {
    try {
      setActionLoading("calculate");
      const res = await fetch(`/api/leases/usage-fees/${id}/calculate`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(err.error || "Fehler bei der Berechnung");
      }
      toast.success("Nutzungsentgelt wurde erfolgreich berechnet");
      mutate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler bei der Berechnung"
      );
    } finally {
      setActionLoading(null);
    }
  }

  async function handleAdvance() {
    try {
      setActionLoading("advance");
      const res = await fetch(`/api/leases/usage-fees/${id}/advance`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(err.error || "Fehler beim Erstellen der Vorschuss-Gutschriften");
      }
      toast.success("Vorschuss-Gutschriften wurden erfolgreich erstellt");
      mutate();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Erstellen der Vorschuss-Gutschriften"
      );
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSettle() {
    try {
      setActionLoading("settle");
      const res = await fetch(`/api/leases/usage-fees/${id}/settle`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(err.error || "Fehler beim Erstellen der Endabrechnung");
      }
      toast.success("Endabrechnung wurde erfolgreich erstellt");
      mutate();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Erstellen der Endabrechnung"
      );
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete() {
    try {
      const res = await fetch(`/api/leases/usage-fees/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(err.error || "Fehler beim Loeschen");
      }
      toast.success("Abrechnung wurde geloescht");
      router.push("/leases/usage-fees");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Loeschen"
      );
    }
  }

  async function handleClose() {
    try {
      setActionLoading("close");
      const res = await fetch(`/api/leases/usage-fees/${id}/close`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(err.error || "Fehler beim Abschliessen");
      }
      toast.success("Abrechnung wurde erfolgreich abgeschlossen");
      mutate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Abschliessen"
      );
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCancel() {
    if (!cancelReason.trim()) {
      toast.error("Bitte geben Sie einen Stornogrund an");
      return;
    }
    try {
      setActionLoading("cancel");
      const res = await fetch(`/api/leases/usage-fees/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(err.error || "Fehler beim Stornieren");
      }
      toast.success("Abrechnung wurde erfolgreich storniert");
      setShowCancelDialog(false);
      setCancelReason("");
      mutate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Stornieren"
      );
    } finally {
      setActionLoading(null);
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
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error / Not Found
  // ---------------------------------------------------------------------------

  if (isError || !settlement) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/leases/usage-fees">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Abrechnung nicht gefunden</h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Die angeforderte Nutzungsentgelt-Abrechnung konnte nicht geladen
            werden.
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------
  const title = `Nutzungsentgelt WP ${settlement.park?.name || ""} ${settlement.year}`;
  const modelLabel = settlement.usedMinimum
    ? "Mindestpacht"
    : "Erloesabhaengig";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/leases/usage-fees">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{title}</h1>
              <Badge
                variant="secondary"
                className={getStatusColor(settlement.status)}
              >
                {SETTLEMENT_STATUS_LABELS[settlement.status] ||
                  settlement.status}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {settlement.park?.name || "-"} - Abrechnungsjahr{" "}
              {settlement.year}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 flex-wrap">
          {settlement.status === "OPEN" && (
            <>
              <Button
                onClick={handleCalculate}
                disabled={!!actionLoading}
              >
                {actionLoading === "calculate" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Calculator className="mr-2 h-4 w-4" />
                )}
                Berechnung starten
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
                disabled={!!actionLoading}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Loeschen
              </Button>
            </>
          )}

          {settlement.status === "CALCULATED" && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCalculate}
                disabled={!!actionLoading}
              >
                {actionLoading === "calculate" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Calculator className="mr-2 h-4 w-4" />
                )}
                Neu berechnen
              </Button>
              <Button
                variant="outline"
                onClick={handleAdvance}
                disabled={!!actionLoading}
              >
                {actionLoading === "advance" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Vorschuss-Gutschriften erzeugen
              </Button>
              <Button
                onClick={handleSettle}
                disabled={!!actionLoading}
              >
                {actionLoading === "settle" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-2 h-4 w-4" />
                )}
                Endabrechnung erstellen
              </Button>
            </>
          )}

          {settlement.status === "ADVANCE_CREATED" && (
            <Button
              onClick={handleSettle}
              disabled={!!actionLoading}
            >
              {actionLoading === "settle" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              Endabrechnung erstellen
            </Button>
          )}

          {settlement.status === "SETTLED" && (
            <>
              <Button variant="outline" asChild>
                <Link href={`/leases/usage-fees/${id}/cost-allocation`}>
                  <Layers className="mr-2 h-4 w-4" />
                  Kostenaufteilung erstellen
                </Link>
              </Button>
              <Button
                variant="secondary"
                onClick={handleClose}
                disabled={!!actionLoading}
              >
                {actionLoading === "close" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="mr-2 h-4 w-4" />
                )}
                Abrechnung abschliessen
              </Button>
            </>
          )}

          {/* Stornieren - available for all statuses except OPEN and CANCELLED */}
          {settlement.status !== "OPEN" && settlement.status !== "CANCELLED" && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowCancelDialog(true)}
              disabled={!!actionLoading}
            >
              {actionLoading === "cancel" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Stornieren
            </Button>
          )}

          {/* Cancelled info */}
          {settlement.status === "CANCELLED" && (
            <Badge variant="destructive" className="text-sm px-3 py-1">
              Diese Abrechnung wurde storniert
            </Badge>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Jahreserloese
            </CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(Number(settlement.totalParkRevenueEur || 0))}
            </div>
            <p className="text-xs text-muted-foreground">
              Parkerloese {settlement.year}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Berechnet ({formatPercent(Number(settlement.revenueSharePercent || 0))}%)
            </CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {settlement.status === "OPEN"
                ? "-"
                : formatCurrency(Number(settlement.calculatedFeeEur || 0))}
            </div>
            <p className="text-xs text-muted-foreground">
              Erloesabhaengiger Anteil
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Minimum</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {settlement.status === "OPEN"
                ? "-"
                : formatCurrency(
                    Number(settlement.minimumGuaranteeEur || 0)
                  )}
            </div>
            <p className="text-xs text-muted-foreground">
              Mindestpachtgarantie
            </p>
          </CardContent>
        </Card>

        <Card
          className={
            settlement.usedMinimum && settlement.status !== "OPEN"
              ? "border-amber-300 bg-amber-50/50"
              : ""
          }
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Tatsaechlich
            </CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {settlement.status === "OPEN"
                ? "-"
                : formatCurrency(Number(settlement.actualFeeEur || 0))}
            </div>
            <p className="text-xs text-muted-foreground">
              {settlement.status !== "OPEN" && settlement.usedMinimum
                ? "Mindestpacht greift"
                : "Auszuzahlender Betrag"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Modell</CardTitle>
            <Scale className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {settlement.status === "OPEN" ? "-" : modelLabel}
            </div>
            <p className="text-xs text-muted-foreground">
              Verwendetes Berechnungsmodell
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Positionen & Kostenaufteilungen */}
      <Tabs defaultValue="positions">
        <TabsList>
          <TabsTrigger value="positions">
            Eigentuemer-Positionen ({items.length})
          </TabsTrigger>
          <TabsTrigger value="allocations">
            Kostenaufteilungen ({costAllocations.length})
          </TabsTrigger>
        </TabsList>

        {/* Positions Tab */}
        <TabsContent value="positions">
          {items.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Aufstellung nach Eigentuemer</CardTitle>
                <CardDescription>
                  {items.length} Eigentuemer-Position(en) -{" "}
                  {SETTLEMENT_STATUS_LABELS[settlement.status] ||
                    settlement.status}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Eigentuemer</TableHead>
                        <TableHead className="text-right">
                          Pool-Anteil (%)
                        </TableHead>
                        <TableHead className="text-right">
                          Standort
                        </TableHead>
                        <TableHead className="text-right">
                          Versiegelt
                        </TableHead>
                        <TableHead className="text-right">Wege</TableHead>
                        <TableHead className="text-right">Kabel</TableHead>
                        <TableHead className="text-right">Gesamt</TableHead>
                        <TableHead className="text-right">
                          Vorschuss
                        </TableHead>
                        <TableHead className="text-right">Rest</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">
                            {getLessorName(item.lessorPerson)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatPercent(
                              Number(item.poolAreaSharePercent || 0)
                            )}
                            %
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(Number(item.standortFeeEur || 0))}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(
                              Number(item.sealedAreaFeeEur || 0)
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(
                              Number(item.roadUsageFeeEur || 0)
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(Number(item.cableFeeEur || 0))}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            {formatCurrency(Number(item.subtotalEur || 0))}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(
                              Number(item.advancePaidEur || 0)
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            {formatCurrency(Number(item.remainderEur || 0))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-bold">Summe</TableCell>
                        <TableCell className="text-right font-mono">
                          -
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          {formatCurrency(totals.standortFeeEur)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          {formatCurrency(totals.sealedAreaFeeEur)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          {formatCurrency(totals.roadUsageFeeEur)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          {formatCurrency(totals.cableFeeEur)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          {formatCurrency(totals.subtotalEur)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          {formatCurrency(totals.advancePaidEur)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          {formatCurrency(totals.remainderEur)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>

                {/* Invoice Links */}
                {items.some(
                  (item) => item.advanceInvoice || item.settlementInvoice
                ) && (
                  <>
                    <Separator className="my-6" />
                    <div>
                      <h4 className="text-sm font-medium mb-3">
                        Verknuepfte Rechnungen
                      </h4>
                      <div className="space-y-2">
                        {items.map((item) => {
                          const invoices = [];
                          if (item.advanceInvoice) {
                            invoices.push({
                              type: "Vorschuss",
                              invoice: item.advanceInvoice,
                            });
                          }
                          if (item.settlementInvoice) {
                            invoices.push({
                              type: "Endabrechnung",
                              invoice: item.settlementInvoice,
                            });
                          }
                          if (invoices.length === 0) return null;

                          return (
                            <div
                              key={item.id}
                              className="flex items-center justify-between text-sm border rounded-md px-3 py-2"
                            >
                              <span className="text-muted-foreground">
                                {getLessorName(item.lessorPerson)}
                              </span>
                              <div className="flex items-center gap-3">
                                {invoices.map(({ type, invoice }) => (
                                  <div key={invoice.id} className="flex items-center gap-2">
                                    <Link
                                      href={`/invoices/${invoice.id}`}
                                      className="flex items-center gap-1 text-primary hover:underline"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                      {type}: {invoice.invoiceNumber}
                                    </Link>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        window.open(`/api/invoices/${invoice.id}/pdf`, '_blank');
                                      }}
                                      title="PDF herunterladen"
                                    >
                                      <Download className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ) : settlement.status === "OPEN" ? (
            // Empty state for OPEN settlement
            <Card>
              <CardContent className="py-12 text-center">
                <Calculator className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">
                  Noch keine Abrechnungspositionen
                </h3>
                <p className="text-muted-foreground mb-4">
                  Klicken Sie auf &quot;Berechnung starten&quot;, um das
                  Nutzungsentgelt auf Basis der Parkerloese und Pachtvertraege
                  zu berechnen.
                </p>
                <Button
                  onClick={handleCalculate}
                  disabled={!!actionLoading}
                >
                  {actionLoading === "calculate" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Calculator className="mr-2 h-4 w-4" />
                  )}
                  Jetzt berechnen
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Keine Abrechnungspositionen vorhanden.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Cost Allocations Tab */}
        <TabsContent value="allocations">
          {costAllocations.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Kostenaufteilungen</CardTitle>
                <CardDescription>
                  Aufteilung der Nutzungsentgelte auf die
                  Betreibergesellschaften
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {costAllocations.map((allocation) => (
                    <div key={allocation.id} className="border rounded-md p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <h4 className="font-medium">
                            {allocation.periodLabel ||
                              `Kostenaufteilung #${allocation.id.substring(0, 8)}`}
                          </h4>
                          <Badge
                            variant="secondary"
                            className={getAllocationStatusColor(
                              allocation.status
                            )}
                          >
                            {ALLOCATION_STATUS_LABELS[
                              allocation.status as keyof typeof ALLOCATION_STATUS_LABELS
                            ] || allocation.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {formatCurrency(
                            Number(allocation.totalUsageFeeEur || 0)
                          )}
                        </div>
                      </div>

                      {allocation.items && allocation.items.length > 0 && (
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Gesellschaft</TableHead>
                                <TableHead className="text-right">
                                  Anteil (%)
                                </TableHead>
                                <TableHead className="text-right">
                                  Betrag
                                </TableHead>
                                <TableHead className="text-right">
                                  Netto zahlbar
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {allocation.items.map((allocItem) => (
                                <TableRow key={allocItem.id}>
                                  <TableCell className="font-medium">
                                    {allocItem.operatorFund?.name || "-"}
                                    {allocItem.operatorFund?.legalForm && (
                                      <span className="text-muted-foreground ml-1">
                                        ({allocItem.operatorFund.legalForm})
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right font-mono">
                                    {formatPercent(
                                      Number(
                                        allocItem.allocationSharePercent || 0
                                      )
                                    )}
                                    %
                                  </TableCell>
                                  <TableCell className="text-right font-mono">
                                    {formatCurrency(
                                      Number(
                                        allocItem.totalAllocatedEur || 0
                                      )
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right font-mono font-semibold">
                                    {formatCurrency(
                                      Number(allocItem.netPayableEur || 0)
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}

                      {allocation.notes && (
                        <p className="text-sm text-muted-foreground mt-2">
                          {allocation.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Layers className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">
                  Keine Kostenaufteilungen
                </h3>
                <p className="text-muted-foreground mb-4">
                  {settlement.status === "SETTLED"
                    ? "Erstellen Sie eine Kostenaufteilung, um die Nutzungsentgelte auf die Betreibergesellschaften aufzuteilen."
                    : "Kostenaufteilungen koennen erstellt werden, sobald die Abrechnung den Status 'Abgerechnet' hat."}
                </p>
                {settlement.status === "SETTLED" && (
                  <Button variant="outline" asChild>
                    <Link href={`/leases/usage-fees/${id}/cost-allocation`}>
                      <Layers className="mr-2 h-4 w-4" />
                      Kostenaufteilung erstellen
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleDelete}
        title="Abrechnung loeschen"
        itemName={title}
      />

      {/* Cancel/Storno Confirmation */}
      <Dialog open={showCancelDialog} onOpenChange={(open) => {
        setShowCancelDialog(open);
        if (!open) setCancelReason("");
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abrechnung stornieren</DialogTitle>
            <DialogDescription>
              Diese Aktion markiert die Abrechnung als storniert. Die Daten bleiben zur Nachvollziehbarkeit erhalten.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="cancel-reason">Stornogrund *</Label>
            <Textarea
              id="cancel-reason"
              placeholder="Bitte geben Sie den Grund fuer die Stornierung an..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="mt-2"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCancelDialog(false);
                setCancelReason("");
              }}
              disabled={actionLoading === "cancel"}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={actionLoading === "cancel" || !cancelReason.trim()}
            >
              {actionLoading === "cancel" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Stornieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
