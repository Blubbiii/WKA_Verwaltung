"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { ClipboardCheck, Eye, Power } from "lucide-react";
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
import { toast } from "sonner";

// =============================================================================
// TYPES
// =============================================================================

interface InspectionPlan {
  id: string;
  title: string;
  description: string | null;
  recurrence: string;
  nextDueDate: string;
  isActive: boolean;
  park: { id: string; name: string } | null;
  turbine: { id: string; designation: string } | null;
  _count: { inspectionReports: number };
}

// =============================================================================
// CONSTANTS
// =============================================================================

const recurrenceLabels: Record<string, string> = {
  MONTHLY: "Monatlich",
  QUARTERLY: "Quartalsweise",
  SEMI_ANNUAL: "Halbjährlich",
  ANNUAL: "Jährlich",
};

const recurrenceBadgeColors: Record<string, string> = {
  MONTHLY: "bg-blue-100 text-blue-800",
  QUARTERLY: "bg-green-100 text-green-800",
  SEMI_ANNUAL: "bg-orange-100 text-orange-800",
  ANNUAL: "bg-purple-100 text-purple-800",
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

function isOverdue(dateStr: string): boolean {
  return new Date(dateStr) < new Date();
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function InspectionPlansListPage() {
  const [plans, setPlans] = useState<InspectionPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const [search, setSearch] = useState("");
  const [recurrenceFilter, setRecurrenceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setIsError(false);
      try {
        const res = await fetch("/api/management-billing/inspection-plans");
        if (!res.ok) throw new Error("Failed to fetch");
        const json = await res.json();
        if (!cancelled) setPlans(json.plans ?? []);
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

  async function handleToggleActive(plan: InspectionPlan) {
    try {
      const res = await fetch(
        `/api/management-billing/inspection-plans/${plan.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !plan.isActive }),
        }
      );
      if (!res.ok) throw new Error("Failed to update");
      setPlans((prev) =>
        prev.map((p) =>
          p.id === plan.id ? { ...p, isActive: !p.isActive } : p
        )
      );
      toast.success(
        plan.isActive ? "Prüfplan deaktiviert" : "Prüfplan aktiviert"
      );
    } catch {
      toast.error("Fehler beim Ändern des Status");
    }
  }

  const filtered = useMemo(() => {
    return plans.filter((p) => {
      if (search) {
        const q = search.toLowerCase();
        const matchesSearch =
          p.title.toLowerCase().includes(q) ||
          p.park?.name.toLowerCase().includes(q) ||
          p.turbine?.designation.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      if (recurrenceFilter !== "all" && p.recurrence !== recurrenceFilter)
        return false;
      if (statusFilter === "active" && !p.isActive) return false;
      if (statusFilter === "inactive" && p.isActive) return false;
      return true;
    });
  }, [plans, search, recurrenceFilter, statusFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prüfpläne"
        description="Wiederkehrende Begehungen und Kontrollen planen"
        createHref="/management-billing/inspections/plans/new"
        createLabel="Neuer Prüfplan"
      />

      <SearchFilter
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Titel, Park oder Anlage suchen..."
        filters={[
          {
            value: recurrenceFilter,
            onChange: setRecurrenceFilter,
            placeholder: "Alle Turnusse",
            options: [
              { value: "all", label: "Alle Turnusse" },
              { value: "MONTHLY", label: "Monatlich" },
              { value: "QUARTERLY", label: "Quartalsweise" },
              { value: "SEMI_ANNUAL", label: "Halbjährlich" },
              { value: "ANNUAL", label: "Jährlich" },
            ],
          },
          {
            value: statusFilter,
            onChange: setStatusFilter,
            placeholder: "Alle Status",
            options: [
              { value: "all", label: "Alle Status" },
              { value: "active", label: "Aktiv" },
              { value: "inactive", label: "Inaktiv" },
            ],
            width: "w-[150px]",
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
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-16" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-destructive">
              Fehler beim Laden der Prüfpläne. Bitte versuchen Sie es erneut.
            </p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={ClipboardCheck}
              title={
                plans.length === 0
                  ? "Keine Prüfpläne vorhanden"
                  : "Keine Ergebnisse"
              }
              description={
                plans.length === 0
                  ? "Erstellen Sie den ersten Prüfplan für wiederkehrende Begehungen."
                  : "Passen Sie Ihre Suchkriterien an."
              }
              action={
                plans.length === 0 ? (
                  <Button asChild>
                    <Link href="/management-billing/inspections/plans/new">
                      Neuen Prüfplan erstellen
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
                    <TableHead>Turnus</TableHead>
                    <TableHead>Nächster Termin</TableHead>
                    <TableHead>Park / Anlage</TableHead>
                    <TableHead className="text-center">Berichte</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((plan) => (
                    <TableRow key={plan.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/management-billing/inspections/plans/${plan.id}`}
                          className="hover:underline"
                        >
                          {plan.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            recurrenceBadgeColors[plan.recurrence] ?? ""
                          }
                        >
                          {recurrenceLabels[plan.recurrence] ??
                            plan.recurrence}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span
                          className={
                            plan.isActive && isOverdue(plan.nextDueDate)
                              ? "text-red-600 font-medium"
                              : ""
                          }
                        >
                          {formatDate(plan.nextDueDate)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div>{plan.park?.name ?? "-"}</div>
                          {plan.turbine && (
                            <div className="text-xs text-muted-foreground">
                              {plan.turbine.designation}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {plan._count.inspectionReports}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={plan.isActive ? "default" : "outline"}
                          className={
                            plan.isActive
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-red-100 text-red-800"
                          }
                        >
                          {plan.isActive ? "Aktiv" : "Inaktiv"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                            title="Details"
                          >
                            <Link
                              href={`/management-billing/inspections/plans/${plan.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={
                              plan.isActive ? "Deaktivieren" : "Aktivieren"
                            }
                            onClick={() => handleToggleActive(plan)}
                          >
                            <Power
                              className={`h-4 w-4 ${plan.isActive ? "text-emerald-600" : "text-muted-foreground"}`}
                            />
                          </Button>
                        </div>
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
