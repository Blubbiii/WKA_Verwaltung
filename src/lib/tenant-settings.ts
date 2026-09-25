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
  // GoBD retention
  gobdRetentionYearsInvoice: number;
  gobdRetentionYearsContract: number;
  /**
   * Aufbewahrung des Änderungsprotokolls.
   *
   * Wird beim Löschlauf nie unterschritten, sondern gegen die beiden Fristen
   * darüber gedeckelt: das Protokoll erklärt, wer einen Beleg wann geändert
   * hat. Verschwände es früher als der Beleg, bliebe der Beleg ohne seine
   * Nachvollziehbarkeit zurück — genau das, was § 147 Abs. 1 Nr. 1 AO in
   * Verbindung mit den GoBD verhindern soll.
   */
  gobdRetentionYearsAuditLog: number;
  // Mahnwesen
  reminderEnabled: boolean;
  reminderDays1: number;
  reminderDays2: number;
  reminderDays3: number;
  reminderFee1: number;
  reminderFee2: number;
  reminderFee3: number;
  // P13: 4-Augen-Freigabe-Schwelle für Eingangsrechnungen (in EUR).
  // null = jede Rechnung braucht 4-Augen-Freigabe (createdById ≠ approvedById).
  // > 0 = nur Rechnungen mit grossAmount > Schwelle brauchen 4-Augen.
  // Auf hohem Wert (z.B. 1.000.000) effektiv deaktiviert.
  fourEyesThresholdEur: number | null;
  // 4-Augen-Schwelle für das Abschließen einer Abrechnungsperiode.
  // null = immer 4-Augen, hoher Wert = effektiv deaktiviert.
  settlementApprovalThresholdEur: number | null;
  // Cent-Toleranz für Bank-Match (Rundungs-Toleranz beim
  // automatischen Matchen). Wird AUCH für die Voll-bezahlt-Übergangs-Toleranz
  // genutzt — wer 0,10 € im Match akzeptiert, akzeptiert auch isFullyPaid bei
  // -0,10 € Differenz.
  bankMatchToleranceEur: number;
  // ABAC Default-Verhalten für FundAccess.
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
  // GoBD retention (§147 AO)
  gobdRetentionYearsInvoice: 10,
  gobdRetentionYearsContract: 10,
  gobdRetentionYearsAuditLog: 10,
  // Mahnwesen defaults
  reminderEnabled: true,
  reminderDays1: 7,
  reminderDays2: 21,
  reminderDays3: 42,
  reminderFee1: 0,
  reminderFee2: 5,
  reminderFee3: 10,
  // P13: 4-Augen-Schwelle Default 1.000 € — übliche Praxis im Mittelstand.
  fourEyesThresholdEur: 1000,
  // Sprint 3: 4-Augen für weitere kritische Aktionen — Defaults konservativ.
  settlementApprovalThresholdEur: 0,  // jedes Settlement-Finalize
  // Bank-Match-Toleranz Default.
  bankMatchToleranceEur: 0.02,
  // Default "allow" → bestehende Tenants verhalten sich unverändert.
  abacFundAccessDefault: "allow",
};

/**
 * Only the fields TenantSettings still knows. Stored JSON may carry fields of
 * removed features (DATEV accounts, chart of accounts); passing them on would
 * keep them alive in every read and every write forever.
 */
export function nurBekannteEinstellungen(gespeichert: Record<string, unknown>): Partial<TenantSettings> {
  return Object.fromEntries(
    Object.entries(gespeichert).filter(([key]) => key in DEFAULT_TENANT_SETTINGS),
  ) as Partial<TenantSettings>;
}

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
        ...nurBekannteEinstellungen(stored),
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
