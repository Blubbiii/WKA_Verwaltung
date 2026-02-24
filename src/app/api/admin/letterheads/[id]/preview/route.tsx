import React from "react";
import { NextRequest, NextResponse } from "next/server";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { Header } from "@/lib/pdf/templates/components/Header";
import { Footer, PageNumber } from "@/lib/pdf/templates/components/Footer";
import { DEFAULT_DOCUMENT_LAYOUT } from "@/types/pdf";
import {
  applyLetterheadBackground,
  type ResolvedLetterhead,
} from "@/lib/pdf/utils/templateResolver";
import type { DocumentTemplateLayout } from "@/types/pdf";

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#333333",
  },
  content: {
    flex: 1,
  },
  // -- Recipient address block (DIN 5008) --
  recipientContainer: {
    marginTop: 50,
    marginBottom: 20,
  },
  recipientWindow: {
    width: 240, // ~85mm Adressfenster (85mm ≈ 241pt)
    height: 55,
    paddingTop: 5,
  },
  senderLine: {
    fontSize: 6,
    color: "#999999",
    marginBottom: 4,
    textDecoration: "underline",
  },
  recipientLine: {
    fontSize: 10,
    lineHeight: 1.4,
  },
  recipientBold: {
    fontSize: 10,
    fontWeight: "bold",
    lineHeight: 1.4,
  },
  // -- Meta section (right-aligned) --
  metaSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  metaBlock: {
    alignItems: "flex-end",
  },
  metaRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  metaLabel: {
    fontSize: 9,
    color: "#666666",
    width: 110,
    textAlign: "right",
    marginRight: 10,
  },
  metaValue: {
    fontSize: 9,
    width: 100,
  },
  // -- Document title --
  documentTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 5,
    marginTop: 10,
  },
  // -- Intro/outro text --
  introText: {
    fontSize: 9,
    marginBottom: 15,
    lineHeight: 1.4,
  },
  outroText: {
    fontSize: 9,
    marginTop: 20,
    lineHeight: 1.4,
  },
  // -- Positions table --
  tableContainer: {
    marginTop: 10,
    marginBottom: 10,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    borderBottomWidth: 1,
    borderBottomColor: "#D1D5DB",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#E5E7EB",
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  // -- Column widths --
  colPos: { width: "8%", fontSize: 9 },
  colDesc: { width: "42%", fontSize: 9 },
  colQty: { width: "10%", fontSize: 9, textAlign: "right" },
  colUnit: { width: "10%", fontSize: 9, textAlign: "right" },
  colTax: { width: "10%", fontSize: 9, textAlign: "right" },
  colAmount: { width: "20%", fontSize: 9, textAlign: "right" },
  headerText: { fontWeight: "bold", fontSize: 9 },
  // -- Totals --
  totalsContainer: {
    marginTop: 8,
    alignItems: "flex-end",
  },
  totalsRow: {
    flexDirection: "row",
    width: 220,
    justifyContent: "space-between",
    marginBottom: 3,
  },
  totalsLabel: { fontSize: 9, color: "#666666" },
  totalsValue: { fontSize: 9 },
  totalsDivider: {
    width: 220,
    borderTopWidth: 1.5,
    borderTopColor: "#333333",
    marginVertical: 4,
  },
  totalsBoldLabel: { fontSize: 10, fontWeight: "bold" },
  totalsBoldValue: { fontSize: 10, fontWeight: "bold" },
  // -- Payment info box --
  paymentInfo: {
    marginTop: 20,
    padding: 10,
    backgroundColor: "#F8F8F8",
    borderRadius: 3,
  },
  paymentLabel: {
    fontSize: 9,
    fontWeight: "bold",
    marginBottom: 5,
  },
  paymentText: {
    fontSize: 9,
    lineHeight: 1.4,
  },
});

// ---------------------------------------------------------------------------
// Helper: Map Prisma letterhead record to ResolvedLetterhead
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helper: Format today as dd.MM.yyyy
// ---------------------------------------------------------------------------

function formatDateDE(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  return `${day}.${month}.${year}`;
}

// ---------------------------------------------------------------------------
// Sample invoice data
// ---------------------------------------------------------------------------

const SAMPLE_ITEMS = [
  { pos: "1", desc: "Einspeisevergütung Januar 2025", qty: "125.340", unit: "kWh", tax: "0,00 %", net: "10.528,56" },
  { pos: "2", desc: "Einspeisevergütung Februar 2025", qty: "98.760", unit: "kWh", tax: "0,00 %", net: "8.295,84" },
  { pos: "3", desc: "Einspeisevergütung Maerz 2025", qty: "142.180", unit: "kWh", tax: "0,00 %", net: "11.943,12" },
  { pos: "4", desc: "Direktvermarktungsentgelt Q1/2025", qty: "1", unit: "psch.", tax: "19,00 %", net: "-1.250,00" },
];

const SAMPLE_RECIPIENT = {
  senderLine: "Windpark Musterstadt GmbH & Co. KG - Am Windfeld 12 - 30159 Hannover",
  company: "Betreibergesellschaft Windenergie",
  name: "Musterpark GmbH & Co. KG",
  street: "Industriestrasse 45",
  zip: "26789",
  city: "Leer (Ostfriesland)",
};

// ---------------------------------------------------------------------------
// Preview PDF Document Component
// ---------------------------------------------------------------------------

interface PreviewDocumentProps {
  letterhead: ResolvedLetterhead;
  layout: DocumentTemplateLayout;
}

function PreviewDocument({ letterhead, layout }: PreviewDocumentProps) {
  const dateStr = formatDateDE();
  const invoiceNo = "GS-2025-00042";
  const dueDate = "15.04.2025";

  // When a background PDF is configured, the letterhead already contains
  // header/footer graphics, so we skip rendering them and leave the page
  // background transparent so the letterhead shows through.
  const hasBackground = !!letterhead.backgroundPdfKey;

  return (
    <Document title={`Briefpapier-Vorschau: ${letterhead.name}`}>
      <Page
        size="A4"
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
        {/* Header (skip when background PDF provides it) */}
        {!hasBackground && <Header letterhead={letterhead} layout={layout} />}

        {/* Content area */}
        <View style={styles.content}>
          {/* Recipient address block (DIN 5008) */}
          <View style={styles.recipientContainer}>
            <View style={styles.recipientWindow}>
              <Text style={styles.senderLine}>{SAMPLE_RECIPIENT.senderLine}</Text>
              <Text style={styles.recipientBold}>{SAMPLE_RECIPIENT.company}</Text>
              <Text style={styles.recipientLine}>{SAMPLE_RECIPIENT.name}</Text>
              <Text style={styles.recipientLine}>{SAMPLE_RECIPIENT.street}</Text>
              <Text style={styles.recipientLine}>{SAMPLE_RECIPIENT.zip} {SAMPLE_RECIPIENT.city}</Text>
            </View>
          </View>

          {/* Meta data (right-aligned) */}
          <View style={styles.metaSection}>
            <View />
            <View style={styles.metaBlock}>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Gutschriftsdatum:</Text>
                <Text style={styles.metaValue}>{dateStr}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Gutschriftsnummer:</Text>
                <Text style={styles.metaValue}>{invoiceNo}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Fällig bis:</Text>
                <Text style={styles.metaValue}>{dueDate}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Abrechnungszeitraum:</Text>
                <Text style={styles.metaValue}>01.01.2025 - 31.03.2025</Text>
              </View>
            </View>
          </View>

          {/* Document title */}
          <Text style={styles.documentTitle}>Gutschrift {invoiceNo}</Text>

          {/* Intro text */}
          <Text style={styles.introText}>
            Sehr geehrte Damen und Herren, hiermit erhalten Sie die Gutschrift
            für die Einspeisevergütung des 1. Quartals 2025 gemaess
            Einspeisevertrag vom 15.03.2018.
          </Text>

          {/* Positions table */}
          <View style={styles.tableContainer}>
            <View style={styles.tableHeader}>
              <Text style={[styles.colPos, styles.headerText]}>Pos.</Text>
              <Text style={[styles.colDesc, styles.headerText]}>Beschreibung</Text>
              <Text style={[styles.colQty, styles.headerText]}>Menge</Text>
              <Text style={[styles.colUnit, styles.headerText]}>Einheit</Text>
              <Text style={[styles.colTax, styles.headerText]}>MwSt.</Text>
              <Text style={[styles.colAmount, styles.headerText]}>Netto EUR</Text>
            </View>

            {SAMPLE_ITEMS.map((item) => (
              <View style={styles.tableRow} key={item.pos}>
                <Text style={styles.colPos}>{item.pos}</Text>
                <Text style={styles.colDesc}>{item.desc}</Text>
                <Text style={styles.colQty}>{item.qty}</Text>
                <Text style={styles.colUnit}>{item.unit}</Text>
                <Text style={styles.colTax}>{item.tax}</Text>
                <Text style={styles.colAmount}>{item.net}</Text>
              </View>
            ))}
          </View>

          {/* Totals */}
          <View style={styles.totalsContainer}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Nettobetrag:</Text>
              <Text style={styles.totalsValue}>29.517,52 EUR</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>zzgl. 19% MwSt. auf -1.250,00:</Text>
              <Text style={styles.totalsValue}>-237,50 EUR</Text>
            </View>
            <View style={styles.totalsDivider} />
            <View style={styles.totalsRow}>
              <Text style={styles.totalsBoldLabel}>Gutschriftsbetrag:</Text>
              <Text style={styles.totalsBoldValue}>29.280,02 EUR</Text>
            </View>
          </View>

          {/* Payment info */}
          <View style={styles.paymentInfo}>
            <Text style={styles.paymentLabel}>Gutschriftshinweis</Text>
            <Text style={styles.paymentText}>
              Der Gutschriftsbetrag wird innerhalb von 14 Werktagen auf das uns
              bekannte Konto der Betreibergesellschaft überwiesen.
            </Text>
          </View>

          {/* Closing */}
          <Text style={styles.outroText}>
            Diese Gutschrift wurde maschinell erstellt und ist ohne
            Unterschrift gültig.
          </Text>
        </View>

        {/* Footer (skip when background PDF provides it) */}
        {!hasBackground && <Footer letterhead={letterhead} layout={layout} />}

        {/* Page number */}
        {!hasBackground && <PageNumber />}
      </Page>
    </Document>
  );
}

// ---------------------------------------------------------------------------
// GET /api/admin/letterheads/[id]/preview
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const letterhead = await prisma.letterhead.findUnique({
      where: { id },
    });

    if (!letterhead) {
      return NextResponse.json(
        { error: "Briefpapier nicht gefunden" },
        { status: 404 }
      );
    }

    if (letterhead.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    const resolved = mapLetterhead(letterhead);
    const layout = DEFAULT_DOCUMENT_LAYOUT;

    const rawBuffer = await renderToBuffer(
      <PreviewDocument letterhead={resolved} layout={layout} />
    );
    const pdfBuffer = await applyLetterheadBackground(rawBuffer, resolved);

    const pdfResponseBody = new Uint8Array(pdfBuffer);
    return new NextResponse(pdfResponseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="briefpapier-vorschau-${id}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error generating letterhead preview PDF");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Briefpapier-Vorschau" },
      { status: 500 }
    );
  }
}
