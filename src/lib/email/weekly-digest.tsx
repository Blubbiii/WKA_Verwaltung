import { Html, Head, Body, Container, Section, Text, Heading, Hr, Link } from "@react-email/components";

interface WeeklyDigestProps {
  userName: string;
  tenantName: string;
  period: string; // "KW 14, 2026"
  stats: {
    totalProductionMwh: number;
    avgAvailabilityPct: number;
    openInvoices: number;
    expiringContracts: number;
    newPayments: number;
    pendingActions: number;
  };
  baseUrl: string;
}

export function WeeklyDigestEmail({
  userName,
  tenantName,
  period,
  stats,
  baseUrl,
}: WeeklyDigestProps) {
  return (
    <Html lang="de">
      <Head />
      <Body style={{ backgroundColor: "#f4f4f5", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: "600px", margin: "0 auto", padding: "40px 20px" }}>
          {/* Header */}
          <Section style={{ backgroundColor: "#335E99", borderRadius: "12px 12px 0 0", padding: "24px 32px", textAlign: "center" as const }}>
            <Heading style={{ color: "#ffffff", fontSize: "20px", margin: 0 }}>
              WindparkManager
            </Heading>
            <Text style={{ color: "#ffffff99", fontSize: "13px", margin: "4px 0 0" }}>
              Wochenbericht {period}
            </Text>
          </Section>

          {/* Content */}
          <Section style={{ backgroundColor: "#ffffff", padding: "32px", borderRadius: "0 0 12px 12px" }}>
            <Text style={{ fontSize: "16px", color: "#1a1a1a" }}>
              Hallo {userName},
            </Text>
            <Text style={{ fontSize: "14px", color: "#555", lineHeight: "1.6" }}>
              hier ist Ihre wochentliche Zusammenfassung fuer <strong>{tenantName}</strong>:
            </Text>

            {/* Stats Grid */}
            <Section style={{ margin: "24px 0" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" as const }}>
                <tbody>
                  <tr>
                    <td style={{ padding: "12px", backgroundColor: "#f9fafb", borderRadius: "8px", textAlign: "center" as const, width: "50%" }}>
                      <Text style={{ fontSize: "24px", fontWeight: "bold", color: "#335E99", margin: 0 }}>
                        {stats.totalProductionMwh.toLocaleString("de-DE")} MWh
                      </Text>
                      <Text style={{ fontSize: "12px", color: "#888", margin: "4px 0 0" }}>Produktion</Text>
                    </td>
                    <td style={{ width: "12px" }} />
                    <td style={{ padding: "12px", backgroundColor: "#f9fafb", borderRadius: "8px", textAlign: "center" as const, width: "50%" }}>
                      <Text style={{ fontSize: "24px", fontWeight: "bold", color: "#16a34a", margin: 0 }}>
                        {stats.avgAvailabilityPct.toFixed(1)} %
                      </Text>
                      <Text style={{ fontSize: "12px", color: "#888", margin: "4px 0 0" }}>Verfuegbarkeit</Text>
                    </td>
                  </tr>
                </tbody>
              </table>
            </Section>

            <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />

            {/* Action Items */}
            {stats.pendingActions > 0 && (
              <Text style={{ fontSize: "14px", color: "#555" }}>
                Sie haben <strong style={{ color: "#d97706" }}>{stats.pendingActions} offene Aufgaben</strong>.
              </Text>
            )}
            {stats.expiringContracts > 0 && (
              <Text style={{ fontSize: "14px", color: "#555" }}>
                <strong style={{ color: "#ef4444" }}>{stats.expiringContracts} Vertraege</strong> laufen in den naechsten 30 Tagen aus.
              </Text>
            )}
            {stats.newPayments > 0 && (
              <Text style={{ fontSize: "14px", color: "#555" }}>
                <strong style={{ color: "#16a34a" }}>{stats.newPayments} neue Zahlungseingaenge</strong> diese Woche.
              </Text>
            )}
            {stats.openInvoices > 0 && (
              <Text style={{ fontSize: "14px", color: "#555" }}>
                {stats.openInvoices} offene Rechnungen warten auf Zahlung.
              </Text>
            )}

            <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />

            {/* CTA */}
            <Section style={{ textAlign: "center" as const }}>
              <Link
                href={`${baseUrl}/dashboard`}
                style={{
                  backgroundColor: "#335E99",
                  color: "#ffffff",
                  padding: "12px 24px",
                  borderRadius: "8px",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: "600",
                  display: "inline-block",
                }}
              >
                Dashboard oeffnen
              </Link>
            </Section>

            <Text style={{ fontSize: "11px", color: "#aaa", textAlign: "center" as const, marginTop: "32px" }}>
              Diese E-Mail wurde automatisch von WindparkManager erstellt.
              <br />
              Sie koennen den Wochenbericht in Ihren Einstellungen deaktivieren.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default WeeklyDigestEmail;
