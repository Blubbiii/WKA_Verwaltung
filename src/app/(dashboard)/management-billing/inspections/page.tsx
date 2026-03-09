"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  ClipboardCheck,
  FileText,
  AlertTriangle,
  ArrowRight,
  Calendar,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";

// =============================================================================
// TYPES
// =============================================================================

interface InspectionPlan {
  id: string;
  title: string;
  recurrence: string;
  nextDueDate: string;
  isActive: boolean;
  park: { id: string; name: string } | null;
  turbine: { id: string; designation: string } | null;
  _count: { inspectionReports: number };
}

interface InspectionReport {
  id: string;
  inspectionDate: string;
  inspector: string | null;
  result: string | null;
  park: { id: string; name: string } | null;
  turbine: { id: string; designation: string } | null;
  inspectionPlan: { id: string; title: string } | null;
  _count: { defects: number };
}

interface Defect {
  id: string;
  title: string;
  severity: string;
  status: string;
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

function isDueSoon(dateStr: string): boolean {
  const due = new Date(dateStr);
  const now = new Date();
  const diffDays = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= 14 && diffDays >= 0;
}

function isOverdue(dateStr: string): boolean {
  return new Date(dateStr) < new Date();
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function InspectionsOverviewPage() {
  const [plans, setPlans] = useState<InspectionPlan[]>([]);
  const [reports, setReports] = useState<InspectionReport[]>([]);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setIsError(false);
      try {
        const [plansRes, reportsRes, defectsRes] = await Promise.all([
          fetch("/api/management-billing/inspection-plans?isActive=true"),
          fetch("/api/management-billing/inspection-reports"),
          fetch("/api/management-billing/defects?status=OPEN"),
        ]);

        if (!cancelled) {
          if (plansRes.ok) {
            const plansJson = await plansRes.json();
            setPlans(plansJson.plans ?? []);
          }
          if (reportsRes.ok) {
            const reportsJson = await reportsRes.json();
            setReports((reportsJson.reports ?? []).slice(0, 5));
          }
          if (defectsRes.ok) {
            const defectsJson = await defectsRes.json();
            setDefects(defectsJson.defects ?? []);
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

  // Count defects by severity
  const defectsBySeverity = defects.reduce(
    (acc, d) => {
      acc[d.severity] = (acc[d.severity] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Begehungen & Kontrollen"
        description="Prüfpläne, Begehungsberichte und Mängelverwaltung"
      />

      {/* Navigation Buttons */}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" asChild>
          <Link href="/management-billing/inspections/plans">
            <ClipboardCheck className="mr-2 h-4 w-4" />
            Prüfpläne
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/management-billing/inspections/reports">
            <FileText className="mr-2 h-4 w-4" />
            Prüfberichte
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/management-billing/inspections/defects">
            <AlertTriangle className="mr-2 h-4 w-4" />
            Mängelliste
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-6 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-28" />
              </CardHeader>
              <CardContent className="space-y-3">
                {Array.from({ length: 3 }).map((_, j) => (
                  <Skeleton key={j} className="h-16 w-full rounded-md" />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-destructive">
              Fehler beim Laden der Daten. Bitte versuchen Sie es erneut.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Section 1: Anstehende Prüfungen */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Anstehende Prüfungen
                  </CardTitle>
                  <CardDescription>
                    {plans.length} aktive Prüfpläne
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/management-billing/inspections/plans">
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {plans.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Keine aktiven Prüfpläne vorhanden
                </p>
              ) : (
                <div className="space-y-3">
                  {plans.slice(0, 5).map((plan) => (
                    <Link
                      key={plan.id}
                      href={`/management-billing/inspections/plans/${plan.id}`}
                      className="block rounded-md border p-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {plan.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {plan.park?.name ?? "Kein Park"}
                            {plan.turbine
                              ? ` - ${plan.turbine.designation}`
                              : ""}
                          </p>
                        </div>
                        <Badge
                          variant="secondary"
                          className={
                            recurrenceBadgeColors[plan.recurrence] ?? ""
                          }
                        >
                          {recurrenceLabels[plan.recurrence] ??
                            plan.recurrence}
                        </Badge>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <span
                          className={`text-xs font-medium ${
                            isOverdue(plan.nextDueDate)
                              ? "text-red-600"
                              : isDueSoon(plan.nextDueDate)
                                ? "text-orange-600"
                                : "text-muted-foreground"
                          }`}
                        >
                          {isOverdue(plan.nextDueDate)
                            ? "Überfällig: "
                            : "Fällig: "}
                          {formatDate(plan.nextDueDate)}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 2: Letzte Prüfberichte */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Letzte Prüfberichte
                  </CardTitle>
                  <CardDescription>
                    Die letzten 5 Berichte
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/management-billing/inspections/reports">
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {reports.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Noch keine Prüfberichte vorhanden
                </p>
              ) : (
                <div className="space-y-3">
                  {reports.map((report) => (
                    <Link
                      key={report.id}
                      href={`/management-billing/inspections/reports/${report.id}`}
                      className="block rounded-md border p-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {formatDate(report.inspectionDate)}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {report.inspector ?? "Unbekannt"} -{" "}
                            {report.park?.name ?? "Kein Park"}
                          </p>
                        </div>
                        {report.result && (
                          <Badge
                            variant="secondary"
                            className={
                              resultBadgeColors[report.result] ?? ""
                            }
                          >
                            {resultLabels[report.result] ?? report.result}
                          </Badge>
                        )}
                      </div>
                      {report._count.defects > 0 && (
                        <p className="mt-1 text-xs text-orange-600">
                          {report._count.defects} Mängel
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 3: Offene Mängel */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    Offene Mängel
                  </CardTitle>
                  <CardDescription>
                    {defects.length} offene Mängel gesamt
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/management-billing/inspections/defects">
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {defects.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Keine offenen Mängel vorhanden
                </p>
              ) : (
                <div className="space-y-3">
                  {/* Severity breakdown */}
                  {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map(
                    (sev) => {
                      const count = defectsBySeverity[sev] || 0;
                      if (count === 0) return null;
                      return (
                        <div
                          key={sev}
                          className="flex items-center justify-between rounded-md border p-3"
                        >
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="secondary"
                              className={severityBadgeColors[sev]}
                            >
                              {severityLabels[sev]}
                            </Badge>
                          </div>
                          <span className="text-lg font-semibold">
                            {count}
                          </span>
                        </div>
                      );
                    }
                  )}

                  {/* Recent defects preview */}
                  <div className="border-t pt-3 mt-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Neueste Mängel
                    </p>
                    {defects.slice(0, 3).map((defect) => (
                      <Link
                        key={defect.id}
                        href={`/management-billing/inspections/defects/${defect.id}`}
                        className="block text-sm py-1 hover:text-primary transition-colors truncate"
                      >
                        <Badge
                          variant="secondary"
                          className={`mr-2 ${severityBadgeColors[defect.severity]}`}
                        >
                          {severityLabels[defect.severity]?.[0] ?? "?"}
                        </Badge>
                        {defect.title}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
