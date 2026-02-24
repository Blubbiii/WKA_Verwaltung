import useSWR from "swr";
import { DISTRIBUTION_STATUS, getStatusBadge } from "@/lib/status-config";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
    throw new Error(error.error || "Fehler beim Laden");
  }
  return res.json();
};

export interface DistributionItem {
  id: string;
  percentage: number;
  amount: number;
  shareholder: {
    id: string;
    person: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      companyName: string | null;
      personType: string;
    };
  };
  invoice?: {
    id: string;
    invoiceNumber: string;
    status: string;
    grossAmount?: number;
  } | null;
}

export interface Distribution {
  id: string;
  distributionNumber: string;
  description: string | null;
  totalAmount: number;
  distributionDate: string;
  status: "DRAFT" | "EXECUTED" | "CANCELLED";
  executedAt: string | null;
  notes: string | null;
  createdAt: string;
  fund?: {
    id: string;
    name: string;
  };
  items: DistributionItem[];
  createdBy?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  _count?: {
    items: number;
  };
}

/**
 * Hook für alle Ausschuettungen einer Gesellschaft
 */
export function useDistributions(fundId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<Distribution[]>(
    fundId ? `/api/funds/${fundId}/distributions` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  return {
    distributions: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

/**
 * Hook für eine einzelne Ausschuettung
 */
export function useDistribution(fundId: string | null, distributionId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<Distribution>(
    fundId && distributionId
      ? `/api/funds/${fundId}/distributions/${distributionId}`
      : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  return {
    distribution: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

/**
 * Erstellt eine neue Ausschuettung (Entwurf)
 */
export async function createDistribution(
  fundId: string,
  data: {
    totalAmount: number;
    distributionDate: string;
    description?: string;
    notes?: string;
  }
): Promise<Distribution> {
  const res = await fetch(`/api/funds/${fundId}/distributions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Fehler beim Erstellen");
  }

  return res.json();
}

/**
 * Fuehrt eine Ausschuettung aus (erstellt Gutschriften)
 */
export async function executeDistribution(
  fundId: string,
  distributionId: string
): Promise<{
  distribution: Distribution;
  createdInvoices: number;
  invoiceIds: string[];
}> {
  const res = await fetch(
    `/api/funds/${fundId}/distributions/${distributionId}/execute`,
    { method: "POST" }
  );

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Fehler beim Ausfuehren");
  }

  return res.json();
}

/**
 * Loescht eine Ausschuettung (nur Entwuerfe)
 */
export async function deleteDistribution(
  fundId: string,
  distributionId: string
): Promise<void> {
  const res = await fetch(
    `/api/funds/${fundId}/distributions/${distributionId}`,
    { method: "DELETE" }
  );

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Fehler beim Löschen");
  }
}

/**
 * Status-Labels (re-exported from central config for backward compatibility)
 */
export const distributionStatusLabels: Record<string, string> = Object.fromEntries(
  Object.entries(DISTRIBUTION_STATUS).map(([key, value]) => [key, value.label])
);

/**
 * Status-Farben für Badges (re-exported from central config for backward compatibility)
 */
export const distributionStatusColors: Record<string, string> = Object.fromEntries(
  Object.entries(DISTRIBUTION_STATUS).map(([key, value]) => [key, value.className])
);

// Re-export for direct usage
export { DISTRIBUTION_STATUS, getStatusBadge } from "@/lib/status-config";
