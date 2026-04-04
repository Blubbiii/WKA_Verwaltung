/**
 * Business-critical thresholds used across the application.
 * These values can be overridden at the tenant level via admin settings.
 */

/** Contract reminder defaults (days before expiry) */
export const CONTRACT_REMINDER_DAYS_DEFAULT = [90, 30] as const;

/** Days before expiry to show "expiring soon" warning in contract lists */
export const CONTRACT_WARNING_DAYS = 30;

/** Days before expiry to show "urgent" warning */
export const CONTRACT_URGENT_DAYS = 7;

/** Days window for calendar view "upcoming" contracts */
export const CONTRACT_CALENDAR_LOOKAHEAD_DAYS = 90;

/** Availability below this % triggers amber/red status in park health */
export const AVAILABILITY_WARNING_THRESHOLD = 85;

/** Availability below this % triggers red/critical status */
export const AVAILABILITY_CRITICAL_THRESHOLD = 70;

/** Days lookback window for park health pulse widget */
export const PARK_HEALTH_LOOKBACK_DAYS = 7;

/** Backup retention defaults (days) */
export const BACKUP_RETENTION_DAYS = 30;

/** BImSchG shadow impact limit (hours per turbine per year, §9 Abs. 2) */
export const BIMSCHG_SHADOW_LIMIT_HOURS = 30;
