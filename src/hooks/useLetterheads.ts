import useSWR from "swr";
import type { LetterheadCompanyInfo } from "@/types/pdf";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
    throw new Error(error.error || "Fehler beim Laden");
  }
  return res.json();
};

export interface Letterhead {
  id: string;
  name: string;
  isDefault: boolean;
  headerImageUrl: string | null;
  headerHeight: number | null;
  logoPosition: string;
  logoWidth: number | null;
  logoMarginTop: number | null;
  logoMarginLeft: number | null;
  senderAddress: string | null;
  companyInfo: LetterheadCompanyInfo | null;
  footerImageUrl: string | null;
  footerHeight: number | null;
  footerText: string | null;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  primaryColor: string | null;
  secondaryColor: string | null;
  backgroundPdfKey: string | null;
  backgroundPdfName: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  parkId: string | null;
  park: {
    id: string;
    name: string;
  } | null;
  fundId: string | null;
  fund: {
    id: string;
    name: string;
    legalForm: string | null;
  } | null;
}

interface UseLetterheadsOptions {
  parkId?: string;
  fundId?: string;
}

export function useLetterheads(options: UseLetterheadsOptions = {}) {
  const params = new URLSearchParams();
  if (options.parkId) params.set("parkId", options.parkId);
  if (options.fundId) params.set("fundId", options.fundId);

  const queryString = params.toString();
  const url = `/api/admin/letterheads${queryString ? `?${queryString}` : ""}`;

  const { data, error, isLoading, mutate } = useSWR<Letterhead[]>(url, fetcher);

  return {
    letterheads: data,
    isLoading,
    isError: error,
    mutate,
  };
}

export function useLetterhead(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<Letterhead>(
    id ? `/api/admin/letterheads/${id}` : null,
    fetcher
  );

  return {
    letterhead: data,
    isLoading,
    isError: error,
    mutate,
  };
}

export async function createLetterhead(data: {
  name: string;
  headerImageUrl?: string | null;
  headerHeight?: number;
  logoPosition?: string;
  logoWidth?: number;
  logoMarginTop?: number;
  logoMarginLeft?: number;
  senderAddress?: string | null;
  companyInfo?: LetterheadCompanyInfo | null;
  footerImageUrl?: string | null;
  footerHeight?: number;
  footerText?: string | null;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  parkId?: string | null;
  fundId?: string | null;
  isDefault?: boolean;
  backgroundPdfKey?: string | null;
  backgroundPdfName?: string | null;
}) {
  const res = await fetch("/api/admin/letterheads", {
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

export async function updateLetterhead(
  id: string,
  data: Partial<Omit<Letterhead, "id" | "createdAt" | "updatedAt" | "park" | "fund">>
) {
  const res = await fetch(`/api/admin/letterheads/${id}`, {
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

export async function deleteLetterhead(id: string) {
  const res = await fetch(`/api/admin/letterheads/${id}`, {
    method: "DELETE",
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Fehler beim Löschen");
  }

  return res.json();
}
