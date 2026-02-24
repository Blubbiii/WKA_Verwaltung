"use client";

import { useState, useEffect, useCallback } from "react";

// =============================================================================
// TYPES
// =============================================================================

export interface EnergyDashboardData {
  energyYield: {
    totalMwh: number;
    yoyChange: number;
  };
  availability: {
    avgPercent: number;
  };
  windSpeed: {
    avgMs: number;
  };
  leaseRevenue: {
    totalEur: number;
    leaseCount: number;
  };
  turbineStatus: {
    operational: number;
    maintenance: number;
    fault: number;
    offline: number;
  };
  productionForecast: {
    month: string;
    actual: number;
    forecast: number;
  }[];
  revenueByPark: {
    name: string;
    revenue: number;
  }[];
  leaseOverview: {
    lessor: string;
    park: string;
    amount: number;
    status: "active" | "pending" | "overdue";
  }[];
  generatedAt: string;
}

// =============================================================================
// HOOK
// =============================================================================

export function useEnergyDashboard() {
  const [data, setData] = useState<EnergyDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/dashboard/energy-kpis");

      if (!response.ok) {
        throw new Error("Fehler beim Laden der Energie-Daten");
      }

      const result: EnergyDashboardData = await response.json();
      setData(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}
