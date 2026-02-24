"use client";

import { useState, use, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  ArrowLeft,
  Calculator,
  FileText,
  Lock,
  Trash2,
  Loader2,
  Calendar,
  Euro,
  Building,
  Users,
  ExternalLink,
  Zap,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Info,
  Send,
  ThumbsUp,
  ThumbsDown,
  ShieldCheck,
  XCircle,
  Clock,
  UserCheck,
} from "lucide-react";
import {
  useSettlementPeriod,
  calculateSettlement,
  createSettlementInvoices,
  updateSettlementPeriod,
  deleteSettlementPeriod,
  approveSettlementPeriod,
  settlementStatusLabels,
  settlementStatusColors,
} from "@/hooks/useSettlementPeriods";

interface PageProps {
  params: Promise<{ id: string }>;
}

interface CalculationLease {
  leaseId: string;
  lessorId: string;
  lessorName: string;
  lessorAddress: string | null;
  monthlyMinimumRent?: number;
  plotCount?: number;
  totalMinimumRent?: number;
  totalRevenueShare?: number;
  alreadyPaidAdvances?: number;
  finalPayment?: number;
  isCredit?: boolean;
}

interface CalculationResult {
  parkId: string;
  parkName: string;
  year: number;
  month?: number;
  periodType: "ADVANCE" | "FINAL";
  calculatedAt: string;
  minimumRentPerTurbine?: number | null;
  totalRevenue?: number;
  revenuePhasePercentage?: number | null;
  leases: CalculationLease[];
  totals: {
    leaseCount: number;
    totalMonthlyMinimumRent?: number;
    totalMinimumRent?: number;
    totalRevenueShare?: number;
    totalAdvancesPaid?: number;
    totalFinalPayment?: number;
  };
}

const periodTypeLabels: Record<string, string> = {
  ADVANCE: "Vorschuss",
  FINAL: "Endabrechnung",
};

const periodTypeColors: Record<string, string> = {
  ADVANCE: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  FINAL: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

const months = [
  "", "Januar", "Februar", "Maerz", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"
];

export default function SettlementPeriodDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { period, isLoading, isError, mutate } = useSettlementPeriod(id);

  const [isCalculating, setIsCalculating] = useState(false);
  const [isCreatingInvoices, setIsCreatingInvoices] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmittingForReview, setIsSubmittingForReview] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showSubmitForReviewDialog, setShowSubmitForReviewDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  // Rejection notes
  const [rejectionNotes, setRejectionNotes] = useState("");

  // Calculation result state
  const [calculationResult, setCalculationResult] = useState<CalculationResult | null>(null);
  const [isLoadingCalculation, setIsLoadingCalculation] = useState(false);

  const [invoiceFormData, setInvoiceFormData] = useState<{
    taxType: "STANDARD" | "REDUCED" | "EXEMPT";
    invoiceDate: string;
    dueDate: string;
  }>({
    taxType: "EXEMPT",
    invoiceDate: new Date().toISOString().split("T")[0],
    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
  });

  // Load calculation when period is loaded and has been calculated
  useEffect(() => {
    if (period && period.status !== "OPEN") {
      loadCalculation();
    }
  }, [period?.id, period?.status]);

  async function loadCalculation() {
    try {
      setIsLoadingCalculation(true);
      const response = await fetch(`/api/admin/settlement-periods/${id}/calculate`);
      if (response.ok) {
        const data = await response.json();
        setCalculationResult(data.calculation);
      }
    } catch {
    } finally {
      setIsLoadingCalculation(false);
    }
  }

  function formatDate(date: string | null | undefined) {
    if (!date) return "-";
    return new Intl.DateTimeFormat("de-DE").format(new Date(date));
  }

  function formatDateTime(date: string | null | undefined) {
    if (!date) return "-";
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(date));
  }

  function formatPeriodTitle() {
    if (!period) return "";
    if (period.periodType === "FINAL") {
      return `${period.park.name} - Jahresendabrechnung ${period.year}`;
    }
    if (period.month) {
      return `${period.park.name} - ${months[period.month]} ${period.year}`;
    }
    return `${period.park.name} - ${period.year}`;
  }

  function formatReviewerName() {
    if (!period?.reviewedBy) return "-";
    const { firstName, lastName } = period.reviewedBy;
    return `${firstName || ""} ${lastName || ""}`.trim() || "-";
  }

  async function handleCalculate() {
    try {
      setIsCalculating(true);
      const response = await fetch(`/api/admin/settlement-periods/${id}/calculate`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler bei der Berechnung");
      }

      const data = await response.json();
      setCalculationResult(data.calculation);
      toast.success("Berechnung abgeschlossen");
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler bei der Berechnung");
    } finally {
      setIsCalculating(false);
    }
  }

  async function handleCreateInvoices() {
    try {
      setIsCreatingInvoices(true);
      const result = await createSettlementInvoices(id, invoiceFormData);
      toast.success(result.message || `${result.created || "Rechnungen"} erstellt`);
      setShowInvoiceDialog(false);
      mutate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Erstellen der Rechnungen"
      );
    } finally {
      setIsCreatingInvoices(false);
    }
  }

  async function handleSubmitForReview() {
    try {
      setIsSubmittingForReview(true);
      await updateSettlementPeriod(id, { status: "PENDING_REVIEW" });
      toast.success("Zur Prüfung eingereicht");
      setShowSubmitForReviewDialog(false);
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Einreichen");
    } finally {
      setIsSubmittingForReview(false);
    }
  }

  async function handleApprove() {
    try {
      setIsApproving(true);
      await approveSettlementPeriod(id, { action: "approve" });
      toast.success("Abrechnungsperiode genehmigt");
      setShowApproveDialog(false);
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler bei der Genehmigung");
    } finally {
      setIsApproving(false);
    }
  }

  async function handleReject() {
    if (!rejectionNotes.trim()) {
      toast.error("Bitte geben Sie eine Begruendung für die Ablehnung an");
      return;
    }
    try {
      setIsRejecting(true);
      await approveSettlementPeriod(id, {
        action: "reject",
        notes: rejectionNotes.trim(),
      });
      toast.success("Abrechnungsperiode zurückgewiesen");
      setShowRejectDialog(false);
      setRejectionNotes("");
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler bei der Ablehnung");
    } finally {
      setIsRejecting(false);
    }
  }

  async function handleClose() {
    try {
      setIsClosing(true);
      await updateSettlementPeriod(id, { status: "CLOSED" });
      toast.success("Abrechnungsperiode abgeschlossen");
      setShowCloseDialog(false);
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Abschliessen");
    } finally {
      setIsClosing(false);
    }
  }

  async function handleDelete() {
    try {
      setIsDeleting(true);
      await deleteSettlementPeriod(id);
      toast.success("Abrechnungsperiode gelöscht");
      router.push("/admin/settlement-periods");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Löschen");
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (isError || !period) {
    return (
      <div className="p-4 text-red-600 bg-red-50 rounded-md">
        Abrechnungsperiode nicht gefunden
      </div>
    );
  }

  // Workflow permission flags
  const canEdit = period.status === "OPEN";
  const canCalculate = period.status === "OPEN" || period.status === "IN_PROGRESS";
  const canSubmitForReview = period.status === "IN_PROGRESS";
  const canApproveOrReject = period.status === "PENDING_REVIEW";
  const canCreateInvoices = period.status === "APPROVED";
  const canClose = period.status === "APPROVED";
  const canDelete = period.status === "OPEN";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/admin/settlement-periods">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-3xl font-bold tracking-tight">
              {formatPeriodTitle()}
            </h1>
          </div>
          <div className="flex items-center gap-2 ml-10">
            <Badge className={periodTypeColors[period.periodType] || ""}>
              {periodTypeLabels[period.periodType] || period.periodType}
            </Badge>
            <Badge className={settlementStatusColors[period.status] || ""}>
              {settlementStatusLabels[period.status] || period.status}
            </Badge>
          </div>
        </div>

        <div className="flex gap-2">
          {canCalculate && (
            <Button
              onClick={handleCalculate}
              disabled={isCalculating}
            >
              {isCalculating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Calculator className="mr-2 h-4 w-4" />
              )}
              Berechnen
            </Button>
          )}
          {canSubmitForReview && (
            <Button
              variant="default"
              onClick={() => setShowSubmitForReviewDialog(true)}
            >
              <Send className="mr-2 h-4 w-4" />
              Zur Prüfung einreichen
            </Button>
          )}
          {canApproveOrReject && (
            <>
              <Button
                variant="default"
                onClick={() => setShowApproveDialog(true)}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <ThumbsUp className="mr-2 h-4 w-4" />
                Genehmigen
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowRejectDialog(true)}
                className="text-destructive border-destructive hover:bg-destructive/10"
              >
                <ThumbsDown className="mr-2 h-4 w-4" />
                Ablehnen
              </Button>
            </>
          )}
          {canCreateInvoices && (
            <Button
              variant="outline"
              onClick={() => setShowInvoiceDialog(true)}
            >
              <FileText className="mr-2 h-4 w-4" />
              Rechnungen erstellen
            </Button>
          )}
          {canClose && (
            <Button
              variant="secondary"
              onClick={() => setShowCloseDialog(true)}
            >
              <Lock className="mr-2 h-4 w-4" />
              Abschliessen
            </Button>
          )}
          {canDelete && (
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(true)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Löschen
            </Button>
          )}
        </div>
      </div>

      {/* Approval Status Banner */}
      {period.status === "PENDING_REVIEW" && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-yellow-50 border border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800">
          <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <div>
            <p className="font-medium text-yellow-800 dark:text-yellow-200">
              Wartet auf Genehmigung
            </p>
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              Diese Abrechnungsperiode wurde zur Prüfung eingereicht und wartet auf die Genehmigung eines Administrators.
            </p>
          </div>
        </div>
      )}

      {period.status === "APPROVED" && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-50 border border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800">
          <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div>
            <p className="font-medium text-emerald-800 dark:text-emerald-200">
              Genehmigt
              {period.reviewedBy && (
                <span className="font-normal">
                  {" "}von {formatReviewerName()}
                </span>
              )}
              {period.reviewedAt && (
                <span className="font-normal text-emerald-600 dark:text-emerald-400">
                  {" "}am {formatDateTime(period.reviewedAt)}
                </span>
              )}
            </p>
            {period.reviewNotes && (
              <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">
                Anmerkung: {period.reviewNotes}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Show rejection info when period was sent back to IN_PROGRESS */}
      {period.status === "IN_PROGRESS" && period.reviewedBy && period.reviewNotes && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950 dark:border-red-800">
          <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
          <div>
            <p className="font-medium text-red-800 dark:text-red-200">
              Zurückgewiesen
              {period.reviewedBy && (
                <span className="font-normal">
                  {" "}von {formatReviewerName()}
                </span>
              )}
              {period.reviewedAt && (
                <span className="font-normal text-red-600 dark:text-red-400">
                  {" "}am {formatDateTime(period.reviewedAt)}
                </span>
              )}
            </p>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">
              Begruendung: {period.reviewNotes}
            </p>
          </div>
        </div>
      )}

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Info className="h-4 w-4" />
              Periode-Typ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">
              {period.periodType === "ADVANCE" ? "Monatlicher Vorschuss" : "Jahresendabrechnung"}
            </div>
            <p className="text-sm text-muted-foreground">
              {period.periodType === "ADVANCE"
                ? `${months[period.month || 0]} ${period.year}`
                : `Abrechnungsjahr ${period.year}`}
            </p>
          </CardContent>
        </Card>

        {period.periodType === "FINAL" && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Gesamtertrag
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(period.totalRevenue)}
              </div>
              <p className="text-sm text-muted-foreground">
                Stromerlös {period.year}
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Euro className="h-4 w-4" />
              Mindestpacht
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(period.totalMinimumRent)}
            </div>
            <p className="text-sm text-muted-foreground">
              {period.periodType === "ADVANCE" ? "Monatlich" : "Jährlich"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Tatsaechliche Pacht
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(period.totalActualRent)}
            </div>
            <p className="text-sm text-muted-foreground">
              Inkl. Erlösanteil
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Rechnungen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{period._count?.invoices || period.invoices?.length || 0}</div>
            <p className="text-sm text-muted-foreground">
              Erstellt
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Workflow Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Genehmigungsworkflow
          </CardTitle>
          <CardDescription>
            Status des Prüfungs- und Genehmigungsprozesses
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            {/* OPEN step */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
              period.status === "OPEN"
                ? "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
            }`}>
              {period.status === "OPEN" ? (
                <AlertCircle className="h-3.5 w-3.5" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Offen
            </div>
            <Separator className="w-6" />
            {/* IN_PROGRESS step */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
              period.status === "IN_PROGRESS"
                ? "bg-blue-200 text-blue-800 dark:bg-blue-800 dark:text-blue-200"
                : ["PENDING_REVIEW", "APPROVED", "CLOSED"].includes(period.status)
                  ? "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                  : "bg-gray-50 text-gray-400 dark:bg-gray-900 dark:text-gray-500"
            }`}>
              {["PENDING_REVIEW", "APPROVED", "CLOSED"].includes(period.status) ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : period.status === "IN_PROGRESS" ? (
                <Calculator className="h-3.5 w-3.5" />
              ) : (
                <Clock className="h-3.5 w-3.5" />
              )}
              Bearbeitung
            </div>
            <Separator className="w-6" />
            {/* PENDING_REVIEW step */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
              period.status === "PENDING_REVIEW"
                ? "bg-yellow-200 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200"
                : ["APPROVED", "CLOSED"].includes(period.status)
                  ? "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                  : "bg-gray-50 text-gray-400 dark:bg-gray-900 dark:text-gray-500"
            }`}>
              {["APPROVED", "CLOSED"].includes(period.status) ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : period.status === "PENDING_REVIEW" ? (
                <Clock className="h-3.5 w-3.5" />
              ) : (
                <Clock className="h-3.5 w-3.5" />
              )}
              Prüfung
            </div>
            <Separator className="w-6" />
            {/* APPROVED step */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
              period.status === "APPROVED"
                ? "bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-200"
                : period.status === "CLOSED"
                  ? "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                  : "bg-gray-50 text-gray-400 dark:bg-gray-900 dark:text-gray-500"
            }`}>
              {period.status === "CLOSED" ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : period.status === "APPROVED" ? (
                <ShieldCheck className="h-3.5 w-3.5" />
              ) : (
                <Clock className="h-3.5 w-3.5" />
              )}
              Genehmigt
            </div>
            <Separator className="w-6" />
            {/* CLOSED step */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
              period.status === "CLOSED"
                ? "bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-200"
                : "bg-gray-50 text-gray-400 dark:bg-gray-900 dark:text-gray-500"
            }`}>
              {period.status === "CLOSED" ? (
                <Lock className="h-3.5 w-3.5" />
              ) : (
                <Clock className="h-3.5 w-3.5" />
              )}
              Abgeschlossen
            </div>
          </div>

          {/* Reviewer info */}
          {period.reviewedBy && (
            <div className="mt-4 pt-4 border-t">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label className="text-muted-foreground">Pruefer</Label>
                  <p className="font-medium flex items-center gap-1.5">
                    <UserCheck className="h-4 w-4 text-muted-foreground" />
                    {formatReviewerName()}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Datum</Label>
                  <p className="font-medium">{formatDateTime(period.reviewedAt)}</p>
                </div>
                {period.reviewNotes && (
                  <div>
                    <Label className="text-muted-foreground">Anmerkung</Label>
                    <p className="font-medium">{period.reviewNotes}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Calculation Result */}
      {(isLoadingCalculation || calculationResult) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Berechnungsergebnis
            </CardTitle>
            <CardDescription>
              {calculationResult?.calculatedAt
                ? `Berechnet am ${formatDate(calculationResult.calculatedAt)}`
                : "Berechnung wird geladen..."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingCalculation ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : calculationResult ? (
              <div className="space-y-4">
                {/* Summary */}
                <div className="grid gap-4 md:grid-cols-3 p-4 bg-muted rounded-lg">
                  <div>
                    <div className="text-sm text-muted-foreground">Verpaechter</div>
                    <div className="text-lg font-semibold">{calculationResult.totals.leaseCount}</div>
                  </div>
                  {calculationResult.periodType === "ADVANCE" ? (
                    <div>
                      <div className="text-sm text-muted-foreground">Monatliche Mindestpacht gesamt</div>
                      <div className="text-lg font-semibold">
                        {formatCurrency(calculationResult.totals.totalMonthlyMinimumRent)}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="text-sm text-muted-foreground">Gezahlte Vorschüsse</div>
                        <div className="text-lg font-semibold">
                          {formatCurrency(calculationResult.totals.totalAdvancesPaid)}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Nachzahlung/Rueckzahlung</div>
                        <div className={`text-lg font-semibold ${(calculationResult.totals.totalFinalPayment || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatCurrency(calculationResult.totals.totalFinalPayment)}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Leases Table */}
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Verpaechter</TableHead>
                        {calculationResult.periodType === "ADVANCE" ? (
                          <>
                            <TableHead className="text-right">Flaechen</TableHead>
                            <TableHead className="text-right">Monatliche Mindestpacht</TableHead>
                          </>
                        ) : (
                          <>
                            <TableHead className="text-right">Mindestpacht</TableHead>
                            <TableHead className="text-right">Erlösanteil</TableHead>
                            <TableHead className="text-right">Gezahlte Vorschüsse</TableHead>
                            <TableHead className="text-right">Restbetrag</TableHead>
                            <TableHead>Status</TableHead>
                          </>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {calculationResult.leases.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={calculationResult.periodType === "ADVANCE" ? 3 : 6} className="text-center py-8 text-muted-foreground">
                            Keine Verpaechter mit aktiven Pachtverträgen gefunden
                          </TableCell>
                        </TableRow>
                      ) : (
                        calculationResult.leases.map((lease) => (
                          <TableRow key={lease.leaseId}>
                            <TableCell>
                              <div className="font-medium">{lease.lessorName}</div>
                              {lease.lessorAddress && (
                                <div className="text-sm text-muted-foreground">{lease.lessorAddress}</div>
                              )}
                            </TableCell>
                            {calculationResult.periodType === "ADVANCE" ? (
                              <>
                                <TableCell className="text-right">{lease.plotCount}</TableCell>
                                <TableCell className="text-right font-medium">
                                  {formatCurrency(lease.monthlyMinimumRent)}
                                </TableCell>
                              </>
                            ) : (
                              <>
                                <TableCell className="text-right">
                                  {formatCurrency(lease.totalMinimumRent)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(lease.totalRevenueShare)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(lease.alreadyPaidAdvances)}
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {formatCurrency(lease.finalPayment)}
                                </TableCell>
                                <TableCell>
                                  {(lease.finalPayment || 0) > 0 ? (
                                    <Badge className="bg-green-100 text-green-800">
                                      <TrendingUp className="mr-1 h-3 w-3" />
                                      Nachzahlung
                                    </Badge>
                                  ) : (lease.finalPayment || 0) < 0 ? (
                                    <Badge className="bg-red-100 text-red-800">
                                      <TrendingDown className="mr-1 h-3 w-3" />
                                      Rueckzahlung
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-gray-100 text-gray-800">
                                      <CheckCircle2 className="mr-1 h-3 w-3" />
                                      Ausgeglichen
                                    </Badge>
                                  )}
                                </TableCell>
                              </>
                            )}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Period Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label className="text-muted-foreground">Windpark</Label>
              <p className="font-medium">{period.park.name}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Jahr</Label>
              <p className="font-medium">{period.year}</p>
            </div>
            {period.periodType === "ADVANCE" && period.month && (
              <div>
                <Label className="text-muted-foreground">Monat</Label>
                <p className="font-medium">{months[period.month]}</p>
              </div>
            )}
            <div>
              <Label className="text-muted-foreground">Rechnungsdatum Vorschuss</Label>
              <p className="font-medium">{formatDate(period.advanceInvoiceDate)}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Schlussabrechnung</Label>
              <p className="font-medium">{formatDate(period.settlementDate)}</p>
            </div>
            <div className="md:col-span-2">
              <Label className="text-muted-foreground">Notizen</Label>
              <p className="font-medium">{period.notes || "-"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Linked Energy Settlement (if applicable) */}
      {period.linkedEnergySettlementId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Verknuepfte Stromabrechnung
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div>
                <p className="font-medium">Stromabrechnung {period.year}</p>
                <p className="text-sm text-muted-foreground">
                  Die Erlösdaten werden aus dieser Stromabrechnung übernommen
                </p>
              </div>
              <Button variant="outline" asChild>
                <Link href={`/energy/settlements/${period.linkedEnergySettlementId}`}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Anzeigen
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invoices */}
      {period.invoices && period.invoices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Rechnungen ({period.invoices.length})
            </CardTitle>
            <CardDescription>
              Erstellte Rechnungen für diese Abrechnungsperiode
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nummer</TableHead>
                    <TableHead>Empfänger</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead className="text-right">Betrag</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {period.invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">
                        {invoice.invoiceNumber}
                      </TableCell>
                      <TableCell>{invoice.recipientName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {invoice.invoiceType === "CREDIT_NOTE"
                            ? "Gutschrift"
                            : invoice.invoiceType === "INVOICE"
                            ? "Rechnung"
                            : invoice.invoiceType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            invoice.status === "PAID"
                              ? "default"
                              : invoice.status === "SENT"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {invoice.status === "DRAFT"
                            ? "Entwurf"
                            : invoice.status === "SENT"
                            ? "Versendet"
                            : invoice.status === "PAID"
                            ? "Bezahlt"
                            : invoice.status === "CANCELLED"
                            ? "Storniert"
                            : invoice.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(invoice.invoiceDate)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(invoice.grossAmount)}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" asChild>
                          <Link href={`/invoices/${invoice.id}`}>
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State for Invoices */}
      {(!period.invoices || period.invoices.length === 0) && period.status !== "OPEN" && (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Noch keine Rechnungen erstellt</p>
              {canCreateInvoices && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setShowInvoiceDialog(true)}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Jetzt Rechnungen erstellen
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submit for Review Confirmation Dialog */}
      <AlertDialog open={showSubmitForReviewDialog} onOpenChange={setShowSubmitForReviewDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zur Prüfung einreichen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Abrechnungsperiode wird zur Genehmigung an einen Administrator weitergeleitet.
              Waehrend der Prüfung können keine Änderungen vorgenommen werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmitForReview} disabled={isSubmittingForReview}>
              {isSubmittingForReview && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Einreichen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Approve Confirmation Dialog */}
      <AlertDialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Abrechnungsperiode genehmigen?</AlertDialogTitle>
            <AlertDialogDescription>
              Durch die Genehmigung bestätigen Sie, dass die Berechnung korrekt ist.
              Anschliessend können Rechnungen erstellt und die Periode abgeschlossen werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApprove}
              disabled={isApproving}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {isApproving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Genehmigen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog (with notes) */}
      <Dialog open={showRejectDialog} onOpenChange={(open) => {
        setShowRejectDialog(open);
        if (!open) setRejectionNotes("");
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abrechnungsperiode ablehnen</DialogTitle>
            <DialogDescription>
              Geben Sie eine Begruendung für die Ablehnung an. Die Periode wird zurück in den
              Status &quot;In Bearbeitung&quot; versetzt und kann überarbeitet werden.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rejectionNotes">Begruendung *</Label>
              <Textarea
                id="rejectionNotes"
                value={rejectionNotes}
                onChange={(e) => setRejectionNotes(e.target.value)}
                placeholder="Bitte beschreiben Sie, warum die Abrechnung überarbeitet werden muss..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowRejectDialog(false);
                setRejectionNotes("");
              }}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={isRejecting || !rejectionNotes.trim()}
            >
              {isRejecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ablehnen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Invoices Dialog */}
      <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechnungen erstellen</DialogTitle>
            <DialogDescription>
              Erstellen Sie {period.periodType === "ADVANCE" ? "Mindestpacht-Rechnungen" : "Schlussrechnungen"} für alle Verpaechter dieser Periode
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="text-sm font-medium mb-2">Rechnungstyp</h4>
              <p className="text-sm text-muted-foreground">
                {period.periodType === "ADVANCE"
                  ? "Mindestpacht-Vorschuss (Monatliche Abschlagszahlung)"
                  : "Jahresendabrechnung (Verrechnung der Vorschüsse mit dem Erlösanteil)"}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Steuerart</Label>
              <Select
                value={invoiceFormData.taxType}
                onValueChange={(value: "STANDARD" | "REDUCED" | "EXEMPT") =>
                  setInvoiceFormData({ ...invoiceFormData, taxType: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXEMPT">Steuerfrei (Paragraph 4 Nr.12 UStG)</SelectItem>
                  <SelectItem value="STANDARD">19% MwSt.</SelectItem>
                  <SelectItem value="REDUCED">7% MwSt.</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Rechnungsdatum</Label>
                <Input
                  type="date"
                  value={invoiceFormData.invoiceDate}
                  onChange={(e) =>
                    setInvoiceFormData({
                      ...invoiceFormData,
                      invoiceDate: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Fälligkeitsdatum</Label>
                <Input
                  type="date"
                  value={invoiceFormData.dueDate}
                  onChange={(e) =>
                    setInvoiceFormData({
                      ...invoiceFormData,
                      dueDate: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowInvoiceDialog(false)}
            >
              Abbrechen
            </Button>
            <Button onClick={handleCreateInvoices} disabled={isCreatingInvoices}>
              {isCreatingInvoices && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Rechnungen erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Confirmation Dialog */}
      <AlertDialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Abrechnungsperiode abschliessen?</AlertDialogTitle>
            <AlertDialogDescription>
              Nach dem Abschliessen können keine weiteren Änderungen oder Rechnungen
              für diese Periode erstellt werden. Dieser Vorgang kann nicht rueckgaengig
              gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleClose} disabled={isClosing}>
              {isClosing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Abschliessen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Abrechnungsperiode löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Sind Sie sicher, dass Sie diese Abrechnungsperiode löschen möchten?
              Dieser Vorgang kann nicht rueckgaengig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
