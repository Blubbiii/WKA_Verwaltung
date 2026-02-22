"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { formatCurrency } from "@/lib/format";
import {
  Calculator,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  FileText,
  Loader2,
  MoreHorizontal,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Billing {
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
  status: "DRAFT" | "CALCULATED" | "INVOICED" | "CANCELLED";
  invoiceId: string | null;
  parkName: string;
  providerName: string;
}

interface BatchResult {
  totalProcessed: number;
  successCount: number;
  failCount: number;
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
  const cfg = STATUS_CONFIG[status] || {
    label: status,
    className: "",
  };
  return cfg;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const currentYear = new Date().getFullYear();

function formatPeriod(year: number, month: number | null): string {
  if (month) {
    return `${String(month).padStart(2, "0")}/${year}`;
  }
  return String(year);
}

const MONTH_OPTIONS = [
  { value: "all", label: "Alle Monate" },
  { value: "1", label: "Januar" },
  { value: "2", label: "Februar" },
  { value: "3", label: "Maerz" },
  { value: "4", label: "April" },
  { value: "5", label: "Mai" },
  { value: "6", label: "Juni" },
  { value: "7", label: "Juli" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "Oktober" },
  { value: "11", label: "November" },
  { value: "12", label: "Dezember" },
];

const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => {
  const y = currentYear - 2 + i;
  return { value: String(y), label: String(y) };
});

const STATUS_OPTIONS = [
  { value: "all", label: "Alle Status" },
  { value: "DRAFT", label: "Entwurf" },
  { value: "CALCULATED", label: "Berechnet" },
  { value: "INVOICED", label: "Fakturiert" },
  { value: "CANCELLED", label: "Storniert" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BillingsPage() {
  const router = useRouter();

  // Filter state
  const [yearFilter, setYearFilter] = useState(String(currentYear));
  const [monthFilter, setMonthFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Data state
  const [billings, setBillings] = useState<Billing[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Batch calculation state
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchYear, setBatchYear] = useState(String(currentYear));
  const [batchMonth, setBatchMonth] = useState("");
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchResult, setBatchResult] =
    useState<BatchResult | null>(null);

  // Action loading
  const [actionLoadingId, setActionLoadingId] = useState<
    string | null
  >(null);

  // Fetch billings
  const fetchBillings = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (yearFilter !== "all") params.set("year", yearFilter);
      if (monthFilter !== "all") params.set("month", monthFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const response = await fetch(
        `/api/management-billing/billings?${params}`
      );
      if (!response.ok) throw new Error("Fehler beim Laden");

      const data = await response.json();
      setBillings(data.billings || []);
    } catch {
      toast.error("Fehler beim Laden der Abrechnungen");
    } finally {
      setIsLoading(false);
    }
  }, [yearFilter, monthFilter, statusFilter]);

  useEffect(() => {
    fetchBillings();
  }, [fetchBillings]);

  // Batch calculation
  async function handleBatchCalculate() {
    if (!batchYear) {
      toast.error("Bitte ein Jahr angeben");
      return;
    }

    try {
      setIsBatchRunning(true);
      setBatchResult(null);

      const payload: Record<string, unknown> = {
        year: parseInt(batchYear, 10),
      };
      if (batchMonth) {
        payload.month = parseInt(batchMonth, 10);
      }

      const response = await fetch(
        "/api/management-billing/billings/batch-calculate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || "Fehler bei der Batch-Berechnung"
        );
      }

      const result: BatchResult = await response.json();
      setBatchResult(result);

      if (result.failCount === 0) {
        toast.success(
          `${result.successCount} Abrechnung(en) erfolgreich berechnet`
        );
      } else {
        toast.warning(
          `${result.successCount} erfolgreich, ${result.failCount} fehlgeschlagen`
        );
      }

      // Refresh list
      fetchBillings();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler bei der Batch-Berechnung"
      );
    } finally {
      setIsBatchRunning(false);
    }
  }

  // Create invoice for a billing
  async function handleCreateInvoice(billingId: string) {
    try {
      setActionLoadingId(billingId);
      const response = await fetch(
        `/api/management-billing/billings/${billingId}/create-invoice`,
        { method: "POST" }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || "Fehler beim Erstellen der Rechnung"
        );
      }

      toast.success("Rechnung erfolgreich erstellt");
      fetchBillings();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Erstellen der Rechnung"
      );
    } finally {
      setActionLoadingId(null);
    }
  }

  // Download PDF
  async function handleDownloadPdf(
    billingId: string,
    period: string
  ) {
    try {
      setActionLoadingId(billingId);
      const res = await fetch(
        `/api/management-billing/billings/${billingId}/pdf`
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
      setActionLoadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="BF-Abrechnungen"
        description="Betriebsfuehrungsabrechnungen verwalten und berechnen"
        actions={
          <Button
            variant="outline"
            onClick={() => setBatchOpen(!batchOpen)}
          >
            <Calculator className="mr-2 h-4 w-4" />
            Batch-Berechnung
            {batchOpen ? (
              <ChevronUp className="ml-2 h-4 w-4" />
            ) : (
              <ChevronDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        }
      />

      {/* Batch Calculation Section */}
      <Collapsible open={batchOpen} onOpenChange={setBatchOpen}>
        <CollapsibleContent>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Batch-Berechnung
              </CardTitle>
              <CardDescription>
                Abrechnungen fuer alle aktiven Konstellationen
                berechnen
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-2">
                  <Label htmlFor="batchYear">Jahr *</Label>
                  <Input
                    id="batchYear"
                    type="number"
                    min={currentYear - 5}
                    max={currentYear + 1}
                    value={batchYear}
                    onChange={(e) => setBatchYear(e.target.value)}
                    className="w-28"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="batchMonth">
                    Monat (optional)
                  </Label>
                  <Input
                    id="batchMonth"
                    type="number"
                    min={1}
                    max={12}
                    value={batchMonth}
                    onChange={(e) => setBatchMonth(e.target.value)}
                    placeholder="Leer = Jahresabrechnung"
                    className="w-48"
                  />
                </div>
                <Button
                  onClick={handleBatchCalculate}
                  disabled={isBatchRunning}
                >
                  {isBatchRunning ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Calculator className="mr-2 h-4 w-4" />
                  )}
                  Alle berechnen
                </Button>
              </div>

              {batchResult && (
                <div className="mt-4 rounded-md bg-muted p-4 text-sm">
                  <p>
                    <span className="font-medium">Ergebnis:</span>{" "}
                    {batchResult.totalProcessed} verarbeitet &mdash;{" "}
                    <span className="text-green-700 font-medium">
                      {batchResult.successCount} erfolgreich
                    </span>
                    {batchResult.failCount > 0 && (
                      <>
                        {", "}
                        <span className="text-red-700 font-medium">
                          {batchResult.failCount} fehlgeschlagen
                        </span>
                      </>
                    )}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Filters & Table */}
      <Card>
        <CardHeader>
          <CardTitle>Abrechnungen</CardTitle>
          <CardDescription>
            Alle BF-Abrechnungen im ausgewaehlten Zeitraum
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Select
              value={yearFilter}
              onValueChange={setYearFilter}
            >
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Jahr" />
              </SelectTrigger>
              <SelectContent>
                {YEAR_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={monthFilter}
              onValueChange={setMonthFilter}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Monat" />
              </SelectTrigger>
              <SelectContent>
                {MONTH_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={statusFilter}
              onValueChange={setStatusFilter}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zeitraum</TableHead>
                  <TableHead>Dienstleister</TableHead>
                  <TableHead>Park</TableHead>
                  <TableHead className="text-right">
                    Basis-Erloes
                  </TableHead>
                  <TableHead className="text-right">
                    Gebuehr %
                  </TableHead>
                  <TableHead className="text-right">Netto</TableHead>
                  <TableHead className="text-right">
                    Brutto
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-5 w-20" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : billings.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="h-32 text-center"
                    >
                      <EmptyState
                        icon={Receipt}
                        title="Keine Abrechnungen"
                        description="Fuer den ausgewaehlten Zeitraum wurden keine Abrechnungen gefunden. Starten Sie eine Batch-Berechnung."
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  billings.map((billing) => {
                    const period = formatPeriod(
                      billing.year,
                      billing.month
                    );
                    const badge = getStatusBadge(billing.status);
                    const isActionLoading =
                      actionLoadingId === billing.id;

                    return (
                      <TableRow
                        key={billing.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() =>
                          router.push(
                            `/management-billing/billings/${billing.id}`
                          )
                        }
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" ||
                            e.key === " "
                          ) {
                            e.preventDefault();
                            router.push(
                              `/management-billing/billings/${billing.id}`
                            );
                          }
                        }}
                      >
                        <TableCell className="font-mono">
                          {period}
                        </TableCell>
                        <TableCell>
                          {billing.providerName}
                        </TableCell>
                        <TableCell>{billing.parkName}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(
                            billing.baseRevenueEur
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {billing.feePercentageUsed.toFixed(2)}%
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(
                            billing.feeAmountNetEur
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(
                            billing.feeAmountGrossEur
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={badge.className}
                          >
                            {badge.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              asChild
                              onClick={(e) =>
                                e.stopPropagation()
                              }
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label="Weitere Aktionen"
                                disabled={isActionLoading}
                              >
                                {isActionLoading ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <MoreHorizontal className="h-4 w-4" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(
                                    `/management-billing/billings/${billing.id}`
                                  );
                                }}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                Details
                              </DropdownMenuItem>
                              {billing.status ===
                                "CALCULATED" && (
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCreateInvoice(
                                      billing.id
                                    );
                                  }}
                                >
                                  <FileText className="mr-2 h-4 w-4" />
                                  Rechnung erstellen
                                </DropdownMenuItem>
                              )}
                              {billing.status === "INVOICED" && (
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownloadPdf(
                                      billing.id,
                                      period
                                    );
                                  }}
                                >
                                  <Download className="mr-2 h-4 w-4" />
                                  PDF herunterladen
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
