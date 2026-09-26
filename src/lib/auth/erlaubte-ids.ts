/**
 * Combines the per-user whitelist (FundAccess / park access) with the
 * role-based resource restriction. null = unrestricted.
 *
 * An empty role list counts as "no restriction" — that is how the routes
 * have always read `allowedResourceIds?.length`. An empty user whitelist,
 * by contrast, only exists as the result of the deny default and means
 * "nothing".
 */
export function erlaubteIds(
  benutzer: string[] | null,
  rolle: string[] | null,
): string[] | null {
  const rollenListe = rolle && rolle.length > 0 ? rolle : null;
  if (benutzer && rollenListe) return benutzer.filter((id) => rollenListe.includes(id));
  return benutzer ?? rollenListe;
}

export function istErlaubt(erlaubt: string[] | null, id: string): boolean {
  return erlaubt === null || erlaubt.includes(id);
}
