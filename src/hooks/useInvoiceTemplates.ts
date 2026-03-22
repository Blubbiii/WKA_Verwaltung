import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { TemplateLayout, InvoiceTemplate } from "@/lib/invoice-templates/template-types";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
    throw new Error(error.error || "Fehler beim Laden");
  }
  return res.json();
};

// Hook: Fetch all invoice templates
export function useInvoiceTemplates() {
  const queryClient = useQueryClient();
  const { data, error, isLoading } = useQuery<InvoiceTemplate[], Error>({
    queryKey: ["/api/admin/invoice-templates"],
    queryFn: () => fetcher("/api/admin/invoice-templates"),
  });

  return {
    templates: data,
    isLoading,
    isError: error,
    mutate: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/invoice-templates"] }),
  };
}

// Hook: Fetch a single invoice template by ID
export function useInvoiceTemplate(id: string | null) {
  const queryClient = useQueryClient();
  const url = id ? `/api/admin/invoice-templates/${id}` : null;

  const { data, error, isLoading } = useQuery<InvoiceTemplate, Error>({
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

// API: Create a new invoice template
export async function createInvoiceTemplate(data: {
  name: string;
  layout?: TemplateLayout;
  isDefault?: boolean;
}) {
  const res = await fetch("/api/admin/invoice-templates", {
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

// API: Update an existing invoice template
export async function updateInvoiceTemplate(
  id: string,
  data: {
    name?: string;
    layout?: TemplateLayout;
    isDefault?: boolean;
    headerHtml?: string | null;
    footerHtml?: string | null;
    styles?: Record<string, unknown> | null;
    variables?: Record<string, unknown> | null;
  }
) {
  const res = await fetch(`/api/admin/invoice-templates/${id}`, {
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

// API: Delete an invoice template
export async function deleteInvoiceTemplate(id: string) {
  const res = await fetch(`/api/admin/invoice-templates/${id}`, {
    method: "DELETE",
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Fehler beim Löschen");
  }

  return res.json();
}
