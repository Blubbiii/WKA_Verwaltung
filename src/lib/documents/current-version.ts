/**
 * Welche Fassung eines Dokuments ist die aktuelle?
 *
 * ## Der Fehler, den das behebt
 *
 * Eine neue Fassung wird als **eigene Zeile** angelegt, die über `parentId`
 * auf das Ursprungsdokument zeigt und eine höhere `version` trägt. Das
 * Ursprungsdokument behält seine eigene `fileUrl` — die der **ersten**
 * Fassung.
 *
 * Genau das wurde übersehen:
 *
 *  - Die Liste zeigt nur Dokumente mit `parentId: null`, kommentiert mit
 *    „Only show latest versions". Das sind aber die Wurzeln, also die
 *    **ältesten** Fassungen.
 *  - Herunterladen und Vorschau riefen `/api/documents/{wurzel}/download`
 *    auf und bekamen damit immer die Datei der ersten Fassung.
 *  - Die Versionshistorie markierte die Wurzel als `isCurrent: true` — die
 *    Liste ist absteigend sortiert, also trug die unterste, älteste Zeile
 *    das Kennzeichen „Aktuell".
 *
 * Wer eine berichtigte Fassung eines Vertrags hochlud, sah sie in der
 * Historie stehen, bekam beim Herunterladen aber weiter die alte. Die neue
 * Datei lag im Speicher, zählte gegen das Kontingent — und war über die
 * Oberfläche nicht zu bekommen.
 *
 * ## Warum an dieser Stelle und nicht in den Daten
 *
 * Man könnte stattdessen beim Hochladen die Wurzel überschreiben und die
 * alte Fassung als Kind wegschreiben. Das führte aber dazu, dass die
 * Kennung eines Dokuments je nach Zeitpunkt auf verschiedene Dateien zeigt —
 * schlecht für ein Archiv, in dem Verweise dauerhaft gelten sollen, und
 * schlecht mit § 147 AO im Rücken.
 *
 * Deshalb bleiben die Daten, wie sie sind, und die aktuelle Fassung wird
 * beim Lesen bestimmt. An **einer** Stelle: die Regel gab es hier schon in
 * drei Ausprägungen, und alle drei waren verschieden.
 */

import { prisma } from "@/lib/prisma";

/** Das Nötigste, um eine Fassung auszuliefern. */
export interface Fassung {
  id: string;
  version: number;
  fileUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileSizeBytes: bigint | null;
}

/**
 * Die Kennung der Kette, zu der ein Dokument gehört.
 *
 * Eine Fassung zeigt über `parentId` auf die Wurzel; die Wurzel selbst hat
 * keinen Vater. Beide Fälle müssen bei derselben Kette landen — sonst hängt
 * das Ergebnis davon ab, welche Fassung gerade aufgerufen wurde.
 */
export function kettenWurzel(dokument: {
  id: string;
  parentId: string | null;
}): string {
  return dokument.parentId ?? dokument.id;
}

/**
 * Die aktuelle Fassung einer Kette — die mit der höchsten Versionsnummer.
 *
 * Gibt es keine spätere Fassung, ist es die Wurzel selbst.
 *
 * @param wurzelId Kennung der Wurzel (siehe `kettenWurzel`).
 * @param tenantId Immer mitgeben. Ohne Mandantenfilter liesse sich über eine
 *                 fremde Kennung die Datei eines anderen Mandanten auflösen.
 */
export async function aktuelleFassung(
  wurzelId: string,
  tenantId: string,
): Promise<Fassung | null> {
  const kette = await prisma.document.findMany({
    where: {
      tenantId,
      OR: [{ id: wurzelId }, { parentId: wurzelId }],
    },
    select: {
      id: true,
      version: true,
      fileUrl: true,
      fileName: true,
      mimeType: true,
      fileSizeBytes: true,
    },
    orderBy: { version: "desc" },
    take: 1,
  });

  return kette[0] ?? null;
}

/**
 * Markiert in einer Liste von Fassungen die aktuelle.
 *
 * Bewusst über die höchste Versionsnummer und nicht über „die zuletzt
 * angelegte": die Versionsnummer ist die Ordnung, die der Nutzer sieht, und
 * nur sie ist auch nach einem Import oder einer Korrektur noch stimmig.
 */
export function markiereAktuelle<T extends { version: number }>(
  fassungen: T[],
): (T & { isCurrent: boolean })[] {
  const hoechste = fassungen.reduce(
    (max, f) => (f.version > max ? f.version : max),
    Number.NEGATIVE_INFINITY,
  );
  return fassungen.map((f) => ({ ...f, isCurrent: f.version === hoechste }));
}
