import useSWR from "swr";
import type { DocumentTemplateLayout } from "@/types/pdf";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
    throw new Error(error.error || "Fehler beim Laden");
  }
  return res.json();
};

export type DocumentType = "INVOICE" | "CREDIT_NOTE" | "CONTRACT" | "SETTLEMENT_REPORT";

export interface DocumentTemplate {
  id: string;
  name: string;
  documentType: DocumentType;
  isDefault: boolean;
  layout: DocumentTemplateLayout;
  customCss: string | null;
  footerText: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  parkId: string | null;
  park: {
    id: string;
    name: string;
  } | null;
}

interface UseDocumentTemplatesOptions {
  documentType?: DocumentType;
  parkId?: string;
}

export function useDocumentTemplates(options: UseDocumentTemplatesOptions = {}) {
  const params = new URLSearchParams();
  if (options.documentType) params.set("documentType", options.documentType);
  if (options.parkId) params.set("parkId", options.parkId);

  const queryString = params.toString();
  const url = `/api/admin/document-templates${queryString ? `?${queryString}` : ""}`;

  const { data, error, isLoading, mutate } = useSWR<DocumentTemplate[]>(
    url,
    fetcher
  );

  return {
    templates: data,
    isLoading,
    isError: error,
    mutate,
  };
}

export function useDocumentTemplate(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<DocumentTemplate>(
    id ? `/api/admin/document-templates/${id}` : null,
    fetcher
  );

  return {
    template: data,
    isLoading,
    isError: error,
    mutate,
  };
}

export async function createDocumentTemplate(data: {
  name: string;
  documentType: DocumentType;
  layout?: Partial<DocumentTemplateLayout>;
  customCss?: string;
  footerText?: string;
  parkId?: string | null;
  isDefault?: boolean;
}) {
  const res = await fetch("/api/admin/document-templates", {
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

export async function updateDocumentTemplate(
  id: string,
  data: {
    name?: string;
    layout?: Partial<DocumentTemplateLayout>;
    customCss?: string | null;
    footerText?: string | null;
    isDefault?: boolean;
    isActive?: boolean;
  }
) {
  const res = await fetch(`/api/admin/document-templates/${id}`, {
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

export async function deleteDocumentTemplate(id: string) {
  const res = await fetch(`/api/admin/document-templates/${id}`, {
    method: "DELETE",
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Fehler beim Loeschen");
  }

  return res.json();
}

// Labels fuer DocumentType
export const documentTypeLabels: Record<DocumentType, string> = {
  INVOICE: "Rechnung",
  CREDIT_NOTE: "Gutschrift",
  CONTRACT: "Vertrag",
  SETTLEMENT_REPORT: "Abrechnungsbericht",
};
