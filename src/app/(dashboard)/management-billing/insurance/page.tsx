"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Shield, FileWarning, AlertTriangle, CheckCircle, XCircle, Clock } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatsCards } from "@/components/ui/stats-cards";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatCurrency } from "@/lib/format";

// =============================================================================
// TYPES
// =============================================================================

interface InsurancePolicy {
  id: string;
  title: string;
  contractType: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  parkName: string | null;
  fundName: string | null;
}

interface ClaimSummary {
  total: number;
  byStatus: {
    REPORTED: number;
    CLAIM_IN_PROGRESS: number;
    RESOLVED: number;
    REJECTED: number;
  };
  totalEstimatedCost: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const statusBadgeColors: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  EXPIRED: "bg-gray-100 text-gray-800",
  CANCELLED: "bg-red-100 text-red-800",
  DRAFT: "bg-yellow-100 text-yellow-800",
};

const statusLabels: Record<string, string> = {
  ACTIVE: "Aktiv",
  EXPIRED: "Abgelaufen",
  CANCELLED: "Gekuendigt",
  DRAFT: "Entwurf",
};

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function InsuranceOverviewPage() {
  const [policies, setPolicies] = useState<InsurancePolicy[]>([]);
  const [claimSummary, setClaimSummary] = useState<ClaimSummary | null>(null);
  const [policiesLoading, setPoliciesLoading] = useState(true);
  const [claimsLoading, setClaimsLoading] = useState(true);
  const [policiesError, setPoliciesError] = useState(false);
  const [claimsError, setClaimsError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPolicies() {
      setPoliciesLoading(true);
      setPoliciesError(false);
      try {
        const res = await fetch("/api/management-billing/insurance-policies");
        if (!res.ok) throw new Error("Failed to fetch");
        const json = await res.json();
        if (!cancelled) {
          setPolicies(json.policies ?? json.data ?? []);
        }
      } catch {
        if (!cancelled) setPoliciesError(true);
      } finally {
        if (!cancelled) setPoliciesLoading(false);
      }
    }

    async function loadClaimSummary() {
      setClaimsLoading(true);
      setClaimsError(false);
      try {
        const res = await fetch("/api/management-billing/insurance-claims?summary=true");
        if (!res.ok) throw new Error("Failed to fetch");
        const json = await res.json();
        if (!cancelled) {
          setClaimSummary(json.summary ?? null);
        }
      } catch {
        if (!cancelled) setClaimsError(true);
      } finally {
        if (!cancelled) setClaimsLoading(false);
      }
    }

    loadPolicies();
    loadClaimSummary();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Versicherungen"
        description="Versicherungsvertraege und Schadensfaelle verwalten"
        createHref="/management-billing/insurance/claims/new"
        createLabel="Neuer Schadensfall"
      />

      {/* ================================================================= */}
      {/* Section 1: Versicherungsvertraege                                  */}
      {/* ================================================================= */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Versicherungsvertraege
          </CardTitle>
          <CardDescription>
            Uebersicht aller aktiven und abgelaufenen Versicherungsvertraege
          </CardDescription>
        </CardHeader>
        <CardContent>
          {policiesLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-lg border p-4 space-y-3">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-6 w-16" />
                </div>
              ))}
            </div>
          ) : policiesError ? (
            <p className="text-center text-destructive py-4">
              Fehler beim Laden der Versicherungsvertraege.
            </p>
          ) : policies.length === 0 ? (
            <EmptyState
              icon={Shield}
              title="Keine Versicherungsvertraege"
              description="Es wurden noch keine Versicherungsvertraege angelegt."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {policies.map((policy) => (
                <Link
                  key={policy.id}
                  href={`/contracts/${policy.id}`}
                  className="block rounded-lg border p-4 hover:shadow-md transition-shadow hover:border-primary/30"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-sm leading-tight line-clamp-2">
                        {policy.title}
                      </h3>
                      <Badge
                        variant="secondary"
                        className={statusBadgeColors[policy.status] ?? "bg-gray-100 text-gray-800"}
                      >
                        {statusLabels[policy.status] ?? policy.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {policy.contractType}
                    </p>
                    {(policy.parkName || policy.fundName) && (
                      <p className="text-xs text-muted-foreground">
                        {policy.parkName ?? policy.fundName}
                      </p>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {formatDate(policy.startDate)}
                      {policy.endDate ? ` – ${formatDate(policy.endDate)}` : " – unbefristet"}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ================================================================= */}
      {/* Section 2: Offene Schadensfaelle                                   */}
      {/* ================================================================= */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileWarning className="h-5 w-5 text-primary" />
                Offene Schadensfaelle
              </CardTitle>
              <CardDescription>
                Zusammenfassung aller gemeldeten Schadensfaelle
              </CardDescription>
            </div>
            <Button variant="outline" asChild>
              <Link href="/management-billing/insurance/claims">
                Alle anzeigen
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {claimsLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-16" />
                </div>
              ))}
            </div>
          ) : claimsError ? (
            <p className="text-center text-destructive py-4">
              Fehler beim Laden der Schadensfaelle.
            </p>
          ) : !claimSummary || claimSummary.total === 0 ? (
            <EmptyState
              icon={FileWarning}
              title="Keine Schadensfaelle"
              description="Es wurden noch keine Schadensfaelle gemeldet."
              action={
                <Button asChild>
                  <Link href="/management-billing/insurance/claims/new">
                    Schadensfall melden
                  </Link>
                </Button>
              }
            />
          ) : (
            <StatsCards
              columns={4}
              stats={[
                {
                  label: "Gesamt",
                  value: claimSummary.total,
                  icon: FileWarning,
                },
                {
                  label: "Gemeldet",
                  value: claimSummary.byStatus.REPORTED ?? 0,
                  icon: AlertTriangle,
                  iconClassName: "text-yellow-600",
                  cardClassName: "border-l-yellow-400",
                },
                {
                  label: "In Bearbeitung",
                  value: claimSummary.byStatus.CLAIM_IN_PROGRESS ?? 0,
                  icon: Clock,
                  iconClassName: "text-blue-600",
                  cardClassName: "border-l-blue-400",
                },
                {
                  label: "Geschaetzte Kosten",
                  value: formatCurrency(claimSummary.totalEstimatedCost),
                  icon: Shield,
                  valueClassName: "text-lg",
                },
              ]}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
