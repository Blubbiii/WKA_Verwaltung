/**
 * Der Mandant, dessen Inhalte auf den öffentlichen Seiten erscheinen.
 *
 * Startseite, Impressum, Datenschutz und Cookie-Hinweis gehören dem Betreiber
 * der Installation. Bisher nahmen sie den erstbesten aktiven Mandanten
 * (`findFirst` ohne Sortierung) — bei mehreren Mandanten also womöglich das
 * Impressum einer fremden Firma. Das Impressum ist eine Pflichtangabe nach
 * § 5 DDG; eine falsche ist schlimmer als die neutrale Vorgabe.
 *
 * Regel, in dieser Reihenfolge:
 * 1. `PUBLIC_SITE_TENANT_SLUG` gesetzt → genau dieser Mandant.
 * 2. Genau ein aktiver Mandant → dieser (Einzelinstallationen ändern sich nicht).
 * 3. Sonst → kein Mandant; die Seiten zeigen ihre Vorgabetexte, und das
 *    Protokoll sagt, was einzustellen ist.
 *
 * Eine Auflösung über die aufgerufene Domain wäre schöner, setzt aber eine
 * Zuordnung Domain → Mandant voraus, die es nicht gibt.
 */

import { prisma } from "@/lib/prisma";
import { apiLogger } from "@/lib/logger";

const logger = apiLogger.child({ component: "oeffentlicher-mandant" });

interface MandantKennung {
  id: string;
  slug: string;
}

/** Reine Auswahl — getrennt von der Abfrage, damit sie prüfbar ist. */
export function waehleOeffentlichenMandanten<T extends MandantKennung>(
  aktive: readonly T[],
  eingestellterSlug: string | undefined,
): { mandant: T | null; warnung?: string } {
  const slug = eingestellterSlug?.trim();
  if (slug) {
    const treffer = aktive.find((m) => m.slug === slug);
    if (treffer) return { mandant: treffer };
    return {
      mandant: null,
      warnung:
        `PUBLIC_SITE_TENANT_SLUG="${slug}" passt auf keinen aktiven Mandanten — ` +
        `die öffentlichen Seiten zeigen die Vorgabetexte.`,
    };
  }
  if (aktive.length === 1) return { mandant: aktive[0] };
  if (aktive.length === 0) return { mandant: null };
  return {
    mandant: null,
    warnung:
      `${aktive.length} aktive Mandanten und kein PUBLIC_SITE_TENANT_SLUG gesetzt — ` +
      `die öffentlichen Seiten zeigen die Vorgabetexte statt eines beliebigen Mandanten.`,
  };
}

let gewarnt = false;

/**
 * Einstellungen des öffentlichen Mandanten, oder `null` für die Vorgaben.
 *
 * Liefert nur `settings`: mehr brauchen die öffentlichen Seiten nicht, und
 * mehr soll an dieser Stelle auch nicht herausgegeben werden.
 */
export async function oeffentlicheEinstellungen(): Promise<Record<string, unknown> | null> {
  const aktive = await prisma.tenant.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, slug: true },
    orderBy: { createdAt: "asc" },
  });
  const { mandant, warnung } = waehleOeffentlichenMandanten(aktive, process.env.PUBLIC_SITE_TENANT_SLUG);
  if (warnung && !gewarnt) {
    // Einmal je Prozess genügt; die Seiten werden oft aufgerufen.
    logger.warn(warnung);
    gewarnt = true;
  }
  if (!mandant) return null;

  const tenant = await prisma.tenant.findUnique({
    where: { id: mandant.id },
    select: { settings: true },
  });
  return (tenant?.settings as Record<string, unknown> | null) ?? null;
}
