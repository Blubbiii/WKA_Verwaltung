/**
 * Splits the text typed into a contact picker into the fields of the create
 * dialog: a legal form or typical organisation word means company, otherwise
 * the last word is the surname.
 */

const FIRMA = /\b(GmbH|AG|KG|OHG|GbR|UG|eG|e\.\s?V\.|SE|mbH|Co\.|Stiftung|Genossenschaft|Gemeinde|Stadt|Amt|Verband|Verein|Bank|Sparkasse|Ltd\.?|Inc\.?)\b|genossenschaft\b/i;

export interface KontaktVorbelegung {
  personType?: "natural" | "legal";
  firstName?: string;
  lastName?: string;
  companyName?: string;
}

export function kontaktVorbelegung(text: string): KontaktVorbelegung {
  const name = text.trim().replace(/\s+/g, " ");
  if (!name) return {};
  if (FIRMA.test(name)) return { personType: "legal", companyName: name };
  const teile = name.split(" ");
  if (teile.length === 1) return { personType: "natural", lastName: name };
  return { personType: "natural", firstName: teile.slice(0, -1).join(" "), lastName: teile[teile.length - 1] };
}
