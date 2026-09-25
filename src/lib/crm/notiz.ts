/** A free-text note as CRM activity of a company (fund). */
export function notizAlsAktivitaet(text: string, fundId: string) {
  const inhalt = text.trim();
  if (!inhalt) return null;
  const ersteZeile = inhalt.split("\n")[0].trim();
  const title = ersteZeile.length > 120 ? ersteZeile.slice(0, 119) + "…" : ersteZeile;
  return { type: "NOTE" as const, title, description: inhalt, fundId };
}

/** Text shown for the latest note. */
export function notizText(notiz: { title: string; description: string | null } | null | undefined): string | null {
  if (!notiz) return null;
  return notiz.description ?? notiz.title;
}
