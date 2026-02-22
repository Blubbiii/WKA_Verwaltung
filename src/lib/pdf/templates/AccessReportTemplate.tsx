import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { formatDate } from "../utils/formatters";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    padding: 40,
    color: "#333333",
    backgroundColor: "#FFFFFF",
  },
  // Header
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 10,
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
    paddingBottom: 10,
    marginBottom: 15,
  },
  // Summary Cards
  summarySection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    padding: 12,
    backgroundColor: "#F8F9FA",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  summaryLabel: {
    fontSize: 8,
    color: "#666666",
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "bold",
  },
  // User Section
  userSection: {
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 4,
    overflow: "hidden",
  },
  userHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 10,
    backgroundColor: "#F8F9FA",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  userName: {
    fontSize: 11,
    fontWeight: "bold",
  },
  userEmail: {
    fontSize: 9,
    color: "#666666",
  },
  userMeta: {
    flexDirection: "row",
    gap: 10,
  },
  badge: {
    fontSize: 7,
    padding: "2 6",
    borderRadius: 10,
    backgroundColor: "#E5E7EB",
  },
  badgeSystem: {
    backgroundColor: "#3B82F6",
    color: "#FFFFFF",
  },
  badgeCustom: {
    backgroundColor: "#8B5CF6",
    color: "#FFFFFF",
  },
  badgeCount: {
    backgroundColor: "#10B981",
    color: "#FFFFFF",
  },
  // Roles Section
  rolesSection: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: "bold",
    marginBottom: 6,
  },
  roleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  roleName: {
    fontSize: 8,
    fontWeight: "bold",
    marginRight: 8,
  },
  roleType: {
    fontSize: 7,
    color: "#666666",
    marginRight: 8,
  },
  roleScope: {
    fontSize: 7,
    color: "#888888",
  },
  // Permissions Section
  permissionsSection: {
    padding: 10,
  },
  moduleGroup: {
    marginBottom: 8,
  },
  moduleName: {
    fontSize: 8,
    fontWeight: "bold",
    marginBottom: 3,
    color: "#444444",
  },
  permissionList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  permissionBadge: {
    fontSize: 7,
    padding: "2 4",
    backgroundColor: "#F3F4F6",
    borderRadius: 2,
    color: "#374151",
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#999999",
    textAlign: "center",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 10,
  },
  pageNumber: {
    position: "absolute",
    bottom: 30,
    right: 40,
    fontSize: 8,
    color: "#999999",
  },
});

// Module display names
const MODULE_LABELS: Record<string, string> = {
  parks: "Windparks",
  turbines: "Turbinen",
  funds: "Beteiligungen",
  shareholders: "Gesellschafter",
  plots: "Flaechen",
  leases: "Pacht",
  contracts: "Vertraege",
  documents: "Dokumente",
  invoices: "Abrechnungen",
  votes: "Abstimmungen",
  "service-events": "Wartungen",
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
  resourceType: string;
  resourceIds: string[];
  resourceNames: string[];
}

interface PermissionData {
  name: string;
  displayName: string;
  module: string;
  action: string;
}

interface UserAccessData {
  id: string;
  email: string;
  name: string;
  status: string;
  roles: RoleData[];
  permissions: PermissionData[];
  permissionCount: number;
  roleCount: number;
}

export interface AccessReportPdfData {
  generatedAt: string;
  tenantId: string;
  tenantName: string;
  totalUsers: number;
  totalRoles: number;
  totalPermissions: number;
  users: UserAccessData[];
}

// Group permissions by module
function groupPermissionsByModule(
  permissions: PermissionData[]
): Map<string, PermissionData[]> {
  const grouped = new Map<string, PermissionData[]>();
  for (const perm of permissions) {
    const existing = grouped.get(perm.module) || [];
    existing.push(perm);
    grouped.set(perm.module, existing);
  }
  return grouped;
}

interface AccessReportTemplateProps {
  data: AccessReportPdfData;
}

export function AccessReportTemplate({ data }: AccessReportTemplateProps) {
  const generatedDate = new Date(data.generatedAt);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Zugriffsreport</Text>
          <Text style={styles.subtitle}>
            Uebersicht aller Benutzer und ihrer effektiven Berechtigungen
          </Text>
          <View style={styles.metaInfo}>
            <Text>Mandant: {data.tenantName}</Text>
            <Text>Erstellt am: {formatDate(generatedDate)}</Text>
          </View>
        </View>

        {/* Summary Section */}
        <View style={styles.summarySection}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Benutzer</Text>
            <Text style={styles.summaryValue}>{data.totalUsers}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Aktive Rollen</Text>
            <Text style={styles.summaryValue}>{data.totalRoles}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Berechtigungen</Text>
            <Text style={styles.summaryValue}>{data.totalPermissions}</Text>
          </View>
        </View>

        {/* Users */}
        {data.users.map((user) => {
          const groupedPermissions = groupPermissionsByModule(user.permissions);

          return (
            <View key={user.id} style={styles.userSection} wrap={false}>
              {/* User Header */}
              <View style={styles.userHeader}>
                <View>
                  <Text style={styles.userName}>{user.name}</Text>
                  <Text style={styles.userEmail}>{user.email}</Text>
                </View>
                <View style={styles.userMeta}>
                  <Text style={[styles.badge, styles.badgeCount]}>
                    {user.roleCount} Rollen
                  </Text>
                  <Text style={[styles.badge, styles.badgeCount]}>
                    {user.permissionCount} Berechtigungen
                  </Text>
                </View>
              </View>

              {/* Roles */}
              <View style={styles.rolesSection}>
                <Text style={styles.sectionTitle}>Rollen</Text>
                {user.roles.map((role) => (
                  <View key={role.id} style={styles.roleRow}>
                    <Text style={styles.roleName}>{role.name}</Text>
                    <Text
                      style={[
                        styles.badge,
                        role.isSystem ? styles.badgeSystem : styles.badgeCustom,
                      ]}
                    >
                      {role.isSystem ? "System" : "Benutzerdefiniert"}
                    </Text>
                    <Text style={styles.roleScope}>
                      {role.resourceType === "__global__"
                        ? " - Global"
                        : ` - ${role.resourceType}: ${
                            role.resourceNames.length > 0
                              ? role.resourceNames.join(", ")
                              : role.resourceIds.join(", ")
                          }`}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Permissions */}
              <View style={styles.permissionsSection}>
                <Text style={styles.sectionTitle}>Effektive Berechtigungen</Text>
                {Array.from(groupedPermissions.entries()).map(
                  ([module, permissions]) => (
                    <View key={module} style={styles.moduleGroup}>
                      <Text style={styles.moduleName}>
                        {MODULE_LABELS[module] || module}
                      </Text>
                      <View style={styles.permissionList}>
                        {permissions.map((perm) => (
                          <Text key={perm.name} style={styles.permissionBadge}>
                            {perm.displayName}
                          </Text>
                        ))}
                      </View>
                    </View>
                  )
                )}
              </View>
            </View>
          );
        })}

        {/* Footer */}
        <Text style={styles.footer}>
          WindparkManager - Zugriffsreport - {data.tenantName}
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
