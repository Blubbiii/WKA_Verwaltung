/**
 * German sentence for an audit-log row on the dashboard
 * ("Anna Schmidt hat den Windpark angelegt").
 */

/** Object in the accusative with article, keyed by audit entityType. */
const OBJEKT: Record<string, { mitArtikel: string; ohne: string }> = {
  Park: { mitArtikel: "den Windpark", ohne: "Windpark" },
  Turbine: { mitArtikel: "die Anlage", ohne: "Anlage" },
  TurbineProduction: { mitArtikel: "die Produktionsdaten", ohne: "Produktionsdaten" },
  Fund: { mitArtikel: "die Gesellschaft", ohne: "Gesellschaft" },
  FundHierarchy: { mitArtikel: "die Gesellschafts-Hierarchie", ohne: "Gesellschafts-Hierarchie" },
  Shareholder: { mitArtikel: "den Gesellschafter", ohne: "Gesellschafter" },
  Plot: { mitArtikel: "das Flurstück", ohne: "Flurstück" },
  Lease: { mitArtikel: "den Pachtvertrag", ohne: "Pachtvertrag" },
  Contract: { mitArtikel: "den Vertrag", ohne: "Vertrag" },
  Document: { mitArtikel: "das Dokument", ohne: "Dokument" },
  Invoice: { mitArtikel: "die Rechnung", ohne: "Rechnung" },
  Vote: { mitArtikel: "die Abstimmung", ohne: "Abstimmung" },
  ServiceEvent: { mitArtikel: "den Service-Vorgang", ohne: "Service-Vorgang" },
  FaultCase: { mitArtikel: "den Störungsvorgang", ohne: "Störungsvorgang" },
  ShareTransfer: { mitArtikel: "die Anteilsübertragung", ohne: "Anteilsübertragung" },
  BankConnection: { mitArtikel: "die Bankverbindung", ohne: "Bankverbindung" },
  News: { mitArtikel: "die Neuigkeit", ohne: "Neuigkeit" },
  Person: { mitArtikel: "die Person", ohne: "Person" },
  Municipality: { mitArtikel: "die Gemeinde", ohne: "Gemeinde" },
  Vendor: { mitArtikel: "den Lieferanten", ohne: "Lieferant" },
  User: { mitArtikel: "den Benutzer", ohne: "Benutzer" },
  Role: { mitArtikel: "die Rolle", ohne: "Rolle" },
  Tenant: { mitArtikel: "den Mandanten", ohne: "Mandant" },
  TurbineOperator: { mitArtikel: "den WKA-Betreiber", ohne: "WKA-Betreiber" },
  EnergySettlement: { mitArtikel: "die Energieabrechnung", ohne: "Energieabrechnung" },
  EnergySettlementItem: { mitArtikel: "eine Position der Energieabrechnung", ohne: "Position der Energieabrechnung" },
  LeaseRevenueSettlement: { mitArtikel: "die Pachtabrechnung", ohne: "Pachtabrechnung" },
  LeaseSettlementPeriod: { mitArtikel: "die Pachtabrechnung", ohne: "Pachtabrechnung" },
  ParkCostAllocation: { mitArtikel: "die Kostenaufteilung", ohne: "Kostenaufteilung" },
  MassCommunication: { mitArtikel: "das Serienschreiben", ohne: "Serienschreiben" },
  ArchivedDocument: { mitArtikel: "das archivierte Dokument", ohne: "Archiviertes Dokument" },
  ArchiveVerification: { mitArtikel: "die Archivprüfung", ohne: "Archivprüfung" },
  IncomingInvoice: { mitArtikel: "die Eingangsrechnung", ohne: "Eingangsrechnung" },
  ACCESS_REPORT: { mitArtikel: "den Zugriffsbericht", ohne: "Zugriffsbericht" },
  PERMISSION_MATRIX: { mitArtikel: "die Rechteübersicht", ohne: "Rechteübersicht" },
};

/** Older rows carry lower-case codes ("lease", "contract"). */
function objekt(entityType: string) {
  if (OBJEKT[entityType]) return OBJEKT[entityType];
  const key = Object.keys(OBJEKT).find((k) => k.toLowerCase() === entityType.toLowerCase());
  return key ? OBJEKT[key] : null;
}

const PARTIZIP: Record<string, string> = {
  CREATE: "angelegt",
  UPDATE: "bearbeitet",
  DELETE: "gelöscht",
  POST: "festgeschrieben",
  REVERSE: "storniert",
  VIEW: "angesehen",
  EXPORT: "exportiert",
  DOCUMENT_DOWNLOAD: "heruntergeladen",
};

const OHNE_OBJEKT: Record<string, string> = {
  LOGIN: "hat sich angemeldet",
  LOGOUT: "hat sich abgemeldet",
  IMPERSONATE: "hat die Sicht eines anderen Benutzers übernommen",
};

export function aktivitaetsSatz(eintrag: {
  name: string | null;
  action: string;
  entityType: string;
}): string {
  const wer = eintrag.name ?? "Jemand";
  const reflexiv = OHNE_OBJEKT[eintrag.action];
  if (reflexiv) return `${wer} ${reflexiv}`;

  const o = objekt(eintrag.entityType);
  const partizip = PARTIZIP[eintrag.action];
  if (!o || !partizip) return `${wer} hat einen Eintrag geändert`;

  return eintrag.name ? `${eintrag.name} hat ${o.mitArtikel} ${partizip}` : `${o.ohne} ${partizip}`;
}

/** Short object name for the detail line ("Rechnung"). */
export function aktivitaetsObjekt(entityType: string): string {
  return objekt(entityType)?.ohne ?? "Eintrag";
}
