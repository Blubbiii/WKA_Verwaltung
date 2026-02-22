/**
 * Reminder System - Central Export Module
 *
 * Provides the automated reminder/notification system for the
 * WindparkManager application. Checks for overdue invoices,
 * expiring contracts, open settlement periods, and expiring documents.
 *
 * @example
 * ```typescript
 * import { checkAndSendReminders, getPendingActionsSummary } from '@/lib/reminders';
 *
 * // Run reminder check for a tenant (called by worker)
 * const result = await checkAndSendReminders('tenant-123');
 *
 * // Get pending actions summary (called by API/dashboard)
 * const summary = await getPendingActionsSummary('tenant-123');
 * ```
 */

export {
  checkAndSendReminders,
  getPendingActionsSummary,
} from "./reminder-service";

export { DEFAULT_REMINDER_CONFIG } from "./reminder-types";

export type {
  ReminderCategory,
  ReminderItem,
  ReminderResult,
  ReminderUrgency,
  PendingActionsSummary,
  ReminderCategoryConfig,
  ReminderThreshold,
} from "./reminder-types";
