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
  // Zahlungsverkehrs-Konten für die Zahlungsbuchung (Bank an Forderung).
  // Leerstring = "nicht konfiguriert" → resolvePaymentAccount() leitet den
  // Standard aus chartOfAccountsVersion ab (SKR03 Bank 1200 / Kasse 1000,
  // SKR04 Bank 1800 / Kasse 1600). Tenants mit mehreren Bankkonten sollten
  // hier ihr Haupt-Geldkonto eintragen.
  datevAccountBank: string;
  datevAccountCash: string;
  // Aufwandskonto für endgültige Forderungsausfälle (SKR03 2400 /
  // SKR04 6930 "Forderungsverluste"). Leer = Fallback auf
  // datevAccountEinspeisung, damit die Ausbuchung in jedem Fall
  // ausgeglichen ins Hauptbuch geht.
  datevAccountBadDebt: string;
  // Wertberichtigungs-Konten für EWB/PWB (§253 HGB). Anders als beim
  // endgültigen Forderungsausfall bleibt die Forderung hier OFFEN stehen —
  // gebucht wird Aufwand (Soll) an Wertberichtigung (Haben, Passivposten).
  //   datevAccountValueAdjustmentExpense: Aufwandskonto
  //     SKR03 2400 "Forderungsverluste" / SKR04 6930
  //   datevAccountValueAdjustment: Wertberichtigungskonto (Gegenkonto)
  //     SKR03 0996/3070 / SKR04 3090 "Wertberichtigungen auf Forderungen"
  // Leer = aus chartOfAccountsVersion ableiten (resolveValueAdjustmentAccounts).
  datevAccountValueAdjustment: string;
  datevAccountValueAdjustmentExpense: string;
  // Ertragskonto für Mahngebühren und Verzugszinsen (F9-Rest, Audit 2026-07).
  //
  // Umsatzsteuer: Mahngebühren und Verzugszinsen nach §288 BGB sind
  // Verzugsschaden, also Schadensersatz und KEIN Leistungsaustausch — damit
  // nicht umsatzsteuerbar. Es wird deshalb ohne USt-Split gebucht (EXEMPT).
  //
  // Zeitpunkt: gebucht wird bei ZAHLUNG, nicht bei Versand der Mahnung. Ein
  // Schadensersatzanspruch von unsicherer Einbringlichkeit wird nach dem
  // Vorsichtsprinzip (§252 Abs. 1 Nr. 4 HGB) nicht vorab als Forderung
  // aktiviert. Das vermeidet zugleich eine Forderung, die nie ausgeglichen
  // werden kann, weil die Rechnung selbst ihren Bruttobetrag behält.
  //
  // KEIN Default: fachlich gehören die Erträge unter "sonstige betriebliche
  // Erträge", die konkrete Kontonummer hängt aber am Kontenrahmen des
  // Mandanten. Solange hier nichts steht, wird der Gebührenanteil NICHT
  // gebucht (Verhalten wie bisher) und der Fall geloggt — lieber nicht buchen
  // als auf ein geratenes Konto buchen. Gleiche Linie wie datevAccountBank.
  datevAccountDunningFee: string;
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
  // Cent-Toleranz für Bank-Match (Rundungs-Toleranz beim
  // automatischen Matchen). Wird AUCH für die Voll-bezahlt-Übergangs-Toleranz
  // genutzt — wer 0,10 € im Match akzeptiert, akzeptiert auch isFullyPaid bei
  // -0,10 € Differenz.
  bankMatchToleranceEur: number;
  // Toleranz für Bilanz-Identitäts-Check (Aktiva = Passiva).
  // Bei großen Tenants mit vielen Buchungen können Cent-Rundungs-Summen
  // schnell ein paar Cent erreichen.
  bilanzToleranceEur: number;
  // Konto auf das das Jahresergebnis beim year-end-close vorgetragen
  // wird. Default "9999" = synthetisches Konto (Vortrag NICHT auto).
  // Tenants sollten ein echtes EK-Konto setzen (SKR04 z.B. "2010" oder
  // "2120" Gewinnvortrag).
  datevAccountAnnualResult: string;
  // Kontenrahmen-Version. Steuert das Range-Mapping in der
  // Bilanz (skr04-mapping vs skr03-mapping).
  chartOfAccountsVersion: "SKR03" | "SKR04";
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
  // Leer = aus chartOfAccountsVersion ableiten (siehe resolvePaymentAccount).
  // Kein hartkodierter Default, weil "1200" je nach Kontenrahmen entweder
  // Bank (SKR03) oder Forderungen (SKR04) bedeutet — ein falscher Default
  // würde Bank an Bank buchen.
  datevAccountBank: "",
  datevAccountCash: "",
  datevAccountBadDebt: "",
  // Leer = aus chartOfAccountsVersion ableiten (resolveValueAdjustmentAccounts).
  datevAccountValueAdjustment: "",
  datevAccountValueAdjustmentExpense: "",
  // Leer = Gebührenanteil wird nicht gebucht (siehe Kommentar am Typ).
  datevAccountDunningFee: "",
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
  // Bank-Match + Bilanz-Toleranz Defaults.
  bankMatchToleranceEur: 0.02,
  bilanzToleranceEur: 0.01,
  datevAccountAnnualResult: "9999",
  chartOfAccountsVersion: "SKR04",
  // Default "allow" → bestehende Tenants verhalten sich unverändert.
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
 * Geldkonto (Bank / Kasse) für Zahlungsbuchungen auflösen.
 *
 * Bevorzugt die explizite Tenant-Konfiguration. Ist sie leer, wird der
 * DATEV-Standard des jeweiligen Kontenrahmens genommen:
 *   SKR03: Bank 1200, Kasse 1000
 *   SKR04: Bank 1800, Kasse 1600
 *
 * @param kind "BANK" für Bank-/SEPA-Zahlungen, "CASH" für Barzahlungen.
 */
export function resolvePaymentAccount(
  settings: TenantSettings,
  kind: "BANK" | "CASH",
): string {
  const configured = kind === "CASH" ? settings.datevAccountCash : settings.datevAccountBank;
  if (configured && configured.trim().length > 0) return configured.trim();

  const isSkr03 = settings.chartOfAccountsVersion === "SKR03";
  if (kind === "CASH") return isSkr03 ? "1000" : "1600";
  return isSkr03 ? "1200" : "1800";
}

/**
 * Konten für die Wertberichtigung (EWB/PWB, §253 Abs. 4 HGB) auflösen.
 *
 * Buchungssatz: Aufwand (Soll) an Wertberichtigung (Haben).
 * Die Forderung selbst bleibt unberührt — das ist der Unterschied zum
 * endgültigen Forderungsausfall (DIRECT_WRITEOFF), der die Forderung ausbucht.
 *
 * Bevorzugt die explizite Tenant-Konfiguration, sonst DATEV-Standard:
 *   SKR03: Aufwand 2400 (Forderungsverluste) / WB-Konto 0996
 *   SKR04: Aufwand 6930 (Forderungsverluste) / WB-Konto 3090
 */
export function resolveValueAdjustmentAccounts(settings: TenantSettings): {
  expenseAccount: string;
  adjustmentAccount: string;
} {
  const isSkr03 = settings.chartOfAccountsVersion === "SKR03";

  const expenseConfigured =
    settings.datevAccountValueAdjustmentExpense?.trim() ||
    settings.datevAccountBadDebt?.trim();
  const adjustmentConfigured = settings.datevAccountValueAdjustment?.trim();

  return {
    expenseAccount: expenseConfigured || (isSkr03 ? "2400" : "6930"),
    adjustmentAccount: adjustmentConfigured || (isSkr03 ? "0996" : "3090"),
  };
}

/**
 * Calculate a due date from a reference date using the tenant's paymentTermDays setting.
 */
export function calculateDueDate(referenceDate: Date, paymentTermDays: number): Date {
  return new Date(referenceDate.getTime() + paymentTermDays * 24 * 60 * 60 * 1000);
}
