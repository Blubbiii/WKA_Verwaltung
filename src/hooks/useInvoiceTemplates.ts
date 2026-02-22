import useSWR from "swr";
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
  const { data, error, isLoading, mutate } = useSWR<InvoiceTemplate[]>(
    "/api/admin/invoice-templates",
    fetcher
  );

  return {
    templates: data,
    isLoading,
    isError: error,
    mutate,
  };
}

// Hook: Fetch a single invoice template by ID
export function useInvoiceTemplate(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<InvoiceTemplate>(
    id ? `/api/admin/invoice-templates/${id}` : null,
    fetcher
  );

  return {
    template: data,
    isLoading,
    isError: error,
    mutate,
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
    throw new Error(error.error || "Fehler beim Loeschen");
  }

  return res.json();
}
