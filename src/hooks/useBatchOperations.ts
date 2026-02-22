"use client";

import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

interface BatchResult {
  action: string;
  success: string[];
  failed: { id: string; error: string }[];
  totalProcessed: number;
  message: string;
}

interface UseBatchOperationsReturn {
  loading: boolean;
  results: BatchResult | null;
  executeBatch: (
    action: string,
    ids: string[],
    extraData?: Record<string, unknown>
  ) => Promise<BatchResult | null>;
  reset: () => void;
}

export function useBatchOperations(
  endpoint: string,
  idsKey?: string
): UseBatchOperationsReturn {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<BatchResult | null>(null);
  const { toast } = useToast();

  const executeBatch = useCallback(
    async (
      action: string,
      ids: string[],
      extraData?: Record<string, unknown>
    ): Promise<BatchResult | null> => {
      setLoading(true);
      setResults(null);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            [idsKey || `${endpoint.split("/").pop()?.replace(/s$/, "")}Ids`]: ids,
            ...extraData,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          toast({
            title: "Fehler",
            description: data.error || "Batch-Operation fehlgeschlagen",
            variant: "destructive",
          });
          return null;
        }

        const result = data as BatchResult;
        setResults(result);

        if (result.failed.length === 0) {
          toast({
            title: "Erfolgreich",
            description: result.message,
          });
        } else if (result.success.length > 0) {
          toast({
            title: "Teilweise erfolgreich",
            description: `${result.success.length} erfolgreich, ${result.failed.length} fehlgeschlagen`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Fehlgeschlagen",
            description: `Alle ${result.failed.length} Operationen fehlgeschlagen`,
            variant: "destructive",
          });
        }

        return result;
      } catch {
        toast({
          title: "Netzwerkfehler",
          description: "Verbindung zum Server fehlgeschlagen",
          variant: "destructive",
        });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [endpoint, toast]
  );

  const reset = useCallback(() => {
    setResults(null);
  }, []);

  return { loading, results, executeBatch, reset };
}
