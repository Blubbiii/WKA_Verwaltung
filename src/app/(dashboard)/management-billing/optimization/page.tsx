"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TrendingUp, Eye } from "lucide-react";
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
import { formatDate, formatCurrency } from "@/lib/format";

// =============================================================================
// TYPES
// =============================================================================

interface OptimizationMeasure {
  id: string;
  title: string;
  category: string | null;
  priority: string;
  status: string;
  parkName: string | null;
  costEstimateEur: number | string | null;
  actualCostEur: number | string | null;
  dueDate: string | null;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const statusLabels: Record<string, string> = {
  OPEN: "Offen",
  IN_PROGRESS: "In Bearbeitung",
  COMPLETED: "Abgeschlossen",
  CANCELLED: "Abgebrochen",
  ON_HOLD: "Pausiert",
};

const statusBadgeColors: Record<string, string> = {
  OPEN: "bg-yellow-100 text-yellow-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-gray-100 text-gray-800",
  ON_HOLD: "bg-orange-100 text-orange-800",
};

const priorityLabels: Record<string, string> = {
  LOW: "Niedrig",
  MEDIUM: "Mittel",
  HIGH: "Hoch",
  CRITICAL: "Kritisch",
};

const priorityBadgeColors: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-700",
  MEDIUM: "bg-blue-100 text-blue-700",
  HIGH: "bg-orange-100 text-orange-700",
  CRITICAL: "bg-red-100 text-red-700",
};

const CATEGORY_OPTIONS = [
  "Ertragssteigerung",
  "Kostensenkung",
  "Verfuegbarkeit",
  "Sicherheit",
  "Sonstiges",
];

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function OptimizationListPage() {
  const router = useRouter();
  const [measures, setMeasures] = useState<OptimizationMeasure[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setIsError(false);
      try {
        const res = await fetch("/api/management-billing/tasks?taskType=IMPROVEMENT");
        if (!res.ok) throw new Error("Failed to fetch");
        const json = await res.json();
        if (!cancelled) {
          setMeasures(json.tasks ?? json.data ?? []);
        }
      } catch {
        if (!cancelled) setIsError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    return measures.filter((m) => {
      if (search) {
        const q = search.toLowerCase();
        const matchesSearch =
          m.title.toLowerCase().includes(q) ||
          (m.category?.toLowerCase().includes(q) ?? false) ||
          (m.parkName?.toLowerCase().includes(q) ?? false);
        if (!matchesSearch) return false;
      }
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (categoryFilter !== "all" && m.category !== categoryFilter) return false;
      return true;
    });
  }, [measures, search, statusFilter, categoryFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Optimierungsmassnahmen"
        description="Verbesserungsmassnahmen fuer Windparks planen und verfolgen"
        createHref="/management-billing/optimization/new"
        createLabel="Neue Massnahme"
      />

      {/* Filter Bar */}
      <SearchFilter
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Titel, Kategorie oder Park suchen..."
        filters={[
          {
            value: statusFilter,
            onChange: setStatusFilter,
            placeholder: "Alle Status",
            options: [
              { value: "all", label: "Alle Status" },
              { value: "OPEN", label: "Offen" },
              { value: "IN_PROGRESS", label: "In Bearbeitung" },
              { value: "COMPLETED", label: "Abgeschlossen" },
              { value: "CANCELLED", label: "Abgebrochen" },
              { value: "ON_HOLD", label: "Pausiert" },
            ],
          },
          {
            value: categoryFilter,
            onChange: setCategoryFilter,
            placeholder: "Alle Kategorien",
            options: [
              { value: "all", label: "Alle Kategorien" },
              ...CATEGORY_OPTIONS.map((c) => ({ value: c, label: c })),
            ],
            width: "w-[200px]",
          },
        ]}
      />

      {/* Table */}
      {isLoading ? (
        <Card>
          <CardContent className="py-6">
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-40 flex-1" />
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-8 w-10" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-destructive">
              Fehler beim Laden der Massnahmen. Bitte versuchen Sie es erneut.
            </p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={TrendingUp}
              title={measures.length === 0 ? "Keine Massnahmen" : "Keine Ergebnisse"}
              description={
                measures.length === 0
                  ? "Erstellen Sie die erste Optimierungsmassnahme, um Verbesserungen zu planen."
                  : "Passen Sie Ihre Suchkriterien an, um Ergebnisse zu finden."
              }
              action={
                measures.length === 0 ? (
                  <Button asChild>
                    <Link href="/management-billing/optimization/new">
                      Massnahme erstellen
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
                    <TableHead>Kategorie</TableHead>
                    <TableHead>Prioritaet</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Park</TableHead>
                    <TableHead className="text-right">Gesch. Kosten</TableHead>
                    <TableHead className="text-right">Tats. Kosten</TableHead>
                    <TableHead>Faellig am</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((measure) => (
                    <TableRow
                      key={measure.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/management-billing/optimization/${measure.id}`)}
                    >
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {measure.title}
                      </TableCell>
                      <TableCell>
                        {measure.category ? (
                          <Badge variant="secondary">{measure.category}</Badge>
                        ) : (
                          <span className="text-muted-foreground">–</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={priorityBadgeColors[measure.priority] ?? ""}
                        >
                          {priorityLabels[measure.priority] ?? measure.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={statusBadgeColors[measure.status] ?? ""}
                        >
                          {statusLabels[measure.status] ?? measure.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {measure.parkName ?? "–"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(measure.costEstimateEur)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(measure.actualCostEur)}
                      </TableCell>
                      <TableCell>{formatDate(measure.dueDate)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                          title="Details anzeigen"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link href={`/management-billing/optimization/${measure.id}`}>
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
