/**
 * Distribution Rule Handler
 * Implementiert die Logik fuer Ausschuettungen an Gesellschafter
 */

import { prisma } from "@/lib/prisma";
import {
  InvoiceType,
  TaxType,
  EntityStatus,
  DistributionStatus,
} from "@prisma/client";
import { getNextInvoiceNumber, calculateTaxAmounts } from "@/lib/invoices/numberGenerator";
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
 * Generiert eine eindeutige Ausschuettungsnummer
 */
async function getNextDistributionNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();

  // Finde die letzte Ausschuettungsnummer dieses Jahres
  const lastDistribution = await prisma.distribution.findFirst({
    where: {
      tenantId,
      distributionNumber: {
        startsWith: `AS-${year}-`,
      },
    },
    orderBy: {
      distributionNumber: "desc",
    },
    select: {
      distributionNumber: true,
    },
  });

  let nextNumber = 1;
  if (lastDistribution) {
    const match = lastDistribution.distributionNumber.match(/AS-\d{4}-(\d+)/);
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1;
    }
  }

  return `AS-${year}-${nextNumber.toString().padStart(3, "0")}`;
}

/**
 * Handler fuer Ausschuettungen an Gesellschafter
 */
export class DistributionHandler implements RuleHandler {
  readonly ruleType = BillingRuleType.DISTRIBUTION;

  validateParameters(parameters: unknown): parameters is DistributionParameters {
    if (!parameters || typeof parameters !== "object") {
      return false;
    }

    const params = parameters as Record<string, unknown>;

    // Pflichtfelder pruefen
    if (!params.fundId || typeof params.fundId !== "string") {
      return false;
    }
    if (!params.totalAmount || typeof params.totalAmount !== "number") {
      return false;
    }
    if (params.totalAmount <= 0) {
      return false;
    }

    // Optionale Felder pruefen
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

    // Lade alle aktiven Gesellschafter der Gesellschaft
    const shareholders = await prisma.shareholder.findMany({
      where: {
        fundId: params.fundId,
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
    });

    if (shareholders.length === 0) {
      return [
        {
          success: false,
          error: "Keine Gesellschafter mit Ausschuettungsanteil gefunden",
        },
      ];
    }

    // Berechne Summe der Ausschuettungsanteile
    const totalPercentage = shareholders.reduce(
      (sum, s) => sum + Number(s.distributionPercentage || 0),
      0
    );

    // Validiere dass Anteile ~100% ergeben
    if (Math.abs(totalPercentage - 100) > 0.01) {
      results.push({
        success: false,
        error: `Warnung: Summe der Ausschuettungsanteile ist ${totalPercentage.toFixed(2)}% (erwartet: 100%)`,
      });
    }

    for (const shareholder of shareholders) {
      const percentage = Number(shareholder.distributionPercentage) || 0;
      const amount = Math.round((params.totalAmount * percentage) / 100 * 100) / 100;

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
    const shareholders = await prisma.shareholder.findMany({
      where: {
        fundId: params.fundId,
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
    });

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

    // Erstelle Distribution Record
    const distributionNumber = await getNextDistributionNumber(tenantId);
    const distributionDate = params.distributionDate
      ? new Date(params.distributionDate)
      : new Date();

    const distribution = await prisma.distribution.create({
      data: {
        distributionNumber,
        description: params.description || `Ausschuettung ${new Date().getFullYear()}`,
        totalAmount: params.totalAmount,
        distributionDate,
        status: DistributionStatus.DRAFT,
        tenantId,
        fundId: params.fundId,
      },
    });

    let totalAmount = 0;

    // Erstelle Gutschriften fuer jeden Gesellschafter
    for (const shareholder of shareholders) {
      try {
        const percentage = Number(shareholder.distributionPercentage) || 0;
        const amount = Math.round((params.totalAmount * percentage) / 100 * 100) / 100;

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

        // Empfaenger-Adresse formatieren
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

        // Ausschuettungen sind steuerfrei (Kapitalertraege)
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
