import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { handleApiError } from "@/lib/api-utils";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import { dispatchWebhook } from "@/lib/webhooks";
import { apiError } from "@/lib/api-errors";
import { stimmgewicht, zaehleAus, type OptionErgebnis } from "@/lib/votes/tally";

const voteUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  voteType: z.enum(["simple", "multiple"]).optional(),
  options: z.array(z.string()).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  quorumPercentage: z.number().min(0).max(100).optional().nullable(),
  requiresCapitalMajority: z.boolean().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "CLOSED"]).optional(),
});

// GET /api/votes/[id] - Einzelne Abstimmung mit Details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.VOTES_READ);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    const vote = await prisma.vote.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
      include: {
        fund: {
          select: {
            id: true,
            name: true,
            legalForm: true,
          },
        },
        createdBy: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        responses: {
          include: {
            shareholder: {
              include: {
                person: {
                  select: {
                    firstName: true,
                    lastName: true,
                    companyName: true,
                  },
                },
              },
            },
          },
          orderBy: { votedAt: "desc" },
        },
      },
    });

    if (!vote) {
      return apiError("NOT_FOUND", undefined, { message: "Abstimmung nicht gefunden" });
    }

    // Get all eligible shareholders for this fund
    const eligibleShareholders = await prisma.shareholder.findMany({
      where: {
        fundId: vote.fundId,
        status: "ACTIVE",
      },
      include: {
        person: {
          select: {
            firstName: true,
            lastName: true,
            companyName: true,
          },
        },
      },
    });

    // Auszaehlung ueber das gemeinsame Modul.
    //
    // Diese Route hatte eine EIGENE Auszaehlung, und sie wich von der des
    // Gesellschafterportals ab: Enthaltungen zaehlten hier zur
    // Mehrheitsgrundlage, dort nicht. Dieselbe Abstimmung kam damit zu zwei
    // Ergebnissen, je nachdem wer hinsah. Ausserdem suchte sie den
    // Zustimmungsanteil ueber den Text "Ja" — eine Abstimmung mit eigenen
    // Antwortmoeglichkeiten konnte nie angenommen werden und wurde als
    // abgelehnt angezeigt.
    //
    // Beide Seiten rechnen jetzt in src/lib/votes/tally.ts. Begruendung der
    // Regel steht dort.
    const auszaehlung = zaehleAus({
      stimmen: vote.responses.map((r) => ({
        selectedOption: r.selectedOption,
        votingRightsPercentage:
          r.shareholder.votingRightsPercentage?.toNumber() ?? null,
        ownershipPercentage:
          r.shareholder.ownershipPercentage?.toNumber() ?? null,
      })),
      stimmberechtigte: eligibleShareholders.map((sh) => ({
        votingRightsPercentage: sh.votingRightsPercentage?.toNumber() ?? null,
        ownershipPercentage: sh.ownershipPercentage?.toNumber() ?? null,
      })),
      optionen: (vote.options as string[]) || ["Ja", "Nein", "Enthaltung"],
      quorumProzent: vote.quorumPercentage?.toNumber() ?? null,
      kapitalmehrheit: vote.requiresCapitalMajority,
    });

    const resultsByHead = auszaehlung.optionen.map((o: OptionErgebnis) => ({
      option: o.option,
      count: o.anzahl,
      percentage: o.anteilKoepfe.toFixed(1),
    }));

    const resultsByCapital = auszaehlung.optionen.map((o: OptionErgebnis) => ({
      option: o.option,
      capitalWeight: o.kapital.toFixed(2),
      percentage: o.anteilKapital.toFixed(1),
    }));

    const quorumMet = auszaehlung.quorumErreicht;
    const totalCapital = auszaehlung.kapitalGesamt;
    const totalCapitalVoted = auszaehlung.kapitalAbgegeben;
    const isApproved = auszaehlung.angenommen;

    return NextResponse.json({
      id: vote.id,
      title: vote.title,
      description: vote.description,
      voteType: vote.voteType,
      options: vote.options,
      startDate: vote.startDate.toISOString(),
      endDate: vote.endDate.toISOString(),
      quorumPercentage: vote.quorumPercentage?.toNumber(),
      requiresCapitalMajority: vote.requiresCapitalMajority,
      status: vote.status,
      fund: vote.fund,
      createdBy: vote.createdBy
        ? [vote.createdBy.firstName, vote.createdBy.lastName].filter(Boolean).join(" ")
        : null,
      createdAt: vote.createdAt.toISOString(),
      responses: vote.responses.map((r) => ({
        id: r.id,
        selectedOption: r.selectedOption,
        votedAt: r.votedAt.toISOString(),
        shareholder: {
          id: r.shareholder.id,
          shareholderNumber: r.shareholder.shareholderNumber,
          name: r.shareholder.person.companyName ||
            [r.shareholder.person.firstName, r.shareholder.person.lastName]
              .filter(Boolean)
              .join(" "),
          // Auch die ANZEIGE des Stimmgewichts kommt aus dem gemeinsamen
          // Modul. Sonst stuende hier eine vierte Fassung derselben Regel —
          // und die Anzeige koennte von der Auszaehlung abweichen.
          votingRights: stimmgewicht({
            votingRightsPercentage:
              r.shareholder.votingRightsPercentage?.toNumber() ?? null,
            ownershipPercentage:
              r.shareholder.ownershipPercentage?.toNumber() ?? null,
          }),
        },
      })),
      eligibleShareholders: eligibleShareholders.map((sh) => ({
        id: sh.id,
        shareholderNumber: sh.shareholderNumber,
        name: sh.person.companyName ||
          [sh.person.firstName, sh.person.lastName].filter(Boolean).join(" "),
        votingRights: stimmgewicht({
          votingRightsPercentage: sh.votingRightsPercentage?.toNumber() ?? null,
          ownershipPercentage: sh.ownershipPercentage?.toNumber() ?? null,
        }),
        hasVoted: vote.responses.some((r) => r.shareholderId === sh.id),
      })),
      stats: {
        totalEligible: eligibleShareholders.length,
        totalResponses: vote.responses.length,
        participationRate:
          eligibleShareholders.length > 0
            ? ((vote.responses.length / eligibleShareholders.length) * 100).toFixed(1)
            : "0",
        capitalParticipation: totalCapital > 0
          ? ((totalCapitalVoted / totalCapital) * 100).toFixed(1)
          : "0",
        quorumMet,
        isApproved: vote.status === "CLOSED" ? isApproved : null,
        // Klartext, warum. Deckt auch den Fall ab, dass sich aus den
        // Antwortmoeglichkeiten gar kein Beschluss ergibt (isApproved null).
        resultReason: vote.status === "CLOSED" ? auszaehlung.begruendung : null,
      },
      results: {
        byHead: resultsByHead,
        byCapital: resultsByCapital,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching vote");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Abstimmung" });
  }
}

// PUT /api/votes/[id] - Abstimmung aktualisieren
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.VOTES_UPDATE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    const existingVote = await prisma.vote.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
      include: {
        _count: { select: { responses: true } },
      },
    });

    if (!existingVote) {
      return apiError("NOT_FOUND", undefined, { message: "Abstimmung nicht gefunden" });
    }

    const body = await request.json();
    const validatedData = voteUpdateSchema.parse(body);

    // Can't change certain fields if votes have been cast
    if (existingVote._count.responses > 0) {
      if (validatedData.options || validatedData.voteType) {
        return apiError("OPERATION_NOT_ALLOWED", 400, { message: "Optionen können nicht geändert werden, wenn bereits Stimmen abgegeben wurden" });
      }
    }

    const vote = await prisma.vote.update({
      where: { id },
      data: {
        ...(validatedData.title && { title: validatedData.title }),
        ...(validatedData.description !== undefined && { description: validatedData.description }),
        ...(validatedData.voteType && { voteType: validatedData.voteType }),
        ...(validatedData.options && { options: validatedData.options }),
        ...(validatedData.startDate && { startDate: new Date(validatedData.startDate) }),
        ...(validatedData.endDate && { endDate: new Date(validatedData.endDate) }),
        ...(validatedData.quorumPercentage !== undefined && {
          quorumPercentage: validatedData.quorumPercentage,
        }),
        ...(validatedData.requiresCapitalMajority !== undefined && {
          requiresCapitalMajority: validatedData.requiresCapitalMajority,
        }),
        ...(validatedData.status && { status: validatedData.status }),
      },
      include: {
        fund: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Fire-and-forget webhook when vote is closed
    if (validatedData.status === "CLOSED") {
      dispatchWebhook(check.tenantId!, "vote.closed", {
        voteId: vote.id,
        title: vote.title,
        fundId: vote.fundId,
        fundName: vote.fund?.name ?? null,
      }).catch((err) => { logger.warn({ err }, "[Webhook] Dispatch failed"); });
    }

    return NextResponse.json(vote);
  } catch (error) {
    return handleApiError(error, "Fehler beim Aktualisieren der Abstimmung");
  }
}

// DELETE /api/votes/[id] - Abstimmung unwiderruflich löschen (nur ADMIN/SUPERADMIN)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.VOTES_DELETE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    const existingVote = await prisma.vote.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
    });

    if (!existingVote) {
      return apiError("NOT_FOUND", undefined, { message: "Abstimmung nicht gefunden" });
    }

    // Hard-delete + audit log atomar in einer Transaktion
    await prisma.$transaction(async (tx) => {
      // 1. Abstimmung unwiderruflich löschen (inkl. aller Responses durch Cascade)
      await tx.vote.delete({
        where: { id },
      });

      // 2. Log deletion for audit trail
      const cleanedData = { ...existingVote } as Record<string, unknown>;
      await tx.auditLog.create({
        data: {
          action: "DELETE",
          entityType: "Vote",
          entityId: id,
          oldValues: cleanedData as unknown as Prisma.InputJsonValue,
          newValues: Prisma.JsonNull,
          tenantId: check.tenantId!,
          userId: check.userId!,
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting vote");
    return apiError("DELETE_FAILED", undefined, { message: "Fehler beim Löschen der Abstimmung" });
  }
}
