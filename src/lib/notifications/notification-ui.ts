import {
  Bell,
  FileText,
  Vote,
  FileSignature,
  Receipt,
  Info,
} from "lucide-react";

// =============================================================================
// Notification type constants shared between NotificationBell and /notifications
// =============================================================================

export type NotificationType = "DOCUMENT" | "VOTE" | "CONTRACT" | "INVOICE" | "SYSTEM";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

/** Icon component for each notification type */
export const TYPE_ICON: Record<NotificationType, typeof Bell> = {
  DOCUMENT: FileText,
  VOTE: Vote,
  CONTRACT: FileSignature,
  INVOICE: Receipt,
  SYSTEM: Info,
};

/** Tailwind color class for each notification type */
export const TYPE_COLOR: Record<NotificationType, string> = {
  DOCUMENT: "text-blue-500",
  VOTE: "text-purple-500",
  CONTRACT: "text-amber-500",
  INVOICE: "text-green-500",
  SYSTEM: "text-muted-foreground",
};

/** German label for each notification type */
export const TYPE_LABEL: Record<NotificationType, string> = {
  DOCUMENT: "Dokument",
  VOTE: "Abstimmung",
  CONTRACT: "Vertrag",
  INVOICE: "Rechnung",
  SYSTEM: "System",
};

/** All notification types for filter UI */
export const ALL_NOTIFICATION_TYPES: NotificationType[] = [
  "DOCUMENT",
  "VOTE",
  "CONTRACT",
  "INVOICE",
  "SYSTEM",
];

/**
 * Format a date string as relative time in German.
 */
export function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "gerade eben";
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  if (diffHour < 24) return `vor ${diffHour} Std.`;
  if (diffDay === 1) return "gestern";
  if (diffDay < 7) return `vor ${diffDay} Tagen`;

  return new Date(dateStr).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
