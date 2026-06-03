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
  datevAccountReceivables: string;
  datevAccountOutputTax19: string;
  datevAccountOutputTax7: string;
  datevAccountInputTax19: string;
  datevAccountInputTax7: string;
  // Geschaeftsjahr
  fiscalYearStartMonth: number; // 1-12 (1 = January)
  // GoBD retention
  gobdRetentionYearsInvoice: number;
  gobdRetentionYearsContract: number;
  // Mahnwesen
  reminderEnabled: boolean;
  reminderDays1: number;
  reminderDays2: number;
  reminderDays3: number;
  reminderFee1: number;
  reminderFee2: number;
  reminderFee3: number;
  // P10: §19 UStG Kleinunternehmer-Status. Wenn true:
  // - Ausgangsrechnungen ohne USt-Ausweis
  // - UStVA wird nicht abgegeben
  // - Tax-Codes mit Kategorie STANDARD_19/REDUCED_7 ergeben 0% effektiv
  kleinunternehmer: boolean;
  // P11: Feature-Flag für USt-Split im Auto-Posting.
  // Default false → bestehende 2-Lines-Engine (Brutto auf Erlöskonto).
  // true → neue 3-Lines-Engine (Netto auf Erlöskonto + USt-Konto separat).
  // Sanfter Rollout: pro Tenant umschaltbar, nach Validierung Default flippen.
  useTaxSplit: boolean;
  // P13: 4-Augen-Freigabe-Schwelle für Eingangsrechnungen (in EUR).
  // null = jede Rechnung braucht 4-Augen-Freigabe (createdById ≠ approvedById).
  // > 0 = nur Rechnungen mit grossAmount > Schwelle brauchen 4-Augen.
  // Auf hohem Wert (z.B. 1.000.000) effektiv deaktiviert.
  fourEyesThresholdEur: number | null;
  // Sprint 3 Permissions v2: 4-Augen-Schwellen für weitere kritische Aktionen.
  // null = immer 4-Augen, hoher Wert = effektiv deaktiviert.
  postingApprovalThresholdEur: number | null;     // Festschreiben (DRAFT → POSTED)
  reverseApprovalThresholdEur: number | null;     // Storno (Generalumkehr)
  settlementApprovalThresholdEur: number | null;  // Settlement-Finalize
  sepaApprovalThresholdEur: number | null;        // SEPA-Zahllauf
  // Audit-B: Cent-Toleranz für Bank-Match (Rundungs-Toleranz beim
  // automatischen Matchen). Wird AUCH für die Voll-bezahlt-Übergangs-Toleranz
  // genutzt — wer 0,10 € im Match akzeptiert, akzeptiert auch isFullyPaid bei
  // -0,10 € Differenz.
  bankMatchToleranceEur: number;
  // Audit-B: Toleranz für Bilanz-Identitäts-Check (Aktiva = Passiva).
  // Bei großen Tenants mit vielen Buchungen können Cent-Rundungs-Summen
  // schnell ein paar Cent erreichen.
  bilanzToleranceEur: number;
  // Audit-B: Konto auf das das Jahresergebnis beim year-end-close vorgetragen
  // wird. Default "9999" = synthetisches Konto (Vortrag NICHT auto).
  // Tenants sollten ein echtes EK-Konto setzen (SKR04 z.B. "2010" oder
  // "2120" Gewinnvortrag).
  datevAccountAnnualResult: string;
  // Audit-C: Kontenrahmen-Version. Steuert das Range-Mapping in der
  // Bilanz (skr04-mapping vs skr03-mapping).
  chartOfAccountsVersion: "SKR03" | "SKR04";
  // K-5: ABAC Default-Verhalten für FundAccess.
  //  - "allow" (Default): User ohne FundAccess-Einträge sehen ALLE Funds
  //    (Backward-Kompatibilität, bestehende Tenants).
  //  - "deny": User ohne FundAccess sehen KEINE Funds (Whitelist-only,
  //    sichere Default-Konfig für neue Tenants mit strikter ABAC).
  abacFundAccessDefault: "allow" | "deny";
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
  datevAccountReceivables: "1200",
  datevAccountOutputTax19: "1776",
  datevAccountOutputTax7: "1771",
  datevAccountInputTax19: "1576",
  datevAccountInputTax7: "1571",
  // Geschaeftsjahr
  fiscalYearStartMonth: 1,
  // GoBD retention (§147 AO)
  gobdRetentionYearsInvoice: 10,
  gobdRetentionYearsContract: 10,
  // Mahnwesen defaults
  reminderEnabled: true,
  reminderDays1: 7,
  reminderDays2: 21,
  reminderDays3: 42,
  reminderFee1: 0,
  reminderFee2: 5,
  reminderFee3: 10,
  // P10: §19 UStG — Default: Standard-Unternehmer (USt-pflichtig).
  kleinunternehmer: false,
  // P11: USt-Split Feature-Flag — default OFF während Shadow-Phase.
  useTaxSplit: false,
  // P13: 4-Augen-Schwelle Default 1.000 € — übliche Praxis im Mittelstand.
  fourEyesThresholdEur: 1000,
  // Sprint 3: 4-Augen für weitere kritische Aktionen — Defaults konservativ.
  postingApprovalThresholdEur: 5000,
  reverseApprovalThresholdEur: 0,  // jeder Storno braucht 4-Augen (Default null würde "immer" bedeuten — 0 = immer)
  settlementApprovalThresholdEur: 0,  // jedes Settlement-Finalize
  sepaApprovalThresholdEur: 10000,  // SEPA-Läufe über 10.000 €
  // Audit-B Defaults.
  bankMatchToleranceEur: 0.02,
  bilanzToleranceEur: 0.01,
  datevAccountAnnualResult: "9999",
  chartOfAccountsVersion: "SKR04",
  // K-5: Default "allow" → bestehende Tenants verhalten sich unverändert.
  abacFundAccessDefault: "allow",
};

/**
 * Load tenant settings from DB, merged with defaults.
 * Safe to call from server-side code (API routes, workers, etc.)
 *
 * Cached for 10min via Redis to avoid hot-path DB roundtrips on every
 * invoice/dunning/billing operation. Cache is invalidated by the
 * admin-settings PUT handler via invalidateTenantSettings().
 */
export async function getTenantSettings(tenantId: string): Promise<TenantSettings> {
  const { cache, CACHE_TTL } = await import("@/lib/cache");
  return cache.getOrSet<TenantSettings>(
    "tenant-settings",
    async () => {
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
    },
    CACHE_TTL.TENANT_SETTINGS,
    tenantId,
  );
}

/**
 * Invalidate the cached tenant settings after a write.
 * MUST be called after any mutation to Tenant.settings or core Tenant fields.
 */
export async function invalidateTenantSettings(tenantId: string): Promise<void> {
  const { cache } = await import("@/lib/cache");
  await cache.del("tenant-settings", tenantId);
}

/**
 * Calculate a due date from a reference date using the tenant's paymentTermDays setting.
 */
export function calculateDueDate(referenceDate: Date, paymentTermDays: number): Date {
  return new Date(referenceDate.getTime() + paymentTermDays * 24 * 60 * 60 * 1000);
}
