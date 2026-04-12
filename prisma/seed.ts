import { PrismaClient, EntityStatus, EnergyCalculationType, TaxType, AccountCategory, TaxBehavior } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ============================================================================
// PERMISSIONS DEFINITION
// ============================================================================
const permissionsData = [
  // Parks Module
  { name: "parks:read", displayName: "Windparks anzeigen", module: "parks", action: "read", sortOrder: 1 },
  { name: "parks:create", displayName: "Windparks erstellen", module: "parks", action: "create", sortOrder: 2 },
  { name: "parks:update", displayName: "Windparks bearbeiten", module: "parks", action: "update", sortOrder: 3 },
  { name: "parks:delete", displayName: "Windparks löschen", module: "parks", action: "delete", sortOrder: 4 },
  { name: "parks:export", displayName: "Windparks exportieren", module: "parks", action: "export", sortOrder: 5 },

  // Turbines Module
  { name: "turbines:read", displayName: "Anlagen anzeigen", module: "turbines", action: "read", sortOrder: 10 },
  { name: "turbines:create", displayName: "Anlagen erstellen", module: "turbines", action: "create", sortOrder: 11 },
  { name: "turbines:update", displayName: "Anlagen bearbeiten", module: "turbines", action: "update", sortOrder: 12 },
  { name: "turbines:delete", displayName: "Anlagen löschen", module: "turbines", action: "delete", sortOrder: 13 },
  { name: "turbines:export", displayName: "Anlagen exportieren", module: "turbines", action: "export", sortOrder: 14 },

  // Funds Module
  { name: "funds:read", displayName: "Beteiligungen anzeigen", module: "funds", action: "read", sortOrder: 20 },
  { name: "funds:create", displayName: "Beteiligungen erstellen", module: "funds", action: "create", sortOrder: 21 },
  { name: "funds:update", displayName: "Beteiligungen bearbeiten", module: "funds", action: "update", sortOrder: 22 },
  { name: "funds:delete", displayName: "Beteiligungen löschen", module: "funds", action: "delete", sortOrder: 23 },
  { name: "funds:export", displayName: "Beteiligungen exportieren", module: "funds", action: "export", sortOrder: 24 },

  // Shareholders Module
  { name: "shareholders:read", displayName: "Gesellschafter anzeigen", module: "shareholders", action: "read", sortOrder: 30 },
  { name: "shareholders:create", displayName: "Gesellschafter erstellen", module: "shareholders", action: "create", sortOrder: 31 },
  { name: "shareholders:update", displayName: "Gesellschafter bearbeiten", module: "shareholders", action: "update", sortOrder: 32 },
  { name: "shareholders:delete", displayName: "Gesellschafter löschen", module: "shareholders", action: "delete", sortOrder: 33 },
  { name: "shareholders:export", displayName: "Gesellschafter exportieren", module: "shareholders", action: "export", sortOrder: 34 },

  // Plots Module
  { name: "plots:read", displayName: "Flurstücke anzeigen", module: "plots", action: "read", sortOrder: 40 },
  { name: "plots:create", displayName: "Flurstücke erstellen", module: "plots", action: "create", sortOrder: 41 },
  { name: "plots:update", displayName: "Flurstücke bearbeiten", module: "plots", action: "update", sortOrder: 42 },
  { name: "plots:delete", displayName: "Flurstücke löschen", module: "plots", action: "delete", sortOrder: 43 },
  { name: "plots:export", displayName: "Flurstücke exportieren", module: "plots", action: "export", sortOrder: 44 },

  // Leases Module
  { name: "leases:read", displayName: "Pachtverträge anzeigen", module: "leases", action: "read", sortOrder: 50 },
  { name: "leases:create", displayName: "Pachtverträge erstellen", module: "leases", action: "create", sortOrder: 51 },
  { name: "leases:update", displayName: "Pachtverträge bearbeiten", module: "leases", action: "update", sortOrder: 52 },
  { name: "leases:delete", displayName: "Pachtverträge löschen", module: "leases", action: "delete", sortOrder: 53 },
  { name: "leases:export", displayName: "Pachtverträge exportieren", module: "leases", action: "export", sortOrder: 54 },

  // Contracts Module
  { name: "contracts:read", displayName: "Verträge anzeigen", module: "contracts", action: "read", sortOrder: 60 },
  { name: "contracts:create", displayName: "Verträge erstellen", module: "contracts", action: "create", sortOrder: 61 },
  { name: "contracts:update", displayName: "Verträge bearbeiten", module: "contracts", action: "update", sortOrder: 62 },
  { name: "contracts:delete", displayName: "Verträge löschen", module: "contracts", action: "delete", sortOrder: 63 },
  { name: "contracts:export", displayName: "Verträge exportieren", module: "contracts", action: "export", sortOrder: 64 },

  // Documents Module
  { name: "documents:read", displayName: "Dokumente anzeigen", module: "documents", action: "read", sortOrder: 70 },
  { name: "documents:create", displayName: "Dokumente hochladen", module: "documents", action: "create", sortOrder: 71 },
  { name: "documents:update", displayName: "Dokumente bearbeiten", module: "documents", action: "update", sortOrder: 72 },
  { name: "documents:delete", displayName: "Dokumente löschen", module: "documents", action: "delete", sortOrder: 73 },
  { name: "documents:download", displayName: "Dokumente herunterladen", module: "documents", action: "download", sortOrder: 74 },
  { name: "documents:export", displayName: "Dokumente exportieren", module: "documents", action: "export", sortOrder: 75 },
  { name: "documents:approve", displayName: "Dokumente freigeben", module: "documents", action: "approve", sortOrder: 76 },
  { name: "documents:publish", displayName: "Dokumente veröffentlichen", module: "documents", action: "publish", sortOrder: 77 },
  { name: "documents:archive", displayName: "Dokumente archivieren", module: "documents", action: "archive", sortOrder: 78 },

  // Invoices Module
  { name: "invoices:read", displayName: "Rechnungen anzeigen", module: "invoices", action: "read", sortOrder: 80 },
  { name: "invoices:create", displayName: "Rechnungen erstellen", module: "invoices", action: "create", sortOrder: 81 },
  { name: "invoices:update", displayName: "Rechnungen bearbeiten", module: "invoices", action: "update", sortOrder: 82 },
  { name: "invoices:delete", displayName: "Rechnungen löschen", module: "invoices", action: "delete", sortOrder: 83 },
  { name: "invoices:export", displayName: "Rechnungen exportieren", module: "invoices", action: "export", sortOrder: 84 },
  { name: "invoices:approve", displayName: "Rechnungen freigeben", module: "invoices", action: "approve", sortOrder: 85 },
  { name: "invoices:send", displayName: "Rechnungen versenden", module: "invoices", action: "send", sortOrder: 86 },
  { name: "invoices:cancel", displayName: "Rechnungen stornieren", module: "invoices", action: "cancel", sortOrder: 87 },
  { name: "invoices:correct", displayName: "Rechnungen korrigieren", module: "invoices", action: "correct", sortOrder: 88 },

  // Votes Module
  { name: "votes:read", displayName: "Abstimmungen anzeigen", module: "votes", action: "read", sortOrder: 90 },
  { name: "votes:create", displayName: "Abstimmungen erstellen", module: "votes", action: "create", sortOrder: 91 },
  { name: "votes:update", displayName: "Abstimmungen bearbeiten", module: "votes", action: "update", sortOrder: 92 },
  { name: "votes:delete", displayName: "Abstimmungen löschen", module: "votes", action: "delete", sortOrder: 93 },
  { name: "votes:manage", displayName: "Abstimmungen verwalten", module: "votes", action: "manage", sortOrder: 94 },

  // News Module
  { name: "news:read", displayName: "Meldungen anzeigen", module: "news", action: "read", sortOrder: 95 },
  { name: "news:create", displayName: "Meldungen erstellen", module: "news", action: "create", sortOrder: 96 },
  { name: "news:update", displayName: "Meldungen bearbeiten", module: "news", action: "update", sortOrder: 97 },
  { name: "news:delete", displayName: "Meldungen löschen", module: "news", action: "delete", sortOrder: 98 },

  // Service Events Module
  { name: "service-events:read", displayName: "Service-Events anzeigen", module: "service-events", action: "read", sortOrder: 100 },
  { name: "service-events:create", displayName: "Service-Events erstellen", module: "service-events", action: "create", sortOrder: 101 },
  { name: "service-events:update", displayName: "Service-Events bearbeiten", module: "service-events", action: "update", sortOrder: 102 },
  { name: "service-events:delete", displayName: "Service-Events löschen", module: "service-events", action: "delete", sortOrder: 103 },
  { name: "service-events:export", displayName: "Service-Events exportieren", module: "service-events", action: "export", sortOrder: 104 },

  // Energy Module
  { name: "energy:read", displayName: "Stromabrechnungen anzeigen", module: "energy", action: "read", sortOrder: 105 },
  { name: "energy:create", displayName: "Stromabrechnungen erstellen", module: "energy", action: "create", sortOrder: 106 },
  { name: "energy:update", displayName: "Stromabrechnungen bearbeiten", module: "energy", action: "update", sortOrder: 107 },
  { name: "energy:delete", displayName: "Stromabrechnungen loeschen", module: "energy", action: "delete", sortOrder: 108 },
  { name: "energy:export", displayName: "Stromabrechnungen exportieren", module: "energy", action: "export", sortOrder: 109 },

  // Reports Module
  { name: "reports:read", displayName: "Berichte anzeigen", module: "reports", action: "read", sortOrder: 110 },
  { name: "reports:create", displayName: "Berichte erstellen", module: "reports", action: "create", sortOrder: 111 },
  { name: "reports:export", displayName: "Berichte exportieren", module: "reports", action: "export", sortOrder: 112 },

  // Settings Module
  { name: "settings:read", displayName: "Einstellungen anzeigen", module: "settings", action: "read", sortOrder: 120 },
  { name: "settings:update", displayName: "Einstellungen bearbeiten", module: "settings", action: "update", sortOrder: 121 },

  // Users Module (Tenant-Admin)
  { name: "users:read", displayName: "Benutzer anzeigen", module: "users", action: "read", sortOrder: 130 },
  { name: "users:create", displayName: "Benutzer erstellen", module: "users", action: "create", sortOrder: 131 },
  { name: "users:update", displayName: "Benutzer bearbeiten", module: "users", action: "update", sortOrder: 132 },
  { name: "users:delete", displayName: "Benutzer löschen", module: "users", action: "delete", sortOrder: 133 },
  { name: "users:impersonate", displayName: "Als Benutzer anmelden", module: "users", action: "impersonate", sortOrder: 134 },

  // Roles Module
  { name: "roles:read", displayName: "Rollen anzeigen", module: "roles", action: "read", sortOrder: 140 },
  { name: "roles:create", displayName: "Rollen erstellen", module: "roles", action: "create", sortOrder: 141 },
  { name: "roles:update", displayName: "Rollen bearbeiten", module: "roles", action: "update", sortOrder: 142 },
  { name: "roles:delete", displayName: "Rollen löschen", module: "roles", action: "delete", sortOrder: 143 },
  { name: "roles:assign", displayName: "Rollen zuweisen", module: "roles", action: "assign", sortOrder: 144 },

  // Portal Module (Kommanditisten-Portal)
  { name: "portal:access", displayName: "Portal-Zugang", module: "portal", action: "read", sortOrder: 150 },
  { name: "portal:participations", displayName: "Portal-Beteiligungen", module: "portal", action: "read", sortOrder: 151 },
  { name: "portal:distributions", displayName: "Portal-Ausschuettungen", module: "portal", action: "read", sortOrder: 152 },
  { name: "portal:documents", displayName: "Portal-Dokumente", module: "portal", action: "read", sortOrder: 153 },
  { name: "portal:reports", displayName: "Portal-Berichte", module: "portal", action: "read", sortOrder: 154 },
  { name: "portal:energyReports", displayName: "Portal-Energieberichte", module: "portal", action: "read", sortOrder: 155 },
  { name: "portal:votes", displayName: "Portal-Abstimmungen", module: "portal", action: "read", sortOrder: 156 },
  { name: "portal:proxies", displayName: "Portal-Vollmachten", module: "portal", action: "read", sortOrder: 157 },
  { name: "portal:profile", displayName: "Portal-Profil bearbeiten", module: "portal", action: "update", sortOrder: 158 },

  // Admin Module (Tenant-level administration)
  { name: "admin:manage", displayName: "Administration verwalten", module: "admin", action: "manage", sortOrder: 199 },
  { name: "admin:email", displayName: "E-Mail-Verwaltung", module: "admin", action: "email", sortOrder: 204 },
  { name: "admin:billing-rules", displayName: "Abrechnungsregeln verwalten", module: "admin", action: "billing-rules", sortOrder: 205 },
  { name: "admin:settlement-periods", displayName: "Abrechnungsperioden verwalten", module: "admin", action: "settlement-periods", sortOrder: 206 },
  { name: "admin:access-report", displayName: "Zugriffsreport anzeigen", module: "admin", action: "access-report", sortOrder: 207 },
  { name: "admin:mass-communication", displayName: "Massen-Kommunikation", module: "admin", action: "mass-communication", sortOrder: 208 },
  { name: "mailings:read", displayName: "Serienbriefe anzeigen", module: "mailings", action: "read", sortOrder: 180 },
  { name: "mailings:write", displayName: "Serienbriefe erstellen/bearbeiten", module: "mailings", action: "write", sortOrder: 181 },
  { name: "mailings:send", displayName: "Serienbriefe versenden", module: "mailings", action: "send", sortOrder: 182 },
  { name: "admin:invoice-settings", displayName: "Rechnungseinstellungen", module: "admin", action: "invoice-settings", sortOrder: 209 },
  { name: "admin:templates", displayName: "Vorlagen verwalten", module: "admin", action: "templates", sortOrder: 210 },
  { name: "admin:impersonate", displayName: "Benutzer impersonieren", module: "admin", action: "impersonate", sortOrder: 211 },

  // System Module (Superadmin only - cross-tenant)
  { name: "system:tenants", displayName: "Mandanten verwalten", module: "system", action: "tenants", sortOrder: 220 },
  { name: "system:settings", displayName: "System-Einstellungen", module: "system", action: "settings", sortOrder: 221 },
  { name: "system:health", displayName: "System & Wartung", module: "system", action: "health", sortOrder: 222 },
  { name: "system:config", displayName: "System-Konfiguration", module: "system", action: "config", sortOrder: 223 },
  { name: "system:audit", displayName: "Audit-Logs anzeigen", module: "system", action: "audit", sortOrder: 224 },
  { name: "system:backup", displayName: "Backup & Speicher", module: "system", action: "backup", sortOrder: 225 },
  { name: "system:marketing", displayName: "Marketing verwalten", module: "system", action: "marketing", sortOrder: 226 },
  { name: "system:revenue-types", displayName: "Vergütungsarten verwalten", module: "system", action: "revenue-types", sortOrder: 227 },
  { name: "system:fund-categories", displayName: "Gesellschaftstypen verwalten", module: "system", action: "fund-categories", sortOrder: 228 },

  // Accounting Module (Buchhaltung)
  { name: "accounting:read", displayName: "Buchhaltung anzeigen", module: "accounting", action: "read", sortOrder: 230 },
  { name: "accounting:create", displayName: "Buchungen erstellen", module: "accounting", action: "create", sortOrder: 231 },
  { name: "accounting:update", displayName: "Buchungen bearbeiten", module: "accounting", action: "update", sortOrder: 232 },
  { name: "accounting:delete", displayName: "Buchungen loeschen", module: "accounting", action: "delete", sortOrder: 233 },

  // Management Billing Module (Betriebsfuehrung)
  { name: "management-billing:read", displayName: "BF-Abrechnungen anzeigen", description: "Betriebsfuehrungsvertraege und Abrechnungen einsehen", module: "management-billing", action: "read", sortOrder: 240 },
  { name: "management-billing:create", displayName: "BF-Vertraege erstellen", description: "Neue Betriebsfuehrungsvertraege anlegen", module: "management-billing", action: "create", sortOrder: 241 },
  { name: "management-billing:update", displayName: "BF-Vertraege bearbeiten", description: "Betriebsfuehrungsvertraege aendern", module: "management-billing", action: "update", sortOrder: 242 },
  { name: "management-billing:delete", displayName: "BF-Vertraege loeschen", description: "Betriebsfuehrungsvertraege entfernen", module: "management-billing", action: "delete", sortOrder: 243 },
  { name: "management-billing:calculate", displayName: "BF-Abrechnungen berechnen", description: "Abrechnungen fuer Betriebsfuehrung kalkulieren", module: "management-billing", action: "calculate", sortOrder: 244 },
  { name: "management-billing:invoice", displayName: "BF-Rechnungen generieren", description: "Rechnungen aus BF-Abrechnungen erstellen", module: "management-billing", action: "invoice", sortOrder: 245 },
];

// ============================================================================
// SYSTEM ROLES DEFINITION
// ============================================================================
const systemRolesData = [
  {
    name: "Superadmin",
    description: "Vollzugriff auf alle Funktionen und alle Mandanten",
    isSystem: true,
    hierarchy: 100,
    color: "#dc2626",
    // Gets ALL permissions
    permissions: permissionsData.map(p => p.name),
  },
  {
    name: "Administrator",
    description: "Vollzugriff auf alle Funktionen innerhalb des Mandanten",
    isSystem: true,
    hierarchy: 80,
    color: "#9333ea",
    // Gets all permissions except system:* (cross-tenant) and portal:*
    permissions: permissionsData.filter(p => p.module !== "system" && p.module !== "portal").map(p => p.name),
  },
  {
    name: "Manager",
    description: "Kann Daten verwalten und bearbeiten, aber keine Benutzer oder Rollen",
    isSystem: true,
    hierarchy: 60,
    color: "#2563eb",
    permissions: [
      // Parks - full access
      "parks:read", "parks:create", "parks:update", "parks:export",
      // Turbines - full access
      "turbines:read", "turbines:create", "turbines:update", "turbines:export",
      // Funds - full access
      "funds:read", "funds:create", "funds:update", "funds:export",
      // Shareholders - full access
      "shareholders:read", "shareholders:create", "shareholders:update", "shareholders:export",
      // Plots - full access
      "plots:read", "plots:create", "plots:update", "plots:export",
      // Leases - full access
      "leases:read", "leases:create", "leases:update", "leases:export",
      // Contracts - full access
      "contracts:read", "contracts:create", "contracts:update", "contracts:export",
      // Documents - full access
      "documents:read", "documents:create", "documents:update", "documents:download", "documents:export",
      "documents:approve", "documents:publish", "documents:archive",
      // Invoices - full access
      "invoices:read", "invoices:create", "invoices:update", "invoices:export",
      "invoices:approve", "invoices:send", "invoices:cancel", "invoices:correct",
      // Votes - full access
      "votes:read", "votes:create", "votes:update", "votes:manage",
      // Service Events - full access
      "service-events:read", "service-events:create", "service-events:update", "service-events:export",
      // Energy - read access
      "energy:read",
      // News - full access
      "news:read", "news:create", "news:update",
      // Reports - full access
      "reports:read", "reports:create", "reports:export",
      // Mailings - full access
      "mailings:read", "mailings:write", "mailings:send",
      // Accounting - full access
      "accounting:read", "accounting:create", "accounting:update",
      // Settings - read only
      "settings:read",
    ],
  },
  {
    name: "Mitarbeiter",
    description: "Kann Daten anzeigen und eingeschränkt bearbeiten",
    isSystem: true,
    hierarchy: 50,
    color: "#059669",
    permissions: [
      // Read access to most modules
      "parks:read", "turbines:read", "funds:read", "shareholders:read",
      "plots:read", "leases:read", "contracts:read", "documents:read",
      "invoices:read", "votes:read", "service-events:read", "reports:read",
      "energy:read", "news:read",
      // Limited create/update
      "documents:create", "documents:download",
      "service-events:create", "service-events:update",
      // Accounting - read only
      "accounting:read",
    ],
  },
  {
    name: "Nur Lesen",
    description: "Kann nur Daten anzeigen, keine Änderungen möglich",
    isSystem: true,
    hierarchy: 40,
    color: "#6b7280",
    permissions: [
      "parks:read", "turbines:read", "funds:read", "shareholders:read",
      "plots:read", "leases:read", "contracts:read", "documents:read",
      "documents:download", "invoices:read", "votes:read", "service-events:read",
      "reports:read", "energy:read", "news:read",
    ],
  },
  {
    name: "Portal-Benutzer",
    description: "Standard-Rolle fuer Anleger-Portal Benutzer mit Zugriff auf alle Portal-Funktionen",
    isSystem: true,
    hierarchy: 20,
    color: "#0891b2",
    permissions: [
      "portal:access", "portal:participations", "portal:distributions",
      "portal:documents", "portal:reports", "portal:energyReports",
      "portal:votes", "portal:proxies", "portal:profile",
    ],
  },
];

async function seedPermissions() {
  console.log("Seeding permissions...");

  for (const permission of permissionsData) {
    await prisma.permission.upsert({
      where: { name: permission.name },
      update: {
        displayName: permission.displayName,
        module: permission.module,
        action: permission.action,
        sortOrder: permission.sortOrder,
      },
      create: permission,
    });
  }

  console.log(`Created ${permissionsData.length} permissions`);
}

// ============================================================================
// ENERGY REVENUE TYPES DEFINITION
// ============================================================================
const energyRevenueTypesData = [
  {
    name: "EEG-Verguetung",
    code: "EEG",
    description: "Feste Einspeiseverguetung nach EEG",
    calculationType: EnergyCalculationType.FIXED_RATE,
    hasTax: true,
    taxRate: 19.0,
    taxType: TaxType.STANDARD,
    sortOrder: 1,
  },
  {
    name: "Direktvermarktung",
    code: "DIRECT",
    description: "Vermarktung ueber Direktvermarkter (EPEX)",
    calculationType: EnergyCalculationType.MARKET_PRICE,
    hasTax: true,
    taxRate: 19.0,
    taxType: TaxType.STANDARD,
    sortOrder: 2,
  },
  {
    name: "Marktpraemie",
    code: "MARKTPRAEMIE",
    description: "Marktpraemie (steuerfrei)",
    calculationType: EnergyCalculationType.MARKET_PRICE,
    hasTax: false,
    taxRate: 0,
    taxType: TaxType.EXEMPT,
    sortOrder: 3,
  },
  {
    name: "Redispatch 2.0",
    code: "REDISPATCH",
    description: "Entschaedigung bei Abregelung",
    calculationType: EnergyCalculationType.MANUAL,
    hasTax: true,
    taxRate: 19.0,
    taxType: TaxType.STANDARD,
    sortOrder: 4,
  },
];

// ============================================================================
// FUND CATEGORIES DEFINITION
// ============================================================================
const defaultFundCategories = [
  { name: "WKA-Betreiber", code: "BETREIBER", description: "Betreibergesellschaft (GmbH, KG, etc.)", color: "#3b82f6", sortOrder: 0 },
  { name: "Netzgesellschaft", code: "NETZGESELLSCHAFT", description: "Netzgesellschaft (GbR, etc.)", color: "#7c3aed", sortOrder: 1 },
  { name: "Umspannwerk", code: "UMSPANNWERK", description: "Umspannwerk-Gesellschaft", color: "#f97316", sortOrder: 2 },
  { name: "Vermarktung", code: "VERMARKTUNG", description: "Direktvermarkter", color: "#14b8a6", sortOrder: 3 },
  { name: "Sonstige", code: "SONSTIGE", description: "Sonstige Gesellschaft", color: "#6b7280", sortOrder: 4 },
];

async function seedFundCategories(tenantId: string) {
  console.log("Seeding fund categories...");

  let createdCount = 0;
  let updatedCount = 0;

  for (const category of defaultFundCategories) {
    const result = await prisma.fundCategory.upsert({
      where: {
        code_tenantId: {
          code: category.code,
          tenantId: tenantId,
        },
      },
      update: {
        name: category.name,
        description: category.description,
        color: category.color,
        sortOrder: category.sortOrder,
        isActive: true,
      },
      create: {
        name: category.name,
        code: category.code,
        description: category.description,
        color: category.color,
        sortOrder: category.sortOrder,
        isActive: true,
        tenantId: tenantId,
      },
    });

    if (result.createdAt === result.updatedAt) {
      createdCount++;
      console.log(`  Created: ${category.name} (${category.code})`);
    } else {
      updatedCount++;
      console.log(`  Updated: ${category.name} (${category.code})`);
    }
  }

  console.log(`Fund categories: ${createdCount} created, ${updatedCount} updated`);
}

async function seedEnergyRevenueTypes(tenantId: string) {
  console.log("Seeding energy revenue types...");

  let createdCount = 0;
  let updatedCount = 0;

  for (const revenueType of energyRevenueTypesData) {
    try {
      // Check if entry already exists
      const existing = await prisma.energyRevenueType.findFirst({
        where: {
          code: revenueType.code,
          tenantId: tenantId,
        },
      });

      if (existing) {
        // Update existing entry
        await prisma.energyRevenueType.update({
          where: { id: existing.id },
          data: {
            name: revenueType.name,
            description: revenueType.description,
            calculationType: revenueType.calculationType,
            hasTax: revenueType.hasTax,
            taxRate: revenueType.taxRate,
            taxType: revenueType.taxType,
            sortOrder: revenueType.sortOrder,
            isActive: true,
          },
        });
        updatedCount++;
        console.log(`  Updated: ${revenueType.name} (${revenueType.code})`);
      } else {
        // Create new entry
        await prisma.energyRevenueType.create({
          data: {
            name: revenueType.name,
            code: revenueType.code,
            description: revenueType.description,
            calculationType: revenueType.calculationType,
            hasTax: revenueType.hasTax,
            taxRate: revenueType.taxRate,
            taxType: revenueType.taxType,
            sortOrder: revenueType.sortOrder,
            isActive: true,
            tenantId: tenantId,
          },
        });
        createdCount++;
        console.log(`  Created: ${revenueType.name} (${revenueType.code})`);
      }
    } catch (error) {
      console.error(`  Error processing ${revenueType.code}:`, error);
      throw error;
    }
  }

  console.log(`Energy revenue types: ${createdCount} created, ${updatedCount} updated`);
}

// ============================================================================
// TAX RATE CONFIGS DEFINITION
// ============================================================================
const defaultTaxRateConfigs = [
  { taxType: "STANDARD" as const, rate: 19, label: "Regelsteuersatz" },
  { taxType: "REDUCED" as const, rate: 7, label: "Ermaessigter Steuersatz" },
  { taxType: "EXEMPT" as const, rate: 0, label: "Steuerbefreit" },
];

async function seedTaxRateConfigs(tenantId: string) {
  console.log("Seeding tax rate configs...");

  let createdCount = 0;

  for (const config of defaultTaxRateConfigs) {
    const existing = await prisma.taxRateConfig.findFirst({
      where: { tenantId, taxType: config.taxType },
    });

    if (!existing) {
      await prisma.taxRateConfig.create({
        data: {
          taxType: config.taxType,
          rate: config.rate,
          label: config.label,
          validFrom: new Date("1970-01-01"),
          validTo: null,
          tenantId,
        },
      });
      createdCount++;
      console.log(`  Created: ${config.taxType} = ${config.rate}%`);
    } else {
      console.log(`  Exists: ${config.taxType} = ${Number(existing.rate)}%`);
    }
  }

  console.log(`Tax rate configs: ${createdCount} created`);
}

// ============================================================================
// POSITION TAX MAPPINGS DEFINITION
// ============================================================================
const defaultPositionTaxMappings = [
  { category: "POOL_AREA", label: "Poolflaeche", taxType: "STANDARD" as const, module: "lease" },
  { category: "TURBINE_SITE", label: "WEA-Standort", taxType: "EXEMPT" as const, module: "lease" },
  { category: "SEALED_AREA", label: "Versiegelte Flaeche", taxType: "EXEMPT" as const, module: "lease" },
  { category: "ROAD_USAGE", label: "Wegenutzung", taxType: "EXEMPT" as const, module: "lease" },
  { category: "CABLE_ROUTE", label: "Kabeltrasse", taxType: "EXEMPT" as const, module: "lease" },
  { category: "MGMT_FEE", label: "Betriebsfuehrungsverguetung", taxType: "STANDARD" as const, module: "management" },
];

async function seedPositionTaxMappings(tenantId: string) {
  console.log("Seeding position tax mappings...");

  let createdCount = 0;

  for (const mapping of defaultPositionTaxMappings) {
    const existing = await prisma.positionTaxMapping.findUnique({
      where: { tenantId_category: { tenantId, category: mapping.category } },
    });

    if (!existing) {
      await prisma.positionTaxMapping.create({
        data: {
          category: mapping.category,
          label: mapping.label,
          taxType: mapping.taxType,
          module: mapping.module,
          tenantId,
        },
      });
      createdCount++;
      console.log(`  Created: ${mapping.label} → ${mapping.taxType}`);
    } else {
      console.log(`  Exists: ${mapping.label} → ${existing.taxType}`);
    }
  }

  console.log(`Position tax mappings: ${createdCount} created`);
}

async function seedSystemRoles() {
  console.log("Seeding system roles...");

  for (const roleData of systemRolesData) {
    // Find existing system role or create new one
    let role = await prisma.role.findFirst({
      where: {
        name: roleData.name,
        isSystem: true,
        tenantId: null,
      },
    });

    if (role) {
      // Update existing role
      role = await prisma.role.update({
        where: { id: role.id },
        data: {
          description: roleData.description,
          hierarchy: roleData.hierarchy,
          color: roleData.color,
        },
      });
    } else {
      // Create new system role
      role = await prisma.role.create({
        data: {
          name: roleData.name,
          description: roleData.description,
          isSystem: roleData.isSystem,
          hierarchy: roleData.hierarchy,
          color: roleData.color,
          tenantId: null,
        },
      });
    }

    // Assign permissions to role
    for (const permissionName of roleData.permissions) {
      const permission = await prisma.permission.findUnique({
        where: { name: permissionName },
      });

      if (permission) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id,
            },
          },
          update: {},
          create: {
            roleId: role.id,
            permissionId: permission.id,
          },
        });
      }
    }

    console.log(`Created role "${roleData.name}" with ${roleData.permissions.length} permissions`);
  }
}

// ============================================================================
// SKR03 LEDGER ACCOUNTS (Kontenrahmen)
// ============================================================================
const skr03Accounts: Array<{
  accountNumber: string;
  name: string;
  category: AccountCategory;
  taxBehavior: TaxBehavior;
  parentNumber?: string;
}> = [
  // Klasse 0: Anlage- und Kapitalkonten
  { accountNumber: "0100", name: "Immaterielle Vermoegensgegenstande", category: "ASSET", taxBehavior: "NONE" },
  { accountNumber: "0200", name: "Grundstuecke und Gebaeude", category: "ASSET", taxBehavior: "NONE" },
  { accountNumber: "0210", name: "Geschaeftsbauten", category: "ASSET", taxBehavior: "NONE", parentNumber: "0200" },
  { accountNumber: "0300", name: "Technische Anlagen und Maschinen", category: "ASSET", taxBehavior: "NONE" },
  { accountNumber: "0310", name: "Windenergieanlagen", category: "ASSET", taxBehavior: "NONE", parentNumber: "0300" },
  { accountNumber: "0320", name: "Netzanbindung / Verkabelung", category: "ASSET", taxBehavior: "NONE", parentNumber: "0300" },
  { accountNumber: "0400", name: "Betriebs- und Geschaeftsausstattung", category: "ASSET", taxBehavior: "NONE" },
  { accountNumber: "0520", name: "Fahrzeuge", category: "ASSET", taxBehavior: "NONE" },
  { accountNumber: "0580", name: "GWG (Geringwertige Wirtschaftsgueter)", category: "ASSET", taxBehavior: "NONE" },
  { accountNumber: "0630", name: "Geleistete Anzahlungen auf Sachanlagen", category: "ASSET", taxBehavior: "NONE" },
  { accountNumber: "0800", name: "Gezeichnetes Kapital", category: "EQUITY", taxBehavior: "NONE" },
  { accountNumber: "0810", name: "Kapitalruecklage", category: "EQUITY", taxBehavior: "NONE" },
  { accountNumber: "0840", name: "Kommanditkapital", category: "EQUITY", taxBehavior: "NONE" },
  { accountNumber: "0860", name: "Gewinnvortrag", category: "EQUITY", taxBehavior: "NONE" },
  { accountNumber: "0868", name: "Verlustvortrag", category: "EQUITY", taxBehavior: "NONE" },
  { accountNumber: "0880", name: "Nicht durch Kapital gedeckter Verlust", category: "EQUITY", taxBehavior: "NONE" },

  // Klasse 1: Finanz- und Privatkonten
  { accountNumber: "1000", name: "Kasse", category: "ASSET", taxBehavior: "NONE" },
  { accountNumber: "1200", name: "Forderungen aus Lieferungen und Leistungen", category: "ASSET", taxBehavior: "NONE" },
  { accountNumber: "1210", name: "Forderungen gegen Gesellschafter", category: "ASSET", taxBehavior: "NONE" },
  { accountNumber: "1300", name: "Sonstige Forderungen", category: "ASSET", taxBehavior: "NONE" },
  { accountNumber: "1360", name: "Geldtransit", category: "ASSET", taxBehavior: "NONE" },
  { accountNumber: "1400", name: "Forderungen gegen verbundene Unternehmen", category: "ASSET", taxBehavior: "NONE" },
  { accountNumber: "1410", name: "Forderungen Netzbetreiber", category: "ASSET", taxBehavior: "NONE" },
  { accountNumber: "1420", name: "Forderungen Direktvermarkter", category: "ASSET", taxBehavior: "NONE" },
  { accountNumber: "1576", name: "Abziehbare Vorsteuer 19%", category: "ASSET", taxBehavior: "INPUT_TAX" },
  { accountNumber: "1571", name: "Abziehbare Vorsteuer 7%", category: "ASSET", taxBehavior: "INPUT_TAX" },
  { accountNumber: "1580", name: "Noch abzuführende USt", category: "LIABILITY", taxBehavior: "NONE" },
  { accountNumber: "1600", name: "Verbindlichkeiten aus Lieferungen und Leistungen", category: "LIABILITY", taxBehavior: "NONE" },
  { accountNumber: "1610", name: "Verbindlichkeiten gegen Gesellschafter", category: "LIABILITY", taxBehavior: "NONE" },
  { accountNumber: "1700", name: "Sonstige Verbindlichkeiten", category: "LIABILITY", taxBehavior: "NONE" },
  { accountNumber: "1710", name: "Erhaltene Anzahlungen", category: "LIABILITY", taxBehavior: "NONE" },
  { accountNumber: "1740", name: "Verbindlichkeiten Pachtzahlungen", category: "LIABILITY", taxBehavior: "NONE" },
  { accountNumber: "1750", name: "Verbindlichkeiten aus Steuern", category: "LIABILITY", taxBehavior: "NONE" },
  { accountNumber: "1760", name: "Umsatzsteuervorauszahlung", category: "LIABILITY", taxBehavior: "NONE" },
  { accountNumber: "1776", name: "Umsatzsteuer 19%", category: "LIABILITY", taxBehavior: "OUTPUT_TAX" },
  { accountNumber: "1771", name: "Umsatzsteuer 7%", category: "LIABILITY", taxBehavior: "OUTPUT_TAX" },
  { accountNumber: "1780", name: "Umsatzsteuer-Vorauszahlungen", category: "LIABILITY", taxBehavior: "NONE" },
  { accountNumber: "1790", name: "Umsatzsteuer laufendes Jahr", category: "LIABILITY", taxBehavior: "NONE" },
  { accountNumber: "1800", name: "Bankkonten (Girokonto)", category: "ASSET", taxBehavior: "NONE" },
  { accountNumber: "1810", name: "Bankkonten (Festgeld)", category: "ASSET", taxBehavior: "NONE" },
  { accountNumber: "1820", name: "Bankkonten (Ruecklagenkonto)", category: "ASSET", taxBehavior: "NONE" },
  { accountNumber: "1890", name: "Rueckstellungen", category: "LIABILITY", taxBehavior: "NONE" },
  { accountNumber: "1900", name: "Privatentnahmen allgemein", category: "EQUITY", taxBehavior: "NONE" },

  // Klasse 2: Abgrenzungskonten
  { accountNumber: "2000", name: "Aktive Rechnungsabgrenzung", category: "ASSET", taxBehavior: "NONE" },
  { accountNumber: "2100", name: "Passive Rechnungsabgrenzung", category: "LIABILITY", taxBehavior: "NONE" },
  { accountNumber: "2900", name: "Sonstige Rueckstellungen", category: "LIABILITY", taxBehavior: "NONE" },

  // Klasse 3: Wareneingang (i.d.R. bei Windpark nicht relevant, nur Platzhalter)
  { accountNumber: "3000", name: "Wareneingang", category: "EXPENSE", taxBehavior: "TAXABLE_19" },

  // Klasse 4: Betriebliche Aufwendungen
  { accountNumber: "4100", name: "Loehne und Gehaelter", category: "EXPENSE", taxBehavior: "NONE" },
  { accountNumber: "4120", name: "Betriebsfuehrungsverguetung", category: "EXPENSE", taxBehavior: "TAXABLE_19" },
  { accountNumber: "4130", name: "Soziale Abgaben und Aufwendungen", category: "EXPENSE", taxBehavior: "NONE" },
  { accountNumber: "4200", name: "Raumkosten", category: "EXPENSE", taxBehavior: "TAXABLE_19" },
  { accountNumber: "4210", name: "Pachtaufwendungen", category: "EXPENSE", taxBehavior: "EXEMPT" },
  { accountNumber: "4211", name: "Pacht Poolflaeche", category: "EXPENSE", taxBehavior: "TAXABLE_19", parentNumber: "4210" },
  { accountNumber: "4212", name: "Pacht Standort / Kabeltrasse", category: "EXPENSE", taxBehavior: "EXEMPT", parentNumber: "4210" },
  { accountNumber: "4220", name: "Pacht Nutzungsentgelt", category: "EXPENSE", taxBehavior: "EXEMPT", parentNumber: "4210" },
  { accountNumber: "4360", name: "Versicherungen", category: "EXPENSE", taxBehavior: "EXEMPT" },
  { accountNumber: "4380", name: "Beitraege und Gebuehren", category: "EXPENSE", taxBehavior: "TAXABLE_19" },
  { accountNumber: "4500", name: "Fahrzeugkosten", category: "EXPENSE", taxBehavior: "TAXABLE_19" },
  { accountNumber: "4520", name: "Leasingkosten Fahrzeuge", category: "EXPENSE", taxBehavior: "TAXABLE_19" },
  { accountNumber: "4600", name: "Werbe- und Reisekosten", category: "EXPENSE", taxBehavior: "TAXABLE_19" },
  { accountNumber: "4700", name: "Kosten der Warenabgabe", category: "EXPENSE", taxBehavior: "TAXABLE_19" },
  { accountNumber: "4800", name: "Reparaturen und Instandhaltung", category: "EXPENSE", taxBehavior: "TAXABLE_19" },
  { accountNumber: "4830", name: "AfA Sachanlagen", category: "EXPENSE", taxBehavior: "NONE" },
  { accountNumber: "4831", name: "AfA Windenergieanlagen", category: "EXPENSE", taxBehavior: "NONE", parentNumber: "4830" },
  { accountNumber: "4832", name: "AfA Netzanbindung", category: "EXPENSE", taxBehavior: "NONE", parentNumber: "4830" },
  { accountNumber: "4855", name: "AfA immaterielle Vermoegensgegenstande", category: "EXPENSE", taxBehavior: "NONE" },
  { accountNumber: "4900", name: "Sonstige betriebliche Aufwendungen", category: "EXPENSE", taxBehavior: "TAXABLE_19" },
  { accountNumber: "4910", name: "Porto / Telefon", category: "EXPENSE", taxBehavior: "TAXABLE_19" },
  { accountNumber: "4920", name: "Rechts- und Beratungskosten", category: "EXPENSE", taxBehavior: "TAXABLE_19" },
  { accountNumber: "4930", name: "Buchfuehrungskosten", category: "EXPENSE", taxBehavior: "TAXABLE_19" },
  { accountNumber: "4940", name: "Wirtschaftspruefung / Abschlusskosten", category: "EXPENSE", taxBehavior: "TAXABLE_19" },
  { accountNumber: "4945", name: "Jahresabschlusskosten", category: "EXPENSE", taxBehavior: "TAXABLE_19" },
  { accountNumber: "4950", name: "Wartung und Instandsetzung", category: "EXPENSE", taxBehavior: "TAXABLE_19" },
  { accountNumber: "4955", name: "Wartungsvertraege WEA", category: "EXPENSE", taxBehavior: "TAXABLE_19", parentNumber: "4950" },
  { accountNumber: "4960", name: "Bankgebuehren", category: "EXPENSE", taxBehavior: "EXEMPT" },
  { accountNumber: "4970", name: "Nebenkosten des Geldverkehrs", category: "EXPENSE", taxBehavior: "EXEMPT" },

  // Klasse 7: Sonstige Erloese und Aufwendungen
  { accountNumber: "7000", name: "Zinsen und aehnliche Aufwendungen", category: "EXPENSE", taxBehavior: "NONE" },
  { accountNumber: "7010", name: "Zinsen Bankdarlehen", category: "EXPENSE", taxBehavior: "NONE", parentNumber: "7000" },
  { accountNumber: "7020", name: "Zinsen Gesellschafterdarlehen", category: "EXPENSE", taxBehavior: "NONE", parentNumber: "7000" },
  { accountNumber: "7100", name: "Sonstige Zinsertraege", category: "REVENUE", taxBehavior: "NONE" },

  // Klasse 8: Erloeskonten
  { accountNumber: "8100", name: "Erloese Inland", category: "REVENUE", taxBehavior: "TAXABLE_19" },
  { accountNumber: "8200", name: "Erloese steuerfreie Umsaetze", category: "REVENUE", taxBehavior: "EXEMPT" },
  { accountNumber: "8300", name: "Erloese Energieerzeugung", category: "REVENUE", taxBehavior: "TAXABLE_19" },
  { accountNumber: "8330", name: "Erloese EEG-Einspeiseverguetung", category: "REVENUE", taxBehavior: "TAXABLE_19", parentNumber: "8300" },
  { accountNumber: "8335", name: "Erloese Marktpraemie", category: "REVENUE", taxBehavior: "EXEMPT", parentNumber: "8300" },
  { accountNumber: "8338", name: "Erloese Direktvermarktung", category: "REVENUE", taxBehavior: "TAXABLE_19", parentNumber: "8300" },
  { accountNumber: "8340", name: "Erloese Redispatch", category: "REVENUE", taxBehavior: "TAXABLE_19", parentNumber: "8300" },
  { accountNumber: "8400", name: "Erloese Einspeiseverguetung allgemein", category: "REVENUE", taxBehavior: "TAXABLE_19" },
  { accountNumber: "8500", name: "Provisionserloese", category: "REVENUE", taxBehavior: "TAXABLE_19" },
  { accountNumber: "8900", name: "Sonstige betriebliche Ertraege", category: "REVENUE", taxBehavior: "TAXABLE_19" },
  { accountNumber: "8910", name: "Versicherungsentschaedigungen", category: "REVENUE", taxBehavior: "EXEMPT" },
  { accountNumber: "8920", name: "Ertraege aus Anlagenabgaengen", category: "REVENUE", taxBehavior: "TAXABLE_19" },
];

async function seedLedgerAccounts(tenantId: string) {
  console.log("Seeding SKR03 ledger accounts...");

  let createdCount = 0;
  let updatedCount = 0;

  for (const acc of skr03Accounts) {
    const existing = await prisma.ledgerAccount.findUnique({
      where: { tenantId_accountNumber: { tenantId, accountNumber: acc.accountNumber } },
    });

    if (existing) {
      await prisma.ledgerAccount.update({
        where: { id: existing.id },
        data: {
          name: acc.name,
          category: acc.category,
          taxBehavior: acc.taxBehavior,
          parentNumber: acc.parentNumber || null,
          isSystem: true,
        },
      });
      updatedCount++;
    } else {
      await prisma.ledgerAccount.create({
        data: {
          tenantId,
          accountNumber: acc.accountNumber,
          name: acc.name,
          category: acc.category,
          taxBehavior: acc.taxBehavior,
          parentNumber: acc.parentNumber || null,
          isSystem: true,
          isActive: true,
        },
      });
      createdCount++;
    }
  }

  console.log(`SKR03 ledger accounts: ${createdCount} created, ${updatedCount} updated`);
}

async function main() {
  console.log("Seeding database...");

  // Seed Permissions and Roles first
  await seedPermissions();
  await seedSystemRoles();

  // Create System Tenant (for Superadmins)
  const systemTenant = await prisma.tenant.upsert({
    where: { slug: "system" },
    update: {},
    create: {
      name: "System",
      slug: "system",
      primaryColor: "#1e40af",
      secondaryColor: "#3b82f6",
      status: EntityStatus.ACTIVE,
    },
  });

  console.log("Created system tenant:", systemTenant.name);

  // Create Demo Tenant
  const demoTenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      name: "Demo Windpark GmbH",
      slug: "demo",
      primaryColor: "#059669",
      secondaryColor: "#10b981",
      contactEmail: "info@demo-windpark.de",
      contactPhone: "+49 123 456789",
      address: "Windstraße 1, 12345 Windstadt",
      status: EntityStatus.ACTIVE,
    },
  });

  console.log("Created demo tenant:", demoTenant.name);

  // Seed Energy Revenue Types for all tenants
  await seedEnergyRevenueTypes(systemTenant.id);
  await seedEnergyRevenueTypes(demoTenant.id);

  // Seed Fund Categories for all tenants
  await seedFundCategories(systemTenant.id);
  await seedFundCategories(demoTenant.id);

  // Seed Tax Rate Configs for all tenants
  await seedTaxRateConfigs(systemTenant.id);
  await seedTaxRateConfigs(demoTenant.id);

  // Seed Position Tax Mappings for all tenants
  await seedPositionTaxMappings(systemTenant.id);
  await seedPositionTaxMappings(demoTenant.id);

  // Seed SKR03 Ledger Accounts for all tenants
  await seedLedgerAccounts(systemTenant.id);
  await seedLedgerAccounts(demoTenant.id);

  // ==========================================================================
  // ROLES — create system roles (hierarchy determines access level)
  // ==========================================================================
  const roleSuperadmin = await prisma.role.upsert({
    where: { name_tenantId: { name: "SUPERADMIN", tenantId: systemTenant.id } },
    update: {},
    create: { name: "SUPERADMIN", description: "Vollzugriff auf alle Mandanten", isSystem: true, hierarchy: 100, tenantId: systemTenant.id },
  });
  const roleAdmin = await prisma.role.upsert({
    where: { name_tenantId: { name: "ADMIN", tenantId: demoTenant.id } },
    update: {},
    create: { name: "ADMIN", description: "Administrator", isSystem: true, hierarchy: 80, tenantId: demoTenant.id },
  });
  const roleManager = await prisma.role.upsert({
    where: { name_tenantId: { name: "MANAGER", tenantId: demoTenant.id } },
    update: {},
    create: { name: "MANAGER", description: "Manager", isSystem: true, hierarchy: 60, tenantId: demoTenant.id },
  });
  console.log("Roles created/verified");

  // ==========================================================================
  // USERS — create without role field (uses UserRoleAssignment instead)
  // ==========================================================================
  const superadminPassword = await bcrypt.hash(
    process.env.SEED_SUPERADMIN_PASSWORD || "admin123",
    12
  );
  const superadmin = await prisma.user.upsert({
    where: { email: "admin@windparkmanager.de" },
    update: {},
    create: {
      email: "admin@windparkmanager.de",
      passwordHash: superadminPassword,
      firstName: "Super",
      lastName: "Admin",
      tenantId: systemTenant.id,
      status: EntityStatus.ACTIVE,
    },
  });

  // Assign role + tenant membership
  await prisma.userRoleAssignment.upsert({
    where: { userId_roleId_resourceType: { userId: superadmin.id, roleId: roleSuperadmin.id, resourceType: "__global__" } },
    update: {},
    create: { userId: superadmin.id, roleId: roleSuperadmin.id, tenantId: systemTenant.id },
  });
  await prisma.userTenantMembership.upsert({
    where: { userId_tenantId: { userId: superadmin.id, tenantId: systemTenant.id } },
    update: {},
    create: { userId: superadmin.id, tenantId: systemTenant.id, isPrimary: true },
  });
  console.log("Created superadmin:", superadmin.email);

  const demoAdminPassword = await bcrypt.hash(
    process.env.SEED_DEMO_ADMIN_PASSWORD || "demo123",
    12
  );
  const demoAdmin = await prisma.user.upsert({
    where: { email: "admin@demo-windpark.de" },
    update: {},
    create: {
      email: "admin@demo-windpark.de",
      passwordHash: demoAdminPassword,
      firstName: "Demo",
      lastName: "Admin",
      tenantId: demoTenant.id,
      status: EntityStatus.ACTIVE,
    },
  });
  await prisma.userRoleAssignment.upsert({
    where: { userId_roleId_resourceType: { userId: demoAdmin.id, roleId: roleAdmin.id, resourceType: "__global__" } },
    update: {},
    create: { userId: demoAdmin.id, roleId: roleAdmin.id, tenantId: demoTenant.id },
  });
  await prisma.userTenantMembership.upsert({
    where: { userId_tenantId: { userId: demoAdmin.id, tenantId: demoTenant.id } },
    update: {},
    create: { userId: demoAdmin.id, tenantId: demoTenant.id, isPrimary: true },
  });
  console.log("Created demo admin:", demoAdmin.email);

  const demoManagerPassword = await bcrypt.hash("demo123", 12);
  const demoManager = await prisma.user.upsert({
    where: { email: "manager@demo-windpark.de" },
    update: {},
    create: {
      email: "manager@demo-windpark.de",
      passwordHash: demoManagerPassword,
      firstName: "Max",
      lastName: "Manager",
      tenantId: demoTenant.id,
      status: EntityStatus.ACTIVE,
    },
  });
  await prisma.userRoleAssignment.upsert({
    where: { userId_roleId_resourceType: { userId: demoManager.id, roleId: roleManager.id, resourceType: "__global__" } },
    update: {},
    create: { userId: demoManager.id, roleId: roleManager.id, tenantId: demoTenant.id },
  });
  await prisma.userTenantMembership.upsert({
    where: { userId_tenantId: { userId: demoManager.id, tenantId: demoTenant.id } },
    update: {},
    create: { userId: demoManager.id, tenantId: demoTenant.id, isPrimary: true },
  });
  console.log("Created demo manager:", demoManager.email);

  // Create Demo Parks
  const park1 = await prisma.park.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Windpark Nordsee",
      shortName: "WP-NORD",
      description: "Offshore Windpark in der Nordsee",
      city: "Cuxhaven",
      postalCode: "27476",
      latitude: 53.8667,
      longitude: 8.7,
      commissioningDate: new Date("2020-06-15"),
      totalCapacityKw: 48000,
      tenantId: demoTenant.id,
      status: EntityStatus.ACTIVE,
    },
  });

  const park2 = await prisma.park.upsert({
    where: { id: "00000000-0000-0000-0000-000000000002" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000002",
      name: "Windpark Binnenland",
      shortName: "WP-BINNEN",
      description: "Onshore Windpark in Niedersachsen",
      city: "Oldenburg",
      postalCode: "26121",
      latitude: 53.1435,
      longitude: 8.2146,
      commissioningDate: new Date("2018-03-20"),
      totalCapacityKw: 24000,
      tenantId: demoTenant.id,
      status: EntityStatus.ACTIVE,
    },
  });

  console.log("Created parks:", park1.name, ",", park2.name);

  // Create Turbines for Park 1
  for (let i = 1; i <= 8; i++) {
    await prisma.turbine.upsert({
      where: { id: `00000000-0000-0000-0001-00000000000${i}` },
      update: {},
      create: {
        id: `00000000-0000-0000-0001-00000000000${i}`,
        designation: `WP-NORD-${String(i).padStart(2, "0")}`,
        serialNumber: `VST-2020-${1000 + i}`,
        manufacturer: "Vestas",
        model: "V164-8.0 MW",
        ratedPowerKw: 8000,
        hubHeightM: 140,
        rotorDiameterM: 164,
        commissioningDate: new Date("2020-06-15"),
        warrantyEndDate: new Date("2025-06-15"),
        parkId: park1.id,
        status: EntityStatus.ACTIVE,
      },
    });
  }

  // Create Turbines for Park 2
  for (let i = 1; i <= 6; i++) {
    await prisma.turbine.upsert({
      where: { id: `00000000-0000-0000-0002-00000000000${i}` },
      update: {},
      create: {
        id: `00000000-0000-0000-0002-00000000000${i}`,
        designation: `WP-BINNEN-${String(i).padStart(2, "0")}`,
        serialNumber: `ENE-2018-${2000 + i}`,
        manufacturer: "Enercon",
        model: "E-126 EP4",
        ratedPowerKw: 4000,
        hubHeightM: 135,
        rotorDiameterM: 127,
        commissioningDate: new Date("2018-03-20"),
        warrantyEndDate: new Date("2023-03-20"),
        parkId: park2.id,
        status: EntityStatus.ACTIVE,
      },
    });
  }

  console.log("Created turbines");

  // Create Demo Fund
  const fund = await prisma.fund.upsert({
    where: { id: "00000000-0000-0000-0000-000000000010" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000010",
      name: "Demo Windenergie GmbH & Co. KG",
      legalForm: "GmbH & Co. KG",
      registrationNumber: "HRA 12345",
      registrationCourt: "Amtsgericht Oldenburg",
      foundingDate: new Date("2015-01-15"),
      totalCapital: 5000000,
      managingDirector: "Demo Admin",
      tenantId: demoTenant.id,
      status: EntityStatus.ACTIVE,
    },
  });

  console.log("Created fund:", fund.name);

  // Link Fund to Parks
  await prisma.fundPark.upsert({
    where: {
      fundId_parkId: {
        fundId: fund.id,
        parkId: park1.id,
      },
    },
    update: {},
    create: {
      fundId: fund.id,
      parkId: park1.id,
      ownershipPercentage: 100,
    },
  });

  await prisma.fundPark.upsert({
    where: {
      fundId_parkId: {
        fundId: fund.id,
        parkId: park2.id,
      },
    },
    update: {},
    create: {
      fundId: fund.id,
      parkId: park2.id,
      ownershipPercentage: 100,
    },
  });

  console.log("Linked fund to parks");

  // Create Demo Persons (for shareholders)
  const persons = [
    { firstName: "Hans", lastName: "Müller", email: "hans.mueller@example.com" },
    { firstName: "Maria", lastName: "Schmidt", email: "maria.schmidt@example.com" },
    { firstName: "Klaus", lastName: "Weber", email: "klaus.weber@example.com" },
    { firstName: "Anna", lastName: "Fischer", email: "anna.fischer@example.com" },
    { firstName: "Peter", lastName: "Wagner", email: "peter.wagner@example.com" },
  ];

  for (let i = 0; i < persons.length; i++) {
    const person = await prisma.person.upsert({
      where: { id: `00000000-0000-0000-0000-00000000002${i}` },
      update: {},
      create: {
        id: `00000000-0000-0000-0000-00000000002${i}`,
        firstName: persons[i].firstName,
        lastName: persons[i].lastName,
        email: persons[i].email,
        phone: `+49 123 ${100000 + i}`,
        street: `Musterstraße ${i + 1}`,
        postalCode: "12345",
        city: "Musterstadt",
        bankIban: `DE89370400440532013${String(i).padStart(3, "0")}`,
        bankBic: "COBADEFFXXX",
        bankName: "Commerzbank",
        tenantId: demoTenant.id,
        status: EntityStatus.ACTIVE,
      },
    });

    // Create Shareholder
    await prisma.shareholder.upsert({
      where: { id: `00000000-0000-0000-0000-00000000003${i}` },
      update: {},
      create: {
        id: `00000000-0000-0000-0000-00000000003${i}`,
        shareholderNumber: `KOM-${String(i + 1).padStart(4, "0")}`,
        entryDate: new Date("2015-01-15"),
        capitalContribution: 100000,
        liabilityAmount: 10000,
        ownershipPercentage: 20,
        votingRightsPercentage: 20,
        distributionPercentage: 20,
        fundId: fund.id,
        personId: person.id,
        status: EntityStatus.ACTIVE,
      },
    });
  }

  console.log("Created persons and shareholders");

  // Assign roles to users
  console.log("Assigning roles to users...");

  // Get system roles
  const superadminRole = await prisma.role.findFirst({
    where: { name: "Superadmin", isSystem: true, tenantId: null },
  });
  const adminRole = await prisma.role.findFirst({
    where: { name: "Administrator", isSystem: true, tenantId: null },
  });
  const managerRole = await prisma.role.findFirst({
    where: { name: "Manager", isSystem: true, tenantId: null },
  });

  if (superadminRole) {
    await prisma.userRoleAssignment.upsert({
      where: {
        userId_roleId_resourceType: {
          userId: superadmin.id,
          roleId: superadminRole.id,
          resourceType: "__global__",
        },
      },
      update: {},
      create: {
        userId: superadmin.id,
        roleId: superadminRole.id,
        resourceType: "__global__",
      },
    });
    console.log("Assigned Superadmin role to", superadmin.email);
  }

  if (adminRole) {
    await prisma.userRoleAssignment.upsert({
      where: {
        userId_roleId_resourceType: {
          userId: demoAdmin.id,
          roleId: adminRole.id,
          resourceType: "__global__",
        },
      },
      update: {},
      create: {
        userId: demoAdmin.id,
        roleId: adminRole.id,
        resourceType: "__global__",
      },
    });
    console.log("Assigned Administrator role to", demoAdmin.email);
  }

  if (managerRole) {
    await prisma.userRoleAssignment.upsert({
      where: {
        userId_roleId_resourceType: {
          userId: demoManager.id,
          roleId: managerRole.id,
          resourceType: "__global__",
        },
      },
      update: {},
      create: {
        userId: demoManager.id,
        roleId: managerRole.id,
        resourceType: "__global__",
      },
    });
    console.log("Assigned Manager role to", demoManager.email);
  }

  console.log("\n✅ Seeding completed!");
  console.log("\n📧 Login credentials:");
  console.log("   Superadmin: admin@windparkmanager.de / admin123");
  console.log("   Demo Admin: admin@demo-windpark.de / demo123");
  console.log("   Demo Manager: manager@demo-windpark.de / demo123");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
