/**
 * Distribution Rule Handler
 * Implementiert die Logik für Ausschuettungen an Gesellschafter
 */

import { prisma } from "@/lib/prisma";
import {
  Prisma,
  InvoiceType,
  TaxType,
  EntityStatus,
  DistributionStatus,
} from "@prisma/client";
import {
  getNextInvoiceNumber,
  calculateTaxAmounts,
  type TxClient,
} from "@/lib/invoices/numberGenerator";
import { BillingRuleType } from "../types";
import {
  RuleHandler,
  DistributionParameters,
  BillingRuleParameters,
  ExecuteRuleOptions,
  ExecutionResult,
  InvoiceCreationResult,
} from "../types";

/**
 * Zulaessige Abweichung der Summe aller Ausschuettungsanteile von 100%
 * (in Prozentpunkten).
 */
const PERCENTAGE_TOLERANCE = 0.01;

/** Anzahl Versuche bei Nummern-Kollision (paralleles execute()). */
const NUMBER_RETRY_ATTEMPTS = 5;

/**
 * Generiert eine eindeutige Ausschuettungsnummer.
 *
 * Muss innerhalb der Transaktion laufen, die auch die Distribution anlegt —
 * sonst kann zwischen "Nummer lesen" und "Distribution schreiben" ein
 * paralleler Aufruf dieselbe Nummer abgreifen. Der `@unique`-Constraint auf
 * `distributionNumber` faengt den Restfall ab, der Caller wiederholt dann.
 *
 * WICHTIG: Die Sortierung passiert NUMERISCH, nicht lexikografisch. Ein
 * `orderBy: { distributionNumber: "desc" }` würde "AS-2026-999" vor
 * "AS-2026-1000" einsortieren — ab der 1000. Ausschuettung wäre die naechste
 * Nummer erneut 1000.
 */
async function getNextDistributionNumber(
  client: TxClient,
  tenantId: string
): Promise<string> {
  const year = new Date().getFullYear();

  const rows = await client.$queryRaw<Array<{ max_number: bigint | number | null }>>`
    SELECT MAX((regexp_replace("distributionNumber", '^AS-[0-9]{4}-', ''))::bigint) AS max_number
    FROM distributions
    WHERE "tenantId" = ${tenantId}
      AND "distributionNumber" ~ ${`^AS-${year}-[0-9]+$`}
  `;

  const maxNumber = rows[0]?.max_number != null ? Number(rows[0].max_number) : 0;
  const nextNumber = maxNumber + 1;

  // padStart(3) bleibt fuer Abwaertskompatibilitaet mit bestehenden Nummern;
  // ab 1000 wird die Nummer natuerlicherweise vierstellig.
  return `AS-${year}-${nextNumber.toString().padStart(3, "0")}`;
}

/** Cent-genaue Rundung. */
function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Verteilt `totalAmount` gemaess `percentages` auf cent-genaue Betraege und
 * weist die Rundungsdifferenz dem letzten Empfaenger mit positivem Betrag zu.
 *
 * Ohne diese Restzuweisung summieren sich die Einzelbetraege nicht exakt auf
 * `totalAmount` (Beispiel: 1.000 EUR auf 7 Gesellschafter à 14,2857% ergibt
 * 7 × 142,86 = 1.000,02 EUR).
 */
function allocateByPercentage(totalAmount: number, percentages: number[]): number[] {
  const amounts = percentages.map((p) => roundCents((totalAmount * p) / 100));
  if (amounts.length === 0) return amounts;

  const distributed = roundCents(amounts.reduce((sum, a) => sum + a, 0));
  const difference = roundCents(totalAmount - distributed);

  // Maximal moeglicher Rundungsfehler: 0,5 Cent pro Empfaenger, plus der
  // Spielraum aus der tolerierten Abweichung der Anteilssumme von 100%.
  const maxRoundingError =
    0.005 * amounts.length + (Math.abs(totalAmount) * PERCENTAGE_TOLERANCE) / 100 + 0.005;

  if (difference !== 0 && Math.abs(difference) <= maxRoundingError) {
    for (let i = amounts.length - 1; i >= 0; i--) {
      if (amounts[i] > 0) {
        amounts[i] = roundCents(amounts[i] + difference);
        break;
      }
    }
  }

  return amounts;
}

/**
 * Prueft, ob die Summe der Anteile ~100% ergibt.
 * @returns Fehlermeldung oder null wenn gueltig.
 */
function checkPercentageSum(totalPercentage: number): string | null {
  if (Math.abs(totalPercentage - 100) > PERCENTAGE_TOLERANCE) {
    return `Summe der Ausschuettungsanteile ist ${totalPercentage.toFixed(2)}% (erwartet: 100%)`;
  }
  return null;
}

/** Erkennt Unique-Constraint-Verletzung bzw. Serialisierungs-Konflikt. */
function isDistributionNumberConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

/**
 * Laedt alle aktiven Gesellschafter mit Ausschuettungsanteil.
 * Gemeinsamer Pfad fuer preview() und execute() — beide MUESSEN denselben
 * Datenstand und dieselben Validierungen sehen.
 */
async function loadDistributionShareholders(tenantId: string, fundId: string) {
  return prisma.shareholder.findMany({
    where: {
      fundId,
      // Tenant-Scoping ueber den Fund: verhindert, dass ein fremder fundId
      // in den Parametern Gesellschafter eines anderen Mandanten zieht.
      fund: { tenantId },
      status: EntityStatus.ACTIVE,
      distributionPercentage: {
        not: null,
        gt: 0,
      },
    },
    include: {
      person: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          companyName: true,
          street: true,
          postalCode: true,
          city: true,
          bankIban: true,
          bankBic: true,
          bankName: true,
        },
      },
      fund: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { id: "asc" },
  });
}

/**
 * Legt den Distribution-Record an. Nummernvergabe und Insert laufen atomar
 * in einer Serializable-Transaktion; bei Kollision auf dem `@unique`-Index
 * wird bis zu NUMBER_RETRY_ATTEMPTS mal wiederholt.
 */
async function createDistributionRecord(input: {
  tenantId: string;
  fundId: string;
  description: string;
  totalAmount: number;
  distributionDate: Date;
}) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= NUMBER_RETRY_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const distributionNumber = await getNextDistributionNumber(tx, input.tenantId);

          return tx.distribution.create({
            data: {
              distributionNumber,
              description: input.description,
              totalAmount: input.totalAmount,
              distributionDate: input.distributionDate,
              status: DistributionStatus.DRAFT,
              tenantId: input.tenantId,
              fundId: input.fundId,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (error) {
      lastError = error;
      if (!isDistributionNumberConflict(error)) throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Ausschuettungsnummer konnte nicht vergeben werden");
}

/**
 * Handler für Ausschuettungen an Gesellschafter
 */
export class DistributionHandler implements RuleHandler {
  readonly ruleType = BillingRuleType.DISTRIBUTION;

  validateParameters(parameters: unknown): parameters is DistributionParameters {
    if (!parameters || typeof parameters !== "object") {
      return false;
    }

    const params = parameters as Record<string, unknown>;

    // Pflichtfelder prüfen
    if (!params.fundId || typeof params.fundId !== "string") {
      return false;
    }
    if (!params.totalAmount || typeof params.totalAmount !== "number") {
      return false;
    }
    if (params.totalAmount <= 0) {
      return false;
    }

    // Optionale Felder prüfen
    if (params.description !== undefined && typeof params.description !== "string") {
      return false;
    }
    if (params.distributionDate !== undefined && typeof params.distributionDate !== "string") {
      return false;
    }
    if (
      params.notifyShareholders !== undefined &&
      typeof params.notifyShareholders !== "boolean"
    ) {
      return false;
    }

    return true;
  }

  async preview(
    tenantId: string,
    parameters: BillingRuleParameters
  ): Promise<InvoiceCreationResult[]> {
    const params = parameters as DistributionParameters;
    const results: InvoiceCreationResult[] = [];

    const shareholders = await loadDistributionShareholders(tenantId, params.fundId);

    if (shareholders.length === 0) {
      return [
        {
          success: false,
          error: "Keine Gesellschafter mit Ausschuettungsanteil gefunden",
        },
      ];
    }

    // Berechne Summe der Ausschuettungsanteile
    const percentages = shareholders.map((s) => Number(s.distributionPercentage) || 0);
    const totalPercentage = percentages.reduce((sum, p) => sum + p, 0);

    // Validiere dass Anteile ~100% ergeben
    const percentageError = checkPercentageSum(totalPercentage);
    if (percentageError) {
      results.push({
        success: false,
        error: `Warnung: ${percentageError}`,
      });
    }

    const amounts = allocateByPercentage(params.totalAmount, percentages);

    for (const [index, shareholder] of shareholders.entries()) {
      const amount = amounts[index];

      const recipientName =
        shareholder.person.companyName ||
        `${shareholder.person.firstName || ""} ${shareholder.person.lastName || ""}`.trim();

      if (amount <= 0) {
        results.push({
          success: false,
          recipientName,
          amount: 0,
          error: "Berechneter Betrag ist 0 oder negativ",
        });
        continue;
      }

      results.push({
        success: true,
        recipientName,
        amount,
      });
    }

    return results;
  }

  async execute(
    tenantId: string,
    parameters: BillingRuleParameters,
    options: ExecuteRuleOptions
  ): Promise<ExecutionResult> {
    const params = parameters as DistributionParameters;
    const invoiceResults: InvoiceCreationResult[] = [];

    // Dry-Run: Nur Vorschau
    if (options.dryRun) {
      const preview = await this.preview(tenantId, parameters);
      const successful = preview.filter((r) => r.success);
      const totalAmount = successful.reduce((sum, r) => sum + (r.amount || 0), 0);

      return {
        status: preview.every((r) => r.success) ? "success" : "partial",
        invoicesCreated: 0,
        totalAmount,
        details: {
          invoices: preview,
          summary: {
            totalProcessed: preview.length,
            successful: successful.length,
            failed: preview.filter((r) => !r.success).length,
            skipped: 0,
          },
        },
      };
    }

    // Lade alle aktiven Gesellschafter
    const shareholders = await loadDistributionShareholders(tenantId, params.fundId);

    if (shareholders.length === 0) {
      return {
        status: "failed",
        invoicesCreated: 0,
        totalAmount: 0,
        errorMessage: "Keine Gesellschafter mit Ausschuettungsanteil gefunden",
        details: {
          invoices: [],
          summary: {
            totalProcessed: 0,
            successful: 0,
            failed: 0,
            skipped: 0,
          },
        },
      };
    }

    // FIX (Randfall 4): Die Anteilssumme MUSS auch im Ausfuehrungspfad geprueft
    // werden, nicht nur in preview(). Ohne diese Pruefung wuerden bei 150%
    // Anteilssumme 150.000 EUR ausgeschuettet, waehrend Distribution.totalAmount
    // auf 100.000 EUR stehen bliebe — Status trotzdem EXECUTED, kein Fehler.
    const percentages = shareholders.map((s) => Number(s.distributionPercentage) || 0);
    const totalPercentage = percentages.reduce((sum, p) => sum + p, 0);
    const percentageError = checkPercentageSum(totalPercentage);

    if (percentageError) {
      return {
        status: "failed",
        invoicesCreated: 0,
        totalAmount: 0,
        errorMessage: `${percentageError}. Ausschuettung wurde nicht ausgefuehrt.`,
        details: {
          invoices: [],
          summary: {
            totalProcessed: 0,
            successful: 0,
            failed: 0,
            skipped: shareholders.length,
          },
        },
      };
    }

    // FIX (Randfall 16): Betraege inkl. Restzuweisung der Rundungsdifferenz,
    // damit die Summe der Gutschriften exakt params.totalAmount ergibt.
    const amounts = allocateByPercentage(params.totalAmount, percentages);

    // Erstelle Distribution Record (Nummer + Insert atomar, siehe unten)
    const distributionDate = params.distributionDate
      ? new Date(params.distributionDate)
      : new Date();

    const distribution = await createDistributionRecord({
      tenantId,
      fundId: params.fundId,
      description: params.description || `Ausschuettung ${new Date().getFullYear()}`,
      totalAmount: params.totalAmount,
      distributionDate,
    });
    const distributionNumber = distribution.distributionNumber;

    let totalAmount = 0;

    // Erstelle Gutschriften für jeden Gesellschafter
    for (const [index, shareholder] of shareholders.entries()) {
      try {
        const percentage = percentages[index];
        const amount = amounts[index];

        if (amount <= 0) {
          invoiceResults.push({
            success: false,
            recipientName:
              shareholder.person.companyName ||
              `${shareholder.person.firstName} ${shareholder.person.lastName}`,
            amount: 0,
            error: "Berechneter Betrag ist 0 oder negativ",
          });
          continue;
        }

        // Empfänger-Adresse formatieren
        const recipientName =
          shareholder.person.companyName ||
          `${shareholder.person.firstName || ""} ${shareholder.person.lastName || ""}`.trim();
        const recipientAddress = [
          shareholder.person.street,
          `${shareholder.person.postalCode || ""} ${shareholder.person.city || ""}`.trim(),
        ]
          .filter(Boolean)
          .join("\n");

        // Gutschrift-Nummer generieren
        const { number: invoiceNumber } = await getNextInvoiceNumber(
          tenantId,
          InvoiceType.CREDIT_NOTE
        );

        // Ausschuettungen sind steuerfrei (Kapitalerträge)
        const taxType: TaxType = TaxType.EXEMPT;
        const { taxRate, taxAmount, grossAmount } = calculateTaxAmounts(amount, "EXEMPT");

        // DistributionItem erstellen
        const distributionItem = await prisma.distributionItem.create({
          data: {
            distributionId: distribution.id,
            shareholderId: shareholder.id,
            percentage,
            amount,
          },
        });

        // Gutschrift erstellen
        const invoice = await prisma.invoice.create({
          data: {
            invoiceType: InvoiceType.CREDIT_NOTE,
            invoiceNumber,
            invoiceDate: distributionDate,
            recipientType: "shareholder",
            recipientName,
            recipientAddress,
            paymentReference: `${distributionNumber}-${shareholder.shareholderNumber || shareholder.id.slice(0, 8)}`,
            netAmount: amount,
            taxRate,
            taxAmount,
            grossAmount,
            status: "DRAFT",
            notes: `Bankverbindung:\n${shareholder.person.bankName || ""}\nIBAN: ${shareholder.person.bankIban || ""}\nBIC: ${shareholder.person.bankBic || ""}`,
            tenantId,
            fundId: params.fundId,
            shareholderId: shareholder.id,
            items: {
              create: [
                {
                  position: 1,
                  description: `${params.description || "Ausschuettung"} - Anteil ${percentage.toFixed(3)}%`,
                  quantity: 1,
                  unit: "pauschal",
                  unitPrice: amount,
                  netAmount: amount,
                  taxType,
                  taxRate,
                  taxAmount,
                  grossAmount,
                  referenceType: "DISTRIBUTION",
                  referenceId: distribution.id,
                },
              ],
            },
          },
        });

        // Verknuepfe Gutschrift mit DistributionItem
        await prisma.distributionItem.update({
          where: { id: distributionItem.id },
          data: { invoiceId: invoice.id },
        });

        totalAmount += grossAmount;

        invoiceResults.push({
          success: true,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          recipientName,
          amount: grossAmount,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unbekannter Fehler";
        invoiceResults.push({
          success: false,
          recipientName:
            shareholder.person.companyName ||
            `${shareholder.person.firstName} ${shareholder.person.lastName}`,
          error: errorMessage,
        });
      }
    }

    // Aktualisiere Distribution Status basierend auf Ergebnis
    const successful = invoiceResults.filter((r) => r.success);
    const failed = invoiceResults.filter((r) => !r.success);

    let status: "success" | "failed" | "partial";
    let distributionStatus: DistributionStatus;

    if (failed.length === 0) {
      status = "success";
      distributionStatus = DistributionStatus.EXECUTED;
    } else if (successful.length === 0) {
      status = "failed";
      distributionStatus = DistributionStatus.DRAFT;
    } else {
      status = "partial";
      distributionStatus = DistributionStatus.EXECUTED;
    }

    // Distribution-Status aktualisieren
    await prisma.distribution.update({
      where: { id: distribution.id },
      data: {
        status: distributionStatus,
        executedAt: distributionStatus === DistributionStatus.EXECUTED ? new Date() : null,
      },
    });

    return {
      status,
      invoicesCreated: successful.length,
      totalAmount,
      errorMessage:
        failed.length > 0
          ? `${failed.length} Gutschriften konnten nicht erstellt werden`
          : undefined,
      details: {
        invoices: invoiceResults,
        summary: {
          totalProcessed: invoiceResults.length,
          successful: successful.length,
          failed: failed.length,
          skipped: 0,
        },
        metadata: {
          distributionId: distribution.id,
          distributionNumber: distribution.distributionNumber,
        },
      },
    };
  }
}

export const distributionHandler = new DistributionHandler();
