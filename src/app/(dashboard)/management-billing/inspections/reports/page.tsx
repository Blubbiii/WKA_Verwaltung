"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { FileText, Eye } from "lucide-react";
import {
  Card,
  CardContent,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { SearchFilter } from "@/components/ui/search-filter";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

// =============================================================================
// TYPES
// =============================================================================

interface ParkOption {
  id: string;
  name: string;
}

interface InspectionReport {
  id: string;
  inspectionDate: string;
  inspector: string | null;
  result: string | null;
  summary: string | null;
  park: { id: string; name: string } | null;
  turbine: { id: string; designation: string } | null;
  inspectionPlan: { id: string; title: string } | null;
  createdBy: { id: string; firstName: string | null; lastName: string | null } | null;
  _count: { defects: number };
}

// =============================================================================
// CONSTANTS
// =============================================================================

const resultLabels: Record<string, string> = {
  OK: "OK",
  DEFECTS_FOUND: "Mängel festgestellt",
  FAILED: "Nicht bestanden",
};

const resultBadgeColors: Record<string, string> = {
  OK: "bg-green-100 text-green-800",
  DEFECTS_FOUND: "bg-orange-100 text-orange-800",
  FAILED: "bg-red-100 text-red-800",
};

// =============================================================================
// HELPERS
// =============================================================================

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    return format(new Date(dateStr), "dd.MM.yyyy", { locale: de });
  } catch {
    return "-";
  }
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function InspectionReportsListPage() {
  const [reports, setReports] = useState<InspectionReport[]>([]);
  const [parks, setParks] = useState<ParkOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  // Filter state
  const [parkFilter, setParkFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setIsError(false);
      try {
        const [reportsRes, parksRes] = await Promise.all([
          fetch("/api/management-billing/inspection-reports"),
          fetch("/api/parks"),
        ]);

        if (!cancelled) {
          if (reportsRes.ok) {
            const json = await reportsRes.json();
            setReports(json.reports ?? []);
          } else {
            setIsError(true);
          }

          if (parksRes.ok) {
            const parksJson = await parksRes.json();
            setParks(parksJson.parks ?? parksJson.data ?? []);
          }
        }
      } catch {
        if (!cancelled) setIsError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    return reports.filter((r) => {
      if (parkFilter !== "all" && r.park?.id !== parkFilter) return false;
      if (resultFilter !== "all" && r.result !== resultFilter) return false;
      if (dateFrom) {
        const reportDate = new Date(r.inspectionDate);
        if (reportDate < new Date(dateFrom)) return false;
      }
      if (dateTo) {
        const reportDate = new Date(r.inspectionDate);
        if (reportDate > new Date(dateTo)) return false;
      }
      return true;
    });
  }, [reports, parkFilter, resultFilter, dateFrom, dateTo]);

  const parkOptions = [
    { value: "all", label: "Alle Parks" },
    ...parks.map((p) => ({ value: p.id, label: p.name })),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prüfberichte"
        description="Begehungsberichte und deren Ergebnisse"
        createHref="/management-billing/inspections/reports/new"
        createLabel="Neuer Bericht"
      />

      {/* Filter Bar */}
      <SearchFilter
        filters={[
          {
            value: parkFilter,
            onChange: setParkFilter,
            placeholder: "Alle Parks",
            options: parkOptions,
          },
          {
            value: resultFilter,
            onChange: setResultFilter,
            placeholder: "Alle Ergebnisse",
            options: [
              { value: "all", label: "Alle Ergebnisse" },
              { value: "OK", label: "OK" },
              { value: "DEFECTS_FOUND", label: "Mängel festgestellt" },
              { value: "FAILED", label: "Nicht bestanden" },
            ],
          },
        ]}
      >
        <div className="flex items-center gap-2">
          <Label htmlFor="dateFrom" className="text-sm text-muted-foreground whitespace-nowrap">
            Von
          </Label>
          <Input
            id="dateFrom"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[160px]"
          />
          <Label htmlFor="dateTo" className="text-sm text-muted-foreground whitespace-nowrap">
            Bis
          </Label>
          <Input
            id="dateTo"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[160px]"
          />
        </div>
      </SearchFilter>

      {isLoading ? (
        <Card>
          <CardContent className="py-6">
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-32" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-destructive">
              Fehler beim Laden der Prüfberichte. Bitte versuchen Sie es erneut.
            </p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={FileText}
              title={
                reports.length === 0
                  ? "Keine Prüfberichte vorhanden"
                  : "Keine Ergebnisse"
              }
              description={
                reports.length === 0
                  ? "Erstellen Sie den ersten Prüfbericht."
                  : "Passen Sie Ihre Filter an."
              }
              action={
                reports.length === 0 ? (
                  <Button asChild>
                    <Link href="/management-billing/inspections/reports/new">
                      Neuen Bericht erstellen
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Prüfer</TableHead>
                    <TableHead>Park / Anlage</TableHead>
                    <TableHead>Ergebnis</TableHead>
                    <TableHead className="text-center">Mängel</TableHead>
                    <TableHead>Prüfplan</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/management-billing/inspections/reports/${report.id}`}
                          className="hover:underline"
                        >
                          {formatDate(report.inspectionDate)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {report.inspector ??
                          (report.createdBy
                            ? `${report.createdBy.firstName ?? ""} ${report.createdBy.lastName ?? ""}`.trim()
                            : "-")}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div>{report.park?.name ?? "-"}</div>
                          {report.turbine && (
                            <div className="text-xs text-muted-foreground">
                              {report.turbine.designation}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {report.result ? (
                          <Badge
                            variant="secondary"
                            className={
                              resultBadgeColors[report.result] ?? ""
                            }
                          >
                            {resultLabels[report.result] ?? report.result}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {report._count.defects > 0 ? (
                          <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                            {report._count.defects}
                          </Badge>
                        ) : (
                          "0"
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {report.inspectionPlan?.title ?? "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                          title="Details"
                        >
                          <Link
                            href={`/management-billing/inspections/reports/${report.id}`}
                          >
                            <Eye className="h-4 w-4" />
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
    </div>
  );
}
