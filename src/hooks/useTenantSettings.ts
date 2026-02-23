import useSWR from "swr";

// =============================================================================
// TYPES
// =============================================================================

export interface TenantSettings {
  // Invoicing
  paymentTermDays: number;
  defaultTaxRate: number;
  taxExempt: boolean;
  taxExemptNote: string;
  invoicePaymentText: string;
  creditNotePaymentText: string;

  // Skonto defaults
  defaultSkontoPercent: number;
  defaultSkontoDays: number;

  // Portal
  portalEnabled: boolean;
  portalWelcomeText: string;
  portalContactEmail: string;
  portalContactPhone: string;
  portalVisibleSections: string[];

  // Email
  emailSignature: string;
  emailFromName: string;

  // Branding / Company Info
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyWebsite: string;

  // DATEV Export
  datevRevenueAccount: string;
  datevExpenseAccount: string;
  datevDebtorStart: number;
  datevCreditorStart: number;

  // GoBD Aufbewahrung
  gobdRetentionYearsInvoice: number;
  gobdRetentionYearsContract: number;
}

// =============================================================================
// FETCHER
// =============================================================================

const fetcher = async (url: string): Promise<TenantSettings> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Fehler beim Laden der Mandanten-Einstellungen");
  }
  return response.json();
};

// =============================================================================
// HOOK
// =============================================================================

export function useTenantSettings() {
  const { data, error, isLoading, mutate } = useSWR<TenantSettings>(
    "/api/admin/tenant-settings",
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 30000,
    }
  );

  async function updateSettings(
    settings: Partial<TenantSettings>
  ): Promise<TenantSettings> {
    const response = await fetch("/api/admin/tenant-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || "Fehler beim Speichern der Einstellungen"
      );
    }

    const updated = await response.json();
    mutate(updated, false);
    return updated;
  }

  return {
    settings: data,
    error,
    isLoading,
    isError: !!error,
    mutate,
    updateSettings,
  };
}
