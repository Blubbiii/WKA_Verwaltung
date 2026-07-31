/**
 * GET  /api/components — Grosskomponenten, mit Alter und Gewährleistung
 * POST /api/components — Komponente erfassen
 *
 * B3 (Audit 2026-07): „0 Treffer für Ersatzteil/Komponente." Getriebe,
 * Generator, Rotorblätter und Trafo standen als Freitext im `ServiceEvent`
 * oder im `technicalData`-Json.
 *
 * ## Warum die Liste die Positionsprüfung mitliefert
 *
 * Zwei eingebaute Getriebe an derselben Anlage sind ein Datenfehler — meist
 * ein Tausch, bei dem der Ausbau des alten Teils vergessen wurde. Das fällt
 * sonst erst auf, wenn die Tauschhistorie zwei Getriebe gleichzeitig zeigt.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import { computeLifetime, checkPositions } from "@/lib/components/lifetime";

const COMPONENT_TYPES = [
  "GEARBOX",
  "GENERATOR",
  "ROTOR_BLADE",
  "MAIN_BEARING",
  "TRANSFORMER",
  "CONVERTER",
  "YAW_SYSTEM",
  "PITCH_SYSTEM",
  "TOWER_SECTION",
  "OTHER",
] as const;

const createSchema = z.object({
  turbineId: z.string().uuid(),
  type: z.enum(COMPONENT_TYPES),
  position: z.string().trim().max(20).nullable().optional(),
  manufacturer: z.string().trim().max(200).nullable().optional(),
  model: z.string().trim().max(200).nullable().optional(),
  serialNumber: z.string().trim().max(100).nullable().optional(),
  installedAt: z.string().nullable().optional(),
  designLifeYears: z.number().int().min(1).max(100).nullable().optional(),
  operatingHoursAtInstall: z.number().int().min(0).nullable().optional(),
  warrantyEndDate: z.string().nullable().optional(),
  warrantyProvider: z.string().trim().max(200).nullable().optional(),
  costEur: z.number().nonnegative().nullable().optional(),
  vendorId: z.string().uuid().nullable().optional(),
  serviceEventId: z.string().uuid().nullable().optional(),
  faultCaseId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const COMPONENT_INCLUDE = {
  turbine: {
    select: {
      id: true,
      designation: true,
      park: { select: { id: true, name: true, shortName: true } },
    },
  },
  vendor: { select: { id: true, name: true } },
  replacedBy: { select: { id: true, installedAt: true, serialNumber: true } },
  replaces: { select: { id: true, removedAt: true, serialNumber: true } },
} as const;

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.TURBINES_READ);
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const turbineId = searchParams.get("turbineId");
    const parkId = searchParams.get("parkId");
    const type = searchParams.get("type");
    /** Historie einschliessen. Standardmässig nur, was eingebaut ist. */
    const includeRemoved = searchParams.get("includeRemoved") === "true";
    /** Nur Komponenten mit ablaufender oder abgelaufener Gewährleistung. */
    const warrantyOnly = searchParams.get("warrantyOnly") === "true";

    const where: Prisma.MajorComponentWhereInput = {
      tenantId: check.tenantId!,
      ...(turbineId ? { turbineId } : {}),
      ...(parkId ? { turbine: { parkId } } : {}),
      ...(type && COMPONENT_TYPES.includes(type as never)
        ? { type: type as (typeof COMPONENT_TYPES)[number] }
        : {}),
      ...(includeRemoved ? {} : { removedAt: null }),
    };

    const components = await prisma.majorComponent.findMany({
      where,
      include: COMPONENT_INCLUDE,
      orderBy: [{ turbineId: "asc" }, { type: "asc" }, { position: "asc" }, { installedAt: "desc" }],
    });

    const now = new Date();
    const withLifetime = components.map((component) => ({
      ...component,
      lifetime: computeLifetime(
        {
          installedAt: component.installedAt,
          removedAt: component.removedAt,
          designLifeYears: component.designLifeYears,
          warrantyEndDate: component.warrantyEndDate,
        },
        now,
      ),
    }));

    // Positionsprüfung je Anlage — sie ergibt nur über den vollständigen
    // Bestand einer Anlage Sinn, nicht über eine gefilterte Teilmenge.
    const byTurbine = new Map<string, typeof components>();
    for (const component of components) {
      const list = byTurbine.get(component.turbineId) ?? [];
      list.push(component);
      byTurbine.set(component.turbineId, list);
    }

    const positionProblems: { turbineId: string; designation: string; problems: string[] }[] = [];
    for (const [id, list] of byTurbine) {
      const problems = checkPositions(list);
      if (problems.length > 0) {
        positionProblems.push({
          turbineId: id,
          designation: list[0].turbine.designation,
          problems,
        });
      }
    }

    const filtered = warrantyOnly
      ? withLifetime.filter(
          (component) =>
            component.lifetime.warranty === "EXPIRED" ||
            (component.lifetime.warrantyDaysLeft !== null &&
              component.lifetime.warrantyDaysLeft <= 180),
        )
      : withLifetime;

    return NextResponse.json({ data: filtered, positionProblems });
  } catch (error) {
    logger.error({ err: error }, "[Components] Liste konnte nicht geladen werden");
    return apiError("FETCH_FAILED", 500, {
      message: "Grosskomponenten konnten nicht geladen werden",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.TURBINES_UPDATE);
    if (!check.authorized) return check.error;

    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe",
        details: { issues: parsed.error.issues },
      });
    }
    const data = parsed.data;

    const turbine = await prisma.turbine.findFirst({
      where: { id: data.turbineId, park: { tenantId: check.tenantId! } },
      select: {
        id: true,
        designation: true,
        commissioningDate: true,
        majorComponents: {
          select: { id: true, type: true, position: true, removedAt: true, serialNumber: true },
        },
      },
    });
    if (!turbine) {
      return apiError("NOT_FOUND", 404, { message: "Anlage nicht gefunden" });
    }

    const installedAt = toDate(data.installedAt);

    // Einbau vor Inbetriebnahme der Anlage ist möglich (Erstausrüstung wird
    // vorher montiert) — aber nicht Jahre davor. Das ist fast immer ein
    // Zahlendreher im Jahr.
    if (installedAt && turbine.commissioningDate) {
      const yearsBefore =
        (turbine.commissioningDate.getTime() - installedAt.getTime()) / (365.25 * 24 * 3600 * 1000);
      if (yearsBefore > 2) {
        return apiError("VALIDATION_FAILED", 400, {
          message: `Das Einbaudatum liegt mehr als zwei Jahre vor der Inbetriebnahme der Anlage (${turbine.commissioningDate.toISOString().slice(0, 10)}). Bitte prüfen.`,
        });
      }
    }

    // Eine belegte Position ablehnen statt eine zweite eingebaute Komponente
    // anzulegen. Der Weg für einen Tausch ist /api/components/[id]/replace —
    // er schliesst die alte in derselben Transaktion.
    const occupying = turbine.majorComponents.find(
      (component) =>
        component.removedAt === null &&
        component.type === data.type &&
        (component.position ?? "") === (data.position ?? ""),
    );
    if (occupying) {
      return apiError("BAD_REQUEST", undefined, {
        message: data.position
          ? `Auf Position ${data.position} ist bereits eine Komponente dieses Typs eingebaut. Für einen Tausch die vorhandene ersetzen, damit die Tauschhistorie zusammenhängt.`
          : "An dieser Anlage ist bereits eine Komponente dieses Typs eingebaut. Für einen Tausch die vorhandene ersetzen, damit die Tauschhistorie zusammenhängt.",
      });
    }

    const created = await prisma.majorComponent.create({
      data: {
        tenantId: check.tenantId!,
        turbineId: data.turbineId,
        type: data.type,
        position: data.position || null,
        manufacturer: data.manufacturer || null,
        model: data.model || null,
        serialNumber: data.serialNumber || null,
        installedAt,
        designLifeYears: data.designLifeYears ?? null,
        operatingHoursAtInstall: data.operatingHoursAtInstall ?? null,
        warrantyEndDate: toDate(data.warrantyEndDate),
        warrantyProvider: data.warrantyProvider || null,
        costEur: data.costEur ?? null,
        vendorId: data.vendorId || null,
        serviceEventId: data.serviceEventId || null,
        faultCaseId: data.faultCaseId || null,
        notes: data.notes || null,
      },
      include: COMPONENT_INCLUDE,
    });

    await createAuditLog({
      action: "CREATE",
      entityType: "Turbine",
      entityId: data.turbineId,
      newValues: {
        componentId: created.id,
        type: data.type,
        position: data.position ?? null,
        serialNumber: data.serialNumber ?? null,
      },
      description: `Grosskomponente ${data.type} an ${turbine.designation} erfasst`,
    });

    return NextResponse.json({ component: created }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "[Components] Anlegen fehlgeschlagen");
    return apiError("CREATE_FAILED", 500, {
      message: "Grosskomponente konnte nicht angelegt werden",
    });
  }
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
