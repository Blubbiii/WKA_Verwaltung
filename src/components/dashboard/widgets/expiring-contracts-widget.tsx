"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { FileWarning, AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// =============================================================================
// TYPES
// =============================================================================

interface ExpiringContract {
  id: string;
  title: string;
  type: string;
  expiryDate: string;
  daysUntilExpiry: number;
  status: "critical" | "warning" | "normal";
}

interface ExpiringContractsWidgetProps {
  className?: string;
}

// =============================================================================
// EXPIRING CONTRACTS WIDGET
// =============================================================================

export function ExpiringContractsWidget({ className }: ExpiringContractsWidgetProps) {
  const [contracts, setContracts] = useState<ExpiringContract[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContracts = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/dashboard/expiring-contracts");

      if (response.ok) {
        const data = await response.json();
        setContracts(data);
      } else {
        // Use mock data if API is not available
        setContracts([
          {
            id: "1",
            title: "Pachtvertrag Flurstueck 12/3",
            type: "Pacht",
            expiryDate: "24.02.2026",
            daysUntilExpiry: 19,
            status: "critical",
          },
          {
            id: "2",
            title: "Wartungsvertrag Vestas",
            type: "Wartung",
            expiryDate: "15.03.2026",
            daysUntilExpiry: 38,
            status: "warning",
          },
          {
            id: "3",
            title: "Versicherung Windpark Nord",
            type: "Versicherung",
            expiryDate: "01.04.2026",
            daysUntilExpiry: 55,
            status: "normal",
          },
        ]);
      }
    } catch {
      // Use mock data on error
      setContracts([
        {
          id: "1",
          title: "Pachtvertrag Flurstueck 12/3",
          type: "Pacht",
          expiryDate: "24.02.2026",
          daysUntilExpiry: 19,
          status: "critical",
        },
        {
          id: "2",
          title: "Wartungsvertrag Vestas",
          type: "Wartung",
          expiryDate: "15.03.2026",
          daysUntilExpiry: 38,
          status: "warning",
        },
        {
          id: "3",
          title: "Versicherung Windpark Nord",
          type: "Versicherung",
          expiryDate: "01.04.2026",
          daysUntilExpiry: 55,
          status: "normal",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  if (isLoading) {
    return (
      <div className={cn("space-y-3", className)}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="h-4 bg-muted rounded w-3/4 mb-2" />
            <div className="h-3 bg-muted rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <div className="text-center text-muted-foreground">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (contracts.length === 0) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <div className="text-center text-muted-foreground">
          <FileWarning className="h-8 w-8 mx-auto mb-2" />
          <p className="text-sm">Keine auslaufenden Verträge</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {contracts.map((contract) => (
        <div
          key={contract.id}
          className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
        >
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{contract.title}</p>
            <p className="text-xs text-muted-foreground">
              {contract.type} - Läuft ab am {contract.expiryDate}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-xs font-medium px-2 py-1 rounded whitespace-nowrap",
                contract.status === "critical"
                  ? "bg-destructive/10 text-destructive"
                  : contract.status === "warning"
                    ? "bg-yellow-500/10 text-yellow-600"
                    : "bg-green-500/10 text-green-600"
              )}
            >
              {contract.daysUntilExpiry} Tage
            </span>
            <Button variant="ghost" size="icon" className="h-6 w-6" asChild>
              <Link href={`/contracts/${contract.id}`}>
                <ExternalLink className="h-3 w-3" />
              </Link>
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
