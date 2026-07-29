/**
 * Kostenstellen-Hierarchie für Reports (Finding F24).
 *
 * JournalEntryLine.costCenter ist ein freier String (der CostCenter.code).
 * Reports matchten diesen Code bisher EXAKT gegen die Budget-/Report-Zeile.
 * CostCenter hat aber eine Eltern-Kind-Beziehung (parentId/children), und in
 * der Praxis wird auf der Elternkostenstelle GEPLANT und auf den Kindern
 * GEBUCHT. Ohne Aufrollung sah eine Budgetzeile auf dem Elternteil nie einen
 * einzigen Ist-Wert — die Abweichung stand konstant bei −100 %.
 *
 * Diese Datei liefert die Zuordnung "Kostenstellen-Code → sich selbst + alle
 * Vorfahren", damit ein Report jede Buchung einmal auf jeder Ebene der Kette
 * zählen kann.
 */

import { prisma } from "@/lib/prisma";

/**
 * Baut die Map code → [eigener Code, Eltern-Code, Großeltern-Code, …].
 *
 * Der eigene Code steht immer an Position 0. Zyklen (durch Datenfehler
 * möglich, da parentId nicht DB-seitig azyklisch erzwungen wird) werden über
 * ein visited-Set abgefangen und brechen die Kette ab, statt endlos zu laufen.
 *
 * Kostenstellen-Codes, die in keiner CostCenter-Zeile vorkommen (Freitext auf
 * alten Buchungen), tauchen nicht in der Map auf — der Caller fällt dann auf
 * `[code]` zurück.
 */
export async function buildCostCenterAncestorMap(
  tenantId: string,
): Promise<Map<string, string[]>> {
  const centers = await prisma.costCenter.findMany({
    where: { tenantId },
    select: { id: true, code: true, parentId: true },
  });

  const byId = new Map(centers.map((c) => [c.id, c]));
  const result = new Map<string, string[]>();

  for (const center of centers) {
    const chain: string[] = [center.code];
    const visited = new Set<string>([center.id]);

    let parentId = center.parentId;
    while (parentId) {
      if (visited.has(parentId)) break; // Zyklus — Kette abbrechen
      visited.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) break;
      // Doppelte Codes (theoretisch durch @@unique ausgeschlossen) nicht
      // zweimal aufnehmen, sonst zählt der Ist-Wert doppelt.
      if (!chain.includes(parent.code)) chain.push(parent.code);
      parentId = parent.parentId;
    }

    result.set(center.code, chain);
  }

  return result;
}
