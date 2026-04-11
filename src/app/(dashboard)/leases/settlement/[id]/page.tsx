"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { formatDate, formatDateTime } from "@/lib/format";
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
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  ArrowLeft,
  Calculator,
  Trash2,
  FileText,
  Lock,
  Send,
  CheckCircle,
  XCircle,
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

function formatPercent(
  value: number | string | null | undefined,
  locale: string
): string {
  if (value === null || value === undefined) return "-";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "-";
  return num.toLocaleString(locale, { minimumFractionDigits: 2 }) + " %";
}

// =============================================================================
// HELPER: Format date — uses central formatDate/formatDateTime from @/lib/format
// =============================================================================

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
  const t = useTranslations("leases.settlementDetail");
  const locale = useLocale();
  const intlLocale = locale === "en" ? "en-US" : "de-DE";

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
          .catch(() => ({ error: t("unknownError") }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSettlement(data.settlement);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loadErrorDetail"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          .catch(() => ({ error: t("unknownError") }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      toast.success(t("actionSuccess"));
      await loadSettlement();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("actionError"));
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
          .catch(() => ({ error: t("unknownError") }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      toast.success(t("deleteSuccess"));
      router.push("/leases/settlement");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("deleteError"));
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
          .catch(() => ({ error: t("unknownError") }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      toast.success(t("cancelSuccess"));
      setCancelDialogOpen(false);
      setCancelReason("");
      await loadSettlement();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("cancelError"));
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
        const err = await res.json().catch(() => ({ error: t("unknownError") }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const result = await res.json();
      const count = result.delivered || 0;
      if (method === "print") toast.success(t("deliveryPrinted", { count }));
      else if (method === "email") toast.success(t("deliveryEmailed", { count }));
      else toast.success(t("deliveryDelivered", { count }));
      if (result.errors?.length > 0) {
        toast.error(
          t("deliveryErrorCount", {
            count: result.errors.length,
            first: result.errors[0],
          })
        );
      }
      await loadSettlement();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("deliveryError"));
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
        const err = await res.json().catch(() => ({ error: t("printError") }));
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
      toast.success(t("pdfDownloaded"));
      await loadSettlement();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("printErrorDetail"));
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
        const err = await res.json().catch(() => ({ error: t("emailError") }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const result = await res.json();
      toast.success(
        t("emailSent", {
          recipient: result.emailedTo || t("emailRecipientFallback"),
        })
      );
      await loadSettlement();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("emailErrorDetail"));
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
              aria-label={t("backAria")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">
            {t("pageTitle")}
          </h1>
        </div>
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center gap-4 text-center">
              <AlertTriangle className="h-10 w-10 text-destructive" />
              <div>
                <h3 className="text-lg font-semibold">{t("notFoundTitle")}</h3>
                <p className="text-muted-foreground mt-1">
                  {error || t("notFoundFallback")}
                </p>
              </div>
              <Button onClick={loadSettlement} variant="outline">
                <RefreshCw className="mr-2 h-4 w-4" />
                {t("retryBtn")}
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
  const parkName = settlement.park?.name || t("unknownPark");
  const isFinal = settlement.periodType === "FINAL";
  const isAdvance = settlement.periodType === "ADVANCE";
  const status = settlement.status;
  const items: LeaseRevenueSettlementItemResponse[] = settlement.items || [];
  const costAllocations: ParkCostAllocationResponse[] =
    settlement.costAllocations || [];

  const periodTypeLabel = isFinal
    ? t("finalSettlementLabel", { year: settlement.year })
    : isAdvance
      ? t("advanceLabel", {
          interval:
            ADVANCE_INTERVAL_LABELS[settlement.advanceInterval || ""] ||
            t("advanceFallback"),
          year: settlement.year,
        })
      : `${settlement.year}`;

  // Model label
  const modelLabel = isAdvance
    ? t("modelAdvance")
    : settlement.usedMinimum
      ? t("modelMinimum")
      : t("modelRevenue");

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
            {t("btnStartCalc")}
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
            {t("btnDelete")}
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
            {t("btnRecalc")}
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
            {t("btnCreateInvoices")}
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
            {t("btnSubmitReview")}
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
            {t("btnApprove")}
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
            {t("btnReject")}
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
            {t("btnClose")}
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
          {t("btnCancel")}
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
            {t("noItemsTitle")}
          </h3>
          <p className="text-muted-foreground mt-2 max-w-sm">
            {t("noItemsDescription")}
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
            {t("btnStartCalc")}
          </Button>
        </div>
      );
    }

    if (items.length === 0) {
      return (
        <div className="py-8 text-center text-muted-foreground">
          {t("noItems")}
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("colOwner")}</TableHead>
              <TableHead className="text-right">{t("colPoolShare")}</TableHead>
              <TableHead className="text-right">{t("colStandort")}</TableHead>
              <TableHead className="text-right">{t("colSealed")}</TableHead>
              <TableHead className="text-right">{t("colRoads")}</TableHead>
              <TableHead className="text-right">{t("colCable")}</TableHead>
              <TableHead className="text-right font-semibold">
                {t("colTotal")}
              </TableHead>
              {isFinal && (
                <>
                  <TableHead className="text-right">{t("colAdvance")}</TableHead>
                  <TableHead className="text-right font-semibold">
                    {t("colRemainder")}
                  </TableHead>
                </>
              )}
              <TableHead>{t("colCreditNote")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">
                  {getLessorName(item.lessorPerson)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatPercent(item.poolAreaSharePercent, intlLocale)}
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
              <TableCell>{t("totalLabel", { count: items.length })}</TableCell>
              <TableCell className="text-right font-mono">
                {formatPercent(itemTotals.poolAreaSharePercent, intlLocale)}
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
                {t("deliveryTitle")}
                <InfoTooltip text={t("deliveryTooltip")} />
              </CardTitle>
              <CardDescription>
                {t("deliveryStats", {
                  printed: printedCount,
                  emailed: emailedCount,
                  total: invoices.length,
                })}
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
                {t("btnPrintAll")}
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
                {t("btnEmailAll")}
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
                {t("btnDeliverAll")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colCreditNoteNo")}</TableHead>
                <TableHead>{t("colRecipient")}</TableHead>
                <TableHead className="text-right">{t("colAmount")}</TableHead>
                <TableHead className="text-center">{t("colPrinted")}</TableHead>
                <TableHead className="text-center">{t("colEmailed")}</TableHead>
                <TableHead>{t("colActions")}</TableHead>
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
                      <span className="text-green-600" title={new Date(inv.printedAt).toLocaleString(intlLocale)}>
                        <CheckCircle className="h-4 w-4 inline" />
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {inv.emailedAt ? (
                      <span className="text-green-600" title={`${new Date(inv.emailedAt).toLocaleString(intlLocale)} an ${inv.emailedTo || "?"}`}>
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
            {t("allocationOnlyFinal")}
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
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">
                      {t("allocationCardTitle")}
                      {allocation.periodLabel
                        ? ` - ${allocation.periodLabel}`
                        : ""}
                    </CardTitle>
                    <InfoTooltip text={t("allocationTooltip")} />
                  </div>
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
                          <TableHead>{t("allocationColCompany")}</TableHead>
                          <TableHead className="text-right">
                            {t("allocationColShare")}
                          </TableHead>
                          <TableHead className="text-right">{t("allocationColAmount")}</TableHead>
                          <TableHead className="text-right">
                            {t("allocationColNetPayable")}
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
                              {formatPercent(item.allocationSharePercent, intlLocale)}
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
                    {t("allocationNoItems")}
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
          {t("allocationAutoCreated")}
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
            {t("advancesOnlyFinal")}
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
            {t("advancesEmpty", { parkName, year: settlement.year })}
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
                <TableHead>{t("colPeriod")}</TableHead>
                <TableHead>{t("colInterval")}</TableHead>
                <TableHead>{t("colStatus")}</TableHead>
                <TableHead className="text-right">{t("colAmount")}</TableHead>
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
                  {t("advancesTotalLabel")}
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
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{t("detailsGeneral")}</CardTitle>
              <InfoTooltip text={t("detailsGeneralTooltip")} />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("createdAt")}</span>
              <span>{formatDateTime(settlement.createdAt)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("createdBy")}</span>
              <span>{settlement.createdBy?.name || "-"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("calculatedAt")}</span>
              <span>
                {calcDetails?.calculatedAt
                  ? formatDateTime(calcDetails.calculatedAt as string)
                  : "-"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("lastUpdated")}</span>
              <span>{formatDateTime(settlement.updatedAt)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Fälligkeiten */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{t("detailsDueDates")}</CardTitle>
              <InfoTooltip text={t("detailsDueDatesTooltip")} />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {t("advanceDueDate")}
              </span>
              <span>{formatDate(settlement.advanceDueDate)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {t("settlementDueDate")}
              </span>
              <span>{formatDate(settlement.settlementDueDate)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Verknuepfungen */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{t("detailsLinks")}</CardTitle>
              <InfoTooltip text={t("detailsLinksTooltip")} />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {t("linkedEnergySettlement")}
              </span>
              <span>
                {settlement.linkedEnergySettlementId ? (
                  <Link
                    href={`/energy/settlements/${settlement.linkedEnergySettlementId}`}
                    className="text-primary underline hover:no-underline"
                  >
                    {t("viewLink")}
                  </Link>
                ) : (
                  "-"
                )}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("periodType")}</span>
              <span>
                {PERIOD_TYPE_LABELS[settlement.periodType] ||
                  settlement.periodType}
              </span>
            </div>
            {isAdvance && settlement.advanceInterval && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("intervalLabel")}</span>
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
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">
                  {t("detailsReview")}
                </CardTitle>
                <InfoTooltip text={t("detailsReviewTooltip")} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("reviewedBy")}</span>
                <span>{settlement.reviewedBy?.name || "-"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("reviewedAt")}</span>
                <span>{formatDateTime(settlement.reviewedAt)}</span>
              </div>
              {settlement.reviewNotes && (
                <div className="text-sm">
                  <span className="text-muted-foreground block mb-1">
                    {t("reviewNotes")}
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
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{t("notesTitle")}</CardTitle>
              <InfoTooltip text={t("notesTooltip")} />
            </div>
          </CardHeader>
          <CardContent>
            {settlement.notes ? (
              <p className="text-sm whitespace-pre-wrap">{settlement.notes}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("notesEmpty")}
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
              aria-label={t("backAria")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {t("headerTitle", { parkName, year: settlement.year })}
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
                {t("cancelledInfo")}
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
              {t("kpiAnnualRevenue")}
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
            <CardTitle className="text-sm font-medium">{t("kpiCalculated")}</CardTitle>
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
                {t("kpiRevenueShareInfo", {
                  pct: formatPercent(settlement.revenueSharePercent, intlLocale),
                })}
              </p>
            )}
          </CardContent>
        </Card>

        {/* 3. Minimum */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("kpiMinimum")}</CardTitle>
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
              {t("kpiActual")}
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
              <p className="text-xs text-amber-700">{t("kpiMinimumApplies")}</p>
            )}
          </CardContent>
        </Card>

        {/* 5. Modell */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("kpiModel")}</CardTitle>
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
            {t("tabPositions")}
            {items.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {items.length}
              </Badge>
            )}
          </TabsTrigger>
          {isFinal && (
            <TabsTrigger value="allocation">
              {t("tabAllocation")}
              {costAllocations.length > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {costAllocations.length}
                </Badge>
              )}
            </TabsTrigger>
          )}
          {isFinal && (
            <TabsTrigger value="advances">{t("tabAdvances")}</TabsTrigger>
          )}
          <TabsTrigger value="details">{t("tabDetails")}</TabsTrigger>
        </TabsList>

        <TabsContent value="positions">
          <Card>
            <CardHeader>
              <CardTitle>{t("positionsCardTitle")}</CardTitle>
              <CardDescription>
                {t("positionsCardDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>{renderPositionsTab()}</CardContent>
          </Card>
        </TabsContent>

        {isFinal && (
          <TabsContent value="allocation">
            <Card>
              <CardHeader>
                <CardTitle>{t("allocationTabTitle")}</CardTitle>
                <CardDescription>
                  {t("allocationTabDescription")}
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
                <CardTitle>{t("advancesTabTitle")}</CardTitle>
                <CardDescription>
                  {t("advancesTabDescription", {
                    parkName,
                    year: settlement.year,
                  })}
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
            <AlertDialogTitle>{t("cancelDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("cancelDialogDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder={t("cancelPlaceholder")}
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
              {t("cancelBack")}
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
              {t("btnCancel")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDialogDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancelBack")}</AlertDialogCancel>
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
              {t("deleteFinalBtn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
