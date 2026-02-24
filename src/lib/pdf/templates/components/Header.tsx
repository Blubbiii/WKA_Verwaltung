import { View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { ResolvedLetterhead } from "../../utils/templateResolver";
import type { DocumentTemplateLayout } from "@/types/pdf";

const styles = StyleSheet.create({
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  headerImage: {
    width: "100%",
    objectFit: "cover",
  },
  logoContainer: {
    position: "absolute",
  },
  logo: {
    objectFit: "contain",
  },
  companyName: {
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 15,
  },
  senderLine: {
    fontSize: 7,
    color: "#666666",
    marginTop: 45,
    marginBottom: 5,
    textDecoration: "underline",
    textDecorationColor: "#666666",
  },
});

interface HeaderProps {
  letterhead: ResolvedLetterhead;
  layout: DocumentTemplateLayout;
  companyName?: string;
}

export function Header({ letterhead, layout, companyName }: HeaderProps) {
  const showLogo = layout.sections.header.showLogo && letterhead.headerImageUrl;
  const showCompanyName = layout.sections.header.showCompanyName && companyName;

  // Position des Logos berechnen
  const getLogoPosition = () => {
    const baseStyle: Record<string, number | string> = {
      top: letterhead.logoMarginTop,
    };

    switch (letterhead.logoPosition) {
      case "top-center":
        baseStyle.left = "50%";
        baseStyle.transform = "translateX(-50%)";
        break;
      case "top-right":
        baseStyle.right = letterhead.logoMarginLeft;
        break;
      case "top-left":
      default:
        baseStyle.left = letterhead.logoMarginLeft;
        break;
    }

    return baseStyle;
  };

  return (
    <View style={styles.header}>
      {/* Header-Bild (Briefkopf) */}
      {letterhead.headerImageUrl && (
        <Image
          src={letterhead.headerImageUrl}
          style={[styles.headerImage, { height: letterhead.headerHeight }]}
        />
      )}

      {/* Logo separat positioniert */}
      {showLogo && (
        <View style={[styles.logoContainer, getLogoPosition()]}>
          <Image
            src={letterhead.headerImageUrl!}
            style={[styles.logo, { width: letterhead.logoWidth }]}
          />
        </View>
      )}

      {/* Firmenname */}
      {showCompanyName && (
        <Text style={[styles.companyName, { marginLeft: letterhead.marginLeft }]}>
          {companyName}
        </Text>
      )}

      {/* Absenderzeile (unter dem Logo, über dem Adressfenster) */}
      {letterhead.senderAddress && (
        <Text style={[styles.senderLine, { marginLeft: letterhead.marginLeft }]}>
          {letterhead.senderAddress}
        </Text>
      )}
    </View>
  );
}
