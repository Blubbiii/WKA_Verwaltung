"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  FileText,
  FileWarning,
  Clock,
  FolderOpen,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// =============================================================================
// TYPES
// =============================================================================

interface PendingActionsSummary {
  overdueInvoices: {
    count: number;
    totalAmount: number;
    criticalCount: number;
  };
  expiringContracts: {
    count: number;
    criticalCount: number;
  };
  openSettlements: {
    count: number;
    criticalCount: number;
  };
  expiringDocuments: {
    count: number;
    criticalCount: number;
  };
  totalCount: number;
  hasCritical: boolean;
}

interface PendingActionsWidgetProps {
  className?: string;
}

interface ActionItem {
  label: string;
  count: number;
  criticalCount: number;
  amount?: number;
  href: string;
  icon: React.ElementType;
}

// =============================================================================
// FORMAT HELPERS
// =============================================================================

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// =============================================================================
// PENDING ACTIONS WIDGET
// =============================================================================

export function PendingActionsWidget({ className }: PendingActionsWidgetProps) {
  const [data, setData] = useState<PendingActionsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/reminders/pending");

      if (!response.ok) {
        throw new Error("Fehler beim Laden");
      }

      const result = await response.json();
      setData(result);
    } catch {
      setError("Daten konnten nicht geladen werden");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Loading state
  if (isLoading && !data) {
    return (
      <div className={cn("space-y-3 p-1", className)}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="h-4 bg-muted rounded w-3/4 mb-2" />
            <div className="h-3 bg-muted rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  // Error state
  if (error && !data) {
    return (
      <div
        className={cn(
          "flex items-center justify-center h-full",
          className
        )}
      >
        <div className="text-center text-muted-foreground">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
          <p className="text-sm">{error}</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={fetchData}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Erneut versuchen
          </Button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Build action items list (only show categories with count > 0)
  const actionItems: ActionItem[] = [];

  if (data.overdueInvoices.count > 0) {
    actionItems.push({
      label: data.overdueInvoices.count === 1
        ? "Rechnung überfällig"
        : "Rechnungen überfällig",
      count: data.overdueInvoices.count,
      criticalCount: data.overdueInvoices.criticalCount,
      amount: data.overdueInvoices.totalAmount,
      href: "/invoices?status=SENT",
      icon: FileText,
    });
  }

  if (data.expiringContracts.count > 0) {
    actionItems.push({
      label: data.expiringContracts.count === 1
        ? "Vertrag läuft aus"
        : "Verträge laufen aus",
      count: data.expiringContracts.count,
      criticalCount: data.expiringContracts.criticalCount,
      href: "/contracts?status=EXPIRING",
      icon: FileWarning,
    });
  }

  if (data.openSettlements.count > 0) {
    actionItems.push({
      label: data.openSettlements.count === 1
        ? "Abrechnung offen"
        : "Abrechnungen offen",
      count: data.openSettlements.count,
      criticalCount: data.openSettlements.criticalCount,
      href: "/leases",
      icon: Clock,
    });
  }

  if (data.expiringDocuments.count > 0) {
    actionItems.push({
      label: data.expiringDocuments.count === 1
        ? "Dokument läuft ab"
        : "Dokumente laufen ab",
      count: data.expiringDocuments.count,
      criticalCount: data.expiringDocuments.criticalCount,
      href: "/documents",
      icon: FolderOpen,
    });
  }

  // Nothing pending
  if (actionItems.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center h-full",
          className
        )}
      >
        <div className="text-center text-muted-foreground">
          <div className="h-10 w-10 mx-auto mb-3 rounded-full bg-green-500/10 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-green-600"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <p className="text-sm font-medium">Keine offenen Punkte</p>
          <p className="text-xs mt-1">Alles erledigt</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1", className)}>
      {/* Summary bar */}
      {data.hasCritical && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-destructive/10 text-destructive text-xs font-medium mb-2">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Dringende Punkte erfordern Aufmerksamkeit</span>
        </div>
      )}

      {/* Action items */}
      {actionItems.map((item) => {
        const Icon = item.icon;
        const hasCritical = item.criticalCount > 0;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center justify-between px-2 py-2.5 rounded-md transition-colors",
              "hover:bg-accent/50 group"
            )}
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div
                className={cn(
                  "h-8 w-8 rounded-md flex items-center justify-center flex-shrink-0",
                  hasCritical
                    ? "bg-destructive/10 text-destructive"
                    : "bg-yellow-500/10 text-yellow-600"
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {item.count} {item.label}
                </p>
                {item.amount !== undefined && item.amount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Gesamt: {formatCurrency(item.amount)}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {hasCritical && (
                <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                  {item.criticalCount} dringend
                </span>
              )}
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
