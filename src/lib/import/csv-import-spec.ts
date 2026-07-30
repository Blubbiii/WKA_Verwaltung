/**
 * Beschreibung dessen, was ein CSV-Import je Zielobjekt annimmt.
 *
 * Bedienaufwand #22 (Audit 2026-07): Export gibt es in 18 Listen, Import für
 * SHP, Bank, Energie, GIS und SCADA-Codes — für Stammdaten in keiner.
 *
 * Client und Server teilen sich diese Datei: die Oberfläche baut daraus ihre
 * Spaltenzuordnung, die Route prüft dagegen. Zwei getrennte Feldlisten würden
 * auseinanderlaufen, und der Import schriebe dann Felder, die die Maske gar
 * nicht anbietet.
 *
 * Bewusst NICHT dabei: Verträge und Buchungssätze. Der Auditbericht nennt sie
 * mit, aber ein Buchungssatz-Import muss Konten auflösen, Soll/Haben abgleichen
 * und in die Nummernkreise eingreifen — das ist kein Stammdatenimport, sondern
 * ein eigener Vorgang mit eigener Prüfung. Ein CSV-Import, der Buchungen halb
 * validiert einträgt, wäre schlimmer als keiner.
 */

export interface CsvImportField {
  /** Feldname im Zielobjekt. */
  key: string;
  /** Beschriftung in der Zuordnungsmaske (i18n-Schlüssel unter `csvImport.fields`). */
  labelKey: string;
  required?: boolean;
  /** Spaltennamen, die automatisch auf dieses Feld gelegt werden. */
  aliases: readonly string[];
  /** Feste Auswahl — alles andere gilt als Fehler in der Zeile. */
  enumValues?: readonly string[];
  maxLength?: number;
}

export interface CsvImportSpec {
  /** Wird in der URL als `type` übergeben. */
  target: string;
  fields: readonly CsvImportField[];
  /**
   * Felder, aus denen sich eine Dublette erkennen lässt. Ein Treffer wird
   * übersprungen und gemeldet — nicht als Fehler und nicht stillschweigend.
   */
  dedupeBy: readonly (readonly string[])[];
}

export const PERSON_IMPORT: CsvImportSpec = {
  target: "persons",
  fields: [
    {
      key: "personType",
      labelKey: "personType",
      aliases: ["Art", "Typ", "Personentyp", "Type"],
      enumValues: ["natural", "legal"],
    },
    { key: "salutation", labelKey: "salutation", aliases: ["Anrede", "Salutation"] },
    { key: "firstName", labelKey: "firstName", aliases: ["Vorname", "First Name", "Firstname"] },
    { key: "lastName", labelKey: "lastName", aliases: ["Nachname", "Name", "Last Name", "Lastname"] },
    { key: "companyName", labelKey: "companyName", aliases: ["Firma", "Firmenname", "Company", "Unternehmen"] },
    { key: "email", labelKey: "email", aliases: ["E-Mail", "Email", "E-Mail-Adresse", "Mail"] },
    { key: "phone", labelKey: "phone", aliases: ["Telefon", "Tel", "Phone", "Festnetz"] },
    { key: "mobile", labelKey: "mobile", aliases: ["Mobil", "Handy", "Mobile"] },
    { key: "street", labelKey: "street", aliases: ["Straße", "Strasse", "Street"] },
    { key: "houseNumber", labelKey: "houseNumber", aliases: ["Hausnummer", "Nr", "House Number"] },
    { key: "postalCode", labelKey: "postalCode", aliases: ["PLZ", "Postleitzahl", "Zip", "Postal Code"] },
    { key: "city", labelKey: "city", aliases: ["Ort", "Stadt", "City"] },
    { key: "country", labelKey: "country", aliases: ["Land", "Country"] },
    { key: "taxId", labelKey: "taxId", aliases: ["Steuernummer", "Steuer-ID", "Tax ID"] },
    { key: "bankIban", labelKey: "bankIban", aliases: ["IBAN", "Bank IBAN"] },
    { key: "bankBic", labelKey: "bankBic", aliases: ["BIC", "SWIFT"] },
    { key: "bankName", labelKey: "bankName", aliases: ["Bank", "Bankname", "Kreditinstitut"] },
    { key: "notes", labelKey: "notes", aliases: ["Notizen", "Bemerkung", "Notes"] },
  ],
  // Eine Firma gilt beim Namen als bekannt, eine natürliche Person bei
  // Vor- UND Nachname. E-Mail zusätzlich, weil sie am eindeutigsten ist.
  dedupeBy: [["email"], ["companyName"], ["firstName", "lastName"]],
};

export const VENDOR_IMPORT: CsvImportSpec = {
  target: "vendors",
  fields: [
    { key: "name", labelKey: "vendorName", required: true, aliases: ["Name", "Firma", "Lieferant", "Company"], maxLength: 200 },
    { key: "email", labelKey: "email", aliases: ["E-Mail", "Email", "Mail"] },
    { key: "street", labelKey: "street", aliases: ["Straße", "Strasse", "Street"] },
    { key: "postalCode", labelKey: "postalCode", aliases: ["PLZ", "Postleitzahl", "Zip"] },
    { key: "city", labelKey: "city", aliases: ["Ort", "Stadt", "City"] },
    { key: "country", labelKey: "country", aliases: ["Land", "Country"] },
    { key: "taxId", labelKey: "taxId", aliases: ["Steuernummer", "Steuer-ID"], maxLength: 50 },
    { key: "vatId", labelKey: "vatId", aliases: ["USt-IdNr", "USt-ID", "VAT ID", "Umsatzsteuer-ID"], maxLength: 50 },
    { key: "iban", labelKey: "bankIban", aliases: ["IBAN"], maxLength: 34 },
    { key: "bic", labelKey: "bankBic", aliases: ["BIC", "SWIFT"], maxLength: 11 },
    { key: "notes", labelKey: "notes", aliases: ["Notizen", "Bemerkung", "Notes"] },
  ],
  dedupeBy: [["name"]],
};

export const IMPORT_SPECS: Record<string, CsvImportSpec> = {
  persons: PERSON_IMPORT,
  vendors: VENDOR_IMPORT,
};

/** Alle Aliasnamen als Zuordnung Feld → Spaltennamen, für `autoDetectMapping`. */
export function aliasMap(spec: CsvImportSpec): Record<string, readonly string[]> {
  return Object.fromEntries(spec.fields.map((field) => [field.key, field.aliases]));
}
