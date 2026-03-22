import { useQuery, useQueryClient } from "@tanstack/react-query";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
    throw new Error(error.error || "Fehler beim Laden");
  }
  return res.json();
};

export interface InvoiceSequence {
  id: string;
  type: "INVOICE" | "CREDIT_NOTE";
  format: string;
  currentYear: number;
  nextNumber: number;
  digitCount: number;
  preview: string;
  createdAt: string;
  updatedAt: string;
}

export function useInvoiceSequences() {
  const queryClient = useQueryClient();
  const { data, error, isLoading } = useQuery<InvoiceSequence[], Error>({
    queryKey: ["/api/admin/invoice-sequences"],
    queryFn: () => fetcher("/api/admin/invoice-sequences"),
  });

  return {
    sequences: data,
    isLoading,
    isError: error,
    mutate: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/invoice-sequences"] }),
  };
}

export function useInvoiceSequence(type: "INVOICE" | "CREDIT_NOTE") {
  const queryClient = useQueryClient();
  const url = `/api/admin/invoice-sequences/${type}`;

  const { data, error, isLoading } = useQuery<InvoiceSequence, Error>({
    queryKey: [url],
    queryFn: () => fetcher(url),
  });

  return {
    sequence: data,
    isLoading,
    isError: error,
    mutate: () => queryClient.invalidateQueries({ queryKey: [url] }),
  };
}

export async function updateSequence(
  type: "INVOICE" | "CREDIT_NOTE",
  data: {
    format?: string;
    nextNumber?: number;
    digitCount?: number;
  }
) {
  const res = await fetch(`/api/admin/invoice-sequences/${type}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Fehler beim Speichern");
  }

  return res.json();
}

/**
 * Generiert eine Vorschau der nächsten Nummer (client-seitig)
 */
export function generatePreviewClient(
  format: string,
  number: number,
  digitCount: number
): string {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const paddedNumber = number.toString().padStart(digitCount, "0");

  return format
    .replace("{YEAR}", currentYear.toString())
    .replace("{YY}", currentYear.toString().slice(-2))
    .replace("{NUMBER}", paddedNumber)
    .replace("{MONTH}", currentMonth.toString().padStart(2, "0"));
}
