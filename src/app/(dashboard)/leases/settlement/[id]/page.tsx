"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Calculator,
  Trash2,
  FileText,
  Lock,
  Send,
  CheckCircle,
  XCircle,
  Layers,
  Loader2,
  Euro,
  Percent,
  BarChart3,
  Info,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import {
  SETTLEMENT_STATUS_LABELS,
  PERIOD_TYPE_LABELS,
  ADVANCE_INTERVAL_LABELS,
  ALLOCATION_STATUS_LABELS,
  getSettlementPeriodLabel,
  type LeaseRevenueSettlementResponse,
  type LeaseRevenueSettlementItemResponse,
  type ParkCostAllocationResponse,
  type LeaseRevenueSettlementStatus,
  type ParkCostAllocationStatus,
} from "@/types/billing";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";

// =============================================================================
// STATUS BADGE HELPER (same colors as list page)
// =============================================================================

function getStatusBadgeClasses(status: string): string {
  switch (status) {
    case "OPEN":
      return "bg-gray-100 text-gray-700 border-gray-200";
    case "CALCULATED":
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "ADVANCE_CREATED":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "SETTLED":
      return "bg-green-100 text-green-700 border-green-200";
    case "PENDING_REVIEW":
      return "bg-purple-100 text-purple-700 border-purple-200";
    case "APPROVED":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "CLOSED":
      return "bg-slate-100 text-slate-700 border-slate-200";
    case "CANCELLED":
      return "bg-red-100 text-red-700 border-red-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

function getAllocationStatusBadgeClasses(status: string): string {
  switch (status) {
    case "DRAFT":
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "INVOICED":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "CLOSED":
      return "bg-slate-100 text-slate-700 border-slate-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

// =============================================================================
// HELPER: Format percentage
// =============================================================================

function formatPercent(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "-";
  return num.toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " %";
}

// =============================================================================
// HELPER: Format date
// =============================================================================

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// =============================================================================
// HELPER: Lessor display name
// =============================================================================

function getLessorName(person: {
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
}): string {
  return person.companyName || `${person.firstName} ${person.lastName}`;
}

// =============================================================================
// TYPES (extended API response)
// =============================================================================

interface SettlementDetailResponse extends LeaseRevenueSettlementResponse {
  periodType: string;
  advanceInterval: string | null;
  month: number | null;
  linkedEnergySettlementId: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  notes: string | null;
  createdById: string | null;
  createdBy?: { id: string; name: string | null } | null;
  reviewedBy?: { id: string; name: string | null } | null;
}

interface AdvanceListItem {
  id: string;
  periodType: string;
  advanceInterval: string | null;
  month: number | null;
  year: number;
  status: LeaseRevenueSettlementStatus;
  actualFeeEur: number;
  createdAt: string;
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function SettlementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const [settlement, setSettlement] = useState<SettlementDetailResponse | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Cancel dialog
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Advances tab
  const [advances, setAdvances] = useState<AdvanceListItem[]>([]);
  const [advancesLoading, setAdvancesLoading] = useState(false);

  // Delivery state
  const [deliveryLoading, setDeliveryLoading] = useState<string | null>(null);

  // Active tab
  const [activeTab, setActiveTab] = useState("positions");

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------
  const loadSettlement = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/leases/settlement/${id}`);
      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSettlement(data.settlement);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Fehler beim Laden der Abrechnung"
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadSettlement();
  }, [loadSettlement]);

  // Load advances when switching to the advances tab
  const loadAdvances = useCallback(async () => {
    if (!settlement || settlement.periodType !== "FINAL") return;
    setAdvancesLoading(true);
    try {
      const params = new URLSearchParams({
        parkId: settlement.parkId,
        year: settlement.year.toString(),
        periodType: "ADVANCE",
        limit: "50",
      });
      const res = await fetch(`/api/leases/settlement?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAdvances(data.data || []);
      }
    } catch {
      // Non-critical
    } finally {
      setAdvancesLoading(false);
    }
  }, [settlement]);

  useEffect(() => {
    if (activeTab === "advances" && settlement?.periodType === "FINAL") {
      loadAdvances();
    }
  }, [activeTab, loadAdvances, settlement?.periodType]);

  // ---------------------------------------------------------------------------
  // Action handlers
  // ---------------------------------------------------------------------------
  async function handleAction(
    actionKey: string,
    endpoint: string,
    method: string = "POST",
    body?: Record<string, unknown>
  ) {
    setActionLoading(actionKey);
    try {
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      toast.success("Aktion erfolgreich ausgeführt");
      await loadSettlement();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Fehler bei der Aktion"
      );
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete() {
    setActionLoading("delete");
    try {
      const res = await fetch(`/api/leases/settlement/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      toast.success("Abrechnung gelöscht");
      router.push("/leases/settlement");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Fehler beim Löschen"
      );
    } finally {
      setActionLoading(null);
      setDeleteDialogOpen(false);
    }
  }

  async function handleCancel() {
    setActionLoading("cancel");
    try {
      const res = await fetch(`/api/leases/settlement/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason }),
      });
      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      toast.success("Abrechnung storniert");
      setCancelDialogOpen(false);
      setCancelReason("");
      await loadSettlement();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Fehler beim Stornieren"
      );
    } finally {
      setActionLoading(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Delivery handlers
  // ---------------------------------------------------------------------------
  async function handleBatchDeliver(method: "print" | "email" | "both") {
    setDeliveryLoading(method);
    try {
      const res = await fetch(`/api/leases/settlement/${id}/deliver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const result = await res.json();
      const label = method === "print" ? "gedruckt" : method === "email" ? "gemailt" : "zugestellt";
      toast.success(`${result.delivered || 0} Gutschrift(en) ${label}`);
      if (result.errors?.length > 0) {
        toast.error(`${result.errors.length} Fehler: ${result.errors[0]}`);
      }
      await loadSettlement();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler bei der Zustellung");
    } finally {
      setDeliveryLoading(null);
    }
  }

  async function handleSinglePrint(invoiceId: string) {
    setDeliveryLoading(`print-${invoiceId}`);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/print`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Fehler beim Drucken" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      // Download the PDF
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition");
      const filename = disposition?.match(/filename="(.+)"/)?.[1] || "gutschrift.pdf";
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("PDF heruntergeladen");
      await loadSettlement();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Drucken");
    } finally {
      setDeliveryLoading(null);
    }
  }

  async function handleSingleEmail(invoiceId: string) {
    setDeliveryLoading(`email-${invoiceId}`);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Fehler beim Versenden" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const result = await res.json();
      toast.success(`E-Mail versendet an ${result.emailedTo || "Empfänger"}`);
      await loadSettlement();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim E-Mail-Versand");
    } finally {
      setDeliveryLoading(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-md" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        {/* KPI skeleton */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>
        {/* Table skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-48" />
          </CardHeader>
          <CardContent>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="mb-3 h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------
  if (error || !settlement) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link
              href="/leases/settlement"
              aria-label="Zurück zur Übersicht"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">
            Pachtabrechnung
          </h1>
        </div>
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center gap-4 text-center">
              <AlertTriangle className="h-10 w-10 text-destructive" />
              <div>
                <h3 className="text-lg font-semibold">Fehler beim Laden</h3>
                <p className="text-muted-foreground mt-1">
                  {error || "Abrechnung nicht gefunden"}
                </p>
              </div>
              <Button onClick={loadSettlement} variant="outline">
                <RefreshCw className="mr-2 h-4 w-4" />
                Erneut versuchen
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Computed values
  // ---------------------------------------------------------------------------
  const parkName = settlement.park?.name || "Unbekannter Park";
  const isFinal = settlement.periodType === "FINAL";
  const isAdvance = settlement.periodType === "ADVANCE";
  const status = settlement.status;
  const items: LeaseRevenueSettlementItemResponse[] = settlement.items || [];
  const costAllocations: ParkCostAllocationResponse[] =
    settlement.costAllocations || [];

  const periodTypeLabel = isFinal
    ? `Endabrechnung \u2014 Abrechnungsjahr ${settlement.year}`
    : isAdvance
      ? `${ADVANCE_INTERVAL_LABELS[settlement.advanceInterval || ""] || "Vorschuss"} \u2014 ${settlement.year}`
      : `${settlement.year}`;

  // Model label
  const modelLabel = isAdvance
    ? "Vorschuss"
    : settlement.usedMinimum
      ? "Mindestpacht"
      : "Umsatzbeteiligung";

  // Item totals
  const itemTotals = items.reduce(
    (acc, item) => ({
      poolAreaSharePercent:
        acc.poolAreaSharePercent + Number(item.poolAreaSharePercent || 0),
      standortFeeEur:
        acc.standortFeeEur + Number(item.standortFeeEur || 0),
      sealedAreaFeeEur:
        acc.sealedAreaFeeEur + Number(item.sealedAreaFeeEur || 0),
      roadUsageFeeEur:
        acc.roadUsageFeeEur + Number(item.roadUsageFeeEur || 0),
      cableFeeEur: acc.cableFeeEur + Number(item.cableFeeEur || 0),
      subtotalEur: acc.subtotalEur + Number(item.subtotalEur || 0),
      advancePaidEur:
        acc.advancePaidEur + Number(item.advancePaidEur || 0),
      remainderEur: acc.remainderEur + Number(item.remainderEur || 0),
    }),
    {
      poolAreaSharePercent: 0,
      standortFeeEur: 0,
      sealedAreaFeeEur: 0,
      roadUsageFeeEur: 0,
      cableFeeEur: 0,
      subtotalEur: 0,
      advancePaidEur: 0,
      remainderEur: 0,
    }
  );

  // Advance totals
  const advanceTotalPaid = advances.reduce(
    (sum, a) => sum + Number(a.actualFeeEur || 0),
    0
  );

  // ---------------------------------------------------------------------------
  // Action buttons based on status
  // ---------------------------------------------------------------------------
  function renderActionButtons() {
    const buttons: React.ReactNode[] = [];

    switch (status) {
      case "OPEN":
        buttons.push(
          <Button
            key="calculate"
            onClick={() =>
              handleAction(
                "calculate",
                `/api/leases/settlement/${id}/calculate`
              )
            }
            disabled={actionLoading === "calculate"}
          >
            {actionLoading === "calculate" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Calculator className="mr-2 h-4 w-4" />
            )}
            Berechnung starten
          </Button>
        );
        buttons.push(
          <Button
            key="delete"
            variant="destructive"
            onClick={() => setDeleteDialogOpen(true)}
            disabled={!!actionLoading}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Löschen
          </Button>
        );
        break;

      case "CALCULATED":
        buttons.push(
          <Button
            key="recalculate"
            variant="ghost"
            onClick={() =>
              handleAction(
                "recalculate",
                `/api/leases/settlement/${id}/calculate`
              )
            }
            disabled={actionLoading === "recalculate"}
          >
            {actionLoading === "recalculate" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Neu berechnen
          </Button>
        );
        buttons.push(
          <Button
            key="invoices"
            onClick={() =>
              handleAction(
                "invoices",
                `/api/leases/settlement/${id}/invoices`
              )
            }
            disabled={actionLoading === "invoices"}
          >
            {actionLoading === "invoices" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            Gutschriften erzeugen
          </Button>
        );
        break;

      case "SETTLED":
        buttons.push(
          <Button
            key="submit-review"
            onClick={() =>
              handleAction(
                "submit-review",
                `/api/leases/settlement/${id}/review`,
                "POST",
                { action: "submit" }
              )
            }
            disabled={actionLoading === "submit-review"}
          >
            {actionLoading === "submit-review" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Zur Prüfung vorlegen
          </Button>
        );
        break;

      case "PENDING_REVIEW":
        buttons.push(
          <Button
            key="approve"
            onClick={() =>
              handleAction(
                "approve",
                `/api/leases/settlement/${id}/review`,
                "POST",
                { action: "approve" }
              )
            }
            disabled={actionLoading === "approve"}
          >
            {actionLoading === "approve" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="mr-2 h-4 w-4" />
            )}
            Freigeben
          </Button>
        );
        buttons.push(
          <Button
            key="reject"
            variant="outline"
            onClick={() =>
              handleAction(
                "reject",
                `/api/leases/settlement/${id}/review`,
                "POST",
                { action: "reject" }
              )
            }
            disabled={actionLoading === "reject"}
          >
            {actionLoading === "reject" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="mr-2 h-4 w-4" />
            )}
            Zurückweisen
          </Button>
        );
        break;

      case "APPROVED":
        buttons.push(
          <Button
            key="close"
            onClick={() =>
              handleAction(
                "close",
                `/api/leases/settlement/${id}/close`
              )
            }
            disabled={actionLoading === "close"}
          >
            {actionLoading === "close" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Lock className="mr-2 h-4 w-4" />
            )}
            Abschliessen
          </Button>
        );
        break;

      case "CLOSED":
        // No actions
        break;

      case "CANCELLED":
        // Show cancelled info instead of actions
        break;
    }

    // Add cancel button for non-OPEN, non-CANCELLED, non-CLOSED statuses
    if (
      status !== "OPEN" &&
      status !== "CANCELLED" &&
      status !== "CLOSED"
    ) {
      buttons.push(
        <Button
          key="cancel-settlement"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={() => setCancelDialogOpen(true)}
          disabled={!!actionLoading}
        >
          <XCircle className="mr-2 h-4 w-4" />
          Stornieren
        </Button>
      );
    }

    return buttons;
  }

  // ---------------------------------------------------------------------------
  // Tab: Eigentuemer-Positionen
  // ---------------------------------------------------------------------------
  function renderPositionsTab() {
    if (status === "OPEN" && items.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-primary/10 p-5 mb-5">
            <Calculator className="h-10 w-10 text-primary/60" />
          </div>
          <h3 className="text-lg font-semibold">
            Noch keine Positionen vorhanden
          </h3>
          <p className="text-muted-foreground mt-2 max-w-sm">
            Starten Sie die Berechnung, um die Eigentuemer-Positionen zu
            erzeugen.
          </p>
          <Button
            className="mt-6"
            onClick={() =>
              handleAction(
                "calculate",
                `/api/leases/settlement/${id}/calculate`
              )
            }
            disabled={actionLoading === "calculate"}
          >
            {actionLoading === "calculate" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Calculator className="mr-2 h-4 w-4" />
            )}
            Berechnung starten
          </Button>
        </div>
      );
    }

    if (items.length === 0) {
      return (
        <div className="py-8 text-center text-muted-foreground">
          Keine Positionen vorhanden.
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Eigentuemer</TableHead>
              <TableHead className="text-right">Pool-Anteil (%)</TableHead>
              <TableHead className="text-right">Standort</TableHead>
              <TableHead className="text-right">Versiegelt</TableHead>
              <TableHead className="text-right">Wege</TableHead>
              <TableHead className="text-right">Kabel</TableHead>
              <TableHead className="text-right font-semibold">
                Gesamt
              </TableHead>
              {isFinal && (
                <>
                  <TableHead className="text-right">Vorschuss</TableHead>
                  <TableHead className="text-right font-semibold">
                    Rest
                  </TableHead>
                </>
              )}
              <TableHead>Gutschrift</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">
                  {getLessorName(item.lessorPerson)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatPercent(item.poolAreaSharePercent)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(item.standortFeeEur)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(item.sealedAreaFeeEur)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(item.roadUsageFeeEur)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(item.cableFeeEur)}
                </TableCell>
                <TableCell className="text-right font-mono font-semibold">
                  {formatCurrency(item.subtotalEur)}
                </TableCell>
                {isFinal && (
                  <>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(item.advancePaidEur)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono font-semibold ${
                        Number(item.remainderEur) < 0 ? "text-red-600" : ""
                      }`}
                    >
                      {formatCurrency(item.remainderEur)}
                    </TableCell>
                  </>
                )}
                <TableCell>
                  {(() => {
                    const inv = isFinal ? item.settlementInvoice : item.advanceInvoice;
                    if (!inv) return <span className="text-muted-foreground">-</span>;
                    return (
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="text-primary underline hover:no-underline text-sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {inv.invoiceNumber}
                      </Link>
                    );
                  })()}
                </TableCell>
              </TableRow>
            ))}
            {/* Footer totals row */}
            <TableRow className="border-t-2 font-bold bg-muted/30">
              <TableCell>Gesamt ({items.length} Positionen)</TableCell>
              <TableCell className="text-right font-mono">
                {formatPercent(itemTotals.poolAreaSharePercent)}
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatCurrency(itemTotals.standortFeeEur)}
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatCurrency(itemTotals.sealedAreaFeeEur)}
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatCurrency(itemTotals.roadUsageFeeEur)}
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatCurrency(itemTotals.cableFeeEur)}
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatCurrency(itemTotals.subtotalEur)}
              </TableCell>
              {isFinal && (
                <>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(itemTotals.advancePaidEur)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(itemTotals.remainderEur)}
                  </TableCell>
                </>
              )}
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>

        {/* Delivery section below table */}
        {renderDeliverySection()}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Gutschriften-Zustellung
  // ---------------------------------------------------------------------------

  function renderDeliverySection() {
    // Collect all invoices from items
    const invoices = items
      .map((item) => {
        const inv = isFinal ? item.settlementInvoice : item.advanceInvoice;
        if (!inv) return null;
        return {
          ...inv,
          lessorName: getLessorName(item.lessorPerson),
        };
      })
      .filter(Boolean) as Array<{
        id: string;
        invoiceNumber: string;
        status: string;
        grossAmount?: number;
        printedAt?: string | null;
        emailedAt?: string | null;
        emailedTo?: string | null;
        lessorName: string;
      }>;

    if (invoices.length === 0) return null;

    const printedCount = invoices.filter((i) => i.printedAt).length;
    const emailedCount = invoices.filter((i) => i.emailedAt).length;

    return (
      <Card className="mt-6">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="h-4 w-4" />
                Gutschriften zustellen
              </CardTitle>
              <CardDescription>
                {printedCount} von {invoices.length} gedruckt, {emailedCount} von {invoices.length} per E-Mail versendet
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBatchDeliver("print")}
                disabled={deliveryLoading !== null}
              >
                {deliveryLoading === "print" ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : (
                  <FileText className="mr-2 h-3 w-3" />
                )}
                Alle drucken
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBatchDeliver("email")}
                disabled={deliveryLoading !== null}
              >
                {deliveryLoading === "email" ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : (
                  <Send className="mr-2 h-3 w-3" />
                )}
                Alle mailen
              </Button>
              <Button
                size="sm"
                onClick={() => handleBatchDeliver("both")}
                disabled={deliveryLoading !== null}
              >
                {deliveryLoading === "both" ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : (
                  <Send className="mr-2 h-3 w-3" />
                )}
                Alle zustellen
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gutschrift-Nr.</TableHead>
                <TableHead>Empfänger</TableHead>
                <TableHead className="text-right">Betrag</TableHead>
                <TableHead className="text-center">Gedruckt</TableHead>
                <TableHead className="text-center">Gemailt</TableHead>
                <TableHead>Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell>
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="text-primary underline hover:no-underline"
                    >
                      {inv.invoiceNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{inv.lessorName}</TableCell>
                  <TableCell className="text-right font-mono">
                    {inv.grossAmount ? formatCurrency(Number(inv.grossAmount)) : "-"}
                  </TableCell>
                  <TableCell className="text-center">
                    {inv.printedAt ? (
                      <span className="text-green-600" title={new Date(inv.printedAt).toLocaleString("de-DE")}>
                        <CheckCircle className="h-4 w-4 inline" />
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {inv.emailedAt ? (
                      <span className="text-green-600" title={`${new Date(inv.emailedAt).toLocaleString("de-DE")} an ${inv.emailedTo || "?"}`}>
                        <CheckCircle className="h-4 w-4 inline" />
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSinglePrint(inv.id)}
                        disabled={deliveryLoading !== null}
                        title="Drucken"
                      >
                        {deliveryLoading === `print-${inv.id}` ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <FileText className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSingleEmail(inv.id)}
                        disabled={deliveryLoading !== null}
                        title="Per E-Mail senden"
                      >
                        {deliveryLoading === `email-${inv.id}` ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Send className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }

  // ---------------------------------------------------------------------------
  // Tab: Kostenumlage
  // ---------------------------------------------------------------------------
  function renderCostAllocationTab() {
    if (!isFinal) {
      return (
        <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
          <Info className="h-5 w-5 text-muted-foreground shrink-0" />
          <p className="text-sm text-muted-foreground">
            Kostenumlagen sind nur für Endabrechnungen verfügbar.
          </p>
        </div>
      );
    }

    if (costAllocations.length > 0) {
      return (
        <div className="space-y-6">
          {costAllocations.map((allocation) => (
            <Card key={allocation.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    Kostenumlage
                    {allocation.periodLabel
                      ? ` - ${allocation.periodLabel}`
                      : ""}
                  </CardTitle>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="secondary"
                      className={getAllocationStatusBadgeClasses(
                        allocation.status
                      )}
                    >
                      {ALLOCATION_STATUS_LABELS[
                        allocation.status as ParkCostAllocationStatus
                      ] || allocation.status}
                    </Badge>
                    <span className="text-sm font-medium">
                      {formatCurrency(allocation.totalUsageFeeEur)}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {allocation.items && allocation.items.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Gesellschaft</TableHead>
                          <TableHead className="text-right">
                            Anteil (%)
                          </TableHead>
                          <TableHead className="text-right">Betrag</TableHead>
                          <TableHead className="text-right">
                            Netto zahlbar
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allocation.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">
                              {item.operatorFund.name}
                              {item.operatorFund.legalForm
                                ? ` ${item.operatorFund.legalForm}`
                                : ""}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatPercent(item.allocationSharePercent)}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatCurrency(item.totalAllocatedEur)}
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold">
                              {formatCurrency(item.netPayableEur)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Keine Positionen in dieser Kostenumlage.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      );
    }

    return (
      <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
        <Info className="h-5 w-5 text-muted-foreground shrink-0" />
        <p className="text-sm text-muted-foreground">
          Die Kostenaufteilung wird automatisch beim Erzeugen der Gutschriften erstellt.
        </p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Tab: Vorschüsse
  // ---------------------------------------------------------------------------
  function renderAdvancesTab() {
    if (!settlement) return null;
    if (!isFinal) {
      return (
        <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
          <Info className="h-5 w-5 text-muted-foreground shrink-0" />
          <p className="text-sm text-muted-foreground">
            Vorschuss-Übersicht ist nur für Endabrechnungen verfügbar.
          </p>
        </div>
      );
    }

    if (advancesLoading) {
      return (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      );
    }

    if (advances.length === 0) {
      return (
        <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
          <Info className="h-5 w-5 text-muted-foreground shrink-0" />
          <p className="text-sm text-muted-foreground">
            Keine Vorschussabrechnungen für {parkName} im Jahr{" "}
            {settlement.year} gefunden.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Periode</TableHead>
                <TableHead>Intervall</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Betrag</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {advances.map((advance) => (
                <TableRow
                  key={advance.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() =>
                    router.push(`/leases/settlement/${advance.id}`)
                  }
                >
                  <TableCell className="font-medium">
                    {getSettlementPeriodLabel(
                      advance.periodType,
                      advance.advanceInterval,
                      advance.month,
                      advance.year
                    )}
                  </TableCell>
                  <TableCell>
                    {ADVANCE_INTERVAL_LABELS[advance.advanceInterval || ""] ||
                      "-"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={getStatusBadgeClasses(advance.status)}
                    >
                      {SETTLEMENT_STATUS_LABELS[advance.status] ||
                        advance.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(advance.actualFeeEur)}
                  </TableCell>
                </TableRow>
              ))}
              {/* Summary row */}
              <TableRow className="border-t-2 font-bold bg-muted/30">
                <TableCell colSpan={3}>
                  Gezahlte Vorschüsse gesamt
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(advanceTotalPaid)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Tab: Details
  // ---------------------------------------------------------------------------
  function renderDetailsTab() {
    if (!settlement) return null;
    const calcDetails = settlement.calculationDetails as Record<
      string,
      unknown
    > | null;

    return (
      <div className="grid gap-6 md:grid-cols-2">
        {/* Allgemein */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Allgemein</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Erstellt am</span>
              <span>{formatDateTime(settlement.createdAt)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Erstellt von</span>
              <span>{settlement.createdBy?.name || "-"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Berechnet am</span>
              <span>
                {calcDetails?.calculatedAt
                  ? formatDateTime(calcDetails.calculatedAt as string)
                  : "-"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Zuletzt aktualisiert</span>
              <span>{formatDateTime(settlement.updatedAt)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Fälligkeiten */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Fälligkeiten</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                Vorschuss-Fälligkeit
              </span>
              <span>{formatDate(settlement.advanceDueDate)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                Abrechnungs-Fälligkeit
              </span>
              <span>{formatDate(settlement.settlementDueDate)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Verknuepfungen */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Verknuepfungen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                Verknuepfte Energieabrechnung
              </span>
              <span>
                {settlement.linkedEnergySettlementId ? (
                  <Link
                    href={`/energy/settlements/${settlement.linkedEnergySettlementId}`}
                    className="text-primary underline hover:no-underline"
                  >
                    Anzeigen
                  </Link>
                ) : (
                  "-"
                )}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Periodentyp</span>
              <span>
                {PERIOD_TYPE_LABELS[settlement.periodType] ||
                  settlement.periodType}
              </span>
            </div>
            {isAdvance && settlement.advanceInterval && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Intervall</span>
                <span>
                  {ADVANCE_INTERVAL_LABELS[settlement.advanceInterval] ||
                    settlement.advanceInterval}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Prüfung & Freigabe */}
        {(status === "PENDING_REVIEW" ||
          status === "APPROVED" ||
          status === "CLOSED") && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Prüfung & Freigabe
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Geprüft von</span>
                <span>{settlement.reviewedBy?.name || "-"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Geprüft am</span>
                <span>{formatDateTime(settlement.reviewedAt)}</span>
              </div>
              {settlement.reviewNotes && (
                <div className="text-sm">
                  <span className="text-muted-foreground block mb-1">
                    Prüfungsnotizen
                  </span>
                  <p className="p-2 bg-muted/50 rounded text-sm">
                    {settlement.reviewNotes}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Notizen */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Notizen</CardTitle>
          </CardHeader>
          <CardContent>
            {settlement.notes ? (
              <p className="text-sm whitespace-pre-wrap">{settlement.notes}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Keine Notizen vorhanden.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" asChild className="mt-1">
            <Link
              href="/leases/settlement"
              aria-label="Zurück zur Übersicht"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Pachtabrechnung {parkName} {settlement.year}
              </h1>
              <Badge
                variant="secondary"
                className={getStatusBadgeClasses(status)}
              >
                {SETTLEMENT_STATUS_LABELS[
                  status as LeaseRevenueSettlementStatus
                ] || status}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">{periodTypeLabel}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {status === "CANCELLED" && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-md">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span className="text-sm text-red-700">
                Diese Abrechnung wurde storniert
              </span>
            </div>
          )}
          {renderActionButtons()}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        {/* 1. Jahreserlöse */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Jahreserlöse
            </CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isAdvance
                ? "-"
                : formatCurrency(settlement.totalParkRevenueEur)}
            </div>
          </CardContent>
        </Card>

        {/* 2. Berechnet */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Berechnet</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {status === "OPEN"
                ? "-"
                : formatCurrency(settlement.calculatedFeeEur)}
            </div>
            {status !== "OPEN" && Number(settlement.revenueSharePercent) > 0 && (
              <p className="text-xs text-muted-foreground">
                {formatPercent(settlement.revenueSharePercent)}{" "}
                Umsatzbeteiligung
              </p>
            )}
          </CardContent>
        </Card>

        {/* 3. Minimum */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Minimum</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {status === "OPEN"
                ? "-"
                : formatCurrency(settlement.minimumGuaranteeEur)}
            </div>
          </CardContent>
        </Card>

        {/* 4. Tatsaechlich */}
        <Card
          className={
            settlement.usedMinimum && status !== "OPEN"
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
              {status === "OPEN"
                ? "-"
                : formatCurrency(settlement.actualFeeEur)}
            </div>
            {settlement.usedMinimum && status !== "OPEN" && (
              <p className="text-xs text-amber-700">Mindestpacht greift</p>
            )}
          </CardContent>
        </Card>

        {/* 5. Modell */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Modell</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{modelLabel}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Section */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="positions">
            Eigentuemer-Positionen
            {items.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {items.length}
              </Badge>
            )}
          </TabsTrigger>
          {isFinal && (
            <TabsTrigger value="allocation">
              Kostenumlage
              {costAllocations.length > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {costAllocations.length}
                </Badge>
              )}
            </TabsTrigger>
          )}
          {isFinal && (
            <TabsTrigger value="advances">Vorschüsse</TabsTrigger>
          )}
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="positions">
          <Card>
            <CardHeader>
              <CardTitle>Eigentuemer-Positionen</CardTitle>
              <CardDescription>
                Aufschluesselung der Pachtanteile pro Eigentuemer
              </CardDescription>
            </CardHeader>
            <CardContent>{renderPositionsTab()}</CardContent>
          </Card>
        </TabsContent>

        {isFinal && (
          <TabsContent value="allocation">
            <Card>
              <CardHeader>
                <CardTitle>Kostenumlage</CardTitle>
                <CardDescription>
                  Aufteilung der Pachtkosten auf die Betreibergesellschaften
                </CardDescription>
              </CardHeader>
              <CardContent>{renderCostAllocationTab()}</CardContent>
            </Card>
          </TabsContent>
        )}

        {isFinal && (
          <TabsContent value="advances">
            <Card>
              <CardHeader>
                <CardTitle>Vorschüsse</CardTitle>
                <CardDescription>
                  Vorschussabrechnungen für {parkName} im Jahr{" "}
                  {settlement.year}
                </CardDescription>
              </CardHeader>
              <CardContent>{renderAdvancesTab()}</CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="details">
          {renderDetailsTab()}
        </TabsContent>
      </Tabs>

      {/* Cancel Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Abrechnung stornieren</AlertDialogTitle>
            <AlertDialogDescription>
              Sind Sie sicher, dass Sie diese Pachtabrechnung stornieren
              möchten? Bitte geben Sie einen Grund an.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Stornierungsgrund..."
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            className="mt-2"
          />
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setCancelReason("");
              }}
            >
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={
                !cancelReason.trim() || actionLoading === "cancel"
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {actionLoading === "cancel" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              Stornieren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Abrechnung löschen</AlertDialogTitle>
            <AlertDialogDescription>
              Sind Sie sicher, dass Sie diese Pachtabrechnung unwiderruflich
              löschen möchten? Alle zugehoerigen Positionen werden ebenfalls
              gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={actionLoading === "delete"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {actionLoading === "delete" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Endgültig löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
