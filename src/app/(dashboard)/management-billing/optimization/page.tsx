"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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

const statusBadgeColors: Record<string, string> = {
  OPEN: "bg-yellow-100 text-yellow-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-gray-100 text-gray-800",
  ON_HOLD: "bg-orange-100 text-orange-800",
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
  const t = useTranslations("managementBilling.optList");
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
        title={t("title")}
        description={t("description")}
        createHref="/management-billing/optimization/new"
        createLabel={t("createLabel")}
      />

      {/* Filter Bar */}
      <SearchFilter
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("searchPlaceholder")}
        filters={[
          {
            value: statusFilter,
            onChange: setStatusFilter,
            placeholder: t("filter.allStatus"),
            options: [
              { value: "all", label: t("filter.allStatus") },
              { value: "OPEN", label: t("status.OPEN") },
              { value: "IN_PROGRESS", label: t("status.IN_PROGRESS") },
              { value: "COMPLETED", label: t("status.COMPLETED") },
              { value: "CANCELLED", label: t("status.CANCELLED") },
              { value: "ON_HOLD", label: t("status.ON_HOLD") },
            ],
          },
          {
            value: categoryFilter,
            onChange: setCategoryFilter,
            placeholder: t("filter.allCategories"),
            options: [
              { value: "all", label: t("filter.allCategories") },
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
              {t("errorLoading")}
            </p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={TrendingUp}
              title={measures.length === 0 ? t("empty.none.title") : t("empty.noResults.title")}
              description={
                measures.length === 0
                  ? t("empty.none.description")
                  : t("empty.noResults.description")
              }
              action={
                measures.length === 0 ? (
                  <Button asChild>
                    <Link href="/management-billing/optimization/new">
                      {t("empty.action")}
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
                    <TableHead>{t("table.title")}</TableHead>
                    <TableHead>{t("table.category")}</TableHead>
                    <TableHead>{t("table.priority")}</TableHead>
                    <TableHead>{t("table.status")}</TableHead>
                    <TableHead>{t("table.park")}</TableHead>
                    <TableHead className="text-right">{t("table.estimatedCost")}</TableHead>
                    <TableHead className="text-right">{t("table.actualCost")}</TableHead>
                    <TableHead>{t("table.dueDate")}</TableHead>
                    <TableHead className="text-right">{t("table.actions")}</TableHead>
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
                          {t(`priority.${measure.priority}` as never)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={statusBadgeColors[measure.status] ?? ""}
                        >
                          {t(`status.${measure.status}` as never)}
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
                          title={t("actionShowDetails")}
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
