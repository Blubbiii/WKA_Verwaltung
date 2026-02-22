/**
 * Flexible field-mapping utility with auto-detection for common German ALKIS
 * (Amtliches Liegenschaftskatasterinformationssystem) shapefile field names.
 *
 * Provides two mapping groups:
 * - Plot fields   (Gemarkung, Flur, Flurstueck, etc.)
 * - Owner fields  (Eigentuemer name, address, etc.)
 */

// ---------------------------------------------------------------------------
// Mappable field types
// ---------------------------------------------------------------------------

export type PlotMappableField =
  | "cadastralDistrict"
  | "fieldNumber"
  | "plotNumber"
  | "plotNumerator"
  | "plotDenominator"
  | "areaSqm"
  | "county"
  | "municipality"
  | "usageType";

export type OwnerMappableField =
  | "ownerName"
  | "ownerFirstName"
  | "ownerLastName"
  | "ownerStreet"
  | "ownerHouseNumber"
  | "ownerPostalCode"
  | "ownerCity"
  | "ownerCount";

// ---------------------------------------------------------------------------
// Auto-detection patterns (all matched case-insensitively)
// ---------------------------------------------------------------------------

const ALKIS_PLOT_PATTERNS: Record<PlotMappableField, string[]> = {
  cadastralDistrict: [
    "gemarkung",
    "gmk",
    "gmk_name",
    "gem",
    "gemarkungsname",
    "gem_name",
  ],
  fieldNumber: ["flur", "flr", "flurnummer", "flurnr"],
  plotNumber: [
    "flurstueck",
    "flst",
    "flst_nr",
    "zaehlernenner",
    "flurstcksknnzchng",
    "flstnr",
  ],
  plotNumerator: [
    "flstnrzae",
    "zaehler",
    "zae",
    "flst_zae",
    "flstzae",
    "nenner_zaehler",
  ],
  plotDenominator: [
    "flstnrnen",
    "nenner",
    "nen",
    "flst_nen",
    "flstnen",
  ],
  areaSqm: [
    "amtlicheflaeche",
    "area",
    "shape_area",
    "flaeche",
    "flaeche_m2",
  ],
  county: ["landkreis", "kreis", "lkr"],
  municipality: ["gemeinde", "gem_name", "ortsteil"],
  usageType: ["nutzungsart", "nat", "tatsaechlichenutzung", "nutzung"],
};

const ALKIS_OWNER_PATTERNS: Record<OwnerMappableField, string[]> = {
  ownerName: [
    "eigentuemer",
    "eigentuemer_name",
    "besitzer",
    "name1",
    "eigentum",
  ],
  ownerFirstName: ["vorname", "eigentuemer_vorname", "eigent_vorname"],
  ownerLastName: [
    "nachname",
    "eigentuemer_nachname",
    "eigent_nachname",
    "name",
  ],
  ownerStreet: ["strasse", "eigentuemer_strasse", "str", "eigent_str"],
  ownerHouseNumber: ["hausnummer", "hausnr", "hnr", "eigent_hnr"],
  ownerPostalCode: ["plz", "eigentuemer_plz", "eigent_plz"],
  ownerCity: ["ort", "eigentuemer_ort", "wohnort", "eigent_ort"],
  ownerCount: ["anzahl_eigentuemer", "anz_eigent", "eigent_anz", "anz_eigen"],
};

// ---------------------------------------------------------------------------
// Auto-detection
// ---------------------------------------------------------------------------

/**
 * Try to match each mappable field to one of the shapefile's actual field
 * names by comparing lowercased strings against the known ALKIS patterns.
 *
 * Returns the ORIGINAL (case-preserved) shapefile field name when matched,
 * or null if no match was found.
 */
function autoDetect<T extends string>(
  shpFields: string[],
  patterns: Record<T, string[]>,
): Record<T, string | null> {
  // Build a lookup from lowercased field name to original field name
  const lowerToOriginal = new Map<string, string>();
  for (const field of shpFields) {
    lowerToOriginal.set(field.toLowerCase(), field);
  }

  const result = {} as Record<T, string | null>;

  // Track which shapefile fields have already been claimed so that a single
  // shapefile field is not assigned to multiple mappable fields.
  const claimed = new Set<string>();

  for (const [mappableField, candidates] of Object.entries(patterns) as Array<
    [T, string[]]
  >) {
    let matched: string | null = null;

    for (const candidate of candidates) {
      const original = lowerToOriginal.get(candidate.toLowerCase());
      if (original && !claimed.has(original)) {
        matched = original;
        claimed.add(original);
        break;
      }
    }

    result[mappableField] = matched;
  }

  return result;
}

/**
 * Auto-detect plot-related field mappings from the shapefile's field names.
 */
export function autoDetectPlotMapping(
  shpFields: string[],
): Record<PlotMappableField, string | null> {
  return autoDetect(shpFields, ALKIS_PLOT_PATTERNS);
}

/**
 * Auto-detect owner-related field mappings from the shapefile's field names.
 */
export function autoDetectOwnerMapping(
  shpFields: string[],
): Record<OwnerMappableField, string | null> {
  return autoDetect(shpFields, ALKIS_OWNER_PATTERNS);
}

// ---------------------------------------------------------------------------
// Apply mapping helpers
// ---------------------------------------------------------------------------

/** Common placeholder values that should be treated as empty / no data. */
const PLACEHOLDER_VALUES = new Set(["-", "--", "---", ".", "..", "?", "??"]);

/**
 * Safely read a string value from feature properties using the mapped field
 * name. Returns null when the field is not mapped, the value is empty, or
 * the value is a common placeholder like "-".
 */
function readString(
  properties: Record<string, unknown>,
  fieldName: string | null,
): string | null {
  if (!fieldName) return null;
  const val = properties[fieldName];
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (str.length === 0 || PLACEHOLDER_VALUES.has(str)) return null;
  return str;
}

/**
 * Safely read a numeric value from feature properties.
 */
function readNumber(
  properties: Record<string, unknown>,
  fieldName: string | null,
): number | null {
  if (!fieldName) return null;
  const val = properties[fieldName];
  if (val === null || val === undefined) return null;
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

// ---------------------------------------------------------------------------
// Plot mapping
// ---------------------------------------------------------------------------

export interface MappedPlotData {
  cadastralDistrict: string;
  fieldNumber: string;
  plotNumber: string;
  areaSqm: number | null;
  county: string | null;
  municipality: string | null;
  usageType: string | null;
}

/**
 * Extract plot data from a feature's properties using the provided field
 * mapping. Required fields (cadastralDistrict, fieldNumber, plotNumber)
 * default to empty strings when not found.
 */
export function applyPlotMapping(
  properties: Record<string, unknown>,
  mapping: Record<PlotMappableField, string | null>,
): MappedPlotData {
  // plotNumber: Zähler from plotNumber or plotNumerator, Nenner from plotDenominator
  const numerator = readString(properties, mapping.plotNumerator)
    ?? readString(properties, mapping.plotNumber)
    ?? "";
  const denominator = readString(properties, mapping.plotDenominator);
  const plotNumber = numerator && denominator && denominator !== "0"
    ? `${numerator}/${denominator}`
    : numerator;

  return {
    cadastralDistrict: readString(properties, mapping.cadastralDistrict) ?? "",
    fieldNumber: readString(properties, mapping.fieldNumber) ?? "",
    plotNumber,
    areaSqm: readNumber(properties, mapping.areaSqm),
    county: readString(properties, mapping.county),
    municipality: readString(properties, mapping.municipality),
    usageType: readString(properties, mapping.usageType),
  };
}

// ---------------------------------------------------------------------------
// Owner mapping
// ---------------------------------------------------------------------------

export interface MappedOwnerData {
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
  isMultiOwner: boolean;
  ownerCount: number | null;
}

/** Patterns that indicate multiple owners sharing a plot. */
const MULTI_OWNER_SEPARATORS = /;| und | u\. /i;
const MULTI_OWNER_ENTITY_KEYWORDS = /erbengemeinschaft|gbr/i;

/**
 * Extract owner data from a feature's properties using the provided field
 * mapping.
 *
 * Multi-owner detection logic:
 * 1. If ownerCount field is mapped and the value is > 1 -> multi-owner.
 * 2. If ownerName contains a semicolon, " und ", or " u. " -> multi-owner.
 * 3. If ownerName contains "Erbengemeinschaft" or "GbR" -> also flagged as
 *    multi-owner (these are communal ownership forms).
 */
export function applyOwnerMapping(
  properties: Record<string, unknown>,
  mapping: Record<OwnerMappableField, string | null>,
): MappedOwnerData {
  const name = readString(properties, mapping.ownerName);
  const firstName = readString(properties, mapping.ownerFirstName);
  const lastName = readString(properties, mapping.ownerLastName);
  const street = readString(properties, mapping.ownerStreet);
  const houseNumber = readString(properties, mapping.ownerHouseNumber);
  const postalCode = readString(properties, mapping.ownerPostalCode);
  const city = readString(properties, mapping.ownerCity);
  const ownerCount = readNumber(properties, mapping.ownerCount);

  // Determine multi-owner status
  let isMultiOwner = false;

  // Rule 1: explicit count > 1
  if (ownerCount !== null && ownerCount > 1) {
    isMultiOwner = true;
  }

  // Rule 2 + 3: name-based detection
  if (name) {
    if (MULTI_OWNER_SEPARATORS.test(name)) {
      isMultiOwner = true;
    }
    if (MULTI_OWNER_ENTITY_KEYWORDS.test(name)) {
      isMultiOwner = true;
    }
  }

  return {
    name,
    firstName,
    lastName,
    street,
    houseNumber,
    postalCode,
    city,
    isMultiOwner,
    ownerCount,
  };
}

// ---------------------------------------------------------------------------
// UI field descriptors
// ---------------------------------------------------------------------------

export interface MappableFieldDescriptor<T extends string> {
  key: T;
  label: string;
  required: boolean;
}

/**
 * Return the list of plot-related mappable fields with German labels and
 * required flags. Useful for rendering the mapping UI.
 */
export function getPlotMappableFields(): MappableFieldDescriptor<PlotMappableField>[] {
  return [
    { key: "cadastralDistrict", label: "Gemarkung", required: true },
    { key: "fieldNumber", label: "Flur", required: false },
    { key: "plotNumber", label: "Flurstück (komplett)", required: false },
    { key: "plotNumerator", label: "Flurstück Zähler", required: false },
    { key: "plotDenominator", label: "Flurstück Nenner", required: false },
    { key: "areaSqm", label: "Fläche (m²)", required: false },
    { key: "county", label: "Landkreis", required: false },
    { key: "municipality", label: "Gemeinde", required: false },
    { key: "usageType", label: "Nutzungsart", required: false },
  ];
}

/**
 * Return the list of owner-related mappable fields with German labels and
 * required flags. Useful for rendering the mapping UI.
 */
export function getOwnerMappableFields(): MappableFieldDescriptor<OwnerMappableField>[] {
  return [
    { key: "ownerName", label: "Eigentümer (Name)", required: false },
    { key: "ownerFirstName", label: "Eigentümer Vorname", required: false },
    { key: "ownerLastName", label: "Eigentümer Nachname", required: false },
    { key: "ownerStreet", label: "Eigentümer Straße", required: false },
    { key: "ownerHouseNumber", label: "Eigentümer Hausnummer", required: false },
    { key: "ownerPostalCode", label: "Eigentümer PLZ", required: false },
    { key: "ownerCity", label: "Eigentümer Ort", required: false },
    { key: "ownerCount", label: "Anzahl Eigentümer", required: false },
  ];
}
