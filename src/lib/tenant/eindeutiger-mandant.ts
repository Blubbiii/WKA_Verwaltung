/**
 * „Der" Mandant — nur, wenn es genau einen aktiven gibt.
 *
 * Für Stellen, die ohne ausdrückliche Zuordnung auskommen müssen (eingehende
 * E-Mail ohne Regel, API-Aufruf ohne Mandantenkopf). Bei einer
 * Einzelinstallation ist die Antwort eindeutig. Bei mehreren Mandanten gibt es
 * keine richtige Wahl — dann liefert diese Funktion nichts, und der Aufrufer
 * muss ablehnen oder nachfragen, statt einen fremden Mandanten zu treffen.
 */

import { prisma } from "@/lib/prisma";

export async function eindeutigerAktiverMandant(): Promise<{ id: string } | null> {
  const aktive = await prisma.tenant.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
    // Zwei genügen für die Frage „genau einer?".
    take: 2,
  });
  return aktive.length === 1 ? aktive[0] : null;
}
