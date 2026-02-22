// Central status configuration for all entity types.
// Import from here instead of defining local status mappings in individual components.

export type BadgeVariant = {
  label: string;
  className: string;
};

// ---------------------------------------------------------------------------
// Invoice Status
// ---------------------------------------------------------------------------
export const INVOICE_STATUS: Record<string, BadgeVariant> = {
  DRAFT: { label: "Entwurf", className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" },
  SENT: { label: "Versendet", className: "bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-200" },
  PAID: { label: "Bezahlt", className: "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200" },
  CANCELLED: { label: "Storniert", className: "bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-200" },
  OVERDUE: { label: "Ueberfaellig", className: "bg-orange-100 text-orange-800 dark:bg-orange-800 dark:text-orange-200" },
};

// ---------------------------------------------------------------------------
// Contract Status (also used for Leases)
// ---------------------------------------------------------------------------
export const CONTRACT_STATUS: Record<string, BadgeVariant> = {
  DRAFT: { label: "Entwurf", className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" },
  ACTIVE: { label: "Aktiv", className: "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200" },
  EXPIRING: { label: "Laeuft aus", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200" },
  EXPIRED: { label: "Abgelaufen", className: "bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-200" },
  TERMINATED: { label: "Gekuendigt", className: "bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-200" },
};

// ---------------------------------------------------------------------------
// Entity Status (Parks, Funds, Plots, Shareholders)
// ---------------------------------------------------------------------------
export const ENTITY_STATUS: Record<string, BadgeVariant> = {
  ACTIVE: { label: "Aktiv", className: "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200" },
  INACTIVE: { label: "Inaktiv", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200" },
  ARCHIVED: { label: "Archiviert", className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" },
};

// ---------------------------------------------------------------------------
// Vote Status
// ---------------------------------------------------------------------------
export const VOTE_STATUS: Record<string, BadgeVariant> = {
  DRAFT: { label: "Entwurf", className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" },
  ACTIVE: { label: "Aktiv", className: "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200" },
  CLOSED: { label: "Beendet", className: "bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-200" },
};

// ---------------------------------------------------------------------------
// Distribution Status
// ---------------------------------------------------------------------------
export const DISTRIBUTION_STATUS: Record<string, BadgeVariant> = {
  DRAFT: { label: "Entwurf", className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" },
  EXECUTED: { label: "Ausgefuehrt", className: "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200" },
  CANCELLED: { label: "Storniert", className: "bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-200" },
};

// ---------------------------------------------------------------------------
// Payment Status (lowercase keys as used in code)
// ---------------------------------------------------------------------------
export const PAYMENT_STATUS: Record<string, BadgeVariant> = {
  pending: { label: "Offen", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200" },
  paid: { label: "Bezahlt", className: "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200" },
  overdue: { label: "Ueberfaellig", className: "bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-200" },
};

// ---------------------------------------------------------------------------
// Portal Distribution Status (portal uses different labels for SENT/PAID)
// ---------------------------------------------------------------------------
export const PORTAL_DISTRIBUTION_STATUS: Record<string, BadgeVariant> = {
  DRAFT: { label: "Entwurf", className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" },
  SENT: { label: "Offen", className: "bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-200" },
  PAID: { label: "Ausgezahlt", className: "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200" },
  CANCELLED: { label: "Storniert", className: "bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-200" },
};

// ---------------------------------------------------------------------------
// Helper function to get status badge info with fallback
// ---------------------------------------------------------------------------
export function getStatusBadge(
  statusMap: Record<string, BadgeVariant>,
  status: string
): BadgeVariant {
  return (
    statusMap[status] ?? {
      label: status,
      className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
    }
  );
}
