/**
 * Billing Types
 * TypeScript Interfaces für das automatische Abrechnungssystem
 */

// Enum-like constants - these should match the Prisma schema
// After running `prisma generate`, these will be replaced by the generated enums
export const BillingRuleType = {
  LEASE_PAYMENT: "LEASE_PAYMENT",
  LEASE_ADVANCE: "LEASE_ADVANCE",
  DISTRIBUTION: "DISTRIBUTION",
  MANAGEMENT_FEE: "MANAGEMENT_FEE",
  CUSTOM: "CUSTOM",
} as const;

export type BillingRuleType = (typeof BillingRuleType)[keyof typeof BillingRuleType];

export const BillingRuleFrequency = {
  MONTHLY: "MONTHLY",
  QUARTERLY: "QUARTERLY",
  SEMI_ANNUAL: "SEMI_ANNUAL",
  ANNUAL: "ANNUAL",
  CUSTOM_CRON: "CUSTOM_CRON",
} as const;

export type BillingRuleFrequency = (typeof BillingRuleFrequency)[keyof typeof BillingRuleFrequency];

// =============================================================================
// RULE PARAMETER TYPES
// =============================================================================

/**
 * Parameter für Pachtzahlungen (LEASE_PAYMENT)
 */
export interface LeasePaymentParameters {
  parkId?: string; // Optional: Nur für einen bestimmten Park
  year?: number; // Abrechnungsjahr (default: aktuelles Jahr)
  month?: number; // Abrechnungsmonat (default: aktueller Monat)
  useMinimumRent?: boolean; // Mindestpacht oder tatsaechliche Pacht
  taxType?: "STANDARD" | "REDUCED" | "EXEMPT"; // Steuerart
  notifyLessors?: boolean; // E-Mail an Verpächter senden
}

/**
 * Parameter für Pacht-Vorschussrechnungen (LEASE_ADVANCE)
 */
export interface LeaseAdvanceParameters {
  parkId?: string; // Optional: Nur für einen bestimmten Park
  year?: number; // Abrechnungsjahr (default: aktuelles Jahr)
  month?: number; // Abrechnungsmonat (default: aktueller Monat)
  taxType?: "STANDARD" | "REDUCED" | "EXEMPT"; // Steuerart (default: EXEMPT für Pacht)
  dueDays?: number; // Zahlungsziel in Tagen (default: 14)
}

/**
 * Parameter für Ausschuettungen (DISTRIBUTION)
 */
export interface DistributionParameters {
  fundId: string; // Pflichtfeld: Gesellschafts-ID
  totalAmount: number; // Gesamtbetrag der Ausschuettung
  description?: string; // Beschreibung (z.B. "Jahresausschuettung 2024")
  distributionDate?: string; // Ausschuettungsdatum (ISO string)
  notifyShareholders?: boolean; // E-Mail an Gesellschafter senden
}

/**
 * Parameter für Verwaltungsgebühren (MANAGEMENT_FEE)
 */
export interface ManagementFeeParameters {
  fundId?: string; // Optional: Nur für eine bestimmte Gesellschaft
  parkId?: string; // Optional: Nur für einen bestimmten Park
  calculationType: "FIXED" | "PERCENTAGE"; // Fester Betrag oder Prozentsatz
  amount?: number; // Fester Betrag in Euro
  percentage?: number; // Prozentsatz (z.B. 2.5)
  baseValue?: "TOTAL_CAPITAL" | "ANNUAL_REVENUE" | "NET_ASSET_VALUE"; // Basis für Prozentsatz
  recipientName?: string; // Empfänger (z.B. Verwaltungsgesellschaft)
  recipientAddress?: string;
  taxType?: "STANDARD" | "REDUCED" | "EXEMPT";
  description?: string;
}

/**
 * Parameter für benutzerdefinierte Regeln (CUSTOM)
 */
export interface CustomRuleParameters {
  invoiceType: "INVOICE" | "CREDIT_NOTE";
  recipientType?: string;
  recipientName?: string;
  recipientAddress?: string;
  items: CustomRuleItem[];
  fundId?: string;
  parkId?: string;
  shareholderId?: string;
  leaseId?: string;
  notes?: string;
  taxType?: "STANDARD" | "REDUCED" | "EXEMPT";
}

export interface CustomRuleItem {
  description: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  taxType?: "STANDARD" | "REDUCED" | "EXEMPT";
}

/**
 * Union Type für alle Parameter-Typen
 */
export type BillingRuleParameters =
  | LeasePaymentParameters
  | LeaseAdvanceParameters
  | DistributionParameters
  | ManagementFeeParameters
  | CustomRuleParameters;

// =============================================================================
// EXECUTION TYPES
// =============================================================================

/**
 * Status einer Regelausführung
 */
export type ExecutionStatus = "success" | "failed" | "partial";

/**
 * Optionen für die Regelausführung
 */
export interface ExecuteRuleOptions {
  dryRun?: boolean; // Nur Vorschau, keine echten Rechnungen erstellen
  forceRun?: boolean; // Ausführung erzwingen, auch wenn nextRunAt noch nicht erreicht
  notifyOnComplete?: boolean; // Benachrichtigung nach Abschluss senden
  overrideParameters?: Partial<BillingRuleParameters>; // Parameter überschreiben
}

/**
 * Ergebnis einer einzelnen Rechnungserstellung
 */
export interface InvoiceCreationResult {
  success: boolean;
  invoiceId?: string;
  invoiceNumber?: string;
  recipientName?: string;
  amount?: number;
  error?: string;
}

/**
 * Detaillierte Ausführungsinformationen
 */
export interface ExecutionDetails {
  invoices: InvoiceCreationResult[];
  summary: {
    totalProcessed: number;
    successful: number;
    failed: number;
    skipped: number;
  };
  warnings?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Ergebnis einer Regelausführung
 */
export interface ExecutionResult {
  status: ExecutionStatus;
  invoicesCreated: number;
  totalAmount: number;
  errorMessage?: string;
  details: ExecutionDetails;
  executionId?: string;
}

// =============================================================================
// SCHEDULER TYPES
// =============================================================================

/**
 * Informationen zur nächsten geplanten Ausführung
 */
export interface NextRunInfo {
  ruleId: string;
  ruleName: string;
  nextRunAt: Date;
  frequency: BillingRuleFrequency;
}

/**
 * Job-Informationen für BullMQ
 */
export interface BillingJob {
  ruleId: string;
  tenantId: string;
  scheduledAt: Date;
  options?: ExecuteRuleOptions;
}

// =============================================================================
// RULE HANDLER INTERFACE
// =============================================================================

/**
 * Interface für Rule Handler Implementierungen
 */
export interface RuleHandler {
  /**
   * Typ der Regel die dieser Handler verarbeitet
   */
  readonly ruleType: BillingRuleType;

  /**
   * Fuehrt die Regel aus und erstellt Rechnungen
   */
  execute(
    tenantId: string,
    parameters: BillingRuleParameters,
    options: ExecuteRuleOptions
  ): Promise<ExecutionResult>;

  /**
   * Validiert die Parameter für diesen Regel-Typ
   */
  validateParameters(parameters: unknown): parameters is BillingRuleParameters;

  /**
   * Gibt eine Vorschau der zu erstellenden Rechnungen zurück (Dry-Run)
   */
  preview(
    tenantId: string,
    parameters: BillingRuleParameters
  ): Promise<InvoiceCreationResult[]>;
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

/**
 * Billing Rule DTO für API Responses
 */
export interface BillingRuleDTO {
  id: string;
  name: string;
  description: string | null;
  ruleType: BillingRuleType;
  frequency: BillingRuleFrequency;
  cronPattern: string | null;
  dayOfMonth: number | null;
  parameters: BillingRuleParameters;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  tenantId: string;
}

/**
 * Billing Rule Execution DTO für API Responses
 */
export interface BillingRuleExecutionDTO {
  id: string;
  status: ExecutionStatus;
  startedAt: string;
  completedAt: string | null;
  invoicesCreated: number;
  totalAmount: number | null;
  errorMessage: string | null;
  details: ExecutionDetails | null;
  ruleId: string;
}

/**
 * Input für das Erstellen einer neuen Regel
 */
export interface CreateBillingRuleInput {
  name: string;
  description?: string;
  ruleType: BillingRuleType;
  frequency: BillingRuleFrequency;
  cronPattern?: string;
  dayOfMonth?: number;
  parameters: BillingRuleParameters;
  isActive?: boolean;
}

/**
 * Input für das Aktualisieren einer Regel
 */
export interface UpdateBillingRuleInput {
  name?: string;
  description?: string;
  frequency?: BillingRuleFrequency;
  cronPattern?: string;
  dayOfMonth?: number;
  parameters?: BillingRuleParameters;
  isActive?: boolean;
}

// =============================================================================
// HELPER TYPES
// =============================================================================

/**
 * Cron-Expression Informationen für UI
 */
export interface CronExpressionInfo {
  expression: string;
  humanReadable: string;
  nextRuns: Date[];
}

/**
 * Frequenz zu Cron-Pattern Mapping
 */
export const FREQUENCY_CRON_PATTERNS: Record<Exclude<BillingRuleFrequency, "CUSTOM_CRON">, string> = {
  MONTHLY: "0 0 1 * *", // 1. jeden Monats um 00:00
  QUARTERLY: "0 0 1 1,4,7,10 *", // 1. Januar, April, Juli, Oktober
  SEMI_ANNUAL: "0 0 1 1,7 *", // 1. Januar und Juli
  ANNUAL: "0 0 1 1 *", // 1. Januar
};

/**
 * Mapping von Frequenz zu deutschem Label
 */
export const FREQUENCY_LABELS: Record<BillingRuleFrequency, string> = {
  MONTHLY: "Monatlich",
  QUARTERLY: "Vierteljährlich",
  SEMI_ANNUAL: "Halbjährlich",
  ANNUAL: "Jährlich",
  CUSTOM_CRON: "Benutzerdefiniert",
};

/**
 * Mapping von Regel-Typ zu deutschem Label
 */
export const RULE_TYPE_LABELS: Record<BillingRuleType, string> = {
  LEASE_PAYMENT: "Pachtzahlung",
  LEASE_ADVANCE: "Pacht-Vorschuss",
  DISTRIBUTION: "Ausschuettung",
  MANAGEMENT_FEE: "Verwaltungsgebühr",
  CUSTOM: "Benutzerdefiniert",
};
