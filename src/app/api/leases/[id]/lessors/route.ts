/**
 * GET /api/leases/[id]/lessors — Miteigentumsanteile eines Pachtvertrags
 * PUT /api/leases/[id]/lessors — Anteile setzen
 *
 * A5 (Audit 2026-07): `Lease.lessorId` ist genau EINE Person. Nach 20 Jahren
 * Vertragslaufzeit ist die Erbengemeinschaft der Normalfall.
 *
 * ## Warum PUT und nicht POST je Anteil
 *
 * Die Anteile ergeben nur ZUSAMMEN Sinn: sie müssen zu jedem Stichtag 100 %
 * ergeben. Einzeln angelegt gäbe es zwangsläufig Zwischenstände, die die
 * Prüfung nicht bestehen — entweder man liesse sie zu (dann rechnet eine
 * Abrechnung dazwischen falsch) oder man wiese sie ab (dann liesse sich nichts
 * erfassen). Deshalb wird der ganze Satz auf einmal gesetzt und als Ganzes
 * geprüft.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import { validateShares, type LessorShare } from "@/lib/lease-lessors/share-split";
import { resolveSharesFrom } from "@/lib/lease-lessors/resolve-shares";

const shareSchema = z.object({
  personId: z.string().uuid(),
  sharePercent: z.number().positive().max(100),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  bankIban: z.string().max(34).nullable().optional(),
  bankBic: z.string().max(11).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

const putSchema = z.object({
  /** Der VOLLSTÄNDIGE Satz. Eine leere Liste löscht die Anteile und lässt den
   *  Vertrag auf `lessorId` zurückfallen. */
  shares: z.array(shareSchema).max(50),
});

const PERSON_SELECT = {
  select: {
    id: true,
    firstName: true,
    lastName: true,
    companyName: true,
    personType: true,
    iban: true,
  },
} as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_READ);
    if (!check.authorized) return check.error;

    const { id } = await params;

    const lease = await prisma.lease.findFirst({
      where: { id, tenantId: check.tenantId! },
      select: {
        id: true,
        lessorId: true,
        lessor: PERSON_SELECT,
        lessorShares: {
          select: {
            id: true,
            personId: true,
            sharePercent: true,
            validFrom: true,
            validTo: true,
            bankIban: true,
            bankBic: true,
            notes: true,
            person: PERSON_SELECT,
          },
          orderBy: [{ validFrom: "asc" }, { sharePercent: "desc" }],
        },
      },
    });

    if (!lease) {
      return apiError("NOT_FOUND", undefined, { message: "Pachtvertrag nicht gefunden" });
    }

    const resolved = resolveSharesFrom(lease);

    return NextResponse.json({
      shares: lease.lessorShares,
      // Woher die Anteile stammen, gehört in die Ansicht: bei
      // SINGLE_LESSOR_FALLBACK ist noch nichts erfasst und der Vertrag rechnet
      // unverändert weiter.
      source: resolved?.source ?? null,
      fallbackLessor: lease.lessor,
      problems: resolved ? validateShares(resolved.shares) : ["Kein Verpächter hinterlegt"],
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching lessor shares");
    return apiError("FETCH_FAILED", undefined, {
      message: "Fehler beim Laden der Verpächteranteile",
    });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_UPDATE);
    if (!check.authorized) return check.error;

    const { id } = await params;
    const data = putSchema.parse(await request.json());

    const lease = await prisma.lease.findFirst({
      where: { id, tenantId: check.tenantId! },
      select: { id: true, lessorId: true, _count: { select: { lessorShares: true } } },
    });

    if (!lease) {
      return apiError("NOT_FOUND", undefined, { message: "Pachtvertrag nicht gefunden" });
    }

    const shares: LessorShare[] = data.shares.map((share) => ({
      personId: share.personId,
      sharePercent: share.sharePercent,
      validFrom: share.validFrom ? new Date(`${share.validFrom}T00:00:00.000Z`) : null,
      validTo: share.validTo ? new Date(`${share.validTo}T00:00:00.000Z`) : null,
    }));

    // Leeren Satz zulassen: das ist der Weg zurück auf `lessorId`.
    if (shares.length > 0) {
      const problems = validateShares(shares);
      if (problems.length > 0) {
        // Hier abweisen, nicht erst bei der Abrechnung ein halbes Jahr später.
        return apiError("VALIDATION_FAILED", 400, {
          message: problems[0],
          details: { problems },
        });
      }

      const personIds = [...new Set(shares.map((s) => s.personId))];
      const found = await prisma.person.count({
        where: { id: { in: personIds }, tenantId: check.tenantId! },
      });
      if (found !== personIds.length) {
        return apiError("BAD_REQUEST", undefined, {
          message: "Mindestens eine der angegebenen Personen gehört nicht zu diesem Mandanten",
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      // Ersetzen statt abgleichen: der Satz wird als Ganzes geprüft und als
      // Ganzes gespeichert. Ein Teilabgleich könnte einen Zwischenstand
      // erzeugen, der die 100-%-Regel verletzt.
      await tx.leaseLessor.deleteMany({ where: { leaseId: id } });
      if (data.shares.length > 0) {
        await tx.leaseLessor.createMany({
          data: data.shares.map((share) => ({
            leaseId: id,
            personId: share.personId,
            sharePercent: share.sharePercent,
            validFrom: share.validFrom ? new Date(`${share.validFrom}T00:00:00.000Z`) : null,
            validTo: share.validTo ? new Date(`${share.validTo}T00:00:00.000Z`) : null,
            bankIban: share.bankIban || null,
            bankBic: share.bankBic || null,
            notes: share.notes || null,
          })),
        });
      }
    });

    await createAuditLog({
      action: "UPDATE",
      entityType: "Lease",
      entityId: id,
      oldValues: { lessorShareCount: lease._count.lessorShares },
      newValues: {
        lessorShareCount: data.shares.length,
        shares: data.shares.map((s) => ({
          personId: s.personId,
          sharePercent: s.sharePercent,
          validFrom: s.validFrom ?? null,
          validTo: s.validTo ?? null,
        })),
      },
      description:
        data.shares.length === 0
          ? "Verpächteranteile entfernt — der Vertrag rechnet wieder über lessorId"
          : `Verpächteranteile gesetzt (${data.shares.length})`,
    });

    return NextResponse.json({ saved: data.shares.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("VALIDATION_FAILED", 400, { details: { issues: error.issues } });
    }
    logger.error({ err: error }, "Error saving lessor shares");
    return apiError("UPDATE_FAILED", undefined, {
      message: "Fehler beim Speichern der Verpächteranteile",
    });
  }
}
