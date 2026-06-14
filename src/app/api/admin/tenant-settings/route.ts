import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";
import {
  DEFAULT_TENANT_SETTINGS as CANONICAL_DEFAULTS,
  type TenantSettings as CanonicalTenantSettings,
} from "@/lib/tenant-settings";

// =============================================================================
// TYPES & DEFAULTS
// =============================================================================
//
// Audit-6A (A-4): Defaults werden aus `src/lib/tenant-settings.ts` re-exportiert.
// Vorher waren sie hier dupliziert — bei Schema-Erweiterungen (z.B. neue
// Approval-Thresholds aus Sprint 3) wurde nur eine Stelle gepflegt und die
// Admin-UI lief auf einem veralteten Defaults-Set.
//
// Das hier stehende `TenantSettings`-Interface bleibt als lokale Variante
// erhalten — es repräsentiert das _über die Admin-UI verwaltbare_ Subset.
// Felder wie `postingApprovalThresholdEur` und `abacFundAccessDefault` werden
// separat verwaltet und sind hier bewusst nicht aufgeführt.

export interface TenantSettings {
  // Invoicing
  paymentTermDays: number;
  defaultTaxRate: number;
  taxExempt: boolean;
  taxExemptNote: string;
  invoicePaymentText: string;
  creditNotePaymentText: string;

  // Skonto defaults (early payment discount)
  defaultSkontoPercent: number; // e.g. 2 for 2%
  defaultSkontoDays: number; // e.g. 7 days

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

  // SKR03 Kontenrahmen
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
  fiscalYearStartMonth: number;

  // GoBD Aufbewahrung
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

  // P10: §19 UStG Kleinunternehmer-Status
  kleinunternehmer: boolean;
  // P11: USt-Split Feature-Flag (default OFF während Shadow-Phase)
  useTaxSplit: boolean;
  // P13: 4-Augen-Freigabe-Schwelle in EUR (null = immer 4-Augen)
  fourEyesThresholdEur: number | null;
  // Audit-B: Cent-Toleranz für Bank-Match + Voll-bezahlt
  bankMatchToleranceEur: number;
  // Audit-B: Toleranz für Bilanz-Identitäts-Check (A=P)
  bilanzToleranceEur: number;
  // Audit-B: Konto auf das das Jahresergebnis vorgetragen wird
  datevAccountAnnualResult: string;
  // Audit-C: Kontenrahmen-Version (steuert Range-Mapping)
  chartOfAccountsVersion: "SKR03" | "SKR04";
}

// Audit-6A (A-4): Defaults werden aus dem kanonischen Settings-Modul übernommen.
// `CANONICAL_DEFAULTS` enthält ein Superset; das `as` projiziert auf das hier
// gepflegte (Admin-UI-bezogene) Subset. Schema-Bewegungen (neue Felder oben
// im Interface) sind damit unmittelbar in den Defaults sichtbar.
const DEFAULT_TENANT_SETTINGS: TenantSettings = CANONICAL_DEFAULTS as unknown as TenantSettings;


// =============================================================================
// ZOD VALIDATION SCHEMA
// =============================================================================

const VALID_PORTAL_SECTIONS = [
  "distributions",
  "documents",
  "votes",
  "reports",
  "proxies",
] as const;

const tenantSettingsSchema = z.object({
  // Invoicing
  paymentTermDays: z
    .number()
    .int()
    .min(1, "Zahlungsziel muss mindestens 1 Tag sein")
    .max(365, "Zahlungsziel darf maximal 365 Tage sein")
    .optional(),
  defaultTaxRate: z
    .number()
    .min(0, "Steuersatz darf nicht negativ sein")
    .max(100, "Steuersatz darf maximal 100% sein")
    .optional(),
  taxExempt: z.boolean().optional(),
  taxExemptNote: z
    .string()
    .max(500, "Steuerbefreiungshinweis darf maximal 500 Zeichen haben")
    .optional(),
  invoicePaymentText: z
    .string()
    .max(1000, "Rechnungstext darf maximal 1000 Zeichen haben")
    .optional(),
  creditNotePaymentText: z
    .string()
    .max(1000, "Gutschriftstext darf maximal 1000 Zeichen haben")
    .optional(),

  // Skonto defaults
  defaultSkontoPercent: z
    .number()
    .min(0, "Skonto-Prozent darf nicht negativ sein")
    .max(99.99, "Skonto-Prozent darf maximal 99,99% sein")
    .optional(),
  defaultSkontoDays: z
    .number()
    .int()
    .min(1, "Skonto-Tage muss mindestens 1 sein")
    .max(365, "Skonto-Tage darf maximal 365 sein")
    .optional(),

  // Portal
  portalEnabled: z.boolean().optional(),
  portalWelcomeText: z
    .string()
    .max(2000, "Begruesungstext darf maximal 2000 Zeichen haben")
    .optional(),
  portalContactEmail: z
    .string()
    .email("Ungültige E-Mail-Adresse")
    .or(z.literal(""))
    .optional(),
  portalContactPhone: z
    .string()
    .max(50, "Telefonnummer darf maximal 50 Zeichen haben")
    .optional(),
  portalVisibleSections: z
    .array(z.enum(VALID_PORTAL_SECTIONS))
    .optional(),

  // Email
  emailSignature: z
    .string()
    .max(5000, "E-Mail-Signatur darf maximal 5000 Zeichen haben")
    .optional(),
  emailFromName: z
    .string()
    .max(100, "Absender-Name darf maximal 100 Zeichen haben")
    .optional(),

  // Branding / Company Info
  companyName: z
    .string()
    .max(200, "Firmenname darf maximal 200 Zeichen haben")
    .optional(),
  companyAddress: z
    .string()
    .max(500, "Firmenadresse darf maximal 500 Zeichen haben")
    .optional(),
  companyPhone: z
    .string()
    .max(50, "Telefonnummer darf maximal 50 Zeichen haben")
    .optional(),
  companyEmail: z
    .string()
    .email("Ungültige E-Mail-Adresse")
    .or(z.literal(""))
    .optional(),
  companyWebsite: z
    .string()
    .max(200, "Website darf maximal 200 Zeichen haben")
    .optional(),

  // DATEV Export
  datevRevenueAccount: z
    .string()
    .max(10, "Sachkonto darf maximal 10 Zeichen haben")
    .regex(/^\d{4,10}$/, "Sachkonto muss 4-10 Ziffern enthalten")
    .optional(),
  datevExpenseAccount: z
    .string()
    .max(10, "Sachkonto darf maximal 10 Zeichen haben")
    .regex(/^\d{4,10}$/, "Sachkonto muss 4-10 Ziffern enthalten")
    .optional(),
  datevDebtorStart: z
    .number()
    .int()
    .min(1000, "Debitorennummernkreis muss mindestens 1000 sein")
    .max(99999999, "Debitorennummernkreis darf maximal 99999999 sein")
    .optional(),
  datevCreditorStart: z
    .number()
    .int()
    .min(1000, "Kreditorennummernkreis muss mindestens 1000 sein")
    .max(99999999, "Kreditorennummernkreis darf maximal 99999999 sein")
    .optional(),

  // SKR03 Kontenrahmen
  datevAccountEinspeisung: z
    .string()
    .regex(/^\d{4,10}$/, "Kontonummer muss 4-10 Ziffern enthalten")
    .optional(),
  datevAccountDirektvermarktung: z
    .string()
    .regex(/^\d{4,10}$/, "Kontonummer muss 4-10 Ziffern enthalten")
    .optional(),
  datevAccountPachtEinnahmen: z
    .string()
    .regex(/^\d{4,10}$/, "Kontonummer muss 4-10 Ziffern enthalten")
    .optional(),
  datevAccountPachtAufwand: z
    .string()
    .regex(/^\d{4,10}$/, "Kontonummer muss 4-10 Ziffern enthalten")
    .optional(),
  datevAccountWartung: z
    .string()
    .regex(/^\d{4,10}$/, "Kontonummer muss 4-10 Ziffern enthalten")
    .optional(),
  datevAccountBF: z
    .string()
    .regex(/^\d{4,10}$/, "Kontonummer muss 4-10 Ziffern enthalten")
    .optional(),

  // GoBD Aufbewahrung
  gobdRetentionYearsInvoice: z
    .number()
    .int()
    .min(1, "Aufbewahrungsfrist muss mindestens 1 Jahr sein")
    .max(30, "Aufbewahrungsfrist darf maximal 30 Jahre sein")
    .optional(),
  gobdRetentionYearsContract: z
    .number()
    .int()
    .min(1, "Aufbewahrungsfrist muss mindestens 1 Jahr sein")
    .max(30, "Aufbewahrungsfrist darf maximal 30 Jahre sein")
    .optional(),

  // Mahnwesen
  reminderEnabled: z.boolean().optional(),
  reminderDays1: z
    .number()
    .int()
    .min(0, "Darf nicht negativ sein")
    .max(365, "Maximal 365 Tage")
    .optional(),
  reminderDays2: z
    .number()
    .int()
    .min(0, "Darf nicht negativ sein")
    .max(365, "Maximal 365 Tage")
    .optional(),
  reminderDays3: z
    .number()
    .int()
    .min(0, "Darf nicht negativ sein")
    .max(365, "Maximal 365 Tage")
    .optional(),
  reminderFee1: z
    .number()
    .min(0, "Mahngebühr darf nicht negativ sein")
    .max(999.99, "Mahngebühr zu hoch")
    .optional(),
  reminderFee2: z
    .number()
    .min(0, "Mahngebühr darf nicht negativ sein")
    .max(999.99, "Mahngebühr zu hoch")
    .optional(),
  reminderFee3: z
    .number()
    .min(0, "Mahngebühr darf nicht negativ sein")
    .max(999.99, "Mahngebühr zu hoch")
    .optional(),

  // HGB-Compliance (P10-P19 + Audit B/C)
  kleinunternehmer: z.boolean().optional(),
  useTaxSplit: z.boolean().optional(),
  fourEyesThresholdEur: z
    .number()
    .min(0, "Schwelle darf nicht negativ sein")
    .max(10_000_000, "Schwelle zu hoch")
    .nullable()
    .optional(),
  bankMatchToleranceEur: z
    .number()
    .min(0, "Toleranz darf nicht negativ sein")
    .max(100, "Toleranz zu hoch (max 100€)")
    .optional(),
  bilanzToleranceEur: z
    .number()
    .min(0, "Toleranz darf nicht negativ sein")
    .max(100, "Toleranz zu hoch (max 100€)")
    .optional(),
  datevAccountAnnualResult: z
    .string()
    .regex(/^\d{4,10}$/, "Kontonummer muss 4-10 Ziffern enthalten")
    .optional(),
  chartOfAccountsVersion: z.enum(["SKR03", "SKR04"]).optional(),
});

// =============================================================================
// GET /api/admin/tenant-settings
// =============================================================================

export async function GET(_request: NextRequest) {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: check.tenantId },
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
      return apiError("NOT_FOUND", undefined, { message: "Mandant nicht gefunden" });
    }

    // Extract tenant-settings sub-key from settings JSON
    const allSettings = (tenant.settings as Record<string, unknown>) || {};
    const storedTenantSettings =
      (allSettings.tenantSettings as Record<string, unknown>) || {};

    // Build defaults that incorporate existing tenant-level fields as fallbacks
    const dynamicDefaults: TenantSettings = {
      ...DEFAULT_TENANT_SETTINGS,
      companyName: tenant.name || "",
      companyEmail: tenant.contactEmail || "",
      companyPhone: tenant.contactPhone || "",
      companyAddress: tenant.address || "",
      emailFromName: tenant.emailFromName || "",
    };

    // Merge stored settings on top of defaults
    const merged: TenantSettings = {
      ...dynamicDefaults,
      ...storedTenantSettings,
    };

    return NextResponse.json(merged);
  } catch (error) {
    logger.error({ err: error }, "Error fetching tenant settings");
    return apiError("TENANT_MISMATCH", 500, { message: "Fehler beim Laden der Mandanten-Einstellungen" });
  }
}

// =============================================================================
// PUT /api/admin/tenant-settings
// =============================================================================

export async function PUT(request: NextRequest) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const body = await request.json();

    // Validate with Zod
    const parsed = tenantSettingsSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return apiError("BAD_REQUEST", undefined, { message: firstError?.message || "Ungültige Eingabedaten", details: parsed.error.issues.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })) });
    }

    // Get current tenant settings
    const tenant = await prisma.tenant.findUnique({
      where: { id: check.tenantId },
      select: { settings: true },
    });

    if (!tenant) {
      return apiError("NOT_FOUND", undefined, { message: "Mandant nicht gefunden" });
    }

    const currentSettings =
      (tenant.settings as Record<string, unknown>) || {};
    const currentTenantSettings =
      (currentSettings.tenantSettings as Record<string, unknown>) || {};

    // Merge only provided fields (partial update)
    const updatedTenantSettings = {
      ...currentTenantSettings,
      ...parsed.data,
    };

    // Update the tenant settings JSON preserving other sub-keys (general, etc.)
    const updatedSettings = JSON.parse(
      JSON.stringify({
        ...currentSettings,
        tenantSettings: updatedTenantSettings,
      })
    );

    await prisma.tenant.update({
      where: { id: check.tenantId },
      data: {
        settings: updatedSettings,
      },
    });

    // Return the merged full settings
    const fullSettings: TenantSettings = {
      ...DEFAULT_TENANT_SETTINGS,
      ...updatedTenantSettings,
    };

    return NextResponse.json(fullSettings);
  } catch (error) {
    logger.error({ err: error }, "Error saving tenant settings");
    return apiError("TENANT_MISMATCH", 500, { message: "Fehler beim Speichern der Mandanten-Einstellungen" });
  }
}
