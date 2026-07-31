/**
 * GET  /api/curtailment — Abregelungsereignisse auflisten
 * POST /api/curtailment — Ereignis erfassen
 *
 * A4 (Audit 2026-07): Es fehlte die Anspruchsseite. Diese Liste ist die
 * Arbeitsliste dafür — ihr wichtigster Teil ist die Spalte „offen": Forderung
 * abzüglich gezahlter Entschädigung.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { parsePaginationParams } from "@/lib/api-utils";
import { createAuditLog } from "@/lib/audit";

const CLAIM_STATUSES = [
  "OPEN",
  "SUBMITTED",
  "ACKNOWLEDGED",
  "PARTIALLY_PAID",
  "PAID",
  "REJECTED",
  "TIME_BARRED",
] as const;

const createSchema = z
  .object({
    parkId: z.string().uuid(),
    turbineId: z.string().uuid().nullable().optional(),
    startAt: z.string(),
    endAt: z.string().nullable().optional(),
    legalBasis: z.enum(["EEG_15", "ENWG_13A", "OTHER"]).default("ENWG_13A"),
    gridOperator: z.string().max(200).optional(),
    gridOperatorReference: z.string().max(100).optional(),
    reason: z.string().max(200).optional(),
    description: z.string().optional(),
    claimDeadline: z.string().nullable().optional(),
    followUpAt: z.string().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.endAt && new Date(data.endAt) < new Date(data.startAt)) {
      ctx.addIssue({ code: "custom", path: ["endAt"], message: "Ende liegt vor dem Beginn" });
    }
  });

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.CURTAILMENT_READ);
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const parkId = searchParams.get("parkId");
    const claimStatus = searchParams.get("claimStatus");
    const legalBasis = searchParams.get("legalBasis");
    const year = searchParams.get("year");
    /** Nur Ereignisse mit offener Forderung. */
    const openOnly = searchParams.get("openOnly") === "true";

    const { page, limit, skip } = parsePaginationParams(searchParams, {
      defaultLimit: 50,
      maxLimit: 100,
    });

    const where: Prisma.CurtailmentEventWhereInput = {
      tenantId: check.tenantId!,
      ...(parkId ? { parkId } : {}),
      ...(claimStatus && CLAIM_STATUSES.includes(claimStatus as never)
        ? { claimStatus: claimStatus as (typeof CLAIM_STATUSES)[number] }
        : {}),
      ...(legalBasis ? { legalBasis: legalBasis as "EEG_15" | "ENWG_13A" | "OTHER" } : {}),
      ...(year
        ? {
            startAt: {
              gte: new Date(Date.UTC(Number(year), 0, 1)),
              lt: new Date(Date.UTC(Number(year) + 1, 0, 1)),
            },
          }
        : {}),
      // Offen heisst: geltend gemacht oder noch nicht, aber jedenfalls nicht
      // abgeschlossen. Abgelehnte und verjaehrte gehoeren nicht in die
      // Arbeitsliste — sie sind erledigt, wenn auch unerfreulich.
      ...(openOnly ? { claimStatus: { in: ["OPEN", "SUBMITTED", "ACKNOWLEDGED", "PARTIALLY_PAID"] } } : {}),
    };

    const [events, total, sums] = await Promise.all([
      prisma.curtailmentEvent.findMany({
        where,
        include: {
          park: { select: { id: true, name: true, shortName: true } },
          turbine: { select: { id: true, designation: true } },
        },
        orderBy: { startAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.curtailmentEvent.count({ where }),
      // Die Summen ueber ALLE Treffer, nicht nur die sichtbare Seite — sonst
      // sagt "offen: 4.200 EUR" etwas ueber Seite 1 aus und nicht ueber den
      // Bestand.
      prisma.curtailmentEvent.aggregate({
        where,
        _sum: { claimEur: true, compensationPaidEur: true, lostWorkKwh: true },
      }),
    ]);

    const claimed = Number(sums._sum.claimEur ?? 0);
    const paid = Number(sums._sum.compensationPaidEur ?? 0);

    return NextResponse.json({
      data: events,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      totals: {
        claimedEur: Math.round(claimed * 100) / 100,
        paidEur: Math.round(paid * 100) / 100,
        openEur: Math.round((claimed - paid) * 100) / 100,
        lostWorkKwh: Number(sums._sum.lostWorkKwh ?? 0),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[Curtailment] Liste konnte nicht geladen werden");
    return apiError("FETCH_FAILED", 500, { message: "Abregelungen konnten nicht geladen werden" });
  }
}

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.CURTAILMENT_MANAGE);
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        message: "Ungültige Eingabe",
        details: parsed.error.issues,
      });
    }
    const data = parsed.data;

    const park = await prisma.park.findFirst({
      where: { id: data.parkId, tenantId: check.tenantId! },
      select: { id: true },
    });
    if (!park) {
      return apiError("NOT_FOUND", 404, { message: "Park nicht gefunden" });
    }

    if (data.turbineId) {
      const turbine = await prisma.turbine.findFirst({
        where: { id: data.turbineId, parkId: data.parkId },
        select: { id: true },
      });
      if (!turbine) {
        return apiError("VALIDATION_FAILED", 400, {
          message: "Die Anlage gehört nicht zum angegebenen Park",
        });
      }
    }

    const startAt = new Date(data.startAt);

    // Nummernkollision am Unique-Index abfangen und neu ziehen — dieselbe
    // Ueberlegung wie beim Stoerungsvorgang: eine Luecke in den
    // Ereignisnummern hat keine rechtliche Folge.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const created = await prisma.$transaction(async (tx) => {
          const eventNumber = await nextEventNumber(tx, check.tenantId!, startAt);
          return tx.curtailmentEvent.create({
            data: {
              tenantId: check.tenantId!,
              eventNumber,
              parkId: data.parkId,
              turbineId: data.turbineId ?? null,
              startAt,
              endAt: data.endAt ? new Date(data.endAt) : null,
              legalBasis: data.legalBasis,
              gridOperator: data.gridOperator,
              gridOperatorReference: data.gridOperatorReference,
              reason: data.reason,
              description: data.description,
              claimDeadline: data.claimDeadline ? new Date(data.claimDeadline) : null,
              followUpAt: data.followUpAt ? new Date(data.followUpAt) : null,
              createdById: check.userId ?? null,
            },
          });
        });

        await createAuditLog({
          action: "CREATE",
          entityType: "Park",
          entityId: data.parkId,
          description: `Abregelungsereignis ${created.eventNumber} erfasst`,
        });

        return NextResponse.json(created, { status: 201 });
      } catch (error) {
        const isConflict =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error as { code?: string }).code === "P2002";
        if (isConflict && attempt < 2) continue;
        throw error;
      }
    }

    return apiError("CREATE_FAILED", 500, { message: "Ereignisnummer konnte nicht vergeben werden" });
  } catch (error) {
    logger.error({ err: error }, "[Curtailment] Anlegen fehlgeschlagen");
    return apiError("CREATE_FAILED", 500, { message: "Ereignis konnte nicht angelegt werden" });
  }
}

type TxClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/** "RD-2026-0012" — fortlaufend je Mandant und Jahr. */
async function nextEventNumber(tx: TxClient, tenantId: string, reference: Date): Promise<string> {
  const prefix = `RD-${reference.getFullYear()}-`;
  const latest = await tx.curtailmentEvent.findFirst({
    where: { tenantId, eventNumber: { startsWith: prefix } },
    orderBy: { eventNumber: "desc" },
    select: { eventNumber: true },
  });
  const last = latest ? Number.parseInt(latest.eventNumber.slice(prefix.length), 10) : 0;
  const next = Number.isFinite(last) ? last + 1 : 1;
  // Feste Stellenzahl, sonst sortiert "RD-2026-9" nach "RD-2026-10".
  return `${prefix}${String(next).padStart(4, "0")}`;
}
