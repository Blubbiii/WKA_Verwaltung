/**
 * Placeholder Service for Mailing Templates (K2)
 *
 * Resolves {placeholder} variables in mailing templates with real shareholder data.
 */

// =============================================================================
// Standard placeholder definitions
// =============================================================================

export interface PlaceholderDefinition {
  key: string;
  label: string;
  example: string;
}

export const STANDARD_PLACEHOLDERS: PlaceholderDefinition[] = [
  { key: "anrede", label: "Anrede", example: "Sehr geehrter Herr Müller" },
  { key: "vorname", label: "Vorname", example: "Hans" },
  { key: "nachname", label: "Nachname", example: "Müller" },
  { key: "gesellschaft", label: "Gesellschaft", example: "Windpark Nord GmbH & Co. KG" },
  { key: "anteil", label: "Beteiligungsquote", example: "5,25%" },
  { key: "einlage", label: "Kapitaleinlage", example: "25.000,00 EUR" },
  { key: "datum", label: "Aktuelles Datum", example: "25.02.2026" },
  { key: "gesellschafternr", label: "Gesellschafter-Nr.", example: "K-0042" },
];

// =============================================================================
// Data types for resolution
// =============================================================================

interface ShareholderData {
  shareholderNumber: string | null;
  capitalContribution: { toString(): string } | number | string | null;
  ownershipPercentage: { toString(): string } | number | string | null;
  person: {
    salutation: string | null;
    firstName: string | null;
    lastName: string | null;
    companyName: string | null;
  };
}

interface FundData {
  name: string;
}

// =============================================================================
// Placeholder resolution
// =============================================================================

/**
 * Resolve placeholder values for a single shareholder.
 */
export function resolveShareholderPlaceholders(
  shareholder: ShareholderData,
  fund: FundData
): Record<string, string> {
  const person = shareholder.person;
  const salutation = person.salutation ?? "";
  const firstName = person.firstName ?? "";
  const lastName = person.lastName ?? person.companyName ?? "";

  // Build formal salutation
  let anrede = "";
  if (salutation && lastName) {
    anrede = `Sehr geehrte${salutation === "Herr" ? "r" : ""} ${salutation} ${lastName}`;
  } else if (lastName) {
    anrede = `Sehr geehrte/r ${lastName}`;
  } else {
    anrede = "Sehr geehrte Damen und Herren";
  }

  // Format ownership percentage
  const ownershipPct = shareholder.ownershipPercentage
    ? Number(shareholder.ownershipPercentage).toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + "%"
    : "–";

  // Format capital contribution
  const capital = shareholder.capitalContribution
    ? Number(shareholder.capitalContribution).toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + " EUR"
    : "–";

  // Current date formatted
  const datum = new Date().toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return {
    anrede,
    vorname: firstName || "–",
    nachname: lastName || "–",
    gesellschaft: fund.name,
    anteil: ownershipPct,
    einlage: capital,
    datum,
    gesellschafternr: shareholder.shareholderNumber ?? "–",
  };
}

/**
 * Replace {placeholder} tokens in a template string with provided values.
 */
export function applyPlaceholders(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    return variables[key] ?? match;
  });
}
