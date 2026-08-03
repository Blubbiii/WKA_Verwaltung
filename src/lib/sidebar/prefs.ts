/**
 * Persönliche Einstellungen der Seitenleiste: Favoriten und ausgeblendete
 * Gruppen.
 *
 * ## Warum Favoriten neben der Systemnavigation stehen und nicht statt ihrer
 *
 * Die Systemnavigation ist nach **Sachgebieten** geordnet — Finanzen, Energie,
 * CRM. Das ist richtig: so findet man etwas, das man noch nie gesucht hat.
 *
 * Arbeit läuft aber nicht nach Sachgebieten. Ein Monatsabschluss braucht
 * Rechnungen (Finanzen), Ertragsdaten (Energie), das Buchungsjournal
 * (Finanzen) und Abstimmungen (Kommunikation) — vier Einträge, drei
 * Sachgebiete, ein Vorgang. Wer das jeden Monat macht, klappert vier Gruppen
 * ab.
 *
 * Das sind zwei verschiedene Ordnungen, und beide sind richtig. Eigene
 * Gruppen lassen die zweite entstehen, ohne die erste anzutasten: die
 * Systemnavigation bleibt vollständig, damit „geh auf Finanzen → Rechnungen"
 * weiterhin stimmt und die Einarbeitung nicht an einer Privatordnung scheitert.
 *
 * ## Warum eigene Gruppen keine Übersetzungsfrage sind
 *
 * Ein selbst vergebener Name ist das eigene Wort des Nutzers, keine
 * Übersetzung eines Systembegriffs — er bleibt in jeder Sprache stehen, und
 * das ist richtig so. Die **Einträge** darin behalten ihre übersetzten
 * Bezeichnungen. Genau daran wäre ein Umbenennen der Systemgruppen
 * gescheitert.
 *
 * ## Ausgeblendete Gruppen: persönlich, nicht für den Mandanten
 *
 * Was ein Mandant gar nicht nutzt, blenden bereits die Feature-Schalter aus
 * (`featureFlag` in der Navigationsdefinition, 35 Stellen). Hier geht es um
 * etwas anderes: die Buchhalterin nutzt die Energie-Gruppe nie, obwohl das
 * Haus SCADA betreibt. Deshalb **pro Benutzer** und niemals mandantenweit —
 * niemand darf einem anderen den Zugang wegkonfigurieren.
 *
 * Ausblenden nimmt nur die Anzeige, nicht das Recht: die Seiten bleiben über
 * Adresse, Suche und Befehlspalette erreichbar.
 */

/** Eine selbst angelegte Gruppe innerhalb der Favoriten. */
export interface FavoritenGruppe {
  /** Stabile Kennung. Der Name darf sich ändern, die Zuordnung nicht. */
  id: string;
  name: string;
  /** Ziele in der vom Nutzer gewählten Reihenfolge. */
  hrefs: string[];
}

export interface SidebarPrefs {
  /** Eigene Gruppen, in ihrer Reihenfolge. */
  gruppen: FavoritenGruppe[];
  /** Favoriten ohne Gruppe. Der Normalfall, solange es wenige sind. */
  lose: string[];
  /** `labelKey` der Systemgruppen, die dieser Benutzer nicht sehen will. */
  versteckteGruppen: string[];
}

export const LEERE_PREFS: SidebarPrefs = {
  gruppen: [],
  lose: [],
  versteckteGruppen: [],
};

/** Obergrenzen — eine Seitenleiste mit dreissig Favoriten ist keine mehr. */
export const MAX_FAVORITEN = 30;
export const MAX_GRUPPEN = 10;
export const MAX_NAME_LAENGE = 40;

/** Ist dieses Ziel ein Favorit — gleich ob lose oder in einer Gruppe? */
export function istFavorit(prefs: SidebarPrefs, href: string): boolean {
  if (prefs.lose.includes(href)) return true;
  return prefs.gruppen.some((g) => g.hrefs.includes(href));
}

/** Alle Favoriten, unabhängig von der Gruppe. Für Zähler und Grenzen. */
export function alleFavoriten(prefs: SidebarPrefs): string[] {
  return [...prefs.lose, ...prefs.gruppen.flatMap((g) => g.hrefs)];
}

/**
 * Fügt ein Ziel hinzu oder entfernt es.
 *
 * Neue Favoriten landen **lose**, nie in einer Gruppe: welche Gruppe die
 * richtige wäre, weiss nur der Nutzer, und ihn beim Setzen des Sterns danach
 * zu fragen macht aus einem Klick einen Dialog. Einsortiert wird später in
 * den Einstellungen — oder gar nicht.
 */
export function umschalten(prefs: SidebarPrefs, href: string): SidebarPrefs {
  if (istFavorit(prefs, href)) {
    return {
      ...prefs,
      lose: prefs.lose.filter((h) => h !== href),
      gruppen: prefs.gruppen.map((g) => ({
        ...g,
        hrefs: g.hrefs.filter((h) => h !== href),
      })),
    };
  }

  if (alleFavoriten(prefs).length >= MAX_FAVORITEN) return prefs;
  return { ...prefs, lose: [...prefs.lose, href] };
}

/**
 * Ordnet ein Ziel einer Gruppe zu — oder holt es wieder heraus
 * (`gruppeId: null`).
 *
 * Ein Ziel steht immer an genau einer Stelle. Es vorher überall zu entfernen
 * ist deshalb nicht Vorsicht, sondern die Regel: läge dasselbe Ziel in zwei
 * Gruppen, wäre nicht mehr zu sagen, welche es beim Entfernen trifft.
 */
export function zuordnen(
  prefs: SidebarPrefs,
  href: string,
  gruppeId: string | null,
): SidebarPrefs {
  const bereinigt: SidebarPrefs = {
    ...prefs,
    lose: prefs.lose.filter((h) => h !== href),
    gruppen: prefs.gruppen.map((g) => ({
      ...g,
      hrefs: g.hrefs.filter((h) => h !== href),
    })),
  };

  if (gruppeId === null) {
    return { ...bereinigt, lose: [...bereinigt.lose, href] };
  }

  return {
    ...bereinigt,
    gruppen: bereinigt.gruppen.map((g) =>
      g.id === gruppeId ? { ...g, hrefs: [...g.hrefs, href] } : g,
    ),
  };
}

/** Legt eine Gruppe an. Gibt die Einstellungen unverändert zurück, wenn die Grenze erreicht ist. */
export function gruppeAnlegen(
  prefs: SidebarPrefs,
  name: string,
  id: string,
): SidebarPrefs {
  const sauber = name.trim().slice(0, MAX_NAME_LAENGE);
  if (!sauber) return prefs;
  if (prefs.gruppen.length >= MAX_GRUPPEN) return prefs;
  return { ...prefs, gruppen: [...prefs.gruppen, { id, name: sauber, hrefs: [] }] };
}

export function gruppeUmbenennen(
  prefs: SidebarPrefs,
  id: string,
  name: string,
): SidebarPrefs {
  const sauber = name.trim().slice(0, MAX_NAME_LAENGE);
  if (!sauber) return prefs;
  return {
    ...prefs,
    gruppen: prefs.gruppen.map((g) => (g.id === id ? { ...g, name: sauber } : g)),
  };
}

/**
 * Löscht eine Gruppe. Ihre Einträge bleiben Favoriten und werden lose —
 * sie zusammen mit der Gruppe zu löschen wäre eine Überraschung: der Nutzer
 * wollte die Ordnung auflösen, nicht die Auswahl.
 */
export function gruppeLoeschen(prefs: SidebarPrefs, id: string): SidebarPrefs {
  const betroffen = prefs.gruppen.find((g) => g.id === id);
  if (!betroffen) return prefs;
  return {
    ...prefs,
    gruppen: prefs.gruppen.filter((g) => g.id !== id),
    lose: [...prefs.lose, ...betroffen.hrefs],
  };
}

/** Blendet eine Systemgruppe aus oder wieder ein. */
export function gruppeSichtbarkeit(
  prefs: SidebarPrefs,
  labelKey: string,
): SidebarPrefs {
  const versteckt = prefs.versteckteGruppen.includes(labelKey);
  return {
    ...prefs,
    versteckteGruppen: versteckt
      ? prefs.versteckteGruppen.filter((k) => k !== labelKey)
      : [...prefs.versteckteGruppen, labelKey],
  };
}

/**
 * Bringt beliebige gespeicherte Daten in eine benutzbare Form.
 *
 * Die Einstellungen liegen als JSON im Benutzerdatensatz. Was dort steht,
 * kann aus einer älteren Fassung stammen oder von Hand verändert worden sein
 * — eine kaputte Einstellung darf die Seitenleiste nicht mitreissen.
 */
export function lesePrefs(roh: unknown): SidebarPrefs {
  if (!roh || typeof roh !== "object") return LEERE_PREFS;
  const o = roh as Record<string, unknown>;

  const texte = (w: unknown): string[] =>
    Array.isArray(w) ? w.filter((x): x is string => typeof x === "string") : [];

  const gruppen = Array.isArray(o.gruppen)
    ? o.gruppen
        .filter((g): g is Record<string, unknown> => !!g && typeof g === "object")
        .filter((g) => typeof g.id === "string" && typeof g.name === "string")
        .map((g) => ({
          id: g.id as string,
          name: (g.name as string).slice(0, MAX_NAME_LAENGE),
          hrefs: texte(g.hrefs),
        }))
        .slice(0, MAX_GRUPPEN)
    : [];

  return {
    gruppen,
    lose: texte(o.lose),
    versteckteGruppen: texte(o.versteckteGruppen),
  };
}
