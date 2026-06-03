/**
 * Entity-Type → URL Mapping for Audit-Log Detail-Links.
 *
 * QW-5 / RA-5: erlaubt es, im Audit-Log-Viewer direkt zur Detail-Seite
 * einer geänderten Entität zu springen.
 */
import type { AuditEntityType } from "./audit-types";

/**
 * Returns the canonical detail-route for an audit-log entity,
 * or `null` if the entity has no dedicated detail page.
 */
export function getAuditEntityHref(
  entityType: AuditEntityType | string,
  entityId: string | null | undefined,
): string | null {
  if (!entityId) return null;

  // Mapping table — keys mirror AuditEntityType values.
  switch (entityType) {
    case "Park":
      return `/parks/${entityId}`;
    case "Turbine":
      return `/anlagen/${entityId}`;
    case "TurbineProduction":
      return `/anlagen/produktion/${entityId}`;
    case "Fund":
      return `/gesellschaften/${entityId}`;
    case "FundHierarchy":
      return `/gesellschaften?hierarchy=${entityId}`;
    case "Shareholder":
      return `/gesellschafter/${entityId}`;
    case "Plot":
      return `/flurstuecke/${entityId}`;
    case "Lease":
      return `/pachtvertraege/${entityId}`;
    case "Contract":
      return `/vertraege/${entityId}`;
    case "Document":
      return `/dokumente/${entityId}`;
    case "Invoice":
      return `/rechnungen/${entityId}`;
    case "IncomingInvoice":
      return `/buchhaltung/eingangsrechnungen/${entityId}`;
    case "JournalEntry":
      return `/buchhaltung/journal/${entityId}`;
    case "BankTransaction":
      return `/buchhaltung/banktransaktionen/${entityId}`;
    case "Vote":
      return `/abstimmungen/${entityId}`;
    case "ServiceEvent":
      return `/service-events/${entityId}`;
    case "News":
      return `/news/${entityId}`;
    case "Person":
      return `/personen/${entityId}`;
    case "User":
      return `/admin/users/${entityId}`;
    case "Role":
      return `/admin/roles/${entityId}`;
    case "Tenant":
      return `/admin/tenants/${entityId}`;
    case "TurbineOperator":
      return `/wka-betreiber/${entityId}`;
    case "EnergySettlement":
      return `/energie/abrechnungen/${entityId}`;
    case "EnergySettlementItem":
      return `/energie/abrechnungen?item=${entityId}`;
    case "LeaseRevenueSettlement":
      return `/pacht/abrechnungen/${entityId}`;
    case "ParkCostAllocation":
      return `/parks/kostenaufteilung/${entityId}`;
    case "MassCommunication":
      return `/kommunikation/${entityId}`;
    case "ArchivedDocument":
      return `/archiv/${entityId}`;
    default:
      return null;
  }
}
