import { renderToBuffer } from "@react-pdf/renderer";
import { InvoiceTemplate } from "../templates/InvoiceTemplate";
import { resolveTemplateAndLetterhead, applyLetterheadBackground } from "../utils/templateResolver";
import type { InvoicePdfData, SettlementPdfDetails } from "@/types/pdf";
import { prisma } from "@/lib/prisma";
import type { DocumentType } from "@prisma/client";
import {
  type WatermarkType,
  type WatermarkProps,
  shouldShowWatermark,
} from "../utils/watermark";

/**
 * Options for invoice PDF generation
 */
export interface InvoicePdfOptions {
  /** Explicit watermark type to show */
  watermark?: WatermarkType;
  /** Is this a preview/sample? */
  isPreview?: boolean;
  /** Custom watermark text */
  customWatermarkText?: string;
  /** Custom watermark opacity */
  customWatermarkOpacity?: number;
  /** Custom watermark color */
  customWatermarkColor?: string;
}

/**
 * Ersetzt Platzhalter im Zahlungstext mit tatsaechlichen Werten
 */
function resolvePaymentText(
  template: string,
  invoiceNumber: string,
  dueDate: Date | null
): string {
  let text = template;
  text = text.replace(/\{invoiceNumber\}/g, invoiceNumber);
  if (dueDate) {
    const formatted = new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(dueDate);
    text = text.replace(/\{dueDate\}/g, formatted);
  }
  return text;
}

/**
 * Generiert ein PDF fuer eine Rechnung
 * @param invoiceId - ID der Rechnung
 * @param options - Optionale Konfiguration (Wasserzeichen, Vorschau, etc.)
 */
export async function generateInvoicePdf(
  invoiceId: string,
  options: InvoicePdfOptions = {}
): Promise<Buffer> {
  // Rechnung mit allen Relationen laden
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      items: {
        orderBy: { position: "asc" },
      },
      tenant: true,
      park: true,
      shareholder: true,
      correctedInvoice: {
        select: { id: true, invoiceNumber: true },
      },
    },
  });

  if (!invoice) {
    throw new Error("Rechnung nicht gefunden");
  }

  // Tenant-Einstellungen fuer konfigurierbare Texte laden
  const tenantData = await prisma.tenant.findUnique({
    where: { id: invoice.tenantId },
    select: { settings: true },
  });
  const allSettings = (tenantData?.settings as Record<string, unknown>) || {};
  const tenantSettings = (allSettings.tenantSettings as Record<string, unknown>) || {};

  // Template und Letterhead aufloesen
  const documentType = mapInvoiceTypeToDocumentType(invoice.invoiceType);
  const { template, letterhead } = await resolveTemplateAndLetterhead(
    invoice.tenantId,
    documentType,
    invoice.parkId,
    invoice.fundId
  );

  // Daten fuer PDF aufbereiten
  const pdfData: InvoicePdfData = {
    invoiceNumber: invoice.invoiceNumber || "",
    invoiceType: (invoice.invoiceType as "INVOICE" | "CREDIT_NOTE") || "INVOICE",
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate ?? null,
    status: (invoice.status as "DRAFT" | "SENT" | "PAID" | "CANCELLED") || "DRAFT",
    recipientName: invoice.recipientName ?? "",
    recipientAddress: invoice.recipientAddress ?? null,
    serviceStartDate: invoice.serviceStartDate ?? null,
    serviceEndDate: invoice.serviceEndDate ?? null,
    paymentReference: invoice.paymentReference ?? null,
    internalReference: invoice.internalReference ?? null,
    items: (invoice.items || []).map((item) => ({
      position: item.position ?? 0,
      description: item.description || "",
      quantity: Number(item.quantity ?? 1),
      unit: item.unit ?? null,
      unitPrice: Number(item.unitPrice ?? 0),
      netAmount: Number(item.netAmount ?? 0),
      taxType: (item.taxType as "STANDARD" | "REDUCED" | "EXEMPT") || "STANDARD",
      taxRate: Number(item.taxRate ?? 0),
      taxAmount: Number(item.taxAmount ?? 0),
      grossAmount: Number(item.grossAmount ?? 0),
    })),
    netAmount: Number(invoice.netAmount ?? 0),
    taxAmount: Number(invoice.taxAmount ?? 0),
    taxRate: Number(invoice.taxRate ?? 0),
    grossAmount: Number(invoice.grossAmount ?? 0),
    notes: invoice.notes ?? null,
    // Zahlungstext basierend auf Rechnungstyp aus Tenant-Einstellungen
    paymentText: (() => {
      const isCredit = invoice.invoiceType === "CREDIT_NOTE";
      const defaultInvoiceText = "Bitte ueberweisen Sie den Betrag bis zum {dueDate} auf das unten angegebene Konto. Geben Sie als Verwendungszweck bitte die Rechnungsnummer {invoiceNumber} an.";
      const defaultCreditText = "Der Gutschriftsbetrag wird bis zum {dueDate} auf Ihr Konto ueberwiesen. Referenz: Gutschriftsnummer {invoiceNumber}.";

      const textTemplate = isCredit
        ? (tenantSettings.creditNotePaymentText as string) || defaultCreditText
        : (tenantSettings.invoicePaymentText as string) || defaultInvoiceText;

      return resolvePaymentText(textTemplate, invoice.invoiceNumber, invoice.dueDate);
    })(),
    // Skonto data
    skontoPercent: invoice.skontoPercent ? Number(invoice.skontoPercent) : null,
    skontoDays: invoice.skontoDays ?? null,
    skontoDeadline: invoice.skontoDeadline ?? null,
    skontoAmount: invoice.skontoAmount ? Number(invoice.skontoAmount) : null,
    skontoPaid: invoice.skontoPaid ?? false,
    // Korrektur-Info
    correctionOfInvoiceNumber: invoice.correctedInvoice?.invoiceNumber ?? undefined,
    correctionType: (invoice.correctionType as "FULL_CANCEL" | "PARTIAL_CANCEL" | "CORRECTION") ?? undefined,
    correctionReason: invoice.cancelReason ?? invoice.notes ?? undefined,
    tenant: invoice.tenant
      ? {
          name: invoice.tenant.name ?? null,
          bankName: invoice.tenant.bankName ?? null,
          iban: invoice.tenant.iban ?? null,
          bic: invoice.tenant.bic ?? null,
        }
      : undefined,
    // Settlement-Details fuer detaillierte Gutschrift-PDFs
    settlementDetails: invoice.calculationDetails
      ? (invoice.calculationDetails as unknown as SettlementPdfDetails)
      : undefined,
  };

  // Wasserzeichen-Konfiguration bestimmen
  let watermarkConfig: WatermarkProps | undefined;

  // Pruefen ob Wasserzeichen angezeigt werden soll
  const watermarkResult = shouldShowWatermark(pdfData.status, {
    watermarkType: options.watermark,
    isPreview: options.isPreview,
  });

  if (watermarkResult.show && watermarkResult.type) {
    watermarkConfig = {
      type: watermarkResult.type,
      customText: options.customWatermarkText,
      opacity: options.customWatermarkOpacity,
      color: options.customWatermarkColor,
    };
  }

  // PDF rendern
  const pdfBuffer = await renderToBuffer(
    <InvoiceTemplate
      invoice={pdfData}
      template={template}
      letterhead={letterhead}
      watermark={watermarkConfig}
    />
  );

  return applyLetterheadBackground(pdfBuffer, letterhead);
}

/**
 * Generiert ein PDF als Base64-String (fuer Vorschau)
 * @param invoiceId - ID der Rechnung
 * @param options - Optionale Konfiguration (Wasserzeichen, Vorschau, etc.)
 */
export async function generateInvoicePdfBase64(
  invoiceId: string,
  options: InvoicePdfOptions = {}
): Promise<string> {
  // Bei Base64-Generierung standardmaessig als Vorschau behandeln
  const previewOptions: InvoicePdfOptions = {
    isPreview: true,
    ...options,
  };
  const buffer = await generateInvoicePdf(invoiceId, previewOptions);
  return buffer.toString("base64");
}

/**
 * Mappt Invoice-Typ zu Document-Typ
 */
function mapInvoiceTypeToDocumentType(invoiceType: string): DocumentType {
  switch (invoiceType) {
    case "CREDIT_NOTE":
      return "CREDIT_NOTE";
    case "CANCELLATION":
      return "CREDIT_NOTE"; // Stornos verwenden Gutschrift-Template
    default:
      return "INVOICE";
  }
}
