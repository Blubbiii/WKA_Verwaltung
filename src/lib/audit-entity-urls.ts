/**
 * Entity-Type → URL Mapping for Audit-Log Detail-Links.
 *
 * QW-5 / RA-5: erlaubt es, im Audit-Log-Viewer direkt zur Detail-Seite
 * einer geänderten Entität zu springen.
 *
 * WICHTIG: Jeder hier zurückgegebene Pfad MUSS im App-Router existieren.
 * Die API hängt ihn an jeden Audit-Eintrag, die UI rendert ihn als <Link>.
 * Ein Pfad ohne `page.tsx` ist ein 404 beim Klick — lieber `null`
 * zurückgeben, dann rendert die UI reinen Text statt eines toten Links.
 *
 * Entitäten ohne eigene Route (Turbine, Plot, Shareholder, TurbineOperator)
 * werden nur innerhalb ihrer Elternseite dargestellt; ohne die Eltern-ID
 * lässt sich kein gültiges Ziel bilden → bewusst `null`.
 */
import type { AuditEntityType } from "./audit-types";

/**
 * Returns the canonical detail-route for an audit-log entity,
 * or `null` if the entity has no reachable page.
 */
export function getAuditEntityHref(
  entityType: AuditEntityType | string,
  entityId: string | null | undefined,
): string | null {
  if (!entityId) return null;

  // Mapping table — keys mirror AuditEntityType values.
  switch (entityType) {
    // ---- Entities with a real detail page ----
    case "Park":
      return `/parks/${entityId}`;
    case "Fund":
      return `/funds/${entityId}`;
    case "Lease":
      return `/leases/${entityId}`;
    case "Contract":
      return `/contracts/${entityId}`;
    case "Invoice":
      return `/invoices/${entityId}`;
    case "IncomingInvoice":
      return `/inbox/${entityId}`;
    case "Vote":
      return `/votes/${entityId}`;
    case "ServiceEvent":
      return `/service-events/${entityId}`;
    case "News":
      return `/news/${entityId}`;
    case "Person":
      return `/crm/contacts/${entityId}`;
    case "EnergySettlement":
      return `/energy/settlements/${entityId}`;
    case "LeaseRevenueSettlement":
      return `/leases/settlement/${entityId}`;
    case "ParkCostAllocation":
      return `/leases/cost-allocation/${entityId}`;
    case "TurbineProduction":
      return `/energy/productions/${entityId}/edit`;

    // ---- Only a list page exists — besser als ein 404 ----
    case "FundHierarchy":
      return "/funds";
    case "Document":
      return "/documents";
    case "JournalEntry":
      return "/journal-entries";
    case "BankTransaction":
      return "/buchhaltung/banking";
    case "EnergySettlementItem":
      return "/energy/settlements";
    case "ArchivedDocument":
      return "/admin/archive";
    case "MassCommunication":
      return "/kommunikation";
    case "Role":
      return "/admin/roles";
    // Benutzerverwaltung liegt auf der Mandantenseite (UserManagement).
    case "User":
    case "Tenant":
      return "/admin/tenants";

    // ---- Kein erreichbares Ziel (nur innerhalb der Elternseite sichtbar) ----
    case "Turbine":
    case "Plot":
    case "Shareholder":
    case "TurbineOperator":
      return null;

    default:
      return null;
  }
}
