/**
 * GET  /api/faults — Störungsvorgänge auflisten
 * POST /api/faults — Störungsvorgang anlegen
 *
 * A1 (Audit 2026-07): Die Störungsdaten lagen vollständig vor, der Vorgang
 * fehlte. Damit fehlte auch die Wiedervorlage — laut Bericht verjähren
 * Ansprüche gegen den Hersteller unbemerkt.
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
import { nextCaseNumber, isCaseNumberConflict, CASE_NUMBER_RETRIES } from "@/lib/faults/case-number";

const CAUSE_CATEGORIES = [
  "MANUFACTURER",
  "GRID",
  "WEATHER",
  "OWN_FAULT",
  "AUTHORITY",
  "THIRD_PARTY",
  "UNKNOWN",
] as const;

const CASE_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;

/**
 * Wie viele Tage vor Ablauf ein Anspruch in der Faelligkeitsliste erscheint.
 * 30 Tage sind knapp genug, um nicht zu verwaessern, und weit genug, um vor
 * einer Verjaehrung noch handeln zu koennen.
 */
const CLAIM_WARNING_DAYS = 30;

const CLAIM_STATUSES = [
  "NONE",
  "PENDING",
  "ASSERTED",
  "ACCEPTED",
  "REJECTED",
  "SETTLED",
  "TIME_BARRED",
] as const;

const createSchema = z
  .object({
    turbineId: z.string().uuid(),
    title: z.string().min(1).max(200),
    description: z.string().optional(),
    startAt: z.string(),
    endAt: z.string().optional().nullable(),
    causeCategory: z.enum(CAUSE_CATEGORIES).default("UNKNOWN"),
    statusCodeId: z.string().uuid().optional().nullable(),
    claimDeadline: z.string().optional().nullable(),
    followUpAt: z.string().optional().nullable(),
    assignedToId: z.string().uuid().optional().nullable(),
    serviceEventId: z.string().uuid().optional().nullable(),
    operationalTaskId: z.string().uuid().optional().nullable(),
    defectId: z.string().uuid().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    // Ein Ende vor dem Beginn ergibt eine negative Störungsdauer und damit eine
    // sinnlose Bewertung. Lieber hier abweisen als später eine leere Zeitreihe
    // erklären zu müssen.
    if (data.endAt && new Date(data.endAt) < new Date(data.startAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "Ende liegt vor dem Beginn",
      });
    }
  });

// GET -----------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.FAULTS_READ);
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const causeCategory = searchParams.get("causeCategory");
    const claimStatus = searchParams.get("claimStatus");
    const turbineId = searchParams.get("turbineId");
    const parkId = searchParams.get("parkId");
    const search = (searchParams.get("search") || "").trim();
    /** Nur Vorgänge mit fälliger Wiedervorlage oder ablaufendem Anspruch. */
    const dueOnly = searchParams.get("dueOnly") === "true";

    const { page, limit, skip } = parsePaginationParams(searchParams, {
      defaultLimit: 50,
      maxLimit: 100,
    });

    const now = new Date();

    const where: Prisma.FaultCaseWhereInput = {
      tenantId: check.tenantId!,
      ...(status && CASE_STATUSES.includes(status as never)
        ? { status: status as (typeof CASE_STATUSES)[number] }
        : {}),
      ...(causeCategory && CAUSE_CATEGORIES.includes(causeCategory as never)
        ? { causeCategory: causeCategory as (typeof CAUSE_CATEGORIES)[number] }
        : {}),
      ...(claimStatus && CLAIM_STATUSES.includes(claimStatus as never)
        ? { claimStatus: claimStatus as (typeof CLAIM_STATUSES)[number] }
        : {}),
      ...(turbineId ? { turbineId } : {}),
      ...(parkId ? { turbine: { parkId } } : {}),
      // Suche und Faelligkeit brauchen BEIDE ein OR. Nebeneinander in
      // demselben Objekt wuerde das zweite das erste stillschweigend
      // ueberschreiben — die Suche waere dann wirkungslos, ohne dass es
      // auffaellt. Deshalb ueber AND kombiniert.
      AND: [
        ...(search
          ? [
              {
                OR: [
                  { caseNumber: { contains: search, mode: "insensitive" as const } },
                  { title: { contains: search, mode: "insensitive" as const } },
                  { turbine: { designation: { contains: search, mode: "insensitive" as const } } },
                ],
              },
            ]
          : []),
        // Die Arbeitsliste des Betriebsführers: was heute liegen bleibt, geht
        // morgen verloren. Erledigte Vorgänge gehören nicht hinein.
        ...(dueOnly
          ? [
              {
                status: { notIn: ["CLOSED", "RESOLVED"] as ("CLOSED" | "RESOLVED")[] },
                OR: [
                  { followUpAt: { lte: now } },
                  { claimDeadline: { lte: addDays(now, CLAIM_WARNING_DAYS) } },
                ],
              },
            ]
          : []),
      ],
    };

    const [cases, total] = await Promise.all([
      prisma.faultCase.findMany({
        where,
        include: {
          turbine: { select: { id: true, designation: true, park: { select: { id: true, name: true, shortName: true } } } },
          statusCode: { select: { id: true, description: true, mainCode: true, subCode: true } },
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
        },
        // Offene zuerst, darin die ältesten — die haben am längsten gewartet.
        orderBy: [{ status: "asc" }, { startAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.faultCase.count({ where }),
    ]);

    return NextResponse.json({
      data: cases,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error({ err: error }, "[FaultCase] Liste konnte nicht geladen werden");
    return apiError("FETCH_FAILED", 500, { message: "Störungsvorgänge konnten nicht geladen werden" });
  }
}

// POST ----------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.FAULTS_CREATE);
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

    // Turbine trägt keine tenantId — die Bindung läuft über den Park. Ohne
    // diese Prüfung liesse sich ein Vorgang an einer fremden Anlage anlegen.
    const turbine = await prisma.turbine.findFirst({
      where: { id: data.turbineId, park: { tenantId: check.tenantId! } },
      select: { id: true },
    });
    if (!turbine) {
      return apiError("NOT_FOUND", 404, { message: "Anlage nicht gefunden" });
    }

    const startAt = new Date(data.startAt);

    // Bei gleichzeitigem Anlegen kann die Nummer kollidieren. Der Unique-Index
    // fängt das ab; hier wird schlicht neu gezogen.
    for (let attempt = 0; attempt < CASE_NUMBER_RETRIES; attempt++) {
      try {
        const created = await prisma.$transaction(async (tx) => {
          const caseNumber = await nextCaseNumber(tx, check.tenantId!, startAt);
          return tx.faultCase.create({
            data: {
              tenantId: check.tenantId!,
              caseNumber,
              turbineId: data.turbineId,
              title: data.title,
              description: data.description,
              startAt,
              endAt: data.endAt ? new Date(data.endAt) : null,
              causeCategory: data.causeCategory,
              statusCodeId: data.statusCodeId ?? null,
              claimDeadline: data.claimDeadline ? new Date(data.claimDeadline) : null,
              followUpAt: data.followUpAt ? new Date(data.followUpAt) : null,
              assignedToId: data.assignedToId ?? null,
              serviceEventId: data.serviceEventId ?? null,
              operationalTaskId: data.operationalTaskId ?? null,
              defectId: data.defectId ?? null,
              createdById: check.userId ?? null,
            },
          });
        });

        await createAuditLog({
          action: "CREATE",
          entityType: "FaultCase",
          entityId: created.id,
          description: `Störungsvorgang ${created.caseNumber} angelegt`,
        });

        return NextResponse.json(created, { status: 201 });
      } catch (error) {
        if (isCaseNumberConflict(error) && attempt < CASE_NUMBER_RETRIES - 1) {
          logger.warn({ attempt }, "[FaultCase] Nummernkollision — neuer Versuch");
          continue;
        }
        throw error;
      }
    }

    return apiError("CREATE_FAILED", 500, { message: "Vorgangsnummer konnte nicht vergeben werden" });
  } catch (error) {
    logger.error({ err: error }, "[FaultCase] Anlegen fehlgeschlagen");
    return apiError("CREATE_FAILED", 500, { message: "Störungsvorgang konnte nicht angelegt werden" });
  }
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
