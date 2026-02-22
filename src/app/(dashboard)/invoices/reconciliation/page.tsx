"use client";

import { useState, useMemo } from "react";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useParks } from "@/hooks/useParks";
import { formatCurrency } from "@/lib/format";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Banknote,
  Receipt,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  ArrowUpRight,
  ArrowDownLeft,
  Scale,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { KPICard, KPICardGrid } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  MonthlyComparisonChart,
  InvoiceStatusChart,
} from "@/components/invoices/reconciliation-charts-dynamic";
import { cn } from "@/lib/utils";

// =============================================================================
// Types
// =============================================================================

interface ReconciliationSummary {
  totalAdvances: number;
  totalSettled: number;
  difference: number;
  differencePercent: number;
  openInvoices: number;
  overdueInvoices: number;
  totalOpenAmount: number;
}

interface MonthlyEntry {
  month: string;
  advances: number;
  settled: number;
  difference: number;
}

interface FundEntry {
  fundId: string;
  fundName: string;
  advances: number;
  settled: number;
  difference: number;
}

interface TimelineEntry {
  date: string;
  type: "ADVANCE" | "SETTLEMENT";
  amount: number;
  fundName: string;
  description: string;
}

interface ReconciliationData {
  summary: ReconciliationSummary;
  monthly: MonthlyEntry[];
  byFund: FundEntry[];
  timeline: TimelineEntry[];
  invoiceStatus: Record<string, number>;
}

// =============================================================================
// Helper: format percentage with sign
// =============================================================================

function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} %`;
}

// =============================================================================
// Helper: group timeline entries by date
// =============================================================================

function groupByDate(entries: TimelineEntry[]): Map<string, TimelineEntry[]> {
  const map = new Map<string, TimelineEntry[]>();
  for (const entry of entries) {
    const existing = map.get(entry.date);
    if (existing) {
      existing.push(entry);
    } else {
      map.set(entry.date, [entry]);
    }
  }
  return map;
}

// =============================================================================
// Year selector
// =============================================================================

function YearSelector({
  year,
  onChange,
}: {
  year: number;
  onChange: (y: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => onChange(year - 1)}
        aria-label="Vorheriges Jahr"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="flex items-center gap-1.5 px-3 py-1.5 border rounded-md text-sm font-medium min-w-[100px] justify-center">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        {year}
      </div>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => onChange(year + 1)}
        aria-label="Naechstes Jahr"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

// =============================================================================
// Fund table
// =============================================================================

function FundTable({ data, isLoading }: { data: FundEntry[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="border-b p-4 last:border-0">
                <div className="flex gap-4">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Abgleich nach Gesellschaft</CardTitle>
          <CardDescription>Vorschuesse und Abrechnungen pro Beteiligungsgesellschaft</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Scale}
            title="Keine Daten vorhanden"
            description="Es wurden keine Vorschuesse oder Abrechnungen fuer diesen Zeitraum gefunden."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Abgleich nach Gesellschaft</CardTitle>
        <CardDescription>
          Vorschuesse und Abrechnungen pro Beteiligungsgesellschaft
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gesellschaft</TableHead>
                <TableHead className="text-right">Vorschuesse</TableHead>
                <TableHead className="text-right">Abrechnungen</TableHead>
                <TableHead className="text-right">Differenz</TableHead>
                <TableHead className="text-right">Differenz %</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((fund) => {
                const diffPercent =
                  fund.settled !== 0
                    ? ((fund.difference / fund.settled) * 100)
                    : 0;
                const isPositive = fund.difference >= 0;

                return (
                  <TableRow key={fund.fundId}>
                    <TableCell className="font-medium">
                      {fund.fundName}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(fund.advances)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(fund.settled)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium",
                        isPositive
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      )}
                    >
                      {formatCurrency(fund.difference)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right",
                        isPositive
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      )}
                    >
                      {formatPercent(diffPercent)}
                    </TableCell>
                    <TableCell className="text-center">
                      {fund.advances === 0 && fund.settled === 0 ? (
                        <Badge
                          variant="secondary"
                          className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                        >
                          Keine Daten
                        </Badge>
                      ) : Math.abs(fund.difference) < 0.01 ? (
                        <Badge
                          variant="secondary"
                          className="bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200"
                        >
                          Ausgeglichen
                        </Badge>
                      ) : isPositive ? (
                        <Badge
                          variant="secondary"
                          className="bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-200"
                        >
                          Ueberschuss
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="bg-orange-100 text-orange-800 dark:bg-orange-800 dark:text-orange-200"
                        >
                          Nachzahlung
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {/* Totals row */}
              {data.length > 1 && (
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell>Gesamt</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(
                      data.reduce((s, f) => s + f.advances, 0)
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(
                      data.reduce((s, f) => s + f.settled, 0)
                    )}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right",
                      data.reduce((s, f) => s + f.difference, 0) >= 0
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    )}
                  >
                    {formatCurrency(
                      data.reduce((s, f) => s + f.difference, 0)
                    )}
                  </TableCell>
                  <TableCell />
                  <TableCell />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Timeline
// =============================================================================

function TimelineSection({
  data,
  isLoading,
}: {
  data: TimelineEntry[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-1 flex-1">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Zahlungs-Verlauf</CardTitle>
          <CardDescription>
            Chronologische Uebersicht aller Zahlungen
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Receipt}
            title="Noch keine Zahlungen"
            description="Es wurden noch keine Vorschuesse oder Abrechnungen erfasst."
          />
        </CardContent>
      </Card>
    );
  }

  const grouped = groupByDate(data);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Zahlungs-Verlauf</CardTitle>
        <CardDescription>
          Chronologische Uebersicht aller Zahlungen ({data.length} Eintraege)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2">
          {Array.from(grouped.entries()).map(([dateStr, entries]) => {
            const dateObj = new Date(dateStr + "T00:00:00");
            const formattedDate = format(dateObj, "dd. MMMM yyyy", {
              locale: de,
            });

            return (
              <div key={dateStr}>
                {/* Date header */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs font-medium text-muted-foreground px-2">
                    {formattedDate}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                {/* Entries for this date */}
                <div className="space-y-3">
                  {entries.map((entry, idx) => {
                    const isAdvance = entry.type === "ADVANCE";
                    return (
                      <div
                        key={`${dateStr}-${idx}`}
                        className="flex items-center gap-3"
                      >
                        {/* Icon */}
                        <div
                          className={cn(
                            "flex items-center justify-center h-9 w-9 rounded-full shrink-0",
                            isAdvance
                              ? "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400"
                              : "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400"
                          )}
                        >
                          {isAdvance ? (
                            <ArrowUpRight className="h-4 w-4" />
                          ) : (
                            <ArrowDownLeft className="h-4 w-4" />
                          )}
                        </div>

                        {/* Description */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {entry.description}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {entry.fundName}
                          </p>
                        </div>

                        {/* Amount */}
                        <div className="text-right shrink-0">
                          <p
                            className={cn(
                              "text-sm font-semibold",
                              isAdvance
                                ? "text-blue-600 dark:text-blue-400"
                                : "text-green-600 dark:text-green-400"
                            )}
                          >
                            {isAdvance ? "-" : "+"}
                            {formatCurrency(entry.amount)}
                          </p>
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5"
                          >
                            {isAdvance ? "Vorschuss" : "Abrechnung"}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Main Page
// =============================================================================

export default function ReconciliationPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [parkFilter, setParkFilter] = useState<string>("all");
  const [fundFilter, setFundFilter] = useState<string>("all");

  // Fetch parks for filter
  const { parks } = useParks();

  // Build API URL with query params
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams({ year: String(year) });
    if (parkFilter !== "all") params.set("parkId", parkFilter);
    if (fundFilter !== "all") params.set("fundId", fundFilter);
    return `/api/invoices/reconciliation?${params}`;
  }, [year, parkFilter, fundFilter]);

  // Fetch reconciliation data
  const { data, isLoading, error, refetch } = useApiQuery<ReconciliationData>(
    ["reconciliation", String(year), parkFilter, fundFilter],
    apiUrl
  );

  // Extract fund list for filter from the response data
  const fundOptions = useMemo(() => {
    if (!data?.byFund) return [];
    return data.byFund.map((f) => ({
      value: f.fundId,
      label: f.fundName,
    }));
  }, [data?.byFund]);

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Zahlungs-Abgleich"
          description="Vorschuesse und Abrechnungen vergleichen"
        />
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <p className="text-destructive font-medium mb-2">
              Fehler beim Laden der Abgleichdaten
            </p>
            <p className="text-muted-foreground text-sm mb-4">
              {error.message}
            </p>
            <Button onClick={() => refetch()} variant="outline">
              Erneut versuchen
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const summary = data?.summary;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <PageHeader
        title="Zahlungs-Abgleich"
        description="Vorschuesse und Abrechnungen vergleichen"
      />

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <YearSelector year={year} onChange={setYear} />

        <Select value={parkFilter} onValueChange={setParkFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Alle Parks" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Parks</SelectItem>
            {parks?.map((park) => (
              <SelectItem key={park.id} value={park.id}>
                {park.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {fundOptions.length > 0 && (
          <Select value={fundFilter} onValueChange={setFundFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Alle Gesellschaften" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Gesellschaften</SelectItem>
              {fundOptions.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* KPI Cards */}
      <KPICardGrid>
        <KPICard
          title="Vorschuesse gesamt"
          value={
            isLoading ? "..." : formatCurrency(summary?.totalAdvances ?? 0)
          }
          icon={Banknote}
          isLoading={isLoading}
          description={`Gezahlte Vorschuesse ${year}`}
        />
        <KPICard
          title="Abrechnungen gesamt"
          value={
            isLoading ? "..." : formatCurrency(summary?.totalSettled ?? 0)
          }
          icon={Receipt}
          isLoading={isLoading}
          description={`Abgerechnete Betraege ${year}`}
        />
        <KPICard
          title="Differenz"
          value={
            isLoading
              ? "..."
              : formatCurrency(summary?.difference ?? 0)
          }
          icon={
            (summary?.difference ?? 0) >= 0 ? TrendingUp : TrendingDown
          }
          isLoading={isLoading}
          trend={summary?.differencePercent}
          trendLabel={
            summary
              ? (summary.difference >= 0 ? "Ueberschuss" : "Nachzahlung")
              : undefined
          }
          className={
            !isLoading && summary
              ? summary.difference >= 0
                ? "border-green-200 dark:border-green-900"
                : "border-red-200 dark:border-red-900"
              : undefined
          }
        />
        <KPICard
          title="Offene Rechnungen"
          value={
            isLoading
              ? "..."
              : `${summary?.openInvoices ?? 0}`
          }
          icon={AlertCircle}
          isLoading={isLoading}
          description={
            isLoading
              ? undefined
              : `${formatCurrency(summary?.totalOpenAmount ?? 0)} offen`
          }
          isAlert={(summary?.overdueInvoices ?? 0) > 0}
        />
      </KPICardGrid>

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <MonthlyComparisonChart data={data?.monthly ?? []} />
        </div>
        <div>
          <InvoiceStatusChart data={data?.invoiceStatus ?? {}} />
        </div>
      </div>

      {/* Fund table */}
      <FundTable data={data?.byFund ?? []} isLoading={isLoading} />

      {/* Timeline */}
      <TimelineSection data={data?.timeline ?? []} isLoading={isLoading} />
    </div>
  );
}
