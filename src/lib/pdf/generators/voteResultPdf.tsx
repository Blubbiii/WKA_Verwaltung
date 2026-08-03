import { renderToBuffer } from "@react-pdf/renderer";
import { VoteResultTemplate, type VoteResultPdfData } from "../templates/VoteResultTemplate";
import { resolveTemplateAndLetterhead, applyLetterheadBackground } from "../utils/templateResolver";
import { prisma } from "@/lib/prisma";
import { zaehleAus, type OptionErgebnis } from "@/lib/votes/tally";

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
  // Auszaehlung ueber das gemeinsame Modul (src/lib/votes/tally.ts).
  //
  // Hier stand eine woertliche Kopie der Verwaltungsansicht — die dritte
  // Auszaehlung im Codebase, mit denselben drei Fehlern: Enthaltungen in der
  // Mehrheitsgrundlage, Zustimmung ueber den Text "Ja" gesucht, und `||`
  // statt `??` beim Stimmgewicht.
  //
  // Bei diesem Dokument wiegt das am schwersten: es ist das Protokoll des
  // Beschlusses. Es konnte "abgelehnt" ausweisen, waehrend den
  // Gesellschaftern im Portal "angenommen" angezeigt wurde.
  const options_array = (vote.options as string[]) || ["Ja", "Nein", "Enthaltung"];

  const auszaehlung = zaehleAus({
    stimmen: vote.responses.map((response) => ({
      selectedOption: response.selectedOption,
      votingRightsPercentage:
        response.shareholder.votingRightsPercentage?.toNumber() ?? null,
      ownershipPercentage:
        response.shareholder.ownershipPercentage?.toNumber() ?? null,
    })),
    stimmberechtigte: eligibleShareholders.map((sh) => ({
      votingRightsPercentage: sh.votingRightsPercentage?.toNumber() ?? null,
      ownershipPercentage: sh.ownershipPercentage?.toNumber() ?? null,
    })),
    optionen: options_array,
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

  const totalCapital = auszaehlung.kapitalGesamt;
  const totalCapitalVoted = auszaehlung.kapitalAbgegeben;
  const quorumMet = auszaehlung.quorumErreicht;

  // `null` heisst: aus den Antwortmoeglichkeiten ergibt sich kein Beschluss.
  // Im Protokoll darf das nicht als "abgelehnt" erscheinen — der Grund steht
  // in `beschlussBegruendung`.
  const isApproved = auszaehlung.angenommen;
  const beschlussBegruendung = auszaehlung.begruendung;

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
      resultReason: beschlussBegruendung,
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
