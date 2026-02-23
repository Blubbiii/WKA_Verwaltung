import { Document, Page, View, StyleSheet } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { ResolvedLetterhead } from "../utils/templateResolver";
import type { DocumentTemplateLayout } from "@/types/pdf";
import { Header } from "./components/Header";
import { Footer, PageNumber } from "./components/Footer";
import { Watermark } from "./components/Watermark";
import type { WatermarkProps } from "../utils/watermark";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#333333",
  },
  content: {
    flex: 1,
  },
});

export interface BasePageProps {
  children: ReactNode;
  letterhead: ResolvedLetterhead;
  layout: DocumentTemplateLayout;
  companyName?: string;
  bankDetails?: {
    bankName?: string;
    iban?: string;
    bic?: string;
  };
  companyInfo?: {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
    taxId?: string;
    vatId?: string;
    registrationCourt?: string;
    registrationNumber?: string;
    managingDirector?: string;
  };
  customFooterText?: string | null;
  showTaxExempt?: boolean;
  /** Watermark configuration */
  watermark?: WatermarkProps;
}

/**
 * Single page with header, footer, page number and watermark.
 * Use inside a <Document> wrapper when building multi-page PDFs.
 */
export function BasePage({
  children,
  letterhead,
  layout,
  companyName,
  bankDetails,
  companyInfo,
  customFooterText,
  showTaxExempt,
  watermark,
}: BasePageProps) {
  const pageSize = layout.pageSize === "LETTER" ? "LETTER" : "A4";

  const pageDimensions = pageSize === "A4"
    ? { width: 595.28, height: 841.89 }
    : { width: 612, height: 792 };

  // When a background PDF is configured, the letterhead already contains
  // header/footer graphics, so we skip rendering them and leave the page
  // background transparent so the letterhead shows through.
  const hasBackground = !!letterhead.backgroundPdfKey;

  return (
    <Page
      size={pageSize}
      style={[
        styles.page,
        hasBackground ? {} : { backgroundColor: "#FFFFFF" },
        {
          paddingTop: letterhead.marginTop,
          paddingBottom: hasBackground
            ? letterhead.marginBottom
            : letterhead.marginBottom + letterhead.footerHeight,
          paddingLeft: letterhead.marginLeft,
          paddingRight: letterhead.marginRight,
        },
      ]}
    >
      {/* Header (fixiert am oberen Rand) - skip when background PDF provides it */}
      {!hasBackground && (
        <Header
          letterhead={letterhead}
          layout={layout}
          companyName={companyName}
        />
      )}

      {/* Hauptinhalt */}
      <View style={styles.content}>{children}</View>

      {/* Footer (fixiert am unteren Rand) - skip when background PDF provides it */}
      {!hasBackground && (
        <Footer
          letterhead={letterhead}
          layout={layout}
          bankDetails={bankDetails}
          companyInfo={companyInfo}
          customText={customFooterText}
          showTaxExempt={showTaxExempt}
        />
      )}

      {/* Seitenzahl */}
      <PageNumber />

      {/* Wasserzeichen (ueber allem, auf jeder Seite) */}
      {watermark && (
        <Watermark
          type={watermark.type}
          customText={watermark.customText}
          opacity={watermark.opacity}
          color={watermark.color}
          pageWidth={pageDimensions.width}
          pageHeight={pageDimensions.height}
        />
      )}
    </Page>
  );
}

type BaseDocumentProps = BasePageProps;

/**
 * Single-page document wrapper (backwards compatible).
 * For multi-page PDFs, use <Document> + multiple <BasePage> directly.
 */
export function BaseDocument(props: BaseDocumentProps) {
  return (
    <Document>
      <BasePage {...props} />
    </Document>
  );
}
