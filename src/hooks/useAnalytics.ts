"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  // FP3: AbortController pro Fetch — bricht in-flight Requests ab, wenn
  // der Hook unmounted oder refetch schneller feuert als der Server antwortet.
  const abortRef = useRef<AbortController | null>(null);

  const fetchAnalytics = useCallback(async () => {
    // Vorherigen Request abbrechen falls noch aktiv
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/dashboard/analytics", {
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Fehler beim Laden der Analytics-Daten");
      }

      const analyticsData: FullAnalyticsResponse = await response.json();
      if (!controller.signal.aborted) {
        setData(analyticsData);
      }
    } catch (err) {
      // Abgebrochene Requests sind kein User-facing-Fehler
      if (err instanceof Error && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Unbekannter Fehler";
      setError(message);
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
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
    } catch (err) {
      // Silent-fail belassen (refetch versucht es ohnehin
      // erneut beim nächsten User-Trigger), aber jetzt mit Logging — sonst sind
      // Cache-Clear-Fehler im Production-Log unsichtbar und nicht debuggbar.
      console.warn("[useAnalytics] Cache-Clear fehlgeschlagen:", err);
    }
  }, [fetchAnalytics]);

  useEffect(() => {
    fetchAnalytics();
    return () => {
      abortRef.current?.abort();
    };
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
  return useCallback((value: Parameters<typeof formatCurrency>[0]) => formatCurrency(value), []);
}

/**
 * Formatiert einen Decimal-String kompakt (z.B. 2.4M EUR)
 */
export function useFormatCurrencyCompact() {
  return useCallback((value: Parameters<typeof formatCurrencyCompact>[0]) => formatCurrencyCompact(value), []);
}
