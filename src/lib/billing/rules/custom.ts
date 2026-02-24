/**
 * Custom Rule Handler
 * Implementiert die Logik für benutzerdefinierte Abrechnungsregeln
 */

import { prisma } from "@/lib/prisma";
import { InvoiceType, TaxType } from "@prisma/client";
import { getNextInvoiceNumber, calculateTaxAmounts, getTaxRateByType } from "@/lib/invoices/numberGenerator";
import { BillingRuleType } from "../types";
import { getTenantSettings } from "@/lib/tenant-settings";
import {
  RuleHandler,
  CustomRuleParameters,
  BillingRuleParameters,
  ExecuteRuleOptions,
  ExecutionResult,
  InvoiceCreationResult,
} from "../types";

/**
 * Handler für benutzerdefinierte Regeln
 */
export class CustomRuleHandler implements RuleHandler {
  readonly ruleType = BillingRuleType.CUSTOM;

  validateParameters(parameters: unknown): parameters is CustomRuleParameters {
    if (!parameters || typeof parameters !== "object") {
      return false;
    }

    const params = parameters as Record<string, unknown>;

    // Pflichtfeld: invoiceType
    if (
      !params.invoiceType ||
      !["INVOICE", "CREDIT_NOTE"].includes(params.invoiceType as string)
    ) {
      return false;
    }

    // Pflichtfeld: items
    if (!Array.isArray(params.items) || params.items.length === 0) {
      return false;
    }

    // Items validieren
    for (const item of params.items) {
      if (!item || typeof item !== "object") {
        return false;
      }
      if (!item.description || typeof item.description !== "string") {
        return false;
      }
      if (typeof item.quantity !== "number" || item.quantity <= 0) {
        return false;
      }
      if (typeof item.unitPrice !== "number") {
        return false;
      }
      if (
        item.taxType !== undefined &&
        !["STANDARD", "REDUCED", "EXEMPT"].includes(item.taxType as string)
      ) {
        return false;
      }
    }

    // Optionale Felder prüfen
    if (params.recipientType !== undefined && typeof params.recipientType !== "string") {
      return false;
    }
    if (params.recipientName !== undefined && typeof params.recipientName !== "string") {
      return false;
    }
    if (params.recipientAddress !== undefined && typeof params.recipientAddress !== "string") {
      return false;
    }
    if (params.fundId !== undefined && typeof params.fundId !== "string") {
      return false;
    }
    if (params.parkId !== undefined && typeof params.parkId !== "string") {
      return false;
    }
    if (params.shareholderId !== undefined && typeof params.shareholderId !== "string") {
      return false;
    }
    if (params.leaseId !== undefined && typeof params.leaseId !== "string") {
      return false;
    }

    return true;
  }

  async preview(
    tenantId: string,
    parameters: BillingRuleParameters
  ): Promise<InvoiceCreationResult[]> {
    const params = parameters as CustomRuleParameters;
    const results: InvoiceCreationResult[] = [];

    // Berechne Gesamtbetrag aus Items
    let totalGross = 0;
    const defaultTaxType = params.taxType || "STANDARD";

    for (const item of params.items) {
      const netAmount = item.quantity * item.unitPrice;
      const { grossAmount } = calculateTaxAmounts(netAmount, item.taxType || defaultTaxType);
      totalGross += grossAmount;
    }

    if (totalGross <= 0 && params.invoiceType === "INVOICE") {
      return [
        {
          success: false,
          recipientName: params.recipientName || "Empfänger",
          amount: 0,
          error: "Gesamtbetrag ist 0 oder negativ",
        },
      ];
    }

    results.push({
      success: true,
      recipientName: params.recipientName || "Empfänger",
      amount: totalGross,
    });

    return results;
  }

  async execute(
    tenantId: string,
    parameters: BillingRuleParameters,
    options: ExecuteRuleOptions
  ): Promise<ExecutionResult> {
    const params = parameters as CustomRuleParameters;
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

    // Load tenant settings for payment term
    const tenantSettings = await getTenantSettings(tenantId);
    const paymentTermDays = tenantSettings.paymentTermDays;

    try {
      const invoiceType = params.invoiceType as InvoiceType;
      const defaultTaxType = params.taxType || "STANDARD";

      // Berechne Summen aus Items
      let totalNet = 0;
      let totalTax = 0;
      let totalGross = 0;

      const itemsData = params.items.map((item, index) => {
        const netAmount = item.quantity * item.unitPrice;
        const itemTaxType = item.taxType || defaultTaxType;
        const { taxRate, taxAmount, grossAmount } = calculateTaxAmounts(netAmount, itemTaxType);

        totalNet += netAmount;
        totalTax += taxAmount;
        totalGross += grossAmount;

        return {
          position: index + 1,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit || "Stueck",
          unitPrice: item.unitPrice,
          netAmount,
          taxType: itemTaxType as TaxType,
          taxRate,
          taxAmount,
          grossAmount,
        };
      });

      if (totalGross <= 0 && invoiceType === "INVOICE") {
        return {
          status: "failed",
          invoicesCreated: 0,
          totalAmount: 0,
          errorMessage: "Gesamtbetrag ist 0 oder negativ",
          details: {
            invoices: [
              {
                success: false,
                recipientName: params.recipientName || "Empfänger",
                amount: 0,
                error: "Gesamtbetrag ist 0 oder negativ",
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

      // Rechnungsnummer generieren
      const { number: invoiceNumber } = await getNextInvoiceNumber(tenantId, invoiceType);

      // Rechnung erstellen
      const invoice = await prisma.invoice.create({
        data: {
          invoiceType,
          invoiceNumber,
          invoiceDate: new Date(),
          dueDate:
            invoiceType === "INVOICE"
              ? new Date(Date.now() + paymentTermDays * 24 * 60 * 60 * 1000)
              : null,
          recipientType: params.recipientType,
          recipientName: params.recipientName,
          recipientAddress: params.recipientAddress,
          paymentReference: invoiceNumber,
          netAmount: totalNet,
          taxRate: 0, // Gemischt
          taxAmount: totalTax,
          grossAmount: totalGross,
          status: "DRAFT",
          notes: params.notes,
          tenantId,
          fundId: params.fundId,
          parkId: params.parkId,
          shareholderId: params.shareholderId,
          leaseId: params.leaseId,
          items: {
            create: itemsData,
          },
        },
      });

      invoiceResults.push({
        success: true,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        recipientName: params.recipientName || "Empfänger",
        amount: totalGross,
      });

      return {
        status: "success",
        invoicesCreated: 1,
        totalAmount: totalGross,
        details: {
          invoices: invoiceResults,
          summary: {
            totalProcessed: 1,
            successful: 1,
            failed: 0,
            skipped: 0,
          },
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unbekannter Fehler";

      return {
        status: "failed",
        invoicesCreated: 0,
        totalAmount: 0,
        errorMessage,
        details: {
          invoices: [
            {
              success: false,
              recipientName: params.recipientName || "Empfänger",
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

export const customRuleHandler = new CustomRuleHandler();
