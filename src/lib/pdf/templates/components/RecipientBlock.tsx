import { View, Text, StyleSheet } from "@react-pdf/renderer";
import type { DocumentTemplateLayout } from "@/types/pdf";

const styles = StyleSheet.create({
  container: {
    marginTop: 50, // Nach Adressfenster-Position (DIN 5008)
    marginBottom: 20,
  },
  recipientWindow: {
    width: 85, // 85mm Adressfenster
    height: 45, // 45mm Hoehe
    paddingTop: 5,
  },
  senderLine: {
    fontSize: 6,
    color: "#666666",
    borderBottomWidth: 0.5,
    borderBottomColor: "#999999",
    paddingBottom: 2,
    marginBottom: 4,
  },
  line: {
    fontSize: 10,
    lineHeight: 1.4,
  },
  companyName: {
    fontSize: 10,
    fontWeight: "bold",
    lineHeight: 1.4,
  },
});

interface Recipient {
  name?: string;
  companyName?: string;
  street?: string;
  houseNumber?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  additionalLine?: string;
}

interface RecipientBlockProps {
  recipient: Recipient;
  layout: DocumentTemplateLayout;
  marginLeft: number;
  senderLine?: string;
}

export function RecipientBlock({ recipient, layout, marginLeft, senderLine }: RecipientBlockProps) {
  return (
    <View
      style={[
        styles.container,
        {
          marginLeft,
          alignItems: layout.sections.recipient.position === "right" ? "flex-end" : "flex-start",
        },
      ]}
    >
      <View style={styles.recipientWindow}>
        {/* Ruecksendeangabe (DIN 5008 - kleine Zeile über Adresse) */}
        {senderLine && (
          <Text style={styles.senderLine}>{senderLine}</Text>
        )}

        {/* Zusätzliche Zeile (z.B. "z.Hd.") */}
        {recipient.additionalLine && (
          <Text style={styles.line}>{recipient.additionalLine}</Text>
        )}

        {/* Firmenname */}
        {recipient.companyName && (
          <Text style={styles.companyName}>{recipient.companyName}</Text>
        )}

        {/* Personenname */}
        {recipient.name && <Text style={styles.line}>{recipient.name}</Text>}

        {/* Strasse + Hausnummer */}
        {(recipient.street || recipient.houseNumber) && (
          <Text style={styles.line}>
            {[recipient.street, recipient.houseNumber].filter(Boolean).join(" ")}
          </Text>
        )}

        {/* PLZ + Stadt */}
        {(recipient.postalCode || recipient.city) && (
          <Text style={styles.line}>
            {[recipient.postalCode, recipient.city].filter(Boolean).join(" ")}
          </Text>
        )}

        {/* Land (nur wenn nicht Deutschland) */}
        {recipient.country && recipient.country !== "Deutschland" && recipient.country !== "DE" && (
          <Text style={styles.line}>{recipient.country}</Text>
        )}
      </View>
    </View>
  );
}
