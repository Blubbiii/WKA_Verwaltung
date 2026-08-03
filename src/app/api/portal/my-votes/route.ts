import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VoteStatus } from "@prisma/client";
import { Decimal } from "@prisma/client-runtime-utils";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";
import {
  istEnthaltung,
  istJa,
  istNein,
  stimmgewicht,
  zaehleAus,
  type OptionErgebnis,
} from "@/lib/votes/tally";

const voteSubmitSchema = z.object({
  voteId: z.string().min(1, "Vote-ID ist erforderlich"),
  decision: z.string().min(1, "Entscheidung ist erforderlich"),
});

// Interface für Ergebnis-Berechnung
interface VoteResults {
  byHeadcount: {
    yes: { count: number; percent: number };
    no: { count: number; percent: number };
    abstain: { count: number; percent: number };
    total: number;
  };
  byCapital: {
    yes: { amount: number; percent: number };
    no: { amount: number; percent: number };
    abstain: { amount: number; percent: number };
    totalVoted: number;
    totalEligible: number;
  };
  quorum: {
    required: number | null;
    achieved: number;
    reached: boolean;
  };
  decision: {
    accepted: boolean;
    reason: string;
  };
}

// Type for a pre-fetched vote response with shareholder capital data
interface BatchedResponse {
  voteId: string;
  selectedOption: string;
  votingRightsPercentage: Decimal | null;
  ownershipPercentage: Decimal | null;
}

// Type for a pre-fetched shareholder with capital data
interface BatchedShareholder {
  fundId: string;
  votingRightsPercentage: Decimal | null;
  ownershipPercentage: Decimal | null;
}

/**
 * Batch-fetches all data needed for vote result calculations.
 * Returns pre-grouped maps so that calculateVoteResults needs zero DB queries.
 */
async function batchFetchVoteResultData(
  closedVoteIds: string[],
  closedFundIds: string[]
): Promise<{
  responsesByVoteId: Map<string, BatchedResponse[]>;
  shareholdersByFundId: Map<string, BatchedShareholder[]>;
}> {
  if (closedVoteIds.length === 0) {
    return {
      responsesByVoteId: new Map(),
      shareholdersByFundId: new Map(),
    };
  }

  const uniqueFundIds = [...new Set(closedFundIds)];

  const [allResponses, allShareholders] = await Promise.all([
    // Single query: all responses for all closed votes
    prisma.voteResponse.findMany({
      where: { voteId: { in: closedVoteIds } },
      select: {
        voteId: true,
        selectedOption: true,
        shareholder: {
          select: {
            votingRightsPercentage: true,
            ownershipPercentage: true,
          },
        },
      },
    }),
    // Single query: all non-archived shareholders for all relevant funds
    prisma.shareholder.findMany({
      where: {
        fundId: { in: uniqueFundIds },
        status: { not: "ARCHIVED" },
      },
      select: {
        fundId: true,
        votingRightsPercentage: true,
        ownershipPercentage: true,
      },
    }),
  ]);

  // Group responses by voteId
  const responsesByVoteId = new Map<string, BatchedResponse[]>();
  for (const r of allResponses) {
    const list = responsesByVoteId.get(r.voteId) ?? [];
    list.push({
      voteId: r.voteId,
      selectedOption: r.selectedOption,
      votingRightsPercentage: r.shareholder.votingRightsPercentage,
      ownershipPercentage: r.shareholder.ownershipPercentage,
    });
    responsesByVoteId.set(r.voteId, list);
  }

  // Group shareholders by fundId
  const shareholdersByFundId = new Map<string, BatchedShareholder[]>();
  for (const sh of allShareholders) {
    const list = shareholdersByFundId.get(sh.fundId) ?? [];
    list.push(sh);
    shareholdersByFundId.set(sh.fundId, list);
  }

  return { responsesByVoteId, shareholdersByFundId };
}

/**
 * Calculates vote results from pre-fetched data (no DB queries).
 */
/**
 * Auszählung für das Gesellschafterportal.
 *
 * Rechnet über `src/lib/votes/tally.ts` — dieselbe Stelle wie die
 * Verwaltungsansicht. Vorher hatte jede Seite ihre eigene Auszählung, und
 * die beiden wichen voneinander ab: Enthaltungen zählten hier nicht zur
 * Mehrheitsgrundlage, dort schon. Derselbe Beschluss kam damit zu zwei
 * Ergebnissen, je nachdem wer hinsah.
 *
 * Diese Funktion bringt das Ergebnis nur noch in die Form, die das Portal
 * erwartet.
 */
function calculateVoteResultsFromData(
  responses: BatchedResponse[],
  fundShareholders: BatchedShareholder[],
  quorumPercentage: Decimal | null,
  requiresCapitalMajority: boolean,
  optionen: string[],
): VoteResults {
  const auszaehlung = zaehleAus({
    stimmen: responses.map((r) => ({
      selectedOption: r.selectedOption,
      votingRightsPercentage: r.votingRightsPercentage?.toNumber() ?? null,
      ownershipPercentage: r.ownershipPercentage?.toNumber() ?? null,
    })),
    stimmberechtigte: fundShareholders.map((sh) => ({
      votingRightsPercentage: sh.votingRightsPercentage?.toNumber() ?? null,
      ownershipPercentage: sh.ownershipPercentage?.toNumber() ?? null,
    })),
    optionen,
    quorumProzent: quorumPercentage?.toNumber() ?? null,
    kapitalmehrheit: requiresCapitalMajority,
  });

  // Das Portal zeigt drei feste Faecher. Eigene Antwortmoeglichkeiten
  // ("Variante A") gehoeren in keines davon — sie bleiben hier unsichtbar,
  // erscheinen aber in der Verwaltungsansicht vollstaendig. Sie werden NICHT
  // in eines der drei Faecher gedraengt: das saehe aus wie eine Zustimmung,
  // die niemand erklaert hat.
  const summe = (
    passt: (o: string) => boolean,
    feld: "anzahl" | "kapital",
  ) =>
    auszaehlung.optionen
      .filter((o: OptionErgebnis) => passt(o.option))
      .reduce((s: number, o: OptionErgebnis) => s + o[feld], 0);

  const yesCount = summe(istJa, "anzahl");
  const noCount = summe(istNein, "anzahl");
  const abstainCount = summe(istEnthaltung, "anzahl");
  const totalCount = auszaehlung.stimmenGesamt;

  const yesCapital = summe(istJa, "kapital");
  const noCapital = summe(istNein, "kapital");
  const abstainCapital = summe(istEnthaltung, "kapital");
  const totalVotedCapital = auszaehlung.kapitalAbgegeben;

  const anteil = (teil: number, ganzes: number) =>
    ganzes > 0 ? (teil / ganzes) * 100 : 0;

  return {
    byHeadcount: {
      yes: { count: yesCount, percent: anteil(yesCount, totalCount) },
      no: { count: noCount, percent: anteil(noCount, totalCount) },
      abstain: { count: abstainCount, percent: anteil(abstainCount, totalCount) },
      total: totalCount,
    },
    byCapital: {
      yes: { amount: yesCapital, percent: anteil(yesCapital, totalVotedCapital) },
      no: { amount: noCapital, percent: anteil(noCapital, totalVotedCapital) },
      abstain: {
        amount: abstainCapital,
        percent: anteil(abstainCapital, totalVotedCapital),
      },
      totalVoted: totalVotedCapital,
      totalEligible: auszaehlung.kapitalGesamt,
    },
    quorum: {
      required: quorumPercentage?.toNumber() ?? null,
      achieved: Math.round(auszaehlung.beteiligungProzent * 100) / 100,
      reached: auszaehlung.quorumErreicht,
    },
    decision: {
      // `null` heisst „nicht bestimmbar" — etwa bei eigenen
      // Antwortmoeglichkeiten. Fuer das Portal, dessen Feld ein Boolean ist,
      // wird daraus `false`; die Begruendung sagt, warum.
      accepted: auszaehlung.angenommen === true,
      reason: auszaehlung.begruendung,
    },
  };
}

// GET /api/portal/my-votes - Get all votes for the current user's funds
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return apiError("FORBIDDEN", 401, { message: "Nicht autorisiert" });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    // Find the shareholder linked to this user
    const shareholder = await prisma.shareholder.findUnique({
      where: { userId: session.user.id },
    });

    if (!shareholder) {
      return NextResponse.json({ data: [], summary: {} });
    }

    // Find all shareholders for the same person
    const shareholders = await prisma.shareholder.findMany({
      where: {
        personId: shareholder.personId,
        status: { not: "ARCHIVED" },
      },
      select: {
        id: true,
        fundId: true,
        ownershipPercentage: true,
        votingRightsPercentage: true,
      },
    });

    const fundIds = shareholders.map((sh) => sh.fundId);
    const shareholderIds = shareholders.map((sh) => sh.id);

    if (fundIds.length === 0) {
      return NextResponse.json({ data: [], summary: {} });
    }

    // Find votes for the funds the user is invested in
    const votes = await prisma.vote.findMany({
      where: {
        fundId: { in: fundIds },
        status: { not: "DRAFT" },
        ...(status && { status: status as VoteStatus }),
      },
      include: {
        fund: {
          select: {
            id: true,
            name: true,
          },
        },
        responses: {
          where: {
            shareholderId: { in: shareholderIds },
          },
          select: {
            id: true,
            selectedOption: true,
            votedAt: true,
            shareholderId: true,
          },
        },
        _count: {
          select: { responses: true },
        },
      },
      orderBy: { endDate: "asc" },
    });

    // Categorize votes
    const now = new Date();
    const activeVotes = votes.filter(
      (v) => v.status === "ACTIVE" && new Date(v.endDate) > now
    );
    const closedVotes = votes.filter(
      (v) => v.status === "CLOSED" || new Date(v.endDate) <= now
    );
    const pendingVotes = activeVotes.filter((v) => v.responses.length === 0);

    // Batch-fetch all data needed for closed vote result calculations (avoids N+1)
    const closedVoteIds = closedVotes.map((v) => v.id);
    const closedFundIds = closedVotes.map((v) => v.fundId);
    const { responsesByVoteId, shareholdersByFundId } =
      await batchFetchVoteResultData(closedVoteIds, closedFundIds);

    // Compute results in-memory using pre-fetched data
    const votesWithResults = votes.map((vote) => {
      const userResponse = vote.responses[0];
      const shareholderForFund = shareholders.find(
        (sh) => sh.fundId === vote.fundId
      );
      const isClosed =
        vote.status === "CLOSED" || new Date(vote.endDate) <= now;

      // Ergebnisse nur für geschlossene Abstimmungen berechnen
      let results: VoteResults | null = null;
      if (isClosed) {
        results = calculateVoteResultsFromData(
          responsesByVoteId.get(vote.id) ?? [],
          shareholdersByFundId.get(vote.fundId) ?? [],
          vote.quorumPercentage,
          vote.requiresCapitalMajority,
          (vote.options as string[]) ?? ["Ja", "Nein", "Enthaltung"],
        );
      }

      return {
        id: vote.id,
        title: vote.title,
        description: vote.description,
        deadline: vote.endDate.toISOString(),
        status: vote.status,
        quorumPercent: vote.quorumPercentage?.toNumber(),
        majorityPercent: vote.requiresCapitalMajority ? 50 : null,
        requiresCapitalMajority: vote.requiresCapitalMajority,
        fund: vote.fund,
        totalBallots: vote._count.responses,
        userVote: userResponse
          ? {
              decision: userResponse.selectedOption,
              votedAt: userResponse.votedAt?.toISOString(),
            }
          : null,
        // Ueber das gemeinsame Modul: `||` liess eine ausdrueckliche 0
        // auf den Kapitalanteil zurueckfallen — dem Gesellschafter ohne
        // Stimmrecht wurde sein Kapitalanteil als Stimmgewicht angezeigt.
        userSharePercentage: shareholderForFund
          ? stimmgewicht({
              votingRightsPercentage:
                shareholderForFund.votingRightsPercentage?.toNumber() ?? null,
              ownershipPercentage:
                shareholderForFund.ownershipPercentage?.toNumber() ?? null,
            })
          : undefined,
        canVote:
          vote.status === "ACTIVE" &&
          new Date(vote.endDate) > now &&
          !userResponse,
        results,
      };
    });

    return NextResponse.json({
      data: votesWithResults,
      summary: {
        totalVotes: votes.length,
        activeVotes: activeVotes.length,
        pendingVotes: pendingVotes.length,
        closedVotes: closedVotes.length,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching votes");
    return apiError("INTERNAL_ERROR", undefined, { message: "Interner Serverfehler" });
  }
}

// POST /api/portal/my-votes - Submit a vote
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return apiError("FORBIDDEN", 401, { message: "Nicht autorisiert" });
    }

    const body = await request.json();
    const parsed = voteSubmitSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }
    const { voteId, decision } = parsed.data;

    // Valid options are typically "Ja", "Nein", "Enthaltung" but we also accept YES/NO/ABSTAIN
    const optionMapping: Record<string, string> = {
      YES: "Ja",
      NO: "Nein",
      ABSTAIN: "Enthaltung",
    };
    const selectedOption = optionMapping[decision] || decision;

    // Find the shareholder linked to this user
    const userShareholder = await prisma.shareholder.findUnique({
      where: { userId: session.user.id },
    });

    if (!userShareholder) {
      return apiError("BAD_REQUEST", undefined, { message: "Kein Gesellschafterprofil verknüpft" });
    }

    // Get the vote
    const vote = await prisma.vote.findUnique({
      where: { id: voteId },
    });

    if (!vote) {
      return apiError("NOT_FOUND", undefined, { message: "Abstimmung nicht gefunden" });
    }

    // Check if vote is still active
    if (vote.status !== "ACTIVE" || new Date(vote.endDate) <= new Date()) {
      return apiError("BAD_REQUEST", undefined, { message: "Abstimmung ist nicht mehr aktiv" });
    }

    // Find the shareholder for this fund (same person)
    const shareholder = await prisma.shareholder.findFirst({
      where: {
        personId: userShareholder.personId,
        fundId: vote.fundId,
        status: { not: "ARCHIVED" },
      },
    });

    if (!shareholder) {
      return apiError("FORBIDDEN", undefined, { message: "Sie sind nicht an dieser Gesellschaft beteiligt" });
    }

    // Check if already voted
    const existingResponse = await prisma.voteResponse.findUnique({
      where: {
        voteId_shareholderId: {
          voteId: vote.id,
          shareholderId: shareholder.id,
        },
      },
    });

    if (existingResponse) {
      return apiError("BAD_REQUEST", undefined, { message: "Sie haben bereits abgestimmt" });
    }

    // Create the vote response
    const response = await prisma.voteResponse.create({
      data: {
        voteId: vote.id,
        shareholderId: shareholder.id,
        selectedOption: selectedOption,
        votedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      ballot: {
        id: response.id,
        decision: response.selectedOption,
        votedAt: response.votedAt?.toISOString(),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error submitting vote");
    return apiError("INTERNAL_ERROR", undefined, { message: "Interner Serverfehler" });
  }
}
