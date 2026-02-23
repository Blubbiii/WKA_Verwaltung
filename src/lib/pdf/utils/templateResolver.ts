/**
 * Template Resolution mit Fallback-Kette:
 * 1. Fund-spezifische Vorlage (Briefpapier der Gesellschaft)
 * 2. Park-spezifische Vorlage
 * 3. Mandanten-Standard-Vorlage
 * 4. System-Default
 */

import { prisma } from "@/lib/prisma";
import { DEFAULT_DOCUMENT_LAYOUT, DocumentTemplateLayout } from "@/types/pdf";
import type { DocumentType } from "@prisma/client";
import { mergeWithLetterhead } from "./letterheadMerge";
import { logger } from "@/lib/logger";

/**
 * Deep-merge eines partiellen Layouts mit dem Default-Layout
 * Stellt sicher, dass alle Properties existieren
 */
function mergeLayoutWithDefaults(
  partial: Partial<DocumentTemplateLayout> | null | undefined
): DocumentTemplateLayout {
  if (!partial) {
    return DEFAULT_DOCUMENT_LAYOUT;
  }

  return {
    pageSize: partial.pageSize ?? DEFAULT_DOCUMENT_LAYOUT.pageSize,
    orientation: partial.orientation ?? DEFAULT_DOCUMENT_LAYOUT.orientation,
    sections: {
      header: {
        showLogo: partial.sections?.header?.showLogo ?? DEFAULT_DOCUMENT_LAYOUT.sections.header.showLogo,
        showCompanyName: partial.sections?.header?.showCompanyName ?? DEFAULT_DOCUMENT_LAYOUT.sections.header.showCompanyName,
        showCompanyAddress: partial.sections?.header?.showCompanyAddress ?? DEFAULT_DOCUMENT_LAYOUT.sections.header.showCompanyAddress,
      },
      recipient: {
        position: partial.sections?.recipient?.position ?? DEFAULT_DOCUMENT_LAYOUT.sections.recipient.position,
        showWindow: partial.sections?.recipient?.showWindow ?? DEFAULT_DOCUMENT_LAYOUT.sections.recipient.showWindow,
        windowOffsetTop: partial.sections?.recipient?.windowOffsetTop ?? DEFAULT_DOCUMENT_LAYOUT.sections.recipient.windowOffsetTop,
      },
      metadata: {
        showInvoiceNumber: partial.sections?.metadata?.showInvoiceNumber ?? DEFAULT_DOCUMENT_LAYOUT.sections.metadata.showInvoiceNumber,
        showDate: partial.sections?.metadata?.showDate ?? DEFAULT_DOCUMENT_LAYOUT.sections.metadata.showDate,
        showDueDate: partial.sections?.metadata?.showDueDate ?? DEFAULT_DOCUMENT_LAYOUT.sections.metadata.showDueDate,
        showServicePeriod: partial.sections?.metadata?.showServicePeriod ?? DEFAULT_DOCUMENT_LAYOUT.sections.metadata.showServicePeriod,
        showCustomerNumber: partial.sections?.metadata?.showCustomerNumber ?? DEFAULT_DOCUMENT_LAYOUT.sections.metadata.showCustomerNumber,
        showPaymentReference: partial.sections?.metadata?.showPaymentReference ?? DEFAULT_DOCUMENT_LAYOUT.sections.metadata.showPaymentReference,
        position: partial.sections?.metadata?.position ?? DEFAULT_DOCUMENT_LAYOUT.sections.metadata.position,
      },
      items: {
        showPosition: partial.sections?.items?.showPosition ?? DEFAULT_DOCUMENT_LAYOUT.sections.items.showPosition,
        showQuantity: partial.sections?.items?.showQuantity ?? DEFAULT_DOCUMENT_LAYOUT.sections.items.showQuantity,
        showUnit: partial.sections?.items?.showUnit ?? DEFAULT_DOCUMENT_LAYOUT.sections.items.showUnit,
        showUnitPrice: partial.sections?.items?.showUnitPrice ?? DEFAULT_DOCUMENT_LAYOUT.sections.items.showUnitPrice,
        showTaxRate: partial.sections?.items?.showTaxRate ?? DEFAULT_DOCUMENT_LAYOUT.sections.items.showTaxRate,
        showTaxAmount: partial.sections?.items?.showTaxAmount ?? DEFAULT_DOCUMENT_LAYOUT.sections.items.showTaxAmount,
        showGrossAmount: partial.sections?.items?.showGrossAmount ?? DEFAULT_DOCUMENT_LAYOUT.sections.items.showGrossAmount,
        groupByTaxRate: partial.sections?.items?.groupByTaxRate ?? DEFAULT_DOCUMENT_LAYOUT.sections.items.groupByTaxRate,
      },
      totals: {
        showNetTotal: partial.sections?.totals?.showNetTotal ?? DEFAULT_DOCUMENT_LAYOUT.sections.totals.showNetTotal,
        showTaxBreakdown: partial.sections?.totals?.showTaxBreakdown ?? DEFAULT_DOCUMENT_LAYOUT.sections.totals.showTaxBreakdown,
        showGrossTotal: partial.sections?.totals?.showGrossTotal ?? DEFAULT_DOCUMENT_LAYOUT.sections.totals.showGrossTotal,
      },
      footer: {
        showBankDetails: partial.sections?.footer?.showBankDetails ?? DEFAULT_DOCUMENT_LAYOUT.sections.footer.showBankDetails,
        showTaxDisclaimer: partial.sections?.footer?.showTaxDisclaimer ?? DEFAULT_DOCUMENT_LAYOUT.sections.footer.showTaxDisclaimer,
        showPaymentTerms: partial.sections?.footer?.showPaymentTerms ?? DEFAULT_DOCUMENT_LAYOUT.sections.footer.showPaymentTerms,
        customText: partial.sections?.footer?.customText ?? DEFAULT_DOCUMENT_LAYOUT.sections.footer.customText,
      },
    },
    fonts: {
      heading: partial.fonts?.heading ?? DEFAULT_DOCUMENT_LAYOUT.fonts.heading,
      body: partial.fonts?.body ?? DEFAULT_DOCUMENT_LAYOUT.fonts.body,
      mono: partial.fonts?.mono ?? DEFAULT_DOCUMENT_LAYOUT.fonts.mono,
    },
    locale: partial.locale ?? DEFAULT_DOCUMENT_LAYOUT.locale,
    dateFormat: partial.dateFormat ?? DEFAULT_DOCUMENT_LAYOUT.dateFormat,
    currencyFormat: partial.currencyFormat ?? DEFAULT_DOCUMENT_LAYOUT.currencyFormat,
    taxExemptDisclaimer: partial.taxExemptDisclaimer ?? DEFAULT_DOCUMENT_LAYOUT.taxExemptDisclaimer,
  };
}

export interface ResolvedTemplate {
  id: string | null;
  name: string;
  layout: DocumentTemplateLayout;
  footerText: string | null;
  customCss: string | null;
}

export interface ResolvedLetterhead {
  id: string | null;
  name: string;
  headerImageUrl: string | null;
  headerHeight: number;
  logoPosition: string;
  logoWidth: number;
  logoMarginTop: number;
  logoMarginLeft: number;
  senderAddress: string | null;
  companyInfo: Record<string, unknown> | null;
  footerImageUrl: string | null;
  footerHeight: number;
  footerText: string | null;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  primaryColor: string | null;
  secondaryColor: string | null;
  backgroundPdfKey: string | null;
  backgroundPdfName: string | null;
}

const DEFAULT_LETTERHEAD: ResolvedLetterhead = {
  id: null,
  name: "System Default",
  headerImageUrl: null,
  headerHeight: 100,
  logoPosition: "top-left",
  logoWidth: 50,
  logoMarginTop: 15,
  logoMarginLeft: 25,
  senderAddress: null,
  companyInfo: null,
  footerImageUrl: null,
  footerHeight: 25,
  footerText: null,
  marginTop: 45,
  marginBottom: 30,
  marginLeft: 25,
  marginRight: 20,
  primaryColor: null,
  secondaryColor: null,
  backgroundPdfKey: null,
  backgroundPdfName: null,
};

/**
 * Loedt die passende Dokumentvorlage mit Fallback-Kette
 */
export async function resolveTemplate(
  tenantId: string,
  documentType: DocumentType,
  parkId?: string | null
): Promise<ResolvedTemplate> {
  // 1. Park-spezifische Vorlage suchen
  if (parkId) {
    const parkTemplate = await prisma.documentTemplate.findFirst({
      where: {
        tenantId,
        documentType,
        parkId,
        isActive: true,
      },
      orderBy: { isDefault: "desc" },
    });

    if (parkTemplate) {
      return {
        id: parkTemplate.id,
        name: parkTemplate.name,
        layout: mergeLayoutWithDefaults(parkTemplate.layout as Partial<DocumentTemplateLayout>),
        footerText: parkTemplate.footerText,
        customCss: parkTemplate.customCss,
      };
    }
  }

  // 2. Mandanten-Standard-Vorlage suchen
  const tenantTemplate = await prisma.documentTemplate.findFirst({
    where: {
      tenantId,
      documentType,
      parkId: null,
      isActive: true,
    },
    orderBy: { isDefault: "desc" },
  });

  if (tenantTemplate) {
    return {
      id: tenantTemplate.id,
      name: tenantTemplate.name,
      layout: mergeLayoutWithDefaults(tenantTemplate.layout as Partial<DocumentTemplateLayout>),
      footerText: tenantTemplate.footerText,
      customCss: tenantTemplate.customCss,
    };
  }

  // 3. System-Default
  return {
    id: null,
    name: "System Default",
    layout: DEFAULT_DOCUMENT_LAYOUT,
    footerText: null,
    customCss: null,
  };
}

/**
 * Loedt das passende Briefpapier mit Fallback-Kette:
 * Fund → Park → Tenant → System-Default
 */
export async function resolveLetterhead(
  tenantId: string,
  parkId?: string | null,
  fundId?: string | null
): Promise<ResolvedLetterhead> {
  // 1. Fund-spezifisches Briefpapier suchen (Firmen-Briefpapier)
  if (fundId) {
    const fundLetterhead = await prisma.letterhead.findFirst({
      where: {
        tenantId,
        fundId,
        isActive: true,
      },
      orderBy: { isDefault: "desc" },
    });

    if (fundLetterhead) {
      return mapLetterhead(fundLetterhead);
    }
  }

  // 2. Park-spezifisches Briefpapier suchen
  if (parkId) {
    const parkLetterhead = await prisma.letterhead.findFirst({
      where: {
        tenantId,
        parkId,
        fundId: null,
        isActive: true,
      },
      orderBy: { isDefault: "desc" },
    });

    if (parkLetterhead) {
      return mapLetterhead(parkLetterhead);
    }
  }

  // 3. Mandanten-Standard-Briefpapier suchen
  const tenantLetterhead = await prisma.letterhead.findFirst({
    where: {
      tenantId,
      parkId: null,
      fundId: null,
      isActive: true,
    },
    orderBy: { isDefault: "desc" },
  });

  if (tenantLetterhead) {
    return mapLetterhead(tenantLetterhead);
  }

  // 4. System-Default
  return DEFAULT_LETTERHEAD;
}

/**
 * Loedt Template und Letterhead zusammen
 */
export async function resolveTemplateAndLetterhead(
  tenantId: string,
  documentType: DocumentType,
  parkId?: string | null,
  fundId?: string | null
): Promise<{
  template: ResolvedTemplate;
  letterhead: ResolvedLetterhead;
}> {
  const [template, letterhead] = await Promise.all([
    resolveTemplate(tenantId, documentType, parkId),
    resolveLetterhead(tenantId, parkId, fundId),
  ]);

  return { template, letterhead };
}

// Helper: Prisma-Modell zu ResolvedLetterhead mappen
function mapLetterhead(letterhead: {
  id: string;
  name: string;
  headerImageUrl: string | null;
  headerHeight: number | null;
  logoPosition: string;
  logoWidth: number | null;
  logoMarginTop: number | null;
  logoMarginLeft: number | null;
  senderAddress: string | null;
  companyInfo: unknown;
  footerImageUrl: string | null;
  footerHeight: number | null;
  footerText: string | null;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  primaryColor: string | null;
  secondaryColor: string | null;
  backgroundPdfKey: string | null;
  backgroundPdfName: string | null;
}): ResolvedLetterhead {
  return {
    id: letterhead.id,
    name: letterhead.name,
    headerImageUrl: letterhead.headerImageUrl,
    headerHeight: letterhead.headerHeight ?? 100,
    logoPosition: letterhead.logoPosition,
    logoWidth: letterhead.logoWidth ?? 50,
    logoMarginTop: letterhead.logoMarginTop ?? 15,
    logoMarginLeft: letterhead.logoMarginLeft ?? 25,
    senderAddress: letterhead.senderAddress,
    companyInfo: letterhead.companyInfo as Record<string, unknown> | null,
    footerImageUrl: letterhead.footerImageUrl,
    footerHeight: letterhead.footerHeight ?? 25,
    footerText: letterhead.footerText,
    marginTop: letterhead.marginTop,
    marginBottom: letterhead.marginBottom,
    marginLeft: letterhead.marginLeft,
    marginRight: letterhead.marginRight,
    primaryColor: letterhead.primaryColor,
    secondaryColor: letterhead.secondaryColor,
    backgroundPdfKey: letterhead.backgroundPdfKey,
    backgroundPdfName: letterhead.backgroundPdfName,
  };
}

/**
 * Wendet ein Briefpapier-Hintergrund-PDF auf einen Content-Buffer an.
 * Faellt durch zum originalen Buffer wenn kein Hintergrund-PDF konfiguriert ist.
 * Bei Fehlern wird der Content-only Buffer zurueckgegeben (graceful degradation).
 */
export async function applyLetterheadBackground(
  contentBuffer: Buffer | Uint8Array,
  letterhead: ResolvedLetterhead
): Promise<Buffer> {
  if (!letterhead.backgroundPdfKey) {
    return Buffer.from(contentBuffer);
  }

  try {
    return await mergeWithLetterhead(contentBuffer, letterhead.backgroundPdfKey);
  } catch (error) {
    logger.error(
      { err: error, letterheadId: letterhead.id },
      "Fehler beim Mergen des Briefpapier-Hintergrunds, verwende Content-only PDF"
    );
    return Buffer.from(contentBuffer);
  }
}
