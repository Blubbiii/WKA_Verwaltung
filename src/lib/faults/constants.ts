/**
 * Wertelisten für Störungsvorgänge.
 *
 * A1 (Audit 2026-07). Client und Server teilen sie sich, damit Filter, Formular
 * und Validierung nicht auseinanderlaufen — dieselbe Überlegung wie beim
 * CSV-Import (#22).
 */

export const CAUSE_CATEGORIES = [
  "MANUFACTURER",
  "GRID",
  "WEATHER",
  "OWN_FAULT",
  "AUTHORITY",
  "THIRD_PARTY",
  "UNKNOWN",
] as const;

export const CASE_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;

export const CLAIM_STATUSES = [
  "NONE",
  "PENDING",
  "ASSERTED",
  "ACCEPTED",
  "REJECTED",
  "SETTLED",
  "TIME_BARRED",
] as const;

export type CauseCategory = (typeof CAUSE_CATEGORIES)[number];
export type CaseStatus = (typeof CASE_STATUSES)[number];
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

/**
 * Ursachen, bei denen ein Anspruch gegen einen Dritten überhaupt in Betracht
 * kommt. Wetter und Eigenverschulden gehören nicht dazu — dort einen Anspruch
 * anzumahnen wäre Lärm ohne Nutzen.
 */
export const CLAIMABLE_CAUSES: readonly CauseCategory[] = [
  "MANUFACTURER",
  "GRID",
  "THIRD_PARTY",
];
