import { View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { ResolvedLetterhead } from "../../utils/templateResolver";
import type { DocumentTemplateLayout } from "@/types/pdf";

const styles = StyleSheet.create({
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  footerImage: {
    width: "100%",
    objectFit: "cover",
  },
  footerContent: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#CCCCCC",
  },
  footerColumns: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerColumn: {
    flex: 1,
    paddingHorizontal: 5,
  },
  footerLabel: {
    fontSize: 7,
    fontWeight: "bold",
    color: "#666666",
    marginBottom: 2,
  },
  footerText: {
    fontSize: 7,
    color: "#666666",
    lineHeight: 1.3,
  },
  taxDisclaimer: {
    marginTop: 15,
    padding: 10,
    backgroundColor: "#F5F5F5",
    borderRadius: 3,
  },
  taxDisclaimerText: {
    fontSize: 8,
    fontStyle: "italic",
    color: "#666666",
  },
  customFooterText: {
    marginTop: 10,
    fontSize: 8,
    color: "#666666",
  },
  pageNumber: {
    position: "absolute",
    bottom: 10,
    right: 10,
    fontSize: 8,
    color: "#999999",
  },
});

interface BankDetails {
  bankName?: string;
  iban?: string;
  bic?: string;
}

interface CompanyInfo {
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
}

interface FooterProps {
  letterhead: ResolvedLetterhead;
  layout: DocumentTemplateLayout;
  bankDetails?: BankDetails;
  companyInfo?: CompanyInfo;
  customText?: string | null;
  showTaxExempt?: boolean;
}

export function Footer({
  letterhead,
  layout,
  bankDetails,
  companyInfo,
  customText,
  showTaxExempt,
}: FooterProps) {
  const { showBankDetails, showTaxDisclaimer } = layout.sections.footer;

  // CompanyInfo aus Letterhead oder uebergebene Daten
  const info = (letterhead.companyInfo as CompanyInfo) || companyInfo || {};

  return (
    <View style={[styles.footer, { marginBottom: letterhead.marginBottom }]}>
      {/* Footer-Bild */}
      {letterhead.footerImageUrl && (
        <Image
          src={letterhead.footerImageUrl}
          style={[styles.footerImage, { height: letterhead.footerHeight }]}
        />
      )}

      {/* Steuerbefreiungs-Hinweis */}
      {showTaxDisclaimer && showTaxExempt && (
        <View
          style={[
            styles.taxDisclaimer,
            {
              marginLeft: letterhead.marginLeft,
              marginRight: letterhead.marginRight,
            },
          ]}
        >
          <Text style={styles.taxDisclaimerText}>
            {layout.taxExemptDisclaimer}
          </Text>
        </View>
      )}

      {/* Benutzerdefinierter Fusszeilen-Text */}
      {customText && (
        <Text
          style={[
            styles.customFooterText,
            {
              marginLeft: letterhead.marginLeft,
              marginRight: letterhead.marginRight,
            },
          ]}
        >
          {customText}
        </Text>
      )}

      {/* Letterhead Fusszeilen-Text */}
      {letterhead.footerText && (
        <Text
          style={[
            styles.customFooterText,
            {
              marginLeft: letterhead.marginLeft,
              marginRight: letterhead.marginRight,
            },
          ]}
        >
          {letterhead.footerText}
        </Text>
      )}

      {/* Spalten mit Firmendaten und Bankverbindung */}
      {(showBankDetails || info.name) && (
        <View
          style={[
            styles.footerContent,
            {
              marginLeft: letterhead.marginLeft,
              marginRight: letterhead.marginRight,
            },
          ]}
        >
          <View style={styles.footerColumns}>
            {/* Spalte 1: Firma */}
            <View style={styles.footerColumn}>
              {info.name && (
                <>
                  <Text style={styles.footerLabel}>Firma</Text>
                  <Text style={styles.footerText}>{info.name}</Text>
                  {info.address && <Text style={styles.footerText}>{info.address}</Text>}
                </>
              )}
            </View>

            {/* Spalte 2: Kontakt */}
            <View style={styles.footerColumn}>
              {(info.phone || info.email) && (
                <>
                  <Text style={styles.footerLabel}>Kontakt</Text>
                  {info.phone && <Text style={styles.footerText}>Tel: {info.phone}</Text>}
                  {info.email && <Text style={styles.footerText}>{info.email}</Text>}
                  {info.website && <Text style={styles.footerText}>{info.website}</Text>}
                </>
              )}
            </View>

            {/* Spalte 3: Bankverbindung */}
            {showBankDetails && bankDetails && (
              <View style={styles.footerColumn}>
                <Text style={styles.footerLabel}>Bankverbindung</Text>
                {bankDetails.bankName && (
                  <Text style={styles.footerText}>{bankDetails.bankName}</Text>
                )}
                {bankDetails.iban && (
                  <Text style={styles.footerText}>IBAN: {bankDetails.iban}</Text>
                )}
                {bankDetails.bic && (
                  <Text style={styles.footerText}>BIC: {bankDetails.bic}</Text>
                )}
              </View>
            )}

            {/* Spalte 4: Rechtliches */}
            <View style={styles.footerColumn}>
              {(info.taxId || info.vatId || info.registrationNumber) && (
                <>
                  <Text style={styles.footerLabel}>Rechtliches</Text>
                  {info.taxId && (
                    <Text style={styles.footerText}>St.-Nr.: {info.taxId}</Text>
                  )}
                  {info.vatId && (
                    <Text style={styles.footerText}>USt-IdNr.: {info.vatId}</Text>
                  )}
                  {(info.registrationCourt || info.registrationNumber) && (
                    <Text style={styles.footerText}>
                      {[info.registrationCourt, info.registrationNumber].filter(Boolean).join(" ")}
                    </Text>
                  )}
                  {info.managingDirector && (
                    <Text style={styles.footerText}>GF: {info.managingDirector}</Text>
                  )}
                </>
              )}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

// Seitenzahl-Komponente (separat verwendbar)
export function PageNumber() {
  return (
    <Text
      style={styles.pageNumber}
      render={({ pageNumber, totalPages }) => `Seite ${pageNumber} von ${totalPages}`}
      fixed
    />
  );
}
