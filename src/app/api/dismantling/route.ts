/**
 * GET  /api/dismantling — Rückbauverpflichtungen mit Sicherheitsprüfung
 * POST /api/dismantling — Verpflichtung zu einem Park erfassen
 *
 * A7 (Audit 2026-07): „Kein einziger Treffer für ‚Rückbau' im gesamten
 * Codebase." Die Liste prüft die Bürgschaft gleich mit — sie läuft still ab,
 * weil niemand den Aktenordner liest.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import { checkSecurity } from "@/lib/dismantling/provision";

/** Vorlauf, ab dem ein Bürgschaftsablauf gemeldet wird. */
const SECURITY_WARN_DAYS = 180;

const createSchema = z
  .object({
    parkId: z.string().uuid(),
    estimatedCostTodayEur: z.number().positive(),
    costEstimateDate: z.string().nullable().optional(),
    costEstimateSource: z.string().max(200).optional(),
    dismantlingYear: z.number().int().min(2000).max(2200),
    costInflationPercent: z.number().min(0).max(20).default(2),
    requiredSecurityEur: z.number().nonnegative().nullable().optional(),
    providedSecurityEur: z.number().nonnegative().nullable().optional(),
    securityType: z
      .enum(["BANK_GUARANTEE", "PARENT_GUARANTEE", "CASH_DEPOSIT", "SURETY_BOND", "OTHER"])
      .nullable()
      .optional(),
    securityProvider: z.string().max(200).optional(),
    securityReference: z.string().max(100).optional(),
    securityValidFrom: z.string().nullable().optional(),
    securityValidTo: z.string().nullable().optional(),
    authorityReference: z.string().max(100).optional(),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.securityValidFrom &&
      data.securityValidTo &&
      new Date(data.securityValidTo) < new Date(data.securityValidFrom)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["securityValidTo"],
        message: "Das Ende der Bürgschaft liegt vor deren Beginn",
      });
    }
  });

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.DISMANTLING_READ);
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const parkId = searchParams.get("parkId");
    /** Nur Verpflichtungen mit einem Problem an der Sicherheit. */
    const issuesOnly = searchParams.get("issuesOnly") === "true";

    const obligations = await prisma.dismantlingObligation.findMany({
      where: {
        tenantId: check.tenantId!,
        ...(parkId ? { parkId } : {}),
      },
      include: {
        park: {
          select: { id: true, name: true, shortName: true, commissioningDate: true },
        },
        provisions: { orderBy: { year: "desc" }, take: 3 },
      },
      orderBy: { createdAt: "desc" },
    });

    const now = new Date();

    const withCheck = obligations.map((obligation) => ({
      ...obligation,
      securityCheck: checkSecurity({
        requiredSecurityEur: Number(obligation.requiredSecurityEur ?? 0),
        providedSecurityEur: Number(obligation.providedSecurityEur ?? 0),
        securityValidTo: obligation.securityValidTo,
        referenceDate: now,
        warnDays: SECURITY_WARN_DAYS,
      }),
    }));

    return NextResponse.json({
      data: issuesOnly ? withCheck.filter((o) => o.securityCheck.problems.length > 0) : withCheck,
    });
  } catch (error) {
    logger.error({ err: error }, "[Dismantling] Laden fehlgeschlagen");
    return apiError("FETCH_FAILED", 500, {
      message: "Rückbauverpflichtungen konnten nicht geladen werden",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.DISMANTLING_MANAGE);
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
      select: { id: true, name: true, commissioningDate: true },
    });
    if (!park) {
      return apiError("NOT_FOUND", 404, { message: "Park nicht gefunden" });
    }

    // Ohne Inbetriebnahmedatum gibt es keinen Beginn der Ansammlung. Das hier
    // zu melden ist besser, als später eine Rückstellung ohne Grundlage zu
    // erklären.
    if (!park.commissioningDate) {
      return apiError("VALIDATION_FAILED", 400, {
        message:
          "Der Park hat kein Inbetriebnahmedatum. Ohne es lässt sich die Ansammlung nicht berechnen.",
      });
    }

    if (data.dismantlingYear <= park.commissioningDate.getFullYear()) {
      return apiError("VALIDATION_FAILED", 400, {
        message: "Das Rückbaujahr liegt nicht nach der Inbetriebnahme",
      });
    }

    const existing = await prisma.dismantlingObligation.findUnique({
      where: { parkId: data.parkId },
      select: { id: true },
    });
    if (existing) {
      return apiError("ALREADY_EXISTS", 409, {
        message: "Für diesen Park gibt es bereits eine Rückbauverpflichtung",
        details: { obligationId: existing.id },
      });
    }

    const created = await prisma.dismantlingObligation.create({
      data: {
        tenantId: check.tenantId!,
        parkId: data.parkId,
        estimatedCostTodayEur: data.estimatedCostTodayEur,
        costEstimateDate: data.costEstimateDate ? new Date(data.costEstimateDate) : null,
        costEstimateSource: data.costEstimateSource,
        dismantlingYear: data.dismantlingYear,
        costInflationPercent: data.costInflationPercent,
        requiredSecurityEur: data.requiredSecurityEur ?? null,
        providedSecurityEur: data.providedSecurityEur ?? null,
        securityType: data.securityType ?? null,
        securityProvider: data.securityProvider,
        securityReference: data.securityReference,
        securityValidFrom: data.securityValidFrom ? new Date(data.securityValidFrom) : null,
        securityValidTo: data.securityValidTo ? new Date(data.securityValidTo) : null,
        authorityReference: data.authorityReference,
        notes: data.notes,
      },
    });

    await createAuditLog({
      action: "CREATE",
      entityType: "Park",
      entityId: data.parkId,
      description: `Rückbauverpflichtung für "${park.name}" erfasst`,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "[Dismantling] Anlegen fehlgeschlagen");
    return apiError("CREATE_FAILED", 500, {
      message: "Rückbauverpflichtung konnte nicht angelegt werden",
    });
  }
}
