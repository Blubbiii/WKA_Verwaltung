import useSWR from "swr";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
    throw new Error(error.error || "Fehler beim Laden");
  }
  return res.json();
};

// =============================================================================
// TYPES
// =============================================================================

export type EnergySettlementStatus = "DRAFT" | "CALCULATED" | "INVOICED" | "CLOSED";

export interface EnergySettlementItem {
  id: string;
  productionShareKwh: number;
  productionSharePct: number;
  revenueShareEur: number;
  distributionKey: string | null;
  recipientFund: {
    id: string;
    name: string;
    fundCategory?: {
      id: string;
      name: string;
      code: string;
      color: string | null;
    } | null;
  } | null;
  turbine: {
    id: string;
    designation: string;
  } | null;
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
  } | null;
}

export interface EnergySettlement {
  id: string;
  year: number;
  month: number | null;
  netOperatorRevenueEur: number;
  netOperatorReference: string | null;
  totalProductionKwh: number;
  eegProductionKwh: number | null;
  eegRevenueEur: number | null;
  dvProductionKwh: number | null;
  dvRevenueEur: number | null;
  distributionMode: "PROPORTIONAL" | "SMOOTHED" | "TOLERATED";
  smoothingFactor: number | null;
  tolerancePercentage: number | null;
  status: EnergySettlementStatus;
  calculationDetails: Record<string, unknown> | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  parkId: string;
  park: {
    id: string;
    name: string;
    shortName: string | null;
  };
  items: EnergySettlementItem[];
  _count: {
    items: number;
  };
}

export interface EnergySettlementsPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface EnergySettlementsAggregations {
  totalRevenueEur: number;
  totalProductionKwh: number;
}

export interface EnergySettlementsResponse {
  data: EnergySettlement[];
  pagination: EnergySettlementsPagination;
  aggregations: EnergySettlementsAggregations;
}

export interface UseEnergySettlementsOptions {
  parkId?: string;
  year?: number;
  month?: number;
  status?: EnergySettlementStatus;
  page?: number;
  limit?: number;
}

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Hook für alle Stromabrechnungen mit Filtern und Paginierung
 */
export function useEnergySettlements(options: UseEnergySettlementsOptions = {}) {
  const params = new URLSearchParams();

  if (options.parkId) params.set("parkId", options.parkId);
  if (options.year) params.set("year", options.year.toString());
  if (options.month) params.set("month", options.month.toString());
  if (options.status) params.set("status", options.status);
  if (options.page) params.set("page", options.page.toString());
  if (options.limit) params.set("limit", options.limit.toString());

  const queryString = params.toString();
  const url = `/api/energy/settlements${queryString ? `?${queryString}` : ""}`;

  const { data, error, isLoading, mutate } = useSWR<EnergySettlementsResponse>(
    url,
    fetcher,
    {
      revalidateOnFocus: false,
    }
  );

  return {
    settlements: data?.data ?? [],
    pagination: data?.pagination,
    aggregations: data?.aggregations,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

/**
 * Hook für eine einzelne Stromabrechnung
 */
export function useEnergySettlement(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<EnergySettlement>(
    id ? `/api/energy/settlements/${id}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
    }
  );

  return {
    settlement: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

/**
 * Neue Stromabrechnung erstellen
 */
export async function createEnergySettlement(data: {
  parkId: string;
  year: number;
  month?: number | null;
  netOperatorRevenueEur: number;
  netOperatorReference?: string | null;
  totalProductionKwh: number;
  distributionMode?: "PROPORTIONAL" | "SMOOTHED" | "TOLERATED";
  smoothingFactor?: number | null;
  tolerancePercentage?: number | null;
  notes?: string | null;
}) {
  const res = await fetch("/api/energy/settlements", {
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
 * Stromabrechnung aktualisieren
 */
export async function updateEnergySettlement(
  id: string,
  data: Partial<{
    netOperatorRevenueEur: number;
    netOperatorReference: string | null;
    totalProductionKwh: number;
    distributionMode: "PROPORTIONAL" | "SMOOTHED" | "TOLERATED";
    smoothingFactor: number | null;
    tolerancePercentage: number | null;
    status: EnergySettlementStatus;
    notes: string | null;
  }>
) {
  const res = await fetch(`/api/energy/settlements/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Fehler beim Aktualisieren");
  }

  return res.json();
}

/**
 * Stromabrechnung löschen
 */
export async function deleteEnergySettlement(id: string) {
  const res = await fetch(`/api/energy/settlements/${id}`, {
    method: "DELETE",
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Fehler beim Löschen");
  }

  return res.json();
}

/**
 * Stromabrechnung berechnen (Items generieren)
 */
export async function calculateEnergySettlement(id: string) {
  const res = await fetch(`/api/energy/settlements/${id}/calculate`, {
    method: "POST",
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Fehler bei der Berechnung");
  }

  return res.json();
}

/**
 * Gutschriften/Rechnungen aus Stromabrechnung erstellen
 */
export async function createEnergySettlementInvoices(
  id: string,
  data: {
    invoiceDate?: string;
    dueDate?: string;
    taxType?: "STANDARD" | "REDUCED" | "EXEMPT";
  }
) {
  const res = await fetch(`/api/energy/settlements/${id}/create-invoices`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Fehler beim Erstellen der Gutschriften");
  }

  return res.json();
}

/**
 * Produktionsdaten für Settlement Auto-Fill laden
 * Gibt aggregierte TurbineProduction-Daten zurück, die für
 * die automatische Befuellung der Abrechnungsfelder verwendet werden.
 */
export interface ProductionForSettlement {
  park: { id: string; name: string; shortName: string | null };
  year: number;
  month: number | null;
  status: string;
  totalProductionKwh: number;
  turbineCount: number;
  recordCount: number;
  turbineSummary: {
    turbineId: string;
    designation: string;
    totalKwh: number;
    recordCount: number;
  }[];
  productions: {
    id: string;
    turbineId: string;
    turbineDesignation: string;
    year: number;
    month: number;
    productionKwh: number;
    operatingHours: number | null;
    availabilityPct: number | null;
    status: string;
    source: string;
  }[];
}

export async function fetchProductionsForSettlement(params: {
  parkId: string;
  year: number;
  month?: number | null;
  status?: string;
}): Promise<ProductionForSettlement> {
  const searchParams = new URLSearchParams();
  searchParams.set("parkId", params.parkId);
  searchParams.set("year", params.year.toString());
  if (params.month !== undefined && params.month !== null) {
    searchParams.set("month", params.month.toString());
  }
  if (params.status) {
    searchParams.set("status", params.status);
  }

  const res = await fetch(
    `/api/energy/productions/for-settlement?${searchParams.toString()}`
  );

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
    throw new Error(error.error || "Fehler beim Laden der Produktionsdaten");
  }

  return res.json();
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Status-Labels (Deutsch)
 */
export const settlementStatusLabels: Record<EnergySettlementStatus, string> = {
  DRAFT: "Entwurf",
  CALCULATED: "Berechnet",
  INVOICED: "Abgerechnet",
  CLOSED: "Abgeschlossen",
};

/**
 * Status-Farben für Badges
 */
export const settlementStatusColors: Record<EnergySettlementStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  CALCULATED: "bg-blue-100 text-blue-800",
  INVOICED: "bg-amber-100 text-amber-800",
  CLOSED: "bg-green-100 text-green-800",
};

/**
 * Verteilungsmodus-Labels
 */
export const distributionModeLabels: Record<string, string> = {
  PROPORTIONAL: "Proportional",
  SMOOTHED: "Geglaettet",
  TOLERATED: "Mit Duldung",
};

/**
 * Monatsnamen (Deutsch)
 */
export const monthNames: Record<number, string> = {
  1: "Januar",
  2: "Februar",
  3: "Maerz",
  4: "April",
  5: "Mai",
  6: "Juni",
  7: "Juli",
  8: "August",
  9: "September",
  10: "Oktober",
  11: "November",
  12: "Dezember",
};

/**
 * Formatiert Monat/Jahr als lesbaren String
 */
export function formatPeriod(year: number, month: number | null): string {
  if (month === null || month === 0) {
    return `Jahr ${year}`;
  }
  return `${monthNames[month]} ${year}`;
}
