/**
 * References in the operational records of the management service
 * (tasks, defects, inspections, claims, checklists).
 *
 * A park may be the tenant's own or one of a client tenant it manages —
 * an active ParkStakeholder entry for that client opens all its parks, the
 * same rule as the park picker (management-billing/available-parks).
 * Assignees are the tenant's own users; everything else (checklist,
 * report, contract …) must belong to the tenant.
 *
 * mandantDb scopes the record, not the ids it points to — without this a
 * foreign id is stored and its name comes back in the response.
 */

import type { NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { mandantDb } from "@/lib/mandant/mandant-db";

export interface Verweise {
  parkId?: string | null;
  turbineId?: string | null;
  serviceEventId?: string | null;
  assignedToId?: string | null;
  checklistId?: string | null;
  inspectionReportId?: string | null;
  inspectionPlanId?: string | null;
  defectId?: string | null;
  contractId?: string | null;
  vendorId?: string | null;
}

const EIGENE = [
  "checklistId",
  "inspectionReportId",
  "inspectionPlanId",
  "defectId",
  "contractId",
  "vendorId",
] as const;
type EigenesFeld = (typeof EIGENE)[number];

/** Where a park stands: its tenant, and whether the checking tenant manages that client. */
interface Standort {
  mandant: string;
  betreut: boolean;
}

/** What was looked up for the given ids; `null` = not found. */
export interface Befund {
  park?: Standort | null;
  anlage?: (Standort & { parkId: string }) | null;
  einsatzAnlage?: (Standort & { parkId: string }) | null;
  bearbeiter?: { mandanten: string[] } | null;
  eigene: Partial<Record<EigenesFeld, boolean>>;
}

const erreichbar = (tenantId: string, s: Standort | null | undefined) =>
  !!s && (s.mandant === tenantId || s.betreut);

/** The first reference the tenant may not use, or null. */
export function verweisFehler(tenantId: string, v: Verweise, b: Befund): keyof Verweise | null {
  if (v.parkId && !erreichbar(tenantId, b.park)) return "parkId";
  if (v.turbineId) {
    if (!erreichbar(tenantId, b.anlage)) return "turbineId";
    if (v.parkId && b.anlage!.parkId !== v.parkId) return "turbineId";
  }
  if (v.serviceEventId && !erreichbar(tenantId, b.einsatzAnlage)) return "serviceEventId";
  if (v.assignedToId && !b.bearbeiter?.mandanten.includes(tenantId)) return "assignedToId";
  for (const feld of EIGENE) {
    if (v[feld] && !b.eigene[feld]) return feld;
  }
  return null;
}

const MELDUNG: Record<keyof Verweise, string> = {
  parkId: "Windpark nicht gefunden",
  turbineId: "Anlage nicht gefunden oder nicht in diesem Windpark",
  serviceEventId: "Serviceeinsatz nicht gefunden",
  assignedToId: "Bearbeiter nicht gefunden",
  checklistId: "Checkliste nicht gefunden",
  inspectionReportId: "Prüfbericht nicht gefunden",
  inspectionPlanId: "Prüfplan nicht gefunden",
  defectId: "Mangel nicht gefunden",
  contractId: "Vertrag nicht gefunden",
  vendorId: "Dienstleister nicht gefunden",
};

async function standort(tenantId: string, parkTenantId: string): Promise<Standort> {
  if (parkTenantId === tenantId) return { mandant: parkTenantId, betreut: false };
  const vertrag = await prisma.parkStakeholder.findFirst({
    where: { stakeholderTenantId: tenantId, parkTenantId, isActive: true },
    select: { id: true },
  });
  return { mandant: parkTenantId, betreut: !!vertrag };
}

async function anlageStandort(tenantId: string, turbineId: string) {
  const t = await prisma.turbine.findFirst({
    where: { id: turbineId },
    select: { parkId: true, park: { select: { tenantId: true } } },
  });
  return t ? { parkId: t.parkId, ...(await standort(tenantId, t.park.tenantId)) } : null;
}

async function ermittle(tenantId: string, v: Verweise): Promise<Befund> {
  const db = mandantDb(tenantId);
  const befund: Befund = { eigene: {} };

  if (v.parkId) {
    // findFirst, not findUnique: the soft-delete filter only applies there.
    const p = await prisma.park.findFirst({ where: { id: v.parkId }, select: { tenantId: true } });
    befund.park = p ? await standort(tenantId, p.tenantId) : null;
  }
  if (v.turbineId) befund.anlage = await anlageStandort(tenantId, v.turbineId);
  if (v.serviceEventId) {
    const e = await prisma.serviceEvent.findFirst({ where: { id: v.serviceEventId }, select: { turbineId: true } });
    befund.einsatzAnlage = e ? await anlageStandort(tenantId, e.turbineId) : null;
  }
  if (v.assignedToId) {
    const u = await prisma.user.findFirst({
      where: { id: v.assignedToId },
      select: { tenantId: true, userTenantMemberships: { where: { status: "ACTIVE" }, select: { tenantId: true } } },
    });
    befund.bearbeiter = u ? { mandanten: [u.tenantId, ...u.userTenantMemberships.map((m) => m.tenantId)] } : null;
  }

  const suche = { select: { id: true } } as const;
  const vorhanden: Record<EigenesFeld, (id: string) => Promise<unknown>> = {
    checklistId: (id) => db.operationalChecklist.findFirst({ where: { id }, ...suche }),
    inspectionReportId: (id) => db.inspectionReport.findFirst({ where: { id }, ...suche }),
    inspectionPlanId: (id) => db.inspectionPlan.findFirst({ where: { id }, ...suche }),
    defectId: (id) => db.defect.findFirst({ where: { id }, ...suche }),
    contractId: (id) => db.contract.findFirst({ where: { id }, ...suche }),
    vendorId: (id) => db.vendor.findFirst({ where: { id }, ...suche }),
  };
  for (const feld of EIGENE) {
    const id = v[feld];
    if (id) befund.eigene[feld] = !!(await vorhanden[feld](id));
  }
  return befund;
}

/**
 * Checks the references of a create/update body. Returns the 400 response
 * for the first one the tenant may not use, or null.
 */
export async function verweisePruefen(tenantId: string, v: Verweise): Promise<NextResponse | null> {
  const fehler = verweisFehler(tenantId, v, await ermittle(tenantId, v));
  if (!fehler) return null;
  return apiError("VALIDATION_FAILED", 400, { message: MELDUNG[fehler], details: { feld: fehler } });
}
