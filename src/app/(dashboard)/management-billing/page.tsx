"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { formatCurrency } from "@/lib/format";
import {
  Briefcase,
  Calculator,
  Euro,
  FileCheck,
  ArrowRight,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import {
  KPICard,
  KPICardGrid,
  KPICardGridSkeleton,
} from "@/components/dashboard/kpi-card";
import { Skeleton } from "@/components/ui/skeleton";

// =============================================================================
// TYPES
// =============================================================================

interface RecentBilling {
  id: string;
  year: number;
  month: number;
  status: string;
  baseRevenueEur: number;
  feeAmountNetEur: number;
  feeAmountGrossEur: number;
  stakeholderTenantName: string;
  parkName: string;
  createdAt: string;
}

interface OverviewData {
  activeContracts: number;
  billingEnabledCount: number;
  totalNetEur: number;
  invoicedCount: number;
  recentBillings: RecentBilling[];
}

// =============================================================================
// CONSTANTS
// =============================================================================

const billingStatusLabels: Record<string, string> = {
  DRAFT: "Entwurf",
  CALCULATED: "Berechnet",
  APPROVED: "Freigegeben",
  INVOICED: "Fakturiert",
  PAID: "Bezahlt",
  CANCELLED: "Storniert",
};

const billingStatusColors: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  CALCULATED: "bg-blue-100 text-blue-800",
  APPROVED: "bg-yellow-100 text-yellow-800",
  INVOICED: "bg-emerald-100 text-emerald-800",
  PAID: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

// =============================================================================
// HELPERS
// =============================================================================

function formatPeriod(year: number, month: number | null): string {
  if (!month) return `${year}`;
  const date = new Date(year, month - 1, 1);
  return format(date, "MMMM yyyy", { locale: de });
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function ManagementBillingOverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setIsError(false);
      try {
        const res = await fetch("/api/management-billing/overview");
        if (!res.ok) throw new Error("Failed to fetch overview");
        const json = await res.json();
        if (!cancelled) {
          setData(json);
        }
      } catch {
        if (!cancelled) {
          setIsError(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Betriebsfuehrung - Uebersicht"
        description="Zusammenfassung aller Betriebsfuehrungs-Vertraege und Abrechnungen"
      />

      {/* KPI Cards */}
      {isLoading ? (
        <KPICardGridSkeleton count={4} />
      ) : isError ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-destructive">
              Fehler beim Laden der Uebersichtsdaten. Bitte versuchen Sie es
              erneut.
            </p>
          </CardContent>
        </Card>
      ) : (
        <KPICardGrid>
          <KPICard
            title="Aktive Vertraege"
            value={data?.activeContracts ?? 0}
            icon={Briefcase}
            description="Aktive BF-Vertraege"
          />
          <KPICard
            title="Abrechnungsfaehig"
            value={data?.billingEnabledCount ?? 0}
            icon={Calculator}
            description="Vertraege mit aktiver Abrechnung"
          />
          <KPICard
            title="Gesamtbetrag Netto"
            value={formatCurrency(data?.totalNetEur ?? 0)}
            icon={Euro}
            description="Summe aller Netto-Gebuehren"
          />
          <KPICard
            title="Fakturiert"
            value={data?.invoicedCount ?? 0}
            icon={FileCheck}
            description="Bereits fakturierte Abrechnungen"
          />
        </KPICardGrid>
      )}

      {/* Recent Billings */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Neueste Abrechnungen</CardTitle>
              <CardDescription>
                Die letzten Betriebsfuehrungs-Abrechnungen
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/management-billing/billings">
                Alle anzeigen
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-32 flex-1" />
                  <Skeleton className="h-5 w-20" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <p className="text-center text-muted-foreground py-8">
              Daten konnten nicht geladen werden
            </p>
          ) : data?.recentBillings && data.recentBillings.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dienstleister</TableHead>
                    <TableHead>Park</TableHead>
                    <TableHead>Zeitraum</TableHead>
                    <TableHead className="text-right">Netto</TableHead>
                    <TableHead className="text-right">Brutto</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentBillings.map((billing) => (
                    <TableRow key={billing.id}>
                      <TableCell className="font-medium">
                        {billing.stakeholderTenantName}
                      </TableCell>
                      <TableCell>{billing.parkName}</TableCell>
                      <TableCell>
                        {formatPeriod(billing.year, billing.month)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(billing.feeAmountNetEur)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(billing.feeAmountGrossEur)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            billingStatusColors[billing.status] ?? ""
                          }
                        >
                          {billingStatusLabels[billing.status] ??
                            billing.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              Keine Abrechnungen vorhanden
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Links */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">BF-Vertraege</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Dienstleister und Gebuehren verwalten
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/management-billing/stakeholders">
                  Oeffnen
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Abrechnungen</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Betriebsfuehrungs-Abrechnungen erstellen und verwalten
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/management-billing/billings">
                  Oeffnen
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
