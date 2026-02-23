import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// TYPES & DEFAULTS
// =============================================================================

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

  // GoBD Aufbewahrung
  gobdRetentionYearsInvoice: number;
  gobdRetentionYearsContract: number;
}

const DEFAULT_TENANT_SETTINGS: TenantSettings = {
  // Invoicing
  paymentTermDays: 30,
  defaultTaxRate: 19,
  taxExempt: false,
  taxExemptNote: "Steuerfrei gem. \u00a74 Nr.12 UStG",
  invoicePaymentText: "Bitte ueberweisen Sie den Betrag bis zum {dueDate} auf das unten angegebene Konto. Geben Sie als Verwendungszweck bitte die Rechnungsnummer {invoiceNumber} an.",
  creditNotePaymentText: "Der Gutschriftsbetrag wird bis zum {dueDate} auf Ihr Konto ueberwiesen. Referenz: Gutschriftsnummer {invoiceNumber}.",

  // Skonto defaults
  defaultSkontoPercent: 2,
  defaultSkontoDays: 7,

  // Portal
  portalEnabled: true,
  portalWelcomeText: "",
  portalContactEmail: "",
  portalContactPhone: "",
  portalVisibleSections: [
    "distributions",
    "documents",
    "votes",
    "reports",
    "proxies",
  ],

  // Email
  emailSignature: "",
  emailFromName: "",

  // Branding / Company Info
  companyName: "",
  companyAddress: "",
  companyPhone: "",
  companyEmail: "",
  companyWebsite: "",

  // DATEV Export (SKR04 defaults)
  datevRevenueAccount: "8400",
  datevExpenseAccount: "8000",
  datevDebtorStart: 10000,
  datevCreditorStart: 70000,

  // GoBD Aufbewahrung (§147 AO)
  gobdRetentionYearsInvoice: 10,
  gobdRetentionYearsContract: 10,
};

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
    .email("Ungueltige E-Mail-Adresse")
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
    .email("Ungueltige E-Mail-Adresse")
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
});

// =============================================================================
// GET /api/admin/tenant-settings
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return NextResponse.json(
        { error: "Mandant nicht gefunden" },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: "Mandant nicht gefunden" },
        { status: 404 }
      );
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
    return NextResponse.json(
      { error: "Fehler beim Laden der Mandanten-Einstellungen" },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: "Mandant nicht gefunden" },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Validate with Zod
    const parsed = tenantSettingsSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json(
        {
          error: firstError?.message || "Ungueltige Eingabedaten",
          details: parsed.error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    // Get current tenant settings
    const tenant = await prisma.tenant.findUnique({
      where: { id: check.tenantId },
      select: { settings: true },
    });

    if (!tenant) {
      return NextResponse.json(
        { error: "Mandant nicht gefunden" },
        { status: 404 }
      );
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
    return NextResponse.json(
      { error: "Fehler beim Speichern der Mandanten-Einstellungen" },
      { status: 500 }
    );
  }
}
