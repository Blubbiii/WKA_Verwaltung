/**
 * Management Fee Rule Handler
 * Implementiert die Logik fuer Verwaltungsgebuehren
 */

import { prisma } from "@/lib/prisma";
import { InvoiceType, TaxType, EntityStatus } from "@prisma/client";
import { getNextInvoiceNumber, calculateTaxAmounts } from "@/lib/invoices/numberGenerator";
import { BillingRuleType } from "../types";
import { billingLogger as logger } from "@/lib/logger";
import {
  RuleHandler,
  ManagementFeeParameters,
  BillingRuleParameters,
  ExecuteRuleOptions,
  ExecutionResult,
  InvoiceCreationResult,
} from "../types";

/**
 * Berechnet den Basiswert fuer prozentuale Verwaltungsgebuehren
 */
async function getBaseValue(
  tenantId: string,
  fundId: string | undefined,
  parkId: string | undefined,
  baseValue: ManagementFeeParameters["baseValue"]
): Promise<number> {
  switch (baseValue) {
    case "TOTAL_CAPITAL":
      if (fundId) {
        const fund = await prisma.fund.findUnique({
          where: { id: fundId },
          select: { totalCapital: true },
        });
        return fund?.totalCapital ? Number(fund.totalCapital) : 0;
      }
      // Summe aller Gesellschaften des Tenants
      const funds = await prisma.fund.findMany({
        where: { tenantId, status: EntityStatus.ACTIVE },
        select: { totalCapital: true },
      });
      return funds.reduce((sum, f) => sum + (f.totalCapital ? Number(f.totalCapital) : 0), 0);

    case "ANNUAL_REVENUE": {
      // Sum of EnergySettlement.netOperatorRevenueEur for the fund's parks in the last 12 months
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
      const cutoffYear = twelveMonthsAgo.getFullYear();
      const cutoffMonth = twelveMonthsAgo.getMonth() + 1; // 1-based

      if (fundId) {
        // Get parks associated with this fund
        const fundParkIds = await prisma.fundPark.findMany({
          where: { fundId },
          select: { parkId: true },
        });
        const parkIds = fundParkIds.map((fp) => fp.parkId);

        if (parkIds.length === 0) return 0;

        const settlements = await prisma.energySettlement.findMany({
          where: {
            parkId: { in: parkIds },
            tenantId,
            OR: [
              { year: { gt: cutoffYear } },
              { year: cutoffYear, month: { gte: cutoffMonth } },
              { year: cutoffYear, month: null }, // Annual settlements for cutoff year
            ],
          },
          select: { netOperatorRevenueEur: true },
        });

        return settlements.reduce(
          (sum, s) => sum + Number(s.netOperatorRevenueEur),
          0
        );
      }

      // No fundId: sum across all tenant settlements in last 12 months
      const allSettlements = await prisma.energySettlement.findMany({
        where: {
          tenantId,
          OR: [
            { year: { gt: cutoffYear } },
            { year: cutoffYear, month: { gte: cutoffMonth } },
            { year: cutoffYear, month: null },
          ],
        },
        select: { netOperatorRevenueEur: true },
      });

      return allSettlements.reduce(
        (sum, s) => sum + Number(s.netOperatorRevenueEur),
        0
      );
    }

    case "NET_ASSET_VALUE": {
      // Net Asset Value: sum of capitalContribution from active shareholders
      if (fundId) {
        const shareholders = await prisma.shareholder.findMany({
          where: { fundId, status: EntityStatus.ACTIVE },
          select: { capitalContribution: true },
        });
        return shareholders.reduce(
          (sum, s) => sum + (s.capitalContribution ? Number(s.capitalContribution) : 0),
          0
        );
      }

      // No fundId: sum across all active shareholders of all tenant funds
      const allShareholders = await prisma.shareholder.findMany({
        where: {
          fund: { tenantId, status: EntityStatus.ACTIVE },
          status: EntityStatus.ACTIVE,
        },
        select: { capitalContribution: true },
      });
      return allShareholders.reduce(
        (sum, s) => sum + (s.capitalContribution ? Number(s.capitalContribution) : 0),
        0
      );
    }

    default:
      return 0;
  }
}

/**
 * Handler fuer Verwaltungsgebuehren
 */
export class ManagementFeeHandler implements RuleHandler {
  readonly ruleType = BillingRuleType.MANAGEMENT_FEE;

  validateParameters(parameters: unknown): parameters is ManagementFeeParameters {
    if (!parameters || typeof parameters !== "object") {
      return false;
    }

    const params = parameters as Record<string, unknown>;

    // Pflichtfeld: calculationType
    if (
      !params.calculationType ||
      !["FIXED", "PERCENTAGE"].includes(params.calculationType as string)
    ) {
      return false;
    }

    // Je nach Typ unterschiedliche Pflichtfelder
    if (params.calculationType === "FIXED") {
      if (typeof params.amount !== "number" || params.amount <= 0) {
        return false;
      }
    } else if (params.calculationType === "PERCENTAGE") {
      if (typeof params.percentage !== "number" || params.percentage <= 0) {
        return false;
      }
      if (
        !params.baseValue ||
        !["TOTAL_CAPITAL", "ANNUAL_REVENUE", "NET_ASSET_VALUE"].includes(
          params.baseValue as string
        )
      ) {
        return false;
      }
    }

    // Optionale Felder pruefen
    if (params.fundId !== undefined && typeof params.fundId !== "string") {
      return false;
    }
    if (params.parkId !== undefined && typeof params.parkId !== "string") {
      return false;
    }
    if (params.recipientName !== undefined && typeof params.recipientName !== "string") {
      return false;
    }
    if (params.recipientAddress !== undefined && typeof params.recipientAddress !== "string") {
      return false;
    }
    if (
      params.taxType !== undefined &&
      !["STANDARD", "REDUCED", "EXEMPT"].includes(params.taxType as string)
    ) {
      return false;
    }

    return true;
  }

  async preview(
    tenantId: string,
    parameters: BillingRuleParameters
  ): Promise<InvoiceCreationResult[]> {
    const params = parameters as ManagementFeeParameters;
    const results: InvoiceCreationResult[] = [];

    let amount: number;

    if (params.calculationType === "FIXED") {
      amount = params.amount || 0;
    } else {
      // PERCENTAGE
      const baseValue = await getBaseValue(
        tenantId,
        params.fundId,
        params.parkId,
        params.baseValue
      );
      amount = Math.round((baseValue * (params.percentage || 0)) / 100 * 100) / 100;
    }

    if (amount <= 0) {
      return [
        {
          success: false,
          recipientName: params.recipientName || "Verwaltungsgesellschaft",
          amount: 0,
          error:
            params.calculationType === "PERCENTAGE"
              ? "Basiswert oder Prozentsatz ist 0"
              : "Fester Betrag ist 0 oder negativ",
        },
      ];
    }

    // Steuer berechnen
    const { grossAmount } = calculateTaxAmounts(amount, params.taxType || "STANDARD");

    results.push({
      success: true,
      recipientName: params.recipientName || "Verwaltungsgesellschaft",
      amount: grossAmount,
    });

    return results;
  }

  async execute(
    tenantId: string,
    parameters: BillingRuleParameters,
    options: ExecuteRuleOptions
  ): Promise<ExecutionResult> {
    const params = parameters as ManagementFeeParameters;
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

    try {
      let amount: number;
      let calculationDetails: string;

      if (params.calculationType === "FIXED") {
        amount = params.amount || 0;
        calculationDetails = `Fester Betrag: ${amount.toFixed(2)} EUR`;
      } else {
        // PERCENTAGE
        const baseValue = await getBaseValue(
          tenantId,
          params.fundId,
          params.parkId,
          params.baseValue
        );
        amount = Math.round((baseValue * (params.percentage || 0)) / 100 * 100) / 100;
        calculationDetails = `${params.percentage}% von ${baseValue.toFixed(2)} EUR (${params.baseValue})`;
      }

      if (amount <= 0) {
        return {
          status: "failed",
          invoicesCreated: 0,
          totalAmount: 0,
          errorMessage:
            params.calculationType === "PERCENTAGE"
              ? "Basiswert oder Prozentsatz ist 0"
              : "Fester Betrag ist 0 oder negativ",
          details: {
            invoices: [
              {
                success: false,
                recipientName: params.recipientName || "Verwaltungsgesellschaft",
                amount: 0,
                error: "Berechneter Betrag ist 0 oder negativ",
              },
            ],
            summary: {
              totalProcessed: 1,
              successful: 0,
              failed: 1,
              skipped: 0,
            },
          },
        };
      }

      // Steuer berechnen
      const taxType = params.taxType || "STANDARD";
      const { taxRate, taxAmount, grossAmount } = calculateTaxAmounts(amount, taxType);

      // Rechnungsnummer generieren
      const { number: invoiceNumber } = await getNextInvoiceNumber(
        tenantId,
        InvoiceType.INVOICE
      );

      // Ermittle aktuelles Quartal oder Monat fuer Beschreibung
      const now = new Date();
      const quarter = Math.floor(now.getMonth() / 3) + 1;
      const year = now.getFullYear();

      const description =
        params.description ||
        `Verwaltungsgebuehr Q${quarter}/${year}`;

      // Rechnung erstellen
      const invoice = await prisma.invoice.create({
        data: {
          invoiceType: InvoiceType.INVOICE,
          invoiceNumber,
          invoiceDate: now,
          dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // +14 Tage
          recipientType: "vendor",
          recipientName: params.recipientName || "Verwaltungsgesellschaft",
          recipientAddress: params.recipientAddress,
          paymentReference: invoiceNumber,
          netAmount: amount,
          taxRate,
          taxAmount,
          grossAmount,
          status: "DRAFT",
          notes: `Berechnung: ${calculationDetails}`,
          tenantId,
          fundId: params.fundId,
          parkId: params.parkId,
          items: {
            create: [
              {
                position: 1,
                description,
                quantity: 1,
                unit: "pauschal",
                unitPrice: amount,
                netAmount: amount,
                taxType: taxType as TaxType,
                taxRate,
                taxAmount,
                grossAmount,
                referenceType: "MANAGEMENT_FEE",
              },
            ],
          },
        },
      });

      invoiceResults.push({
        success: true,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        recipientName: params.recipientName || "Verwaltungsgesellschaft",
        amount: grossAmount,
      });

      return {
        status: "success",
        invoicesCreated: 1,
        totalAmount: grossAmount,
        details: {
          invoices: invoiceResults,
          summary: {
            totalProcessed: 1,
            successful: 1,
            failed: 0,
            skipped: 0,
          },
          metadata: {
            calculationType: params.calculationType,
            calculationDetails,
          },
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unbekannter Fehler";

      return {
        status: "failed",
        invoicesCreated: 0,
        totalAmount: 0,
        errorMessage,
        details: {
          invoices: [
            {
              success: false,
              recipientName: params.recipientName || "Verwaltungsgesellschaft",
              error: errorMessage,
            },
          ],
          summary: {
            totalProcessed: 1,
            successful: 0,
            failed: 1,
            skipped: 0,
          },
        },
      };
    }
  }
}

export const managementFeeHandler = new ManagementFeeHandler();
