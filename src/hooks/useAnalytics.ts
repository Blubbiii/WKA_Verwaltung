"use client";

import { useState, useEffect, useCallback } from "react";
import type { FullAnalyticsResponse } from "@/lib/analytics/kpis";
import { formatCurrency, formatCurrencyCompact } from "@/lib/format";

// =============================================================================
// USE ANALYTICS HOOK
// =============================================================================

interface UseAnalyticsResult {
  data: FullAnalyticsResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  clearCache: () => Promise<void>;
}

export function useAnalytics(): UseAnalyticsResult {
  const [data, setData] = useState<FullAnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/dashboard/analytics");

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Fehler beim Laden der Analytics-Daten");
      }

      const analyticsData: FullAnalyticsResponse = await response.json();
      setData(analyticsData);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearCache = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard/analytics", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Fehler beim Leeren des Caches");
      }

      // Nach Cache-Clear neu laden
      await fetchAnalytics();
    } catch {
      // Cache clear failed silently - refetch will retry
    }
  }, [fetchAnalytics]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchAnalytics,
    clearCache,
  };
}

// =============================================================================
// HELPER HOOKS
// =============================================================================

/**
 * Formatiert einen Decimal-String als Euro-Betrag
 */
export function useFormatCurrency() {
  return useCallback(formatCurrency, []);
}

/**
 * Formatiert einen Decimal-String kompakt (z.B. 2.4M EUR)
 */
export function useFormatCurrencyCompact() {
  return useCallback(formatCurrencyCompact, []);
}
