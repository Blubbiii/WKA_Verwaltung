import { z } from "zod";

// =============================================================================
// Section IDs — all available marketing page sections
// =============================================================================

export const SECTION_IDS = [
  "hero",
  "trustBar",
  "features",
  "showcase",
  "stats",
  "workflow",
  "modules",
  "pricing",
  "testimonials",
  "cta",
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

export const SECTION_LABELS: Record<SectionId, string> = {
  hero: "Hero-Bereich",
  trustBar: "Vertrauensleiste",
  features: "Features",
  showcase: "Produkt-Showcase",
  stats: "Statistiken",
  workflow: "Workflow (So funktioniert es)",
  modules: "Module & Addons",
  pricing: "Preisrechner",
  testimonials: "Kundenstimmen",
  cta: "Call-to-Action",
};

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

export const sectionOrderSchema = z.object({
  id: z.enum(SECTION_IDS),
  enabled: z.boolean(),
});

export const featureSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  icon: z.string().min(1).max(50),
});

export const statSchema = z.object({
  end: z.number().min(0),
  prefix: z.string().max(10).optional(),
  suffix: z.string().max(10),
  label: z.string().min(1).max(50),
});

export const testimonialSchema = z.object({
  initials: z.string().min(1).max(5),
  name: z.string().min(1).max(100),
  role: z.string().min(1).max(100),
  company: z.string().min(1).max(100),
  quote: z.string().min(1).max(500),
});

export const workflowStepSchema = z.object({
  icon: z.string().min(1).max(50),
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(300),
});

export const moduleSchema = z.object({
  id: z.string().min(1).max(50),
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(300),
  icon: z.string().min(1).max(50),
  badge: z.string().max(30).optional(),
});

export const showcaseTabSchema = z.object({
  id: z.string().min(1).max(50),
  label: z.string().min(1).max(50),
  icon: z.string().min(1).max(50),
  url: z.string().min(1).max(100),
});

export const marketingConfigSchema = z.object({
  // Section order and visibility
  sections: z.array(sectionOrderSchema),

  // Hero
  hero: z.object({
    title: z.string().min(1).max(200),
    subtitle: z.string().min(1).max(500),
  }),

  // Trust Bar
  trustBar: z.object({
    headline: z.string().max(200).optional(),
    stats: z.array(z.object({
      value: z.string().max(20),
      label: z.string().max(50),
    })).max(4),
  }),

  // Features (Bento grid)
  features: z.array(featureSchema).min(1).max(12),

  // Showcase tabs
  showcase: z.object({
    title: z.string().max(200),
    subtitle: z.string().max(500),
    tabs: z.array(showcaseTabSchema).max(6),
  }),

  // Stats
  stats: z.object({
    items: z.array(statSchema).max(6),
  }),

  // Workflow
  workflow: z.object({
    title: z.string().max(200),
    subtitle: z.string().max(500),
    steps: z.array(workflowStepSchema).max(5),
  }),

  // Modules / Addons
  modules: z.object({
    title: z.string().max(200),
    subtitle: z.string().max(500),
    items: z.array(moduleSchema).max(12),
  }),

  // Pricing
  pricing: z.object({
    basePrice: z.number().min(0).max(10000),
    turbinePrice: z.number().min(0).max(1000),
    userPrice: z.number().min(0).max(1000),
    annualDiscountPercent: z.number().min(0).max(100),
    maxTurbines: z.number().int().min(1).max(500),
    maxUsers: z.number().int().min(1).max(500),
  }),

  // Testimonials
  testimonials: z.object({
    title: z.string().max(200),
    items: z.array(testimonialSchema).max(6),
  }),

  // CTA
  cta: z.object({
    title: z.string().min(1).max(200),
    subtitle: z.string().min(1).max(500),
  }),
});

// =============================================================================
// ZOD SCHEMAS - Legal Pages
// =============================================================================

export const legalPageSchema = z.object({
  impressum: z.string().max(50000),
  datenschutz: z.string().max(100000),
  cookies: z.string().max(50000),
});

// =============================================================================
// TYPES (inferred from Zod schemas)
// =============================================================================

export type MarketingConfig = z.infer<typeof marketingConfigSchema>;
export type LegalPages = z.infer<typeof legalPageSchema>;
export type FeatureConfig = z.infer<typeof featureSchema>;
export type StatConfig = z.infer<typeof statSchema>;
export type TestimonialConfig = z.infer<typeof testimonialSchema>;
export type WorkflowStepConfig = z.infer<typeof workflowStepSchema>;
export type ModuleConfig = z.infer<typeof moduleSchema>;
export type ShowcaseTabConfig = z.infer<typeof showcaseTabSchema>;
export type SectionOrder = z.infer<typeof sectionOrderSchema>;

/** Standalone pricing config type for the PriceCalculator component */
export type PricingConfig = MarketingConfig["pricing"];
