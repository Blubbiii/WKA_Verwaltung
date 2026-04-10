/**
 * Pure constants for CRM labels.
 *
 * IMPORTANT: This file must stay free of imports that pull in server-only
 * modules (prisma, fs, net, ...). It is imported by client components that
 * need to know which label keys are "derived" (from contracts) vs. custom.
 *
 * Keys are locale-independent identifiers. UI display names come from
 * next-intl translations at `crm.labels.<KEY>` in the message files.
 */

export const DERIVED_LABEL_KEYS = [
  "LESSOR",
  "SHAREHOLDER",
  "MAINTENANCE",
  "INSURANCE",
  "GRID_OPERATOR",
  "DIRECT_MARKETING",
] as const;

export type DerivedLabel = (typeof DERIVED_LABEL_KEYS)[number];

export function isDerivedLabel(key: string): key is DerivedLabel {
  return (DERIVED_LABEL_KEYS as readonly string[]).includes(key);
}
