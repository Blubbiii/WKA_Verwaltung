import { renderToBuffer } from "@react-pdf/renderer";
import { VoteResultTemplate, type VoteResultPdfData } from "../templates/VoteResultTemplate";
import { resolveTemplateAndLetterhead, applyLetterheadBackground } from "../utils/templateResolver";
import { prisma } from "@/lib/prisma";

/**
 * Generiert ein PDF für ein Abstimmungsergebnis
 */
export async function generateVoteResultPdf(
  voteId: string,
  options?: { showSignatureLine?: boolean }
): Promise<Buffer> {
  // Vote mit allen Relationen laden
  const vote = await prisma.vote.findUnique({
    where: { id: voteId },
    include: {
      fund: {
        select: {
          id: true,
          name: true,
          legalForm: true,
        },
      },
      tenant: {
        select: {
          id: true,
          name: true,
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
            select: {
              id: true,
              votingRightsPercentage: true,
              ownershipPercentage: true,
            },
          },
        },
      },
    },
  });

  if (!vote) {
    throw new Error("Abstimmung nicht gefunden");
  }

  if (vote.status !== "CLOSED") {
    throw new Error("PDF-Export ist nur für abgeschlossene Abstimmungen moeglich");
  }

  // Alle stimmberechtigten Gesellschafter laden
  const eligibleShareholders = await prisma.shareholder.findMany({
    where: {
      fundId: vote.fundId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      votingRightsPercentage: true,
      ownershipPercentage: true,
    },
  });

  // Ergebnisse berechnen
  const options_array = (vote.options as string[]) || ["Ja", "Nein", "Enthaltung"];
  const optionCounts: Record<string, { count: number; capitalWeight: number }> = {};

  options_array.forEach((opt) => {
    optionCounts[opt] = { count: 0, capitalWeight: 0 };
  });

  let totalCapitalVoted = 0;
  const totalCapital = eligibleShareholders.reduce(
    (sum, sh) =>
      sum + (sh.votingRightsPercentage?.toNumber() || sh.ownershipPercentage?.toNumber() || 0),
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

  // Prozentuale Ergebnisse berechnen
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

  // Quorum prüfen
  const quorumMet =
    !vote.quorumPercentage ||
    (totalCapitalVoted / totalCapital) * 100 >= vote.quorumPercentage.toNumber();

  // Ergebnis bestimmen
  const yesPercentage = vote.requiresCapitalMajority
    ? parseFloat(resultsByCapital.find((r) => r.option === "Ja")?.percentage || "0")
    : parseFloat(resultsByHead.find((r) => r.option === "Ja")?.percentage || "0");

  const isApproved = quorumMet && yesPercentage > 50;

  // Template und Letterhead aufloesen (nutzt SETTLEMENT_REPORT als DocumentType)
  // Da es keinen VOTE_RESULT Typ gibt, verwenden wir den generischen Ansatz
  const { template, letterhead } = await resolveTemplateAndLetterhead(
    vote.tenantId,
    "SETTLEMENT_REPORT", // Closest document type for reports
    null // Kein park-spezifisches Template
  );

  // Daten für PDF aufbereiten
  const pdfData: VoteResultPdfData = {
    voteId: vote.id,
    title: vote.title,
    description: vote.description,
    voteType: vote.voteType,
    options: options_array,
    startDate: vote.startDate,
    endDate: vote.endDate,
    quorumPercentage: vote.quorumPercentage?.toNumber() ?? null,
    requiresCapitalMajority: vote.requiresCapitalMajority,
    status: vote.status as "DRAFT" | "ACTIVE" | "CLOSED",
    fund: {
      name: vote.fund.name,
      legalForm: vote.fund.legalForm,
    },
    stats: {
      totalEligible: eligibleShareholders.length,
      totalResponses: vote.responses.length,
      participationRate:
        eligibleShareholders.length > 0
          ? ((vote.responses.length / eligibleShareholders.length) * 100).toFixed(1)
          : "0",
      capitalParticipation:
        totalCapital > 0 ? ((totalCapitalVoted / totalCapital) * 100).toFixed(1) : "0",
      quorumMet,
      isApproved,
    },
    results: {
      byHead: resultsByHead,
      byCapital: resultsByCapital,
    },
    createdBy: vote.createdBy
      ? [vote.createdBy.firstName, vote.createdBy.lastName].filter(Boolean).join(" ")
      : null,
    createdAt: vote.createdAt,
    exportedAt: new Date(),
    tenant: {
      name: vote.tenant.name,
    },
  };

  // PDF rendern
  const pdfBuffer = await renderToBuffer(
    <VoteResultTemplate
      data={pdfData}
      template={template}
      letterhead={letterhead}
      showSignatureLine={options?.showSignatureLine ?? true}
    />
  );

  return applyLetterheadBackground(pdfBuffer, letterhead);
}

/**
 * Generiert ein PDF als Base64-String (für Vorschau)
 */
export async function generateVoteResultPdfBase64(
  voteId: string,
  options?: { showSignatureLine?: boolean }
): Promise<string> {
  const buffer = await generateVoteResultPdf(voteId, options);
  return buffer.toString("base64");
}
