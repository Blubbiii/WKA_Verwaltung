/**
 * Pure constants for CRM labels.
 *
 * IMPORTANT: This file must stay free of imports that pull in server-only
 * modules (prisma, fs, net, ...). It is imported by client components that
 * need to know which label keys are "derived" (from contracts) vs. custom.
 */

export const DERIVED_LABEL_KEYS = [
  "Verpächter",
  "Gesellschafter",
  "Wartungsfirma",
  "Versicherung",
  "Netzbetreiber",
  "Direktvermarkter",
] as const;

export type DerivedLabel = (typeof DERIVED_LABEL_KEYS)[number];
