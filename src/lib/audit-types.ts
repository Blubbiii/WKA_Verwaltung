// Audit log action types
export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "VIEW"
  | "EXPORT"
  | "DOCUMENT_DOWNLOAD"
  | "LOGIN"
  | "LOGOUT"
  | "IMPERSONATE";

// Entity types for audit logging
export type AuditEntityType =
  | "Park"
  | "Turbine"
  | "TurbineProduction"
  | "Fund"
  | "FundHierarchy"
  | "Shareholder"
  | "Plot"
  | "Lease"
  | "Contract"
  | "Document"
  | "Invoice"
  | "Vote"
  | "ServiceEvent"
  | "News"
  | "Person"
  | "User"
  | "Role"
  | "Tenant"
  | "TurbineOperator"
  | "EnergySettlement"
  | "EnergySettlementItem"
  | "LeaseRevenueSettlement"
  | "ParkCostAllocation"
  | "MassCommunication"
  | "ArchivedDocument"
  | "ArchiveVerification";

/**
 * Get entity display name for German UI
 */
export function getEntityDisplayName(entityType: AuditEntityType): string {
  const displayNames: Record<AuditEntityType, string> = {
    Park: "Windpark",
    Turbine: "Anlage",
    TurbineProduction: "Netzbetreiber-Daten",
    Fund: "Gesellschaft",
    FundHierarchy: "Gesellschafts-Hierarchie",
    Shareholder: "Gesellschafter",
    Plot: "Flurstück",
    Lease: "Pachtvertrag",
    Contract: "Vertrag",
    Document: "Dokument",
    Invoice: "Rechnung",
    Vote: "Abstimmung",
    ServiceEvent: "Service-Event",
    News: "Neuigkeit",
    Person: "Person",
    User: "Benutzer",
    Role: "Rolle",
    Tenant: "Mandant",
    TurbineOperator: "WKA-Betreiber",
    EnergySettlement: "Stromabrechnung",
    EnergySettlementItem: "Stromabrechnung-Position",
    LeaseRevenueSettlement: "Nutzungsentgelt-Abrechnung",
    ParkCostAllocation: "Kostenaufteilung",
    MassCommunication: "Massen-Kommunikation",
    ArchivedDocument: "Archiviertes Dokument",
    ArchiveVerification: "Archiv-Integritaetsprüfung",
  };
  return displayNames[entityType] || entityType;
}

/**
 * Get action display name for German UI
 */
export function getActionDisplayName(action: AuditAction): string {
  const displayNames: Record<AuditAction, string> = {
    CREATE: "Erstellt",
    UPDATE: "Bearbeitet",
    DELETE: "Gelöscht",
    VIEW: "Angesehen",
    EXPORT: "Exportiert",
    DOCUMENT_DOWNLOAD: "Heruntergeladen",
    LOGIN: "Angemeldet",
    LOGOUT: "Abgemeldet",
    IMPERSONATE: "Impersoniert",
  };
  return displayNames[action] || action;
}
