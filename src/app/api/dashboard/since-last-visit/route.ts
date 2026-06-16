import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";
import { hasPermission } from "@/lib/auth/permissions";
import { apiLogger as logger } from "@/lib/logger";

/**
 * Feature A3: "Seit deinem letzten Besuch"
 *
 * Returns per-tenant deltas since the supplied ISO timestamp.
 * The widget passes the user's last localStorage-tracked visit; this route
 * is permission-aware: KPIs the user cannot read are simply returned as 0.
 *
 * Not cached — the input timestamp is user-specific and the query volume is
 * negligible (one call per dashboard open).
 */

const ACTION_LABELS: Record<string, string> = {
  CREATE: "erstellt",
  UPDATE: "aktualisiert",
  DELETE: "gelöscht",
};

const ENTITY_LABELS: Record<string, string> = {
  Park: "Windpark",
  Lease: "Pachtvertrag",
  Invoice: "Rechnung",
  IncomingInvoice: "Eingangsrechnung",
  User: "Benutzer",
  Plot: "Flurstück",
  Fund: "Fonds",
  Settlement: "Abrechnung",
  Contract: "Vertrag",
  ServiceEvent: "Service-Vorgang",
  ApprovalRequest: "Freigabe",
  JournalEntry: "Buchung",
};

function buildEntityHref(entityType: string, entityId: string | null): string | null {
  if (!entityId) return null;
  switch (entityType) {
    case "Park":
      return `/parks/${entityId}`;
    case "Lease":
      return `/leases/${entityId}`;
    case "Invoice":
      return `/invoices/${entityId}`;
    case "IncomingInvoice":
      return `/buchhaltung/eingangsrechnungen/${entityId}`;
    case "Plot":
      return `/plots/${entityId}`;
    case "Fund":
      return `/funds/${entityId}`;
    case "Settlement":
      return `/buchhaltung/settlements/${entityId}`;
    case "Contract":
      return `/contracts/${entityId}`;
    case "ServiceEvent":
      return `/service/${entityId}`;
    case "ApprovalRequest":
      return `/approvals`;
    default:
      return null;
  }
}

function relativeTimeGerman(date: Date): string {
  const now = Date.now();
  const diffMs = Math.max(0, now - date.getTime());
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return "gerade eben";
  if (diffMinutes < 60) {
    return `vor ${diffMinutes} Minute${diffMinutes !== 1 ? "n" : ""}`;
  }
  if (diffHours < 24) {
    return `vor ${diffHours} Stunde${diffHours !== 1 ? "n" : ""}`;
  }
  if (diffDays === 1) return "gestern";
  return `vor ${diffDays} Tagen`;
}

export async function GET(request: NextRequest) {
  const check = await requireAuth();
  if (!check.authorized) return check.error;

  const sinceParam = request.nextUrl.searchParams.get("since");
  // Default-Lookback: 24h (z.B. erster Aufruf ohne localStorage-Wert).
  const fallback = new Date(Date.now() - 24 * 3600 * 1000);
  const since = sinceParam ? new Date(sinceParam) : fallback;
  if (Number.isNaN(since.getTime())) {
    return apiError("INVALID_INPUT", 400, { message: "Ungültiger Zeitstempel" });
  }

  const userId = check.userId!;
  const tenantId = check.tenantId;
  if (!tenantId) {
    return apiError("FORBIDDEN", 403, { message: "Kein aktiver Mandant" });
  }

  try {
    // Permissions werden parallel ermittelt — falls eine fehlt, wird der
    // Zähler einfach auf 0 gesetzt, statt einen 403 für das ganze Widget
    // zu werfen.
    const [canReadInvoices, canReadIncoming, canReadApprovals, canReadAudit] =
      await Promise.all([
        hasPermission(userId, "invoices:read"),
        hasPermission(userId, "incoming-invoices:read"),
        hasPermission(userId, "approvals:read"),
        hasPermission(userId, "audit:read"),
      ]);

    const [newInvoices, newIncomingInvoices, newApprovals, newAuditEntries, recentLogs] =
      await Promise.all([
        canReadInvoices
          ? prisma.invoice.count({
              where: { tenantId, createdAt: { gt: since } },
            })
          : Promise.resolve(0),
        canReadIncoming
          ? prisma.incomingInvoice.count({
              where: { tenantId, createdAt: { gt: since } },
            })
          : Promise.resolve(0),
        canReadApprovals
          ? prisma.approvalRequest.count({
              where: { tenantId, status: "PENDING", createdAt: { gt: since } },
            })
          : Promise.resolve(0),
        prisma.auditLog.count({
          where: { tenantId, createdAt: { gt: since } },
        }),
        prisma.auditLog.findMany({
          where: { tenantId, createdAt: { gt: since } },
          orderBy: { createdAt: "desc" },
          take: 5,
          include: { user: { select: { firstName: true, lastName: true } } },
        }),
      ]);

    const topActivities = recentLogs.map((log) => {
      const actionLabel = ACTION_LABELS[log.action] ?? log.action.toLowerCase();
      const entityLabel = ENTITY_LABELS[log.entityType] ?? log.entityType;
      const shortId = log.entityId ? ` #${log.entityId.slice(0, 8)}` : "";
      const userName = log.user
        ? [log.user.firstName, log.user.lastName].filter(Boolean).join(" ") || null
        : null;
      const action = userName
        ? `${userName} hat ${entityLabel}${shortId} ${actionLabel}`
        : `${entityLabel}${shortId} ${actionLabel}`;
      return {
        action,
        time: relativeTimeGerman(log.createdAt),
        href: buildEntityHref(log.entityType, log.entityId),
      };
    });

    return NextResponse.json({
      sinceTime: since.toISOString(),
      newInvoices,
      newIncomingInvoices,
      newApprovals,
      newAuditEntries: canReadAudit ? newAuditEntries : topActivities.length,
      topActivities,
    });
  } catch (error) {
    logger.error({ error, tenantId, since: since.toISOString() }, "[since-last-visit] Error");
    return apiError("INTERNAL_ERROR", 500, { message: "Interner Serverfehler" });
  }
}
