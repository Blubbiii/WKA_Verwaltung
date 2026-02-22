/**
 * Reminder System - Type Definitions
 *
 * Defines all types, enums, and default configurations for the
 * automated reminder/notification system.
 */

// =============================================================================
// Reminder Categories
// =============================================================================

/**
 * Categories of reminders the system can generate
 */
export type ReminderCategory =
  | "OVERDUE_INVOICE"       // Invoices with status SENT and dueDate < today
  | "EXPIRING_CONTRACT"     // Contracts with endDate approaching
  | "OPEN_SETTLEMENT"       // Settlement periods open for >30 days
  | "EXPIRING_DOCUMENT";    // Documents with an expiry-like date (permits, etc.)

/**
 * Urgency level for a reminder item
 */
export type ReminderUrgency = "critical" | "warning" | "info";

// =============================================================================
// Configuration
// =============================================================================

/**
 * Threshold configuration for a single reminder category
 */
export interface ReminderThreshold {
  /** Days before/after the reference date to trigger the reminder */
  days: number;
  /** Urgency assigned at this threshold */
  urgency: ReminderUrgency;
  /** Human-readable label (German) */
  label: string;
}

/**
 * Configuration for a reminder category
 */
export interface ReminderCategoryConfig {
  /** Category identifier */
  category: ReminderCategory;
  /** Display name (German) */
  displayName: string;
  /** Description */
  description: string;
  /** Whether this category is enabled */
  enabled: boolean;
  /** Thresholds that trigger reminders (sorted by urgency, most urgent first) */
  thresholds: ReminderThreshold[];
  /** Minimum days between reminders for the same item (spam protection) */
  cooldownDays: number;
  /** Link path template for navigation (uses :id placeholder) */
  linkPath: string;
}

// =============================================================================
// Default Configuration
// =============================================================================

/**
 * Default reminder configuration for all categories.
 * These can be overridden per tenant via SystemConfig later.
 */
export const DEFAULT_REMINDER_CONFIG: ReminderCategoryConfig[] = [
  {
    category: "OVERDUE_INVOICE",
    displayName: "Ueberfaellige Rechnungen",
    description: "Rechnungen mit Status SENT deren Faelligkeitsdatum ueberschritten ist",
    enabled: true,
    thresholds: [
      { days: 30, urgency: "critical", label: "Mehr als 30 Tage ueberfaellig" },
      { days: 14, urgency: "warning", label: "Mehr als 14 Tage ueberfaellig" },
      { days: 0, urgency: "info", label: "Ueberfaellig" },
    ],
    cooldownDays: 7,
    linkPath: "/invoices",
  },
  {
    category: "EXPIRING_CONTRACT",
    displayName: "Auslaufende Vertraege",
    description: "Aktive Vertraege die bald auslaufen",
    enabled: true,
    thresholds: [
      { days: 7, urgency: "critical", label: "Laeuft in weniger als 7 Tagen aus" },
      { days: 14, urgency: "warning", label: "Laeuft in weniger als 14 Tagen aus" },
      { days: 30, urgency: "info", label: "Laeuft in weniger als 30 Tagen aus" },
    ],
    cooldownDays: 7,
    linkPath: "/contracts",
  },
  {
    category: "OPEN_SETTLEMENT",
    displayName: "Offene Abrechnungsperioden",
    description: "Settlement Periods die seit mehr als 30 Tagen offen sind",
    enabled: true,
    thresholds: [
      { days: 90, urgency: "critical", label: "Seit mehr als 90 Tagen offen" },
      { days: 60, urgency: "warning", label: "Seit mehr als 60 Tagen offen" },
      { days: 30, urgency: "info", label: "Seit mehr als 30 Tagen offen" },
    ],
    cooldownDays: 7,
    linkPath: "/leases",
  },
  {
    category: "EXPIRING_DOCUMENT",
    displayName: "Ablaufende Dokumente",
    description: "Dokumente mit Ablaufdatum (z.B. Genehmigungen, Permits)",
    enabled: true,
    thresholds: [
      { days: 7, urgency: "critical", label: "Laeuft in weniger als 7 Tagen ab" },
      { days: 14, urgency: "warning", label: "Laeuft in weniger als 14 Tagen ab" },
      { days: 30, urgency: "info", label: "Laeuft in weniger als 30 Tagen ab" },
    ],
    cooldownDays: 7,
    linkPath: "/documents",
  },
];

// =============================================================================
// Reminder Items (returned by the service)
// =============================================================================

/**
 * A single reminder item found by the service
 */
export interface ReminderItem {
  /** Category of this reminder */
  category: ReminderCategory;
  /** Database entity ID (invoice, contract, etc.) */
  entityId: string;
  /** Entity type for the reminder log (e.g., "Invoice", "Contract") */
  entityType: string;
  /** Human-readable title of the item */
  title: string;
  /** Human-readable description/details */
  description: string;
  /** Urgency level */
  urgency: ReminderUrgency;
  /** The reference date (due date, expiry date, etc.) */
  referenceDate: Date;
  /** Number of days until/since the reference date (negative = overdue) */
  daysRemaining: number;
  /** Optional: related entity name (park name, fund name, etc.) */
  relatedEntity?: string;
  /** Optional: monetary amount (for invoices) */
  amount?: number;
}

/**
 * Summary of pending action counts per category
 */
export interface PendingActionsSummary {
  overdueInvoices: {
    count: number;
    totalAmount: number;
    criticalCount: number;
  };
  expiringContracts: {
    count: number;
    criticalCount: number;
  };
  openSettlements: {
    count: number;
    criticalCount: number;
  };
  expiringDocuments: {
    count: number;
    criticalCount: number;
  };
  totalCount: number;
  hasCritical: boolean;
}

/**
 * Result of a reminder check run
 */
export interface ReminderResult {
  /** Tenant that was checked */
  tenantId: string;
  /** Timestamp of the check */
  checkedAt: Date;
  /** Items found per category */
  items: ReminderItem[];
  /** Number of emails sent */
  emailsSent: number;
  /** Number of items skipped (cooldown) */
  skipped: number;
  /** Any errors encountered */
  errors: string[];
}
