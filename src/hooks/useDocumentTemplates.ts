import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  const queryClient = useQueryClient();
  const params = new URLSearchParams();
  if (options.documentType) params.set("documentType", options.documentType);
  if (options.parkId) params.set("parkId", options.parkId);

  const queryString = params.toString();
  const url = `/api/admin/document-templates${queryString ? `?${queryString}` : ""}`;

  const { data, error, isLoading } = useQuery<DocumentTemplate[], Error>({
    queryKey: [url],
    queryFn: () => fetcher(url),
  });

  return {
    templates: data,
    isLoading,
    isError: error,
    mutate: () => queryClient.invalidateQueries({ queryKey: [url] }),
  };
}

export function useDocumentTemplate(id: string | null) {
  const queryClient = useQueryClient();
  const url = id ? `/api/admin/document-templates/${id}` : null;

  const { data, error, isLoading } = useQuery<DocumentTemplate, Error>({
    queryKey: [url],
    queryFn: () => fetcher(url!),
    enabled: !!id,
  });

  return {
    template: data,
    isLoading,
    isError: error,
    mutate: () => url && queryClient.invalidateQueries({ queryKey: [url] }),
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
    throw new Error(error.error || "Fehler beim Löschen");
  }

  return res.json();
}

// Labels für DocumentType
export const documentTypeLabels: Record<DocumentType, string> = {
  INVOICE: "Rechnung",
  CREDIT_NOTE: "Gutschrift",
  CONTRACT: "Vertrag",
  SETTLEMENT_REPORT: "Abrechnungsbericht",
};
