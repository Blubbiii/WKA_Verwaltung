import { prisma } from "@/lib/prisma";

/**
 * Referenz-Validierung für Kostenstellen.
 *
 * Hintergrund (Audit-Randfall 13): `updateMany({ where: { id, tenantId } })`
 * schützt nur die GEÄNDERTE Zeile — nicht die REFERENZIERTE. Ein `parentId`
 * (oder `parkId`/`turbineId`/`fundId`) eines fremden Mandanten erfüllt den
 * globalen Foreign-Key-Constraint und wird ohne zusätzliche Prüfung
 * gespeichert → mandantenübergreifende Verknüpfung.
 *
 * Ausserdem prüft `parentId` auf Selbstreferenz und Zyklen (A→B, dann B→A).
 */

/** Sicherheits-Bremse gegen bereits vorhandene pathologische Ketten. */
const MAX_HIERARCHY_DEPTH = 100;

export interface CostCenterReferenceInput {
  parkId?: string | null;
  turbineId?: string | null;
  fundId?: string | null;
  parentId?: string | null;
}

export interface ReferenceValidationError {
  code: "NOT_FOUND" | "SELF_REFERENCE" | "CYCLE";
  message: string;
}

/**
 * Prüft alle gesetzten Fremdschlüssel gegen den Mandanten.
 *
 * @param tenantId  Mandant des Requests
 * @param input     die zu speichernden Referenzen (undefined = unverändert,
 *                  null = Referenz wird entfernt → keine Prüfung nötig)
 * @param selfId    ID der Kostenstelle, die geändert wird (bei POST weglassen).
 *                  Nur mit selfId sind Selbstreferenz- und Zyklus-Prüfung möglich.
 */
export async function validateCostCenterReferences(
  tenantId: string,
  input: CostCenterReferenceInput,
  selfId?: string,
): Promise<ReferenceValidationError | null> {
  if (input.parkId) {
    const park = await prisma.park.findFirst({
      where: { id: input.parkId, tenantId },
      select: { id: true },
    });
    if (!park) {
      return { code: "NOT_FOUND", message: "Windpark nicht gefunden" };
    }
  }

  if (input.turbineId) {
    // Turbine hat kein eigenes tenantId — Scoping läuft über den Park.
    const turbine = await prisma.turbine.findFirst({
      where: { id: input.turbineId, park: { tenantId } },
      select: { id: true },
    });
    if (!turbine) {
      return { code: "NOT_FOUND", message: "Windenergieanlage nicht gefunden" };
    }
  }

  if (input.fundId) {
    const fund = await prisma.fund.findFirst({
      where: { id: input.fundId, tenantId },
      select: { id: true },
    });
    if (!fund) {
      return { code: "NOT_FOUND", message: "Gesellschaft nicht gefunden" };
    }
  }

  if (input.parentId) {
    if (selfId && input.parentId === selfId) {
      return {
        code: "SELF_REFERENCE",
        message: "Eine Kostenstelle kann nicht ihr eigenes übergeordnetes Element sein",
      };
    }

    const parent = await prisma.costCenter.findFirst({
      where: { id: input.parentId, tenantId },
      select: { id: true },
    });
    if (!parent) {
      return { code: "NOT_FOUND", message: "Übergeordnete Kostenstelle nicht gefunden" };
    }

    if (selfId && (await wouldCreateCycle(tenantId, selfId, input.parentId))) {
      return {
        code: "CYCLE",
        message:
          "Die Zuordnung würde einen Zyklus in der Kostenstellen-Hierarchie erzeugen",
      };
    }
  }

  return null;
}

/**
 * Läuft die Eltern-Kette ab `parentId` nach oben. Trifft sie auf `selfId`
 * (oder auf einen bereits besuchten Knoten), wäre die neue Kante ein Zyklus.
 */
async function wouldCreateCycle(
  tenantId: string,
  selfId: string,
  parentId: string,
): Promise<boolean> {
  const visited = new Set<string>([selfId]);
  let current: string | null = parentId;
  let depth = 0;

  while (current && depth < MAX_HIERARCHY_DEPTH) {
    if (visited.has(current)) return true;
    visited.add(current);

    const node: { parentId: string | null } | null = await prisma.costCenter.findFirst({
      where: { id: current, tenantId },
      select: { parentId: true },
    });
    if (!node) return false; // Kette endet ausserhalb des Mandanten

    current = node.parentId;
    depth++;
  }

  // Tiefenlimit erreicht → defensiv als Zyklus behandeln
  return current !== null;
}
