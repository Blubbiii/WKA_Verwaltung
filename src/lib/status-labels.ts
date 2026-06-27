/**
 * Central status-label registry.
 *
 * Provides a single source of truth for status enum → label/tone/icon mappings.
 * Use together with `<StatusBadge>` (src/components/ui/status-badge.tsx) and the
 * `statusLabels` i18n namespace.
 *
 * Why this file exists:
 *   Before, every page/component re-declared its own `STATUS_VARIANTS` /
 *   `STATUS_LABELS` / fallback-to-code maps. Labels and tones drifted across
 *   3–5 surfaces per enum. Importing from here keeps labels, colors and icons
 *   consistent and i18n-aware everywhere.
 *
 * To add a new enum:
 *   1. Add a `Record<string, StatusMeta>` constant below.
 *   2. Add the matching `statusLabels.<group>.<key>` entries in all 3 locales
 *      (de, en, de-personal).
 *   3. Use `<StatusBadge status={value} mapping={MY_STATUS} />` in components.
 */

import type { LucideIcon } from "lucide-react";
import {
  FileText,
  Send,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Pause,
  Eye,
  ShieldCheck,
  FileCheck,
  Ban,
  Loader2,
  Sparkles,
} from "lucide-react";

/** Visual tone of a status badge — maps to design-token colors. */
export type StatusTone =
  | "default"
  | "secondary"
  | "success"
  | "warning"
  | "destructive"
  | "info";

export interface StatusMeta {
  /** i18n-Key relative zum `statusLabels` Namespace (z.B. "invoice.draft"). */
  labelKey: string;
  /** Design-Token-Variante (steuert Hintergrund-/Text-/Border-Klassen). */
  tone: StatusTone;
  /** Optionales Lucide-Icon zur Doppel-Kodierung (Farbe + Symbol → a11y). */
  icon?: LucideIcon;
}

/**
 * Invoice-Status (aus prisma/schema.prisma InvoiceStatus enum).
 * Hinweis: Das DB-Schema kennt aktuell DRAFT/SENT/PAID/CANCELLED; PARTIALLY_PAID
 * und WRITTEN_OFF sind als Forward-Compat-Slots gepflegt.
 */
export const INVOICE_STATUS: Record<string, StatusMeta> = {
  DRAFT: { labelKey: "invoice.draft", tone: "secondary", icon: FileText },
  SENT: { labelKey: "invoice.sent", tone: "info", icon: Send },
  PAID: { labelKey: "invoice.paid", tone: "success", icon: CheckCircle2 },
  PARTIALLY_PAID: { labelKey: "invoice.partiallyPaid", tone: "warning", icon: Clock },
  CANCELLED: { labelKey: "invoice.cancelled", tone: "destructive", icon: Ban },
  WRITTEN_OFF: { labelKey: "invoice.writtenOff", tone: "destructive", icon: XCircle },
};

/** IncomingInvoice-Status (Inbox-Workflow). */
export const INCOMING_INVOICE_STATUS: Record<string, StatusMeta> = {
  INBOX: { labelKey: "incomingInvoice.inbox", tone: "secondary", icon: FileText },
  OCR_PROCESSING: { labelKey: "incomingInvoice.ocrProcessing", tone: "info", icon: Loader2 },
  REVIEW: { labelKey: "incomingInvoice.review", tone: "warning", icon: Eye },
  APPROVED: { labelKey: "incomingInvoice.approved", tone: "info", icon: ShieldCheck },
  PAID: { labelKey: "incomingInvoice.paid", tone: "success", icon: CheckCircle2 },
  CANCELLED: { labelKey: "incomingInvoice.cancelled", tone: "destructive", icon: Ban },
};

/** Contract-Status (aus ContractStatus enum). */
export const CONTRACT_STATUS: Record<string, StatusMeta> = {
  DRAFT: { labelKey: "contract.draft", tone: "secondary", icon: FileText },
  ACTIVE: { labelKey: "contract.active", tone: "success", icon: CheckCircle2 },
  TERMINATED: { labelKey: "contract.terminated", tone: "destructive", icon: Ban },
  EXPIRED: { labelKey: "contract.expired", tone: "warning", icon: AlertCircle },
};

/** Approval-Status (Vier-Augen-Prinzip / Freigaben). */
export const APPROVAL_STATUS: Record<string, StatusMeta> = {
  PENDING: { labelKey: "approval.pending", tone: "warning", icon: Clock },
  APPROVED: { labelKey: "approval.approved", tone: "success", icon: ShieldCheck },
  REJECTED: { labelKey: "approval.rejected", tone: "destructive", icon: XCircle },
  EXPIRED: { labelKey: "approval.expired", tone: "secondary", icon: Clock },
};

/** Turbine-Status (Windenergieanlagen). */
export const TURBINE_STATUS: Record<string, StatusMeta> = {
  ACTIVE: { labelKey: "turbine.active", tone: "success", icon: CheckCircle2 },
  INACTIVE: { labelKey: "turbine.inactive", tone: "secondary", icon: Pause },
  MAINTENANCE: { labelKey: "turbine.maintenance", tone: "warning", icon: Clock },
  FAULT: { labelKey: "turbine.fault", tone: "destructive", icon: AlertCircle },
  PLANNED: { labelKey: "turbine.planned", tone: "info", icon: Sparkles },
};

/** Vote-Status (Gesellschafterabstimmungen). */
export const VOTE_STATUS: Record<string, StatusMeta> = {
  DRAFT: { labelKey: "vote.draft", tone: "secondary", icon: FileText },
  ACTIVE: { labelKey: "vote.active", tone: "info", icon: Eye },
  CLOSED: { labelKey: "vote.closed", tone: "success", icon: FileCheck },
};

/** Fallback wenn der Status-Code nicht im Mapping existiert. */
export const UNKNOWN_STATUS: StatusMeta = {
  labelKey: "common.unknown",
  tone: "secondary",
};
