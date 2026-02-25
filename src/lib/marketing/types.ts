import { z } from "zod";

// =============================================================================
// ZOD SCHEMAS - Marketing Configuration
// =============================================================================

export const featureSchema = z.object({
  title: z.string().min(1, "Titel ist erforderlich").max(100, "Titel darf maximal 100 Zeichen haben"),
  description: z.string().min(1, "Beschreibung ist erforderlich").max(500, "Beschreibung darf maximal 500 Zeichen haben"),
  icon: z.string().min(1, "Icon ist erforderlich").max(50, "Icon-Name darf maximal 50 Zeichen haben"),
});

export const marketingConfigSchema = z.object({
  hero: z.object({
    title: z.string().min(1, "Hero-Titel ist erforderlich").max(200, "Hero-Titel darf maximal 200 Zeichen haben"),
    subtitle: z.string().min(1, "Hero-Untertitel ist erforderlich").max(500, "Hero-Untertitel darf maximal 500 Zeichen haben"),
  }),
  features: z
    .array(featureSchema)
    .min(1, "Mindestens ein Feature ist erforderlich")
    .max(12, "Maximal 12 Features erlaubt"),
  pricing: z.object({
    basePrice: z.number().min(0, "Grundpreis darf nicht negativ sein").max(10000, "Grundpreis darf maximal 10.000 sein"),
    turbinePrice: z.number().min(0, "Anlagenpreis darf nicht negativ sein").max(1000, "Anlagenpreis darf maximal 1.000 sein"),
    userPrice: z.number().min(0, "Benutzerpreis darf nicht negativ sein").max(1000, "Benutzerpreis darf maximal 1.000 sein"),
    annualDiscountPercent: z.number().min(0, "Jahresrabatt darf nicht negativ sein").max(100, "Jahresrabatt darf maximal 100% sein"),
    maxTurbines: z.number().int().min(1, "Mindestens 1 Anlage").max(500, "Maximal 500 Anlagen"),
    maxUsers: z.number().int().min(1, "Mindestens 1 Benutzer").max(500, "Maximal 500 Benutzer"),
  }),
  cta: z.object({
    title: z.string().min(1, "CTA-Titel ist erforderlich").max(200, "CTA-Titel darf maximal 200 Zeichen haben"),
    subtitle: z.string().min(1, "CTA-Untertitel ist erforderlich").max(500, "CTA-Untertitel darf maximal 500 Zeichen haben"),
  }),
});

// =============================================================================
// ZOD SCHEMAS - Legal Pages
// =============================================================================

export const legalPageSchema = z.object({
  impressum: z.string().max(50000, "Impressum darf maximal 50.000 Zeichen haben"),
  datenschutz: z.string().max(100000, "Datenschutzerklärung darf maximal 100.000 Zeichen haben"),
  cookies: z.string().max(50000, "Cookie-Richtlinie darf maximal 50.000 Zeichen haben"),
});

// =============================================================================
// TYPES (inferred from Zod schemas)
// =============================================================================

export type MarketingConfig = z.infer<typeof marketingConfigSchema>;
export type LegalPages = z.infer<typeof legalPageSchema>;
export type FeatureConfig = z.infer<typeof featureSchema>;

/** Standalone pricing config type for the PriceCalculator component */
export type PricingConfig = MarketingConfig["pricing"];
