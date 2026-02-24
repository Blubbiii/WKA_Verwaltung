"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CloudOff, BarChart3, ArrowRight } from "lucide-react";
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
import { toast } from "sonner";

// =============================================================================
// Types
// =============================================================================

interface ReportConfig {
  id: string;
  name: string;
  description: string | null;
  modules: string[];
  parkId: string | null;
  interval: string | null;
  portalLabel: string | null;
}

const MODULE_LABELS: Record<string, string> = {
  // Classic
  kpiSummary: "KPI-Zusammenfassung",
  production: "Produktion",
  turbineComparison: "Anlagenvergleich",
  powerCurve: "Leistungskurve",
  windRose: "Windrose",
  dailyProfile: "Tagesverlauf",
  // Analytics
  performanceKpis: "Performance-KPIs",
  productionHeatmap: "Produktions-Heatmap",
  turbineRanking: "Turbinen-Ranking",
  yearOverYear: "Jahresvergleich",
  availabilityBreakdown: "Verfügbarkeit T1-T6",
  availabilityTrend: "Verfügbarkeits-Trend",
  availabilityHeatmap: "Verfügbarkeits-Heatmap",
  downtimePareto: "Ausfallzeiten-Pareto",
  powerCurveOverlay: "Leistungskurven-Overlay",
  faultPareto: "Störungen-Pareto",
  warningTrend: "Warnungs-Trend",
  windDistribution: "Windverteilung",
  environmentalData: "Umweltdaten",
  financialOverview: "Finanz-Übersicht",
  revenueComparison: "Erlösvergleich",
};

// =============================================================================
// Page Component
// =============================================================================

export default function EnergyReportsPage() {
  const [configs, setConfigs] = useState<ReportConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConfigs();
  }, []);

  async function fetchConfigs() {
    try {
      setLoading(true);
      const response = await fetch("/api/portal/energy-reports");
      if (!response.ok) {
        throw new Error("Fehler beim Laden der Energieberichte");
      }
      const data = await response.json();
      setConfigs(data.data || []);
    } catch {
      toast.error("Fehler beim Laden der Energieberichte");
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Loading State
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-9 w-64 mb-2" />
          <Skeleton className="h-5 w-96" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-20 mb-3" />
                <div className="flex flex-wrap gap-1 mb-4">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-14" />
                </div>
                <Skeleton className="h-9 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Empty State
  // ---------------------------------------------------------------------------

  if (configs.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Energieberichte
          </h1>
          <p className="text-muted-foreground">
            SCADA-Auswertungen und Produktionsberichte
          </p>
        </div>
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <CloudOff className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                Keine Energieberichte verfügbar
              </h3>
              <p className="text-muted-foreground max-w-sm">
                Derzeit sind keine Energieberichte für Ihr Portal
                freigeschaltet. Bitte wenden Sie sich an die Verwaltung.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Report Config Cards
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Energieberichte</h1>
        <p className="text-muted-foreground">
          SCADA-Auswertungen und Produktionsberichte
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {configs.map((config) => (
          <Card
            key={config.id}
            className="flex flex-col hover:shadow-lg transition-shadow"
          >
            <CardHeader className="flex-1">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-lg">
                  {config.portalLabel || config.name}
                </CardTitle>
                <Badge variant="secondary" className="shrink-0">
                  {config.modules.length}{" "}
                  {config.modules.length === 1 ? "Modul" : "Module"}
                </Badge>
              </div>
              {config.description && (
                <CardDescription className="line-clamp-2">
                  {config.description}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-1 mb-4">
                {config.modules.map((mod) => (
                  <Badge key={mod} variant="outline" className="text-xs">
                    {MODULE_LABELS[mod] || mod}
                  </Badge>
                ))}
              </div>
              <Button asChild className="w-full">
                <Link href={`/portal/energy-reports/${config.id}`}>
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Bericht anzeigen
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
