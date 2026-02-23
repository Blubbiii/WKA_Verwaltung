import { Document, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { ResolvedLetterhead, ResolvedTemplate } from "../utils/templateResolver";
import type { InvoicePdfData, LetterheadCompanyInfo } from "@/types/pdf";
import { BasePage } from "./BaseDocument";
import { RecipientBlock } from "./components/RecipientBlock";
import { ItemsTable, type InvoiceItem } from "./components/ItemsTable";
import { SettlementAttachment } from "./components/SettlementAttachment";
import { formatDate, formatPeriod, calculateTotals, formatCurrency } from "../utils/formatters";
import type { WatermarkProps } from "../utils/watermark";

const styles = StyleSheet.create({
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
    width: 100,
    textAlign: "right",
    marginRight: 10,
  },
  metaValue: {
    fontSize: 9,
    width: 100,
  },
  documentTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 5,
    marginTop: 10,
  },
  documentSubtitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 15,
  },
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
  skontoInfo: {
    marginTop: 15,
    padding: 10,
    backgroundColor: "#F0F7F0",
    borderRadius: 3,
    borderWidth: 0.5,
    borderColor: "#4CAF50",
  },
  skontoLabel: {
    fontSize: 9,
    fontWeight: "bold",
    marginBottom: 5,
    color: "#2E7D32",
  },
  skontoText: {
    fontSize: 9,
    lineHeight: 1.4,
  },
  correctionInfo: {
    marginBottom: 15,
    padding: 10,
    backgroundColor: "#FFF8E1",
    borderRadius: 3,
    borderWidth: 0.5,
    borderColor: "#F9A825",
  },
  correctionLabel: {
    fontSize: 9,
    fontWeight: "bold",
    marginBottom: 3,
    color: "#E65100",
  },
  correctionText: {
    fontSize: 9,
    lineHeight: 1.4,
    color: "#333333",
  },
});

interface InvoiceTemplateProps {
  invoice: InvoicePdfData;
  template: ResolvedTemplate;
  letterhead: ResolvedLetterhead;
  /** Watermark configuration (optional) */
  watermark?: WatermarkProps;
  /** Auto-generated or manual company info for header/footer */
  companyInfo?: LetterheadCompanyInfo;
}

export function InvoiceTemplate({ invoice, template, letterhead, watermark, companyInfo }: InvoiceTemplateProps) {
  const layout = template.layout;

  // Dokumenttyp-Titel (with correction type prefix)
  const getDocumentTitle = () => {
    if (invoice.correctionType === "PARTIAL_CANCEL") {
      return "Teilstorno-Gutschrift";
    }
    if (invoice.correctionType === "CORRECTION" && invoice.invoiceType === "CREDIT_NOTE") {
      return "Korrekturgutschrift";
    }
    if (invoice.correctionType === "CORRECTION") {
      return "Korrekturrechnung";
    }
    switch (invoice.invoiceType) {
      case "CREDIT_NOTE":
        return "Gutschrift";
      default:
        return "Rechnung";
    }
  };

  // Items fuer Tabelle vorbereiten
  const tableItems: InvoiceItem[] = invoice.items.map((item, index) => ({
    position: index + 1,
    description: item.description,
    quantity: item.quantity ?? undefined,
    unit: item.unit ?? undefined,
    unitPrice: item.unitPrice ?? undefined,
    taxRate: item.taxRate,
    netAmount: item.netAmount,
  }));

  // Summen berechnen
  const totals = calculateTotals(
    invoice.items.map((item) => ({
      netAmount: item.netAmount,
      taxRate: item.taxRate,
    }))
  );

  // Steuerbefreiung pruefen (alle Items mit 0% MwSt)
  const isTaxExempt = invoice.items.every((item) => item.taxRate === 0);

  // Empfaenger-Daten
  // Address is stored as newline-separated: "Strasse 5\n27246 Borstel"
  // Fallback: also handle comma-separated legacy format
  const rawAddress = invoice.recipientAddress ?? "";
  const addressLines = rawAddress.includes("\n")
    ? rawAddress.split("\n")
    : rawAddress.split(", ");
  const recipient = {
    companyName: invoice.recipientName || "",
    street: addressLines[0] || undefined,
    postalCode: addressLines[1]?.match(/^(\d{5})/)?.[1] || undefined,
    city: addressLines[1]?.replace(/^\d{5}\s*/, "") || undefined,
    country: addressLines[2] || undefined,
  };

  // Bank details: prioritize Fund (companyInfo) > Tenant
  const bankDetails = companyInfo?.bankDetails
    ? {
        bankName: companyInfo.bankDetails.bankName ?? undefined,
        iban: companyInfo.bankDetails.iban ?? undefined,
        bic: companyInfo.bankDetails.bic ?? undefined,
      }
    : invoice.tenant
      ? {
          bankName: invoice.tenant.bankName ?? undefined,
          iban: invoice.tenant.iban ?? undefined,
          bic: invoice.tenant.bic ?? undefined,
        }
      : undefined;

  // Company name: prioritize Fund name > Tenant name
  const companyName = companyInfo?.name || invoice.tenant?.name || undefined;

  // Flatten companyInfo for Footer component
  const footerCompanyInfo = companyInfo
    ? {
        name: companyInfo.name,
        address: companyInfo.address
          ? [
              companyInfo.address.street,
              `${companyInfo.address.postalCode} ${companyInfo.address.city}`.trim(),
            ]
              .filter(Boolean)
              .join(", ")
          : undefined,
        phone: companyInfo.contact?.phone,
        email: companyInfo.contact?.email,
        website: companyInfo.contact?.website,
        taxId: companyInfo.taxInfo?.taxId,
        vatId: companyInfo.taxInfo?.vatId,
        registrationCourt: companyInfo.registration?.court,
        registrationNumber: companyInfo.registration?.registerNumber,
        managingDirector: companyInfo.management?.join(", "),
      }
    : undefined;

  // Check if settlement attachment page is needed (FINAL or ENERGY with data)
  const sd = invoice.settlementDetails;
  const hasAttachment = (sd?.type === "FINAL" || sd?.type === "ENERGY") && (
    (sd.revenueTable && sd.revenueTable.length > 0) ||
    !!sd.calculationSummary ||
    !!sd.energyDistribution ||
    (sd.turbineProductions && sd.turbineProductions.length > 0)
  );

  // Auto-generate sender line from companyInfo if letterhead has none
  const senderAddress = letterhead.senderAddress
    || (companyInfo
      ? [
          companyInfo.name,
          companyInfo.address?.street,
          `${companyInfo.address?.postalCode ?? ""} ${companyInfo.address?.city ?? ""}`.trim(),
        ]
          .filter(Boolean)
          .join(" \u00B7 ")
      : undefined);

  // Shared page props
  const pageProps = {
    letterhead: { ...letterhead, senderAddress: senderAddress ?? null },
    layout,
    companyName,
    bankDetails,
    companyInfo: footerCompanyInfo,
    customFooterText: template.footerText,
    showTaxExempt: isTaxExempt,
    watermark,
  };

  return (
    <Document>
      {/* Seite 1: Gutschrift */}
      <BasePage {...pageProps}>
        {/* Empfaengerblock */}
        <RecipientBlock
          recipient={recipient}
          layout={layout}
          marginLeft={0}
          senderLine={letterhead.senderAddress ?? undefined}
        />

        {/* Metadaten (rechts) */}
        <View style={styles.metaSection}>
          <View>
            {/* Platzhalter links */}
          </View>
          <View style={styles.metaBlock}>
            {layout.sections.metadata.showDate && (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Rechnungsdatum:</Text>
                <Text style={styles.metaValue}>{formatDate(invoice.invoiceDate)}</Text>
              </View>
            )}
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Rechnungsnummer:</Text>
              <Text style={styles.metaValue}>{invoice.invoiceNumber || "-"}</Text>
            </View>
            {layout.sections.metadata.showDueDate && invoice.dueDate && (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Faellig bis:</Text>
                <Text style={styles.metaValue}>{formatDate(invoice.dueDate)}</Text>
              </View>
            )}
            {invoice.serviceStartDate && invoice.serviceEndDate && (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Abrechnungszeitraum:</Text>
                <Text style={styles.metaValue}>
                  {formatPeriod(invoice.serviceStartDate, invoice.serviceEndDate)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Dokumenttitel */}
        <Text style={styles.documentTitle}>
          {getDocumentTitle()} {invoice.invoiceNumber}
        </Text>

        {/* Dokumentuntertitel (Settlement) */}
        {invoice.settlementDetails?.subtitle && (
          <Text style={styles.documentSubtitle}>
            {invoice.settlementDetails.subtitle}
          </Text>
        )}

        {/* Korrektur-Referenz (shown on correction/partial cancel credit notes) */}
        {invoice.correctionOfInvoiceNumber && (
          <View style={styles.correctionInfo}>
            <Text style={styles.correctionLabel}>
              {invoice.correctionType === "PARTIAL_CANCEL"
                ? "Teilstornierung"
                : invoice.correctionType === "CORRECTION"
                  ? "Rechnungskorrektur"
                  : "Stornierung"}
            </Text>
            <Text style={styles.correctionText}>
              Korrektur zu Rechnung {invoice.correctionOfInvoiceNumber}
            </Text>
            {invoice.correctionReason && (
              <Text style={styles.correctionText}>
                Grund: {invoice.correctionReason}
              </Text>
            )}
          </View>
        )}

        {/* Notizen */}
        {invoice.notes && (
          <Text style={styles.introText}>{invoice.notes}</Text>
        )}

        {/* Positionen-Tabelle */}
        <ItemsTable items={tableItems} layout={layout} totals={totals} />

        {/* Anlage-Hinweis (wenn Anlage vorhanden) */}
        {hasAttachment && (
          <Text style={styles.introText}>
            Berechnungsgrundlagen siehe Anlage 1.
          </Text>
        )}

        {/* Skonto-Hinweis */}
        {invoice.skontoPercent && invoice.skontoDeadline && invoice.skontoAmount && !invoice.skontoPaid && (
          <View style={styles.skontoInfo}>
            <Text style={styles.skontoLabel}>Skonto</Text>
            <Text style={styles.skontoText}>
              Bei Zahlung bis zum {formatDate(invoice.skontoDeadline)} gewaehren wir {
                new Intl.NumberFormat("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(invoice.skontoPercent)
              }% Skonto.
            </Text>
            <Text style={styles.skontoText}>
              Skonto-Betrag: {formatCurrency(invoice.skontoAmount)} | Zahlbetrag bei Skonto: {
                formatCurrency(invoice.grossAmount - invoice.skontoAmount)
              }
            </Text>
          </View>
        )}

        {/* Zahlungsinformationen */}
        {invoice.paymentText && (
          <View style={styles.paymentInfo}>
            <Text style={styles.paymentLabel}>
              {invoice.invoiceType === "CREDIT_NOTE" ? "Gutschriftshinweis" : "Zahlungsbedingungen"}
            </Text>
            <Text style={styles.paymentText}>
              {invoice.paymentText}
            </Text>
          </View>
        )}
      </BasePage>

      {/* Seite 2: Anlage (nur bei FINAL mit Berechnungsdaten) */}
      {hasAttachment && sd && (
        <BasePage {...pageProps}>
          <SettlementAttachment
            invoiceNumber={invoice.invoiceNumber}
            details={sd}
          />
        </BasePage>
      )}
    </Document>
  );
}
