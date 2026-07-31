import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { handleApiError } from "@/lib/api-utils";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";
import { splitDistribution } from "@/lib/shareholding/distribution-split";
import {
  resolveShareholderSharesFrom,
  SHAREHOLDER_SHARES_SELECT,
} from "@/lib/shareholding/resolve-shares";

const createDistributionSchema = z
  .object({
    totalAmount: z.number().positive("Betrag muss positiv sein"),
    distributionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /**
     * A8: Zeitraum, für den ausgeschüttet wird — in der Regel das
     * Geschäftsjahr des Gewinnverwendungsbeschlusses. Optional, weil
     * bestehende Aufrufer ihn nicht kennen; ohne ihn wird nach dem Stand der
     * Gesellschafterliste am Ausschüttungstag verteilt. Geraten wird er NICHT.
     */
    periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    description: z.string().optional(),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (Boolean(data.periodStart) !== Boolean(data.periodEnd)) {
      ctx.addIssue({
        code: "custom",
        path: ["periodEnd"],
        message: "Beginn und Ende des Zeitraums müssen zusammen angegeben werden",
      });
    }
    if (data.periodStart && data.periodEnd && data.periodEnd < data.periodStart) {
      ctx.addIssue({
        code: "custom",
        path: ["periodEnd"],
        message: "Das Ende des Zeitraums liegt vor dessen Beginn",
      });
    }
  });

// GET /api/funds/[id]/distributions - Liste aller Ausschuettungen
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("funds:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Prüfen ob Gesellschaft existiert und zum Mandanten gehoert
    const fund = await prisma.fund.findFirst({
      where: { id, tenantId: check.tenantId! },
      select: { id: true },
    });

    if (!fund) {
      return apiError("NOT_FOUND", undefined, { message: "Gesellschaft nicht gefunden" });
    }

    const distributions = await prisma.distribution.findMany({
      where: { fundId: id },
      include: {
        items: {
          include: {
            shareholder: {
              include: {
                person: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    companyName: true,
                    personType: true,
                  },
                },
              },
            },
            invoice: {
              select: {
                id: true,
                invoiceNumber: true,
                status: true,
              },
            },
          },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        _count: {
          select: { items: true },
        },
      },
      orderBy: { distributionDate: "desc" },
    });

    return NextResponse.json(distributions);
  } catch (error) {
    logger.error({ err: error }, "Error fetching distributions");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Ausschuettungen" });
  }
}

// POST /api/funds/[id]/distributions - Neue Ausschuettung erstellen (Entwurf)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:create");
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();
    const data = createDistributionSchema.parse(body);

    // Gesellschaft mit ALLEN Gesellschaftern laden.
    //
    // A8 (Finding 4.1): Der frühere Filter `status: "ACTIVE"` war der Kern des
    // Fehlers. Wer im Zeitraum ausgetreten ist, steht auf INACTIVE und hat
    // trotzdem Anspruch auf seinen Zeitanteil — sein Anteil wurde stattdessen
    // auf die übrigen hochnormalisiert und damit verschenkt.
    const fund = await prisma.fund.findFirst({
      where: { id, tenantId: check.tenantId! },
      include: {
        shareholders: {
          include: {
            person: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                companyName: true,
                personType: true,
              },
            },
            shareHistory: SHAREHOLDER_SHARES_SELECT,
          },
        },
      },
    });

    if (!fund) {
      return apiError("NOT_FOUND", undefined, { message: "Gesellschaft nicht gefunden" });
    }

    if (fund.shareholders.length === 0) {
      return apiError("BAD_REQUEST", undefined, { message: "Keine Gesellschafter vorhanden" });
    }

    const distributionDate = new Date(`${data.distributionDate}T00:00:00.000Z`);

    // Ohne Zeitraum gibt es keinen Zeitanteil. Dann gilt der Stand der
    // Gesellschafterliste am Ausschüttungstag — und auch der wird NICHT
    // hochnormalisiert.
    const proRata = Boolean(data.periodStart && data.periodEnd);
    const periodStart = data.periodStart
      ? new Date(`${data.periodStart}T00:00:00.000Z`)
      : distributionDate;
    const periodEnd = data.periodEnd
      ? new Date(`${data.periodEnd}T00:00:00.000Z`)
      : distributionDate;

    const resolved = resolveShareholderSharesFrom(fund.shareholders);
    const split = splitDistribution({
      shares: resolved.shares,
      periodStart,
      periodEnd,
      totalAmountEur: data.totalAmount,
    });

    if (split.allocations === null) {
      return apiError("BAD_REQUEST", undefined, { message: split.reason });
    }

    const warnings = [...resolved.warnings, ...split.warnings];
    if (!proRata) {
      warnings.push(
        "Kein Ausschüttungszeitraum angegeben — verteilt wurde nach dem Stand der Gesellschafterliste am Ausschüttungstag. Für eine zeitanteilige Verteilung bitte den Zeitraum (Geschäftsjahr) angeben.",
      );
    }

    // Nennquote je Gesellschafter, also die Quote OHNE Zeitanteil. Nur wenn
    // sie im Zeitraum unverändert war — bei einem Anteilsübergang mitten im
    // Jahr gibt es keine einzelne Nennquote, und eine davon herauszugreifen
    // wäre eine Behauptung. Dann tragen `days` und die wirksame Quote die
    // Herleitung.
    const nominalByShareholder = new Map<string, number | null>();
    for (const share of resolved.shares) {
      const known = nominalByShareholder.get(share.shareholderId);
      if (known === undefined) {
        nominalByShareholder.set(share.shareholderId, share.sharePercent);
      } else if (known !== share.sharePercent) {
        nominalByShareholder.set(share.shareholderId, null);
      }
    }

    // Eindeutige Ausschuettungsnummer generieren
    const year = new Date(data.distributionDate).getFullYear();
    const existingCount = await prisma.distribution.count({
      where: {
        tenantId: check.tenantId!,
        distributionNumber: { startsWith: `AS-${year}-` },
      },
    });
    const distributionNumber = `AS-${year}-${String(existingCount + 1).padStart(3, "0")}`;

    // Distribution mit Items erstellen (in Transaction)
    const distribution = await prisma.$transaction(async (tx) => {
      // Distribution erstellen
      const dist = await tx.distribution.create({
        data: {
          distributionNumber,
          description: data.description,
          totalAmount: data.totalAmount,
          distributionDate,
          periodStart: proRata ? periodStart : null,
          periodEnd: proRata ? periodEnd : null,
          basis: proRata ? "PRO_RATA_TEMPORIS" : "REGISTER_AT_DATE",
          undistributedAmount: split.undistributedEur,
          computationNotes:
            warnings.length > 0
              ? { source: resolved.source, segments: split.segmentCount, warnings }
              : Prisma.DbNull,
          notes: data.notes,
          status: "DRAFT",
          fundId: id,
          tenantId: check.tenantId!,
          createdById: check.userId,
        },
      });

      // Ein Item je Gesellschafter, der im Zeitraum beteiligt WAR — nicht je
      // heute aktivem. Der Rundungsausgleich steckt bereits in
      // `splitDistribution` und greift dort nur in den verteilten Betrag.
      await tx.distributionItem.createMany({
        data: split.allocations.map((allocation) => ({
          distributionId: dist.id,
          shareholderId: allocation.shareholderId,
          percentage: allocation.effectiveSharePercent,
          amount: allocation.amountEur,
          days: proRata ? allocation.days : null,
          nominalPercentage: nominalByShareholder.get(allocation.shareholderId) ?? null,
        })),
      });

      return dist;
    });

    // Distribution mit Items laden
    const result = await prisma.distribution.findUnique({
      where: { id: distribution.id },
      include: {
        items: {
          include: {
            shareholder: {
              include: {
                person: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    companyName: true,
                    personType: true,
                  },
                },
              },
            },
          },
        },
        _count: { select: { items: true } },
      },
    });

    // Die Hinweise gehen mit zurück, nicht nur in die Datenbank — sonst
    // erführe der Bearbeiter erst beim nächsten Öffnen, dass ein Teil nicht
    // verteilt wurde.
    return NextResponse.json({ ...result, warnings }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Fehler beim Erstellen der Ausschuettung");
  }
}
