/**
 * Column Definitions for Export
 *
 * Predefined column configurations for each exportable entity type.
 */

import type { ColumnDef } from './types';

/**
 * Column definitions for Shareholders export
 */
export const shareholderColumns: ColumnDef[] = [
  { key: 'shareholderNumber', header: 'Gesellschafter-Nr.', width: 18 },
  { key: 'person.salutation', header: 'Anrede', width: 10 },
  { key: 'person.firstName', header: 'Vorname', width: 15 },
  { key: 'person.lastName', header: 'Nachname', width: 20 },
  { key: 'person.companyName', header: 'Firma', width: 25 },
  { key: 'person.email', header: 'E-Mail', width: 30 },
  { key: 'person.phone', header: 'Telefon', width: 18 },
  { key: 'person.street', header: 'Strasse', width: 25 },
  { key: 'person.postalCode', header: 'PLZ', width: 8 },
  { key: 'person.city', header: 'Ort', width: 15 },
  { key: 'capitalContribution', header: 'Kapitaleinlage', width: 18, format: 'currency' },
  { key: 'liabilityAmount', header: 'Hafteinlage', width: 15, format: 'currency' },
  { key: 'ownershipPercentage', header: 'Beteiligung %', width: 15, format: 'percentage' },
  { key: 'votingRightsPercentage', header: 'Stimmrechte %', width: 15, format: 'percentage' },
  { key: 'distributionPercentage', header: 'Ausschuettung %', width: 18, format: 'percentage' },
  { key: 'entryDate', header: 'Eintrittsdatum', width: 15, format: 'date' },
  { key: 'exitDate', header: 'Austrittsdatum', width: 15, format: 'date' },
  { key: 'status', header: 'Status', width: 12 },
  { key: 'fund.name', header: 'Gesellschaft', width: 25 },
];

/**
 * Column definitions for Parks export
 */
export const parkColumns: ColumnDef[] = [
  { key: 'name', header: 'Name', width: 25 },
  { key: 'shortName', header: 'Kurzname', width: 15 },
  { key: 'address', header: 'Adresse', width: 30 },
  { key: 'postalCode', header: 'PLZ', width: 8 },
  { key: 'city', header: 'Ort', width: 15 },
  { key: 'country', header: 'Land', width: 15 },
  { key: 'latitude', header: 'Breitengrad', width: 12, format: 'number' },
  { key: 'longitude', header: 'Laengengrad', width: 12, format: 'number' },
  { key: 'commissioningDate', header: 'Inbetriebnahme', width: 15, format: 'date' },
  { key: 'totalCapacityKw', header: 'Gesamtleistung kW', width: 18, format: 'number' },
  { key: 'operator', header: 'Betreiber', width: 20 },
  { key: 'owner', header: 'Eigentuemer', width: 20 },
  { key: 'minimumRentPerTurbine', header: 'Mindestpacht/WEA', width: 18, format: 'currency' },
  { key: 'status', header: 'Status', width: 12 },
  { key: '_count.turbines', header: 'Anzahl WEA', width: 12, format: 'number' },
];

/**
 * Column definitions for Turbines export
 */
export const turbineColumns: ColumnDef[] = [
  { key: 'designation', header: 'Bezeichnung', width: 15 },
  { key: 'park.name', header: 'Windpark', width: 25 },
  { key: 'serialNumber', header: 'Seriennummer', width: 18 },
  { key: 'manufacturer', header: 'Hersteller', width: 18 },
  { key: 'model', header: 'Modell', width: 18 },
  { key: 'ratedPowerKw', header: 'Nennleistung kW', width: 16, format: 'number' },
  { key: 'hubHeightM', header: 'Nabenhoehe m', width: 14, format: 'number' },
  { key: 'rotorDiameterM', header: 'Rotordurchmesser m', width: 18, format: 'number' },
  { key: 'commissioningDate', header: 'Inbetriebnahme', width: 15, format: 'date' },
  { key: 'warrantyEndDate', header: 'Garantieende', width: 15, format: 'date' },
  { key: 'latitude', header: 'Breitengrad', width: 12, format: 'number' },
  { key: 'longitude', header: 'Laengengrad', width: 12, format: 'number' },
  { key: 'status', header: 'Status', width: 12 },
];

/**
 * Column definitions for Invoices export
 */
export const invoiceColumns: ColumnDef[] = [
  { key: 'invoiceNumber', header: 'Rechnungsnummer', width: 18 },
  { key: 'invoiceType', header: 'Typ', width: 15 },
  { key: 'invoiceDate', header: 'Rechnungsdatum', width: 15, format: 'date' },
  { key: 'dueDate', header: 'Fälligkeitsdatum', width: 15, format: 'date' },
  { key: 'recipientName', header: 'Empfänger', width: 25 },
  { key: 'recipientAddress', header: 'Adresse', width: 35 },
  { key: 'netAmount', header: 'Nettobetrag', width: 15, format: 'currency' },
  { key: 'taxRate', header: 'MwSt. %', width: 10, format: 'percentage' },
  { key: 'taxAmount', header: 'MwSt. Betrag', width: 14, format: 'currency' },
  { key: 'grossAmount', header: 'Bruttobetrag', width: 15, format: 'currency' },
  { key: 'currency', header: 'Währung', width: 10 },
  { key: 'status', header: 'Status', width: 12 },
  { key: 'sentAt', header: 'Versendet am', width: 15, format: 'date' },
  { key: 'paidAt', header: 'Bezahlt am', width: 15, format: 'date' },
  { key: 'serviceStartDate', header: 'Leistungszeitraum von', width: 20, format: 'date' },
  { key: 'serviceEndDate', header: 'Leistungszeitraum bis', width: 20, format: 'date' },
  { key: 'fund.name', header: 'Gesellschaft', width: 25 },
  { key: 'park.name', header: 'Windpark', width: 25 },
  { key: 'notes', header: 'Bemerkungen', width: 30 },
];

/**
 * Column definitions for Contracts export
 */
export const contractColumns: ColumnDef[] = [
  { key: 'contractNumber', header: 'Vertragsnummer', width: 18 },
  { key: 'title', header: 'Titel', width: 30 },
  { key: 'contractType', header: 'Vertragsart', width: 18 },
  { key: 'partner.companyName', header: 'Vertragspartner Firma', width: 25 },
  {
    key: 'partner.lastName',
    header: 'Vertragspartner Name',
    width: 20,
    transform: (val, row) => {
      const partner = row.partner as Record<string, unknown> | undefined;
      if (!partner) return '';
      const firstName = partner.firstName || '';
      const lastName = partner.lastName || '';
      return `${firstName} ${lastName}`.trim();
    },
  },
  { key: 'startDate', header: 'Vertragsbeginn', width: 15, format: 'date' },
  { key: 'endDate', header: 'Vertragsende', width: 15, format: 'date' },
  { key: 'noticePeriodMonths', header: 'Kuendigungsfrist (Monate)', width: 22, format: 'number' },
  { key: 'noticeDeadline', header: 'Kuendigungstermin', width: 18, format: 'date' },
  { key: 'autoRenewal', header: 'Auto-Verlaengerung', width: 18 },
  { key: 'renewalPeriodMonths', header: 'Verlaengerung (Monate)', width: 20, format: 'number' },
  { key: 'annualValue', header: 'Jahreswert', width: 15, format: 'currency' },
  { key: 'paymentTerms', header: 'Zahlungsbedingungen', width: 25 },
  { key: 'status', header: 'Status', width: 12 },
  { key: 'park.name', header: 'Windpark', width: 25 },
  { key: 'fund.name', header: 'Gesellschaft', width: 25 },
  { key: 'notes', header: 'Bemerkungen', width: 30 },
];

/**
 * Column definitions for Persons export
 */
export const personColumns: ColumnDef[] = [
  { key: 'personType', header: 'Typ', width: 12 },
  { key: 'salutation', header: 'Anrede', width: 10 },
  { key: 'firstName', header: 'Vorname', width: 15 },
  { key: 'lastName', header: 'Nachname', width: 20 },
  { key: 'companyName', header: 'Firma', width: 25 },
  { key: 'email', header: 'E-Mail', width: 30 },
  { key: 'phone', header: 'Telefon', width: 18 },
  { key: 'mobile', header: 'Mobil', width: 18 },
  { key: 'street', header: 'Strasse', width: 25 },
  { key: 'postalCode', header: 'PLZ', width: 8 },
  { key: 'city', header: 'Ort', width: 15 },
  { key: 'country', header: 'Land', width: 15 },
  { key: 'taxId', header: 'Steuernummer', width: 18 },
  { key: 'bankIban', header: 'IBAN', width: 25 },
  { key: 'bankBic', header: 'BIC', width: 12 },
  { key: 'bankName', header: 'Bank', width: 20 },
  { key: 'status', header: 'Status', width: 12 },
  { key: 'notes', header: 'Bemerkungen', width: 30 },
];

/**
 * Column definitions for Funds export
 */
export const fundColumns: ColumnDef[] = [
  { key: 'name', header: 'Name', width: 30 },
  { key: 'legalForm', header: 'Rechtsform', width: 20 },
  { key: 'registrationNumber', header: 'Registernummer', width: 18 },
  { key: 'registrationCourt', header: 'Registergericht', width: 20 },
  { key: 'foundingDate', header: 'Gruendungsdatum', width: 15, format: 'date' },
  { key: 'fiscalYearEnd', header: 'Geschaeftsjahresende', width: 20 },
  { key: 'totalCapital', header: 'Gesamtkapital', width: 18, format: 'currency' },
  { key: 'managingDirector', header: 'Geschaeftsfuehrer', width: 25 },
  { key: 'address', header: 'Adresse', width: 35 },
  { key: 'status', header: 'Status', width: 12 },
  { key: '_count.shareholders', header: 'Anzahl Gesellschafter', width: 20, format: 'number' },
  { key: '_count.fundParks', header: 'Anzahl Parks', width: 15, format: 'number' },
];

/**
 * Column definitions for Leases export
 */
export const leaseColumns: ColumnDef[] = [
  { key: 'id', header: 'ID', width: 10 },
  { key: 'lessor.companyName', header: 'Verpaechter Firma', width: 25 },
  {
    key: 'lessor.lastName',
    header: 'Verpaechter Name',
    width: 20,
    transform: (val, row) => {
      const lessor = row.lessor as Record<string, unknown> | undefined;
      if (!lessor) return '';
      const firstName = lessor.firstName || '';
      const lastName = lessor.lastName || '';
      return `${firstName} ${lastName}`.trim();
    },
  },
  { key: 'signedDate', header: 'Unterzeichnet am', width: 15, format: 'date' },
  { key: 'startDate', header: 'Beginn', width: 12, format: 'date' },
  { key: 'endDate', header: 'Ende', width: 12, format: 'date' },
  { key: 'status', header: 'Status', width: 12 },
  { key: 'hasExtensionOption', header: 'Verlaengerungsoption', width: 20 },
  { key: 'extensionDetails', header: 'Verlaengerungsdetails', width: 25 },
  { key: 'hasWaitingMoney', header: 'Wartegeld', width: 12 },
  { key: 'waitingMoneyAmount', header: 'Wartegeld Betrag', width: 16, format: 'currency' },
  { key: 'waitingMoneyUnit', header: 'Wartegeld Einheit', width: 15 },
  { key: 'waitingMoneySchedule', header: 'Wartegeld Rhythmus', width: 18 },
  { key: 'notes', header: 'Bemerkungen', width: 30 },
];

/**
 * Column definitions for Plots export
 */
export const plotColumns: ColumnDef[] = [
  { key: 'county', header: 'Landkreis', width: 20 },
  { key: 'municipality', header: 'Gemeinde', width: 20 },
  { key: 'cadastralDistrict', header: 'Gemarkung', width: 20 },
  { key: 'fieldNumber', header: 'Flur', width: 8 },
  { key: 'plotNumber', header: 'Flurstueck', width: 12 },
  { key: 'areaSqm', header: 'Flaeche m2', width: 14, format: 'number' },
  { key: 'usageType', header: 'Nutzungsart', width: 18 },
  { key: 'latitude', header: 'Breitengrad', width: 12, format: 'number' },
  { key: 'longitude', header: 'Laengengrad', width: 12, format: 'number' },
  { key: 'park.name', header: 'Windpark', width: 25 },
  { key: 'status', header: 'Status', width: 12 },
  { key: 'notes', header: 'Bemerkungen', width: 30 },
];

/**
 * Get column definitions for an entity type
 */
export function getColumnsForType(type: string): ColumnDef[] {
  switch (type) {
    case 'shareholders':
      return shareholderColumns;
    case 'parks':
      return parkColumns;
    case 'turbines':
      return turbineColumns;
    case 'invoices':
      return invoiceColumns;
    case 'contracts':
      return contractColumns;
    case 'persons':
      return personColumns;
    case 'funds':
      return fundColumns;
    case 'leases':
      return leaseColumns;
    case 'plots':
      return plotColumns;
    default:
      throw new Error(`Unknown export type: ${type}`);
  }
}

/**
 * Get a German display name for an entity type
 */
export function getEntityDisplayName(type: string): string {
  switch (type) {
    case 'shareholders':
      return 'Gesellschafter';
    case 'parks':
      return 'Windparks';
    case 'turbines':
      return 'Windenergieanlagen';
    case 'invoices':
      return 'Rechnungen';
    case 'contracts':
      return 'Verträge';
    case 'persons':
      return 'Personen';
    case 'funds':
      return 'Gesellschaften';
    case 'leases':
      return 'Pachtverträge';
    case 'plots':
      return 'Flurstuecke';
    default:
      return type;
  }
}
