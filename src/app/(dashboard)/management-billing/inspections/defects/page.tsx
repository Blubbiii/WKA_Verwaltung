"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { AlertTriangle, Eye } from "lucide-react";
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

interface Defect {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  dueDate: string | null;
  costEstimateEur: number | null;
  actualCostEur: number | null;
  park: { id: string; name: string } | null;
  turbine: { id: string; designation: string } | null;
  inspectionReport: {
    id: string;
    inspectionDate: string;
    inspector: string | null;
  } | null;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const severityLabels: Record<string, string> = {
  LOW: "Gering",
  MEDIUM: "Mittel",
  HIGH: "Hoch",
  CRITICAL: "Kritisch",
};

const severityBadgeColors: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-800",
  MEDIUM: "bg-yellow-100 text-yellow-800",
  HIGH: "bg-orange-100 text-orange-800",
  CRITICAL: "bg-red-100 text-red-800",
};

const statusLabels: Record<string, string> = {
  OPEN: "Offen",
  IN_PROGRESS: "In Bearbeitung",
  DONE: "Erledigt",
  CANCELLED: "Abgebrochen",
};

const statusBadgeColors: Record<string, string> = {
  OPEN: "bg-yellow-100 text-yellow-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  DONE: "bg-green-100 text-green-800",
  CANCELLED: "bg-gray-100 text-gray-800",
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

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function DefectsListPage() {
  const [defects, setDefects] = useState<Defect[]>([]);
  const [parks, setParks] = useState<ParkOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [parkFilter, setParkFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setIsError(false);
      try {
        const [defectsRes, parksRes] = await Promise.all([
          fetch("/api/management-billing/defects"),
          fetch("/api/parks"),
        ]);

        if (!cancelled) {
          if (defectsRes.ok) {
            const json = await defectsRes.json();
            setDefects(json.defects ?? []);
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
    return defects.filter((d) => {
      if (search) {
        const q = search.toLowerCase();
        const matchesSearch =
          d.title.toLowerCase().includes(q) ||
          d.park?.name.toLowerCase().includes(q) ||
          d.turbine?.designation.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      if (severityFilter !== "all" && d.severity !== severityFilter) return false;
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      if (parkFilter !== "all" && d.park?.id !== parkFilter) return false;
      return true;
    });
  }, [defects, search, severityFilter, statusFilter, parkFilter]);

  const parkOptions = [
    { value: "all", label: "Alle Parks" },
    ...parks.map((p) => ({ value: p.id, label: p.name })),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mängelliste"
        description="Alle festgestellten Mängel aus Begehungen und Kontrollen"
        createHref="/management-billing/inspections/defects/new"
        createLabel="Neuer Mangel"
      />

      <SearchFilter
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Titel, Park oder Anlage suchen..."
        filters={[
          {
            value: severityFilter,
            onChange: setSeverityFilter,
            placeholder: "Alle Schweregrade",
            options: [
              { value: "all", label: "Alle Schweregrade" },
              { value: "CRITICAL", label: "Kritisch" },
              { value: "HIGH", label: "Hoch" },
              { value: "MEDIUM", label: "Mittel" },
              { value: "LOW", label: "Gering" },
            ],
          },
          {
            value: statusFilter,
            onChange: setStatusFilter,
            placeholder: "Alle Status",
            options: [
              { value: "all", label: "Alle Status" },
              { value: "OPEN", label: "Offen" },
              { value: "IN_PROGRESS", label: "In Bearbeitung" },
              { value: "DONE", label: "Erledigt" },
              { value: "CANCELLED", label: "Abgebrochen" },
            ],
            width: "w-[180px]",
          },
          {
            value: parkFilter,
            onChange: setParkFilter,
            placeholder: "Alle Parks",
            options: parkOptions,
          },
        ]}
      />

      {isLoading ? (
        <Card>
          <CardContent className="py-6">
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-20" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-destructive">
              Fehler beim Laden der Mängel. Bitte versuchen Sie es erneut.
            </p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={AlertTriangle}
              title={
                defects.length === 0
                  ? "Keine Mängel vorhanden"
                  : "Keine Ergebnisse"
              }
              description={
                defects.length === 0
                  ? "Mängel werden aus Prüfberichten heraus erstellt."
                  : "Passen Sie Ihre Filter an."
              }
              action={
                defects.length === 0 ? (
                  <Button asChild>
                    <Link href="/management-billing/inspections/defects/new">
                      Neuen Mangel erfassen
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
                    <TableHead>Titel</TableHead>
                    <TableHead>Schweregrad</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Park / Anlage</TableHead>
                    <TableHead>Frist</TableHead>
                    <TableHead className="text-right">Kosten (Schätz.)</TableHead>
                    <TableHead>Prüfbericht</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((defect) => (
                    <TableRow key={defect.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/management-billing/inspections/defects/${defect.id}`}
                          className="hover:underline"
                        >
                          {defect.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            severityBadgeColors[defect.severity] ?? ""
                          }
                        >
                          {severityLabels[defect.severity] ?? defect.severity}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            statusBadgeColors[defect.status] ?? ""
                          }
                        >
                          {statusLabels[defect.status] ?? defect.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div>{defect.park?.name ?? "-"}</div>
                          {defect.turbine && (
                            <div className="text-xs text-muted-foreground">
                              {defect.turbine.designation}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className={
                            defect.dueDate &&
                            new Date(defect.dueDate) < new Date() &&
                            defect.status !== "DONE" &&
                            defect.status !== "CANCELLED"
                              ? "text-red-600 font-medium"
                              : ""
                          }
                        >
                          {formatDate(defect.dueDate)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(defect.costEstimateEur)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {defect.inspectionReport ? (
                          <Link
                            href={`/management-billing/inspections/reports/${defect.inspectionReport.id}`}
                            className="hover:underline"
                          >
                            {formatDate(
                              defect.inspectionReport.inspectionDate
                            )}
                          </Link>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                          title="Details"
                        >
                          <Link
                            href={`/management-billing/inspections/defects/${defect.id}`}
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
