/**
 * Server-side utility to load tenant settings from the database.
 * Use this in API routes, server actions, and background workers
 * instead of hardcoding values like paymentTermDays, taxExemptNote, etc.
 */

import { prisma } from "@/lib/prisma";

// Keep in sync with src/app/api/admin/tenant-settings/route.ts
export interface TenantSettings {
  paymentTermDays: number;
  defaultTaxRate: number;
  taxExempt: boolean;
  taxExemptNote: string;
  invoicePaymentText: string;
  creditNotePaymentText: string;
  defaultSkontoPercent: number;
  defaultSkontoDays: number;
  portalEnabled: boolean;
  portalWelcomeText: string;
  portalContactEmail: string;
  portalContactPhone: string;
  portalVisibleSections: string[];
  emailSignature: string;
  emailFromName: string;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyWebsite: string;
  // DATEV accounts
  datevRevenueAccount: string;
  datevExpenseAccount: string;
  datevDebtorStart: number;
  datevCreditorStart: number;
  // SKR03 Kontenrahmen (konfigurierbar je Mandant)
  datevAccountEinspeisung: string;
  datevAccountDirektvermarktung: string;
  datevAccountPachtEinnahmen: string;
  datevAccountPachtAufwand: string;
  datevAccountWartung: string;
  datevAccountBF: string;
  // GoBD retention
  gobdRetentionYearsInvoice: number;
  gobdRetentionYearsContract: number;
}

export const DEFAULT_TENANT_SETTINGS: TenantSettings = {
  paymentTermDays: 30,
  defaultTaxRate: 19,
  taxExempt: false,
  taxExemptNote: "Steuerfrei gem. \u00a74 Nr.12 UStG",
  invoicePaymentText:
    "Bitte überweisen Sie den Betrag bis zum {dueDate} auf das unten angegebene Konto. Geben Sie als Verwendungszweck bitte die Rechnungsnummer {invoiceNumber} an.",
  creditNotePaymentText:
    "Der Gutschriftsbetrag wird bis zum {dueDate} auf Ihr Konto überwiesen. Referenz: Gutschriftsnummer {invoiceNumber}.",
  defaultSkontoPercent: 2,
  defaultSkontoDays: 7,
  portalEnabled: true,
  portalWelcomeText: "",
  portalContactEmail: "",
  portalContactPhone: "",
  portalVisibleSections: ["distributions", "documents", "votes", "reports", "proxies"],
  emailSignature: "",
  emailFromName: "",
  companyName: "",
  companyAddress: "",
  companyPhone: "",
  companyEmail: "",
  companyWebsite: "",
  // DATEV defaults (SKR03)
  datevRevenueAccount: "8400",
  datevExpenseAccount: "8000",
  datevDebtorStart: 10000,
  datevCreditorStart: 70000,
  // SKR03 Kontenrahmen-Defaults
  datevAccountEinspeisung: "8400",
  datevAccountDirektvermarktung: "8338",
  datevAccountPachtEinnahmen: "8210",
  datevAccountPachtAufwand: "4210",
  datevAccountWartung: "4950",
  datevAccountBF: "4120",
  // GoBD retention (§147 AO)
  gobdRetentionYearsInvoice: 10,
  gobdRetentionYearsContract: 10,
};

/**
 * Load tenant settings from DB, merged with defaults.
 * Safe to call from server-side code (API routes, workers, etc.)
 */
export async function getTenantSettings(tenantId: string): Promise<TenantSettings> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      settings: true,
      name: true,
      contactEmail: true,
      contactPhone: true,
      address: true,
      emailFromName: true,
    },
  });

  if (!tenant) {
    return { ...DEFAULT_TENANT_SETTINGS };
  }

  const allSettings = (tenant.settings as Record<string, unknown>) || {};
  const stored = (allSettings.tenantSettings as Record<string, unknown>) || {};

  return {
    ...DEFAULT_TENANT_SETTINGS,
    companyName: tenant.name || "",
    companyEmail: tenant.contactEmail || "",
    companyPhone: tenant.contactPhone || "",
    companyAddress: tenant.address || "",
    emailFromName: tenant.emailFromName || "",
    ...stored,
  };
}

/**
 * Calculate a due date from a reference date using the tenant's paymentTermDays setting.
 */
export function calculateDueDate(referenceDate: Date, paymentTermDays: number): Date {
  return new Date(referenceDate.getTime() + paymentTermDays * 24 * 60 * 60 * 1000);
}
