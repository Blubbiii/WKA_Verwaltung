/**
 * Visible tariffs for the landing page, read on the server. A failing
 * database must not take the landing page down — then the pricing section
 * is simply left out.
 */
import { prisma } from "@/lib/prisma";
import { apiLogger } from "@/lib/logger";
import type { OeffentlicherTarif } from "@/lib/marketing/types";

export async function oeffentlicheTarife(): Promise<OeffentlicherTarif[]> {
  try {
    const tarife = await prisma.tarif.findMany({
      where: { sichtbar: true },
      orderBy: [{ sortierung: "asc" }, { name: "asc" }],
    });
    return tarife.map((t) => ({
      id: t.id,
      name: t.name,
      beschreibung: t.beschreibung,
      preisMonatEur: t.preisMonatEur === null ? null : Number(t.preisMonatEur),
      preisHinweis: t.preisHinweis,
      maxFirmen: t.maxFirmen,
      maxUmspannwerke: t.maxUmspannwerke,
      maxWea: t.maxWea,
      maxBenutzer: t.maxBenutzer,
      leistungen: t.leistungen,
      hervorgehoben: t.hervorgehoben,
    }));
  } catch (err) {
    apiLogger.warn({ err }, "[Marketing] Tarife konnten nicht geladen werden");
    return [];
  }
}
