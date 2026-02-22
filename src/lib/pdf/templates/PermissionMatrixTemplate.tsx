import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { formatDate } from "../utils/formatters";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 8,
    padding: 30,
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
  // Summary
  summarySection: {
    flexDirection: "row",
    justifyContent: "flex-start",
    marginBottom: 15,
    gap: 15,
  },
  summaryCard: {
    padding: 8,
    backgroundColor: "#F8F9FA",
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    minWidth: 80,
  },
  summaryLabel: {
    fontSize: 7,
    color: "#666666",
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 12,
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
  },
  tableRowLast: {
    flexDirection: "row",
  },
  moduleRow: {
    flexDirection: "row",
    backgroundColor: "#EBF5FF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  // Cells
  permissionCell: {
    width: 140,
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: "#E5E7EB",
  },
  permissionCellHeader: {
    width: 140,
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: "#E5E7EB",
    fontWeight: "bold",
  },
  roleCell: {
    width: 55,
    padding: 4,
    textAlign: "center",
    borderRightWidth: 1,
    borderRightColor: "#E5E7EB",
  },
  roleCellLast: {
    width: 55,
    padding: 4,
    textAlign: "center",
  },
  roleCellHeader: {
    width: 55,
    padding: 4,
    textAlign: "center",
    fontWeight: "bold",
    fontSize: 7,
    borderRightWidth: 1,
    borderRightColor: "#E5E7EB",
  },
  roleCellHeaderLast: {
    width: 55,
    padding: 4,
    textAlign: "center",
    fontWeight: "bold",
    fontSize: 7,
  },
  // Module name cell
  moduleCellText: {
    fontWeight: "bold",
    fontSize: 8,
    color: "#1E40AF",
  },
  permissionText: {
    fontSize: 7,
  },
  checkmark: {
    color: "#16A34A",
    fontSize: 10,
    fontWeight: "bold",
  },
  cross: {
    color: "#DC2626",
    fontSize: 8,
  },
  // Legend
  legend: {
    marginTop: 15,
    flexDirection: "row",
    gap: 20,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendText: {
    fontSize: 7,
    color: "#666666",
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 20,
    left: 30,
    right: 30,
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
    right: 30,
    fontSize: 7,
    color: "#999999",
  },
});

// Module display names
const MODULE_LABELS: Record<string, string> = {
  parks: "Windparks",
  turbines: "Anlagen",
  funds: "Beteiligungen",
  shareholders: "Gesellschafter",
  plots: "Flurstuecke",
  leases: "Pachtvertraege",
  contracts: "Vertraege",
  documents: "Dokumente",
  invoices: "Rechnungen",
  votes: "Abstimmungen",
  "service-events": "Service-Events",
  reports: "Berichte",
  settings: "Einstellungen",
  users: "Benutzer",
  roles: "Rollen",
  admin: "Administration",
};

// Types
interface RoleData {
  id: string;
  name: string;
  isSystem: boolean;
  color: string | null;
  permissionNames: string[];
}

interface PermissionData {
  id: string;
  name: string;
  displayName: string;
  module: string;
  action: string;
}

interface ModuleGroup {
  module: string;
  label: string;
  permissions: PermissionData[];
}

export interface PermissionMatrixPdfData {
  generatedAt: string;
  tenantId: string;
  tenantName: string;
  totalRoles: number;
  totalPermissions: number;
  roles: RoleData[];
  groupedPermissions: ModuleGroup[];
}

interface PermissionMatrixTemplateProps {
  data: PermissionMatrixPdfData;
}

export function PermissionMatrixTemplate({ data }: PermissionMatrixTemplateProps) {
  const generatedDate = new Date(data.generatedAt);

  // Build a set for quick lookup: roleId -> Set of permissionNames
  const rolePermissionMap = new Map<string, Set<string>>();
  for (const role of data.roles) {
    rolePermissionMap.set(role.id, new Set(role.permissionNames));
  }

  // Check if role has permission
  const hasPermission = (roleId: string, permName: string): boolean => {
    return rolePermissionMap.get(roleId)?.has(permName) || false;
  };

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Berechtigungs-Matrix</Text>
          <Text style={styles.subtitle}>
            Uebersicht aller Rollen und deren Berechtigungen
          </Text>
          <View style={styles.metaInfo}>
            <Text>Mandant: {data.tenantName}</Text>
            <Text>Erstellt am: {formatDate(generatedDate)}</Text>
          </View>
        </View>

        {/* Summary Section */}
        <View style={styles.summarySection}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Rollen</Text>
            <Text style={styles.summaryValue}>{data.totalRoles}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Berechtigungen</Text>
            <Text style={styles.summaryValue}>{data.totalPermissions}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Module</Text>
            <Text style={styles.summaryValue}>{data.groupedPermissions.length}</Text>
          </View>
        </View>

        {/* Matrix Table */}
        <View style={styles.table}>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <View style={styles.permissionCellHeader}>
              <Text>Berechtigung</Text>
            </View>
            {data.roles.map((role, index) => (
              <View
                key={role.id}
                style={
                  index === data.roles.length - 1
                    ? styles.roleCellHeaderLast
                    : styles.roleCellHeader
                }
              >
                <Text>{role.name}</Text>
                <Text style={{ fontSize: 6, color: "#888888", marginTop: 2 }}>
                  {role.isSystem ? "(System)" : ""}
                </Text>
              </View>
            ))}
          </View>

          {/* Permission Rows grouped by Module */}
          {data.groupedPermissions.map((group, groupIndex) => (
            <View key={group.module}>
              {/* Module Header Row */}
              <View style={styles.moduleRow}>
                <View style={styles.permissionCell}>
                  <Text style={styles.moduleCellText}>
                    {MODULE_LABELS[group.module] || group.label}
                  </Text>
                </View>
                {data.roles.map((role, roleIndex) => (
                  <View
                    key={role.id}
                    style={
                      roleIndex === data.roles.length - 1
                        ? styles.roleCellLast
                        : styles.roleCell
                    }
                  >
                    <Text></Text>
                  </View>
                ))}
              </View>

              {/* Permission Rows */}
              {group.permissions.map((permission, permIndex) => {
                const isLastInGroup = permIndex === group.permissions.length - 1;
                const isLastGroup = groupIndex === data.groupedPermissions.length - 1;
                const isLastRow = isLastInGroup && isLastGroup;

                return (
                  <View
                    key={permission.id}
                    style={isLastRow ? styles.tableRowLast : styles.tableRow}
                  >
                    <View style={styles.permissionCell}>
                      <Text style={styles.permissionText}>
                        {"  "}{permission.displayName}
                      </Text>
                    </View>
                    {data.roles.map((role, roleIndex) => (
                      <View
                        key={role.id}
                        style={
                          roleIndex === data.roles.length - 1
                            ? styles.roleCellLast
                            : styles.roleCell
                        }
                      >
                        {hasPermission(role.id, permission.name) ? (
                          <Text style={styles.checkmark}>&#x2713;</Text>
                        ) : (
                          <Text style={styles.cross}>-</Text>
                        )}
                      </View>
                    ))}
                  </View>
                );
              })}
            </View>
          ))}
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <Text style={styles.checkmark}>&#x2713;</Text>
            <Text style={styles.legendText}>Berechtigung vorhanden</Text>
          </View>
          <View style={styles.legendItem}>
            <Text style={styles.cross}>-</Text>
            <Text style={styles.legendText}>Keine Berechtigung</Text>
          </View>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          WindparkManager - Berechtigungs-Matrix - {data.tenantName}
        </Text>
        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) =>
            `Seite ${pageNumber} von ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
