import useSWR from "swr";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
    throw new Error(error.error || "Fehler beim Laden");
  }
  return res.json();
};

export type SettlementPeriodStatus = "OPEN" | "IN_PROGRESS" | "PENDING_REVIEW" | "APPROVED" | "CLOSED";

export interface SettlementPeriod {
  id: string;
  year: number;
  month?: number | null;
  periodType: "ADVANCE" | "FINAL";
  status: SettlementPeriodStatus;
  advanceInvoiceDate: string | null;
  settlementDate: string | null;
  totalRevenue: number | null;
  totalMinimumRent: number | null;
  totalActualRent: number | null;
  linkedEnergySettlementId?: string | null;
  notes: string | null;
  reviewedById?: string | null;
  reviewedBy?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
  parkId: string;
  park: {
    id: string;
    name: string;
  };
  createdBy?: {
    id: string;
    name: string;
  };
  _count?: {
    invoices: number;
  };
}

export interface SettlementPeriodWithDetails extends SettlementPeriod {
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    invoiceType: string;
    status: string;
    grossAmount: number;
    invoiceDate: string;
    recipientName?: string;
  }>;
}

interface UseSettlementPeriodsOptions {
  parkId?: string;
  year?: number;
  periodType?: "ADVANCE" | "FINAL";
  status?: SettlementPeriodStatus;
}

export function useSettlementPeriods(options: UseSettlementPeriodsOptions = {}) {
  const params = new URLSearchParams();
  if (options.parkId) params.set("parkId", options.parkId);
  if (options.year) params.set("year", options.year.toString());
  if (options.periodType) params.set("periodType", options.periodType);
  if (options.status) params.set("status", options.status);

  const queryString = params.toString();
  const url = `/api/admin/settlement-periods${queryString ? `?${queryString}` : ""}`;

  const { data, error, isLoading, mutate } = useSWR<SettlementPeriod[]>(
    url,
    fetcher
  );

  return {
    periods: data,
    isLoading,
    isError: error,
    mutate,
  };
}

export function useSettlementPeriod(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<SettlementPeriodWithDetails>(
    id ? `/api/admin/settlement-periods/${id}` : null,
    fetcher
  );

  return {
    period: data,
    isLoading,
    isError: error,
    mutate,
  };
}

export async function createSettlementPeriod(data: {
  year: number;
  month?: number | null;
  periodType?: "ADVANCE" | "FINAL";
  parkId: string;
  notes?: string;
}) {
  const res = await fetch("/api/admin/settlement-periods", {
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

export async function updateSettlementPeriod(
  id: string,
  data: {
    status?: SettlementPeriodStatus;
    advanceInvoiceDate?: string | null;
    settlementDate?: string | null;
    totalRevenue?: number | null;
    totalMinimumRent?: number | null;
    totalActualRent?: number | null;
    notes?: string | null;
  }
) {
  const res = await fetch(`/api/admin/settlement-periods/${id}`, {
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

export async function deleteSettlementPeriod(id: string) {
  const res = await fetch(`/api/admin/settlement-periods/${id}`, {
    method: "DELETE",
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Fehler beim Loeschen");
  }

  return res.json();
}

export async function calculateSettlement(id: string) {
  const res = await fetch(`/api/admin/settlement-periods/${id}/calculate`, {
    method: "POST",
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Fehler bei der Berechnung");
  }

  return res.json();
}

export async function createSettlementInvoices(
  id: string,
  data: {
    taxType?: "STANDARD" | "REDUCED" | "EXEMPT";
    invoiceDate?: string;
    dueDate?: string;
  }
) {
  const res = await fetch(`/api/admin/settlement-periods/${id}/create-invoices`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Fehler beim Erstellen der Rechnungen");
  }

  return res.json();
}

export async function approveSettlementPeriod(
  id: string,
  data: {
    action: "approve" | "reject";
    notes?: string | null;
  }
) {
  const res = await fetch(`/api/admin/settlement-periods/${id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Fehler bei der Genehmigung");
  }

  return res.json();
}

/**
 * Status-Labels
 */
export const settlementStatusLabels: Record<string, string> = {
  OPEN: "Offen",
  IN_PROGRESS: "In Bearbeitung",
  PENDING_REVIEW: "Zur Pruefung",
  APPROVED: "Genehmigt",
  CLOSED: "Abgeschlossen",
};

/**
 * Status-Farben fuer Badges
 */
export const settlementStatusColors: Record<string, string> = {
  OPEN: "bg-gray-100 text-gray-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  PENDING_REVIEW: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  CLOSED: "bg-green-100 text-green-800",
};
