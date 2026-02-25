import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import { dispatchWebhook } from "@/lib/webhooks";

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
      return NextResponse.json(
        { error: "Abstimmung nicht gefunden" },
        { status: 404 }
      );
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

    // Calculate results
    const optionCounts: Record<string, { count: number; capitalWeight: number }> = {};
    const options = (vote.options as string[]) || ["Ja", "Nein", "Enthaltung"];

    options.forEach((opt) => {
      optionCounts[opt] = { count: 0, capitalWeight: 0 };
    });

    let totalCapitalVoted = 0;
    const totalCapital = eligibleShareholders.reduce(
      (sum, sh) => sum + (sh.votingRightsPercentage?.toNumber() || sh.ownershipPercentage?.toNumber() || 0),
      0
    );

    vote.responses.forEach((response) => {
      const option = response.selectedOption;
      if (optionCounts[option]) {
        optionCounts[option].count += 1;
        const shareholderWeight =
          response.shareholder.votingRightsPercentage?.toNumber() ||
          response.shareholder.ownershipPercentage?.toNumber() ||
          0;
        optionCounts[option].capitalWeight += shareholderWeight;
        totalCapitalVoted += shareholderWeight;
      }
    });

    // Calculate percentages
    const resultsByHead = Object.entries(optionCounts).map(([option, data]) => ({
      option,
      count: data.count,
      percentage:
        vote.responses.length > 0
          ? ((data.count / vote.responses.length) * 100).toFixed(1)
          : "0",
    }));

    const resultsByCapital = Object.entries(optionCounts).map(([option, data]) => ({
      option,
      capitalWeight: data.capitalWeight.toFixed(2),
      percentage:
        totalCapitalVoted > 0
          ? ((data.capitalWeight / totalCapitalVoted) * 100).toFixed(1)
          : "0",
    }));

    // Check quorum
    const quorumMet =
      !vote.quorumPercentage ||
      (totalCapitalVoted / totalCapital) * 100 >= vote.quorumPercentage.toNumber();

    // Determine result
    const yesPercentage = vote.requiresCapitalMajority
      ? parseFloat(resultsByCapital.find((r) => r.option === "Ja")?.percentage || "0")
      : parseFloat(resultsByHead.find((r) => r.option === "Ja")?.percentage || "0");

    const isApproved = quorumMet && yesPercentage > 50;

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
          votingRights:
            r.shareholder.votingRightsPercentage?.toNumber() ||
            r.shareholder.ownershipPercentage?.toNumber(),
        },
      })),
      eligibleShareholders: eligibleShareholders.map((sh) => ({
        id: sh.id,
        shareholderNumber: sh.shareholderNumber,
        name: sh.person.companyName ||
          [sh.person.firstName, sh.person.lastName].filter(Boolean).join(" "),
        votingRights:
          sh.votingRightsPercentage?.toNumber() || sh.ownershipPercentage?.toNumber(),
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
      },
      results: {
        byHead: resultsByHead,
        byCapital: resultsByCapital,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching vote");
    return NextResponse.json(
      { error: "Fehler beim Laden der Abstimmung" },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: "Abstimmung nicht gefunden" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validatedData = voteUpdateSchema.parse(body);

    // Can't change certain fields if votes have been cast
    if (existingVote._count.responses > 0) {
      if (validatedData.options || validatedData.voteType) {
        return NextResponse.json(
          { error: "Optionen können nicht geändert werden, wenn bereits Stimmen abgegeben wurden" },
          { status: 400 }
        );
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
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error updating vote");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der Abstimmung" },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: "Abstimmung nicht gefunden" },
        { status: 404 }
      );
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
    return NextResponse.json(
      { error: "Fehler beim Löschen der Abstimmung" },
      { status: 500 }
    );
  }
}
