import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { formatDate } from "../utils/formatters";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 8,
    padding: 25,
    paddingTop: 30,
    paddingBottom: 50,
    color: "#333333",
    backgroundColor: "#FFFFFF",
  },
  // Header
  header: {
    marginBottom: 15,
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 9,
    color: "#666666",
    marginBottom: 4,
  },
  metaInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#666666",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingBottom: 8,
    marginBottom: 12,
  },
  filterInfo: {
    fontSize: 7,
    color: "#888888",
    marginBottom: 8,
  },
  // Summary Cards
  summarySection: {
    flexDirection: "row",
    justifyContent: "flex-start",
    marginBottom: 15,
    gap: 12,
  },
  summaryCard: {
    padding: 8,
    backgroundColor: "#F8F9FA",
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    minWidth: 70,
  },
  summaryLabel: {
    fontSize: 7,
    color: "#666666",
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 11,
    fontWeight: "bold",
  },
  // Table
  table: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 3,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    minHeight: 22,
  },
  tableRowLast: {
    flexDirection: "row",
    minHeight: 22,
  },
  // Row colors based on action
  rowCreate: {
    backgroundColor: "#F0FDF4", // Light green
  },
  rowUpdate: {
    backgroundColor: "#EFF6FF", // Light blue
  },
  rowDelete: {
    backgroundColor: "#FEF2F2", // Light red
  },
  rowDefault: {
    backgroundColor: "#FFFFFF",
  },
  // Cells
  cellDateTime: {
    width: 75,
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: "#E5E7EB",
  },
  cellUser: {
    width: 100,
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: "#E5E7EB",
  },
  cellAction: {
    width: 70,
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: "#E5E7EB",
  },
  cellEntity: {
    width: 85,
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: "#E5E7EB",
  },
  cellDetails: {
    flex: 1,
    padding: 4,
  },
  // Header cells
  headerCell: {
    fontWeight: "bold",
    fontSize: 7,
  },
  // Cell text
  cellText: {
    fontSize: 7,
  },
  cellTextSmall: {
    fontSize: 6,
    color: "#666666",
  },
  // Action badges
  actionCreate: {
    color: "#16A34A",
    fontWeight: "bold",
  },
  actionUpdate: {
    color: "#2563EB",
    fontWeight: "bold",
  },
  actionDelete: {
    color: "#DC2626",
    fontWeight: "bold",
  },
  actionDefault: {
    color: "#6B7280",
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 20,
    left: 25,
    right: 25,
    fontSize: 7,
    color: "#999999",
    textAlign: "center",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 8,
  },
  pageNumber: {
    position: "absolute",
    bottom: 20,
    right: 25,
    fontSize: 7,
    color: "#999999",
  },
});

// Action display names
const ACTION_LABELS: Record<string, string> = {
  CREATE: "Erstellt",
  UPDATE: "Bearbeitet",
  DELETE: "Geloescht",
  VIEW: "Angesehen",
  EXPORT: "Exportiert",
  DOCUMENT_DOWNLOAD: "Download",
  LOGIN: "Anmeldung",
  LOGOUT: "Abmeldung",
  IMPERSONATE: "Impersoniert",
};

// Entity display names
const ENTITY_LABELS: Record<string, string> = {
  Park: "Windpark",
  Turbine: "Anlage",
  Fund: "Gesellschaft",
  Shareholder: "Gesellschafter",
  Plot: "Flurstueck",
  Lease: "Pachtvertrag",
  Contract: "Vertrag",
  Document: "Dokument",
  Invoice: "Rechnung",
  Vote: "Abstimmung",
  ServiceEvent: "Service-Event",
  News: "Neuigkeit",
  Person: "Person",
  User: "Benutzer",
  Role: "Rolle",
  Tenant: "Mandant",
};

// Types
interface AuditLogEntry {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  user: {
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
  impersonatedBy: {
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
}

interface FilterInfo {
  from?: string;
  to?: string;
  entityType?: string;
  action?: string;
  userId?: string;
  userName?: string;
}

export interface AuditLogPdfData {
  generatedAt: string;
  tenantId: string;
  tenantName: string;
  totalEntries: number;
  filters: FilterInfo;
  logs: AuditLogEntry[];
  statistics: {
    creates: number;
    updates: number;
    deletes: number;
    views: number;
    exports: number;
    logins: number;
    others: number;
  };
}

interface AuditLogTemplateProps {
  data: AuditLogPdfData;
}

/**
 * Formatiert Datum und Uhrzeit
 */
function formatDateTime(dateStr: string): { date: string; time: string } {
  const d = new Date(dateStr);
  return {
    date: d.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }),
    time: d.toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}

/**
 * Formatiert Benutzer-Namen
 */
function formatUserName(user: AuditLogEntry["user"]): string {
  if (!user) return "-";
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`;
  }
  return user.email;
}

/**
 * Extrahiert wichtige Details aus den Aenderungen
 */
function extractDetails(entry: AuditLogEntry): string {
  // Fuer CREATE/UPDATE: zeige geaenderte Felder
  if (entry.action === "CREATE" && entry.newValues) {
    const keys = Object.keys(entry.newValues).slice(0, 3);
    if (keys.length > 0) {
      return `Neu: ${keys.join(", ")}`;
    }
  }

  if (entry.action === "UPDATE" && entry.newValues && entry.oldValues) {
    const changedKeys = Object.keys(entry.newValues).filter(
      (key) => JSON.stringify(entry.oldValues?.[key]) !== JSON.stringify(entry.newValues?.[key])
    );
    if (changedKeys.length > 0) {
      return `Geaendert: ${changedKeys.slice(0, 3).join(", ")}`;
    }
  }

  if (entry.action === "DELETE") {
    return `ID: ${entry.entityId || "-"}`;
  }

  return entry.entityId ? `ID: ${entry.entityId.substring(0, 8)}...` : "-";
}

/**
 * Gibt den Stil basierend auf der Aktion zurueck
 */
function getActionStyle(action: string) {
  switch (action) {
    case "CREATE":
      return styles.actionCreate;
    case "UPDATE":
      return styles.actionUpdate;
    case "DELETE":
      return styles.actionDelete;
    default:
      return styles.actionDefault;
  }
}

/**
 * Gibt den Zeilen-Stil basierend auf der Aktion zurueck
 */
function getRowStyle(action: string) {
  switch (action) {
    case "CREATE":
      return styles.rowCreate;
    case "UPDATE":
      return styles.rowUpdate;
    case "DELETE":
      return styles.rowDelete;
    default:
      return styles.rowDefault;
  }
}

/**
 * Formatiert den Filter-Info-Text
 */
function formatFilterText(filters: FilterInfo): string {
  const parts: string[] = [];

  if (filters.from && filters.to) {
    parts.push(`Zeitraum: ${formatDate(filters.from)} - ${formatDate(filters.to)}`);
  } else if (filters.from) {
    parts.push(`Ab: ${formatDate(filters.from)}`);
  } else if (filters.to) {
    parts.push(`Bis: ${formatDate(filters.to)}`);
  }

  if (filters.entityType) {
    parts.push(`Entitaet: ${ENTITY_LABELS[filters.entityType] || filters.entityType}`);
  }

  if (filters.action) {
    parts.push(`Aktion: ${ACTION_LABELS[filters.action] || filters.action}`);
  }

  if (filters.userName) {
    parts.push(`Benutzer: ${filters.userName}`);
  }

  return parts.length > 0 ? parts.join(" | ") : "Keine Filter aktiv";
}

export function AuditLogTemplate({ data }: AuditLogTemplateProps) {
  const generatedDate = new Date(data.generatedAt);
  const ENTRIES_PER_PAGE = 50;

  // Teile Logs in Seiten auf
  const pages: AuditLogEntry[][] = [];
  for (let i = 0; i < data.logs.length; i += ENTRIES_PER_PAGE) {
    pages.push(data.logs.slice(i, i + ENTRIES_PER_PAGE));
  }

  // Falls keine Logs, erstelle mindestens eine leere Seite
  if (pages.length === 0) {
    pages.push([]);
  }

  return (
    <Document>
      {pages.map((pageEntries, pageIndex) => (
        <Page key={pageIndex} size="A4" orientation="landscape" style={styles.page}>
          {/* Header - nur auf erster Seite vollstaendig */}
          <View style={styles.header}>
            <Text style={styles.title}>Audit-Log Export</Text>
            {pageIndex === 0 && (
              <>
                <Text style={styles.subtitle}>
                  Protokoll aller System-Aktivitaeten
                </Text>
                <View style={styles.metaInfo}>
                  <Text>Mandant: {data.tenantName}</Text>
                  <Text>
                    Erstellt am: {formatDate(generatedDate)} um{" "}
                    {generatedDate.toLocaleTimeString("de-DE", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
                <Text style={styles.filterInfo}>{formatFilterText(data.filters)}</Text>
              </>
            )}
            {pageIndex > 0 && (
              <View style={styles.metaInfo}>
                <Text>Mandant: {data.tenantName}</Text>
                <Text>Fortsetzung...</Text>
              </View>
            )}
          </View>

          {/* Summary Section - nur auf erster Seite */}
          {pageIndex === 0 && (
            <View style={styles.summarySection}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Gesamt</Text>
                <Text style={styles.summaryValue}>{data.totalEntries}</Text>
              </View>
              <View style={[styles.summaryCard, { borderLeftWidth: 3, borderLeftColor: "#16A34A" }]}>
                <Text style={styles.summaryLabel}>Erstellt</Text>
                <Text style={[styles.summaryValue, styles.actionCreate]}>
                  {data.statistics.creates}
                </Text>
              </View>
              <View style={[styles.summaryCard, { borderLeftWidth: 3, borderLeftColor: "#2563EB" }]}>
                <Text style={styles.summaryLabel}>Bearbeitet</Text>
                <Text style={[styles.summaryValue, styles.actionUpdate]}>
                  {data.statistics.updates}
                </Text>
              </View>
              <View style={[styles.summaryCard, { borderLeftWidth: 3, borderLeftColor: "#DC2626" }]}>
                <Text style={styles.summaryLabel}>Geloescht</Text>
                <Text style={[styles.summaryValue, styles.actionDelete]}>
                  {data.statistics.deletes}
                </Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Anmeldungen</Text>
                <Text style={styles.summaryValue}>{data.statistics.logins}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Exports</Text>
                <Text style={styles.summaryValue}>{data.statistics.exports}</Text>
              </View>
            </View>
          )}

          {/* Table */}
          <View style={styles.table}>
            {/* Table Header */}
            <View style={styles.tableHeader}>
              <View style={styles.cellDateTime}>
                <Text style={styles.headerCell}>Datum/Zeit</Text>
              </View>
              <View style={styles.cellUser}>
                <Text style={styles.headerCell}>Benutzer</Text>
              </View>
              <View style={styles.cellAction}>
                <Text style={styles.headerCell}>Aktion</Text>
              </View>
              <View style={styles.cellEntity}>
                <Text style={styles.headerCell}>Entitaet</Text>
              </View>
              <View style={styles.cellDetails}>
                <Text style={styles.headerCell}>Details</Text>
              </View>
            </View>

            {/* Table Rows */}
            {pageEntries.length === 0 ? (
              <View style={[styles.tableRow, { justifyContent: "center", padding: 20 }]}>
                <Text style={styles.cellText}>Keine Eintraege gefunden</Text>
              </View>
            ) : (
              pageEntries.map((entry, index) => {
                const isLast = index === pageEntries.length - 1;
                const dateTime = formatDateTime(entry.createdAt);

                return (
                  <View
                    key={entry.id}
                    style={[
                      isLast ? styles.tableRowLast : styles.tableRow,
                      getRowStyle(entry.action),
                    ]}
                  >
                    <View style={styles.cellDateTime}>
                      <Text style={styles.cellText}>{dateTime.date}</Text>
                      <Text style={styles.cellTextSmall}>{dateTime.time}</Text>
                    </View>
                    <View style={styles.cellUser}>
                      <Text style={styles.cellText}>{formatUserName(entry.user)}</Text>
                      {entry.impersonatedBy && (
                        <Text style={styles.cellTextSmall}>
                          (via {formatUserName(entry.impersonatedBy)})
                        </Text>
                      )}
                    </View>
                    <View style={styles.cellAction}>
                      <Text style={[styles.cellText, getActionStyle(entry.action)]}>
                        {ACTION_LABELS[entry.action] || entry.action}
                      </Text>
                    </View>
                    <View style={styles.cellEntity}>
                      <Text style={styles.cellText}>
                        {ENTITY_LABELS[entry.entityType] || entry.entityType}
                      </Text>
                      {entry.entityId && (
                        <Text style={styles.cellTextSmall}>
                          {entry.entityId.substring(0, 8)}...
                        </Text>
                      )}
                    </View>
                    <View style={styles.cellDetails}>
                      <Text style={styles.cellText}>{extractDetails(entry)}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {/* Footer */}
          <Text style={styles.footer}>
            WindparkManager - Audit-Log - {data.tenantName}
          </Text>
          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) =>
              `Seite ${pageNumber} von ${totalPages}`
            }
            fixed
          />
        </Page>
      ))}
    </Document>
  );
}
