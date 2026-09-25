/**
 * Order of the sortable sidebar groups: one default (the config order) and one
 * merge rule for a saved order. Used on the server (first paint) and client.
 */

interface Gruppe {
  labelKey?: string;
}

/** Default order = order in nav-config. */
export function standardReihenfolge(gruppen: Gruppe[]): string[] {
  return gruppen.map((g) => g.labelKey).filter((k): k is string => !!k);
}

/**
 * Saved order first; a group the saved order does not know (added later) goes
 * right behind its predecessor from the config instead of to the end.
 */
export function sortiereGruppen<G extends Gruppe>(gruppen: G[], gespeichert: string[]): G[] {
  const nachKey = new Map(gruppen.map((g) => [g.labelKey ?? "", g]));
  const ergebnis: G[] = gespeichert.map((k) => nachKey.get(k)).filter((g): g is G => !!g);
  // Deduplicate in case the stored array repeats a key.
  const gesehen = new Set<G>();
  const eindeutig = ergebnis.filter((g) => (gesehen.has(g) ? false : (gesehen.add(g), true)));

  gruppen.forEach((g, i) => {
    if (gesehen.has(g)) return;
    let pos = 0;
    for (let j = i - 1; j >= 0; j--) {
      const idx = eindeutig.indexOf(gruppen[j]);
      if (idx !== -1) {
        pos = idx + 1;
        break;
      }
    }
    eindeutig.splice(pos, 0, g);
    gesehen.add(g);
  });
  return eindeutig;
}

/** Groups that always stay at the bottom and are not sortable. */
export const FESTE_GRUPPEN_UNTEN = new Set(["admin", "system"]);

/** The groups the user can reorder: labelled and not pinned. */
export function sortierbareGruppen<G extends Gruppe & { label: string | null }>(gruppen: G[]): G[] {
  return gruppen.filter((g) => g.label !== null && !(g.labelKey && FESTE_GRUPPEN_UNTEN.has(g.labelKey)));
}
