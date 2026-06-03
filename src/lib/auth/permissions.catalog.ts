/**
 * PERMISSION CATALOG — Single Source of Truth (SSOT)
 * ====================================================
 *
 * Ziel: EINE Quelle für alle Permissions statt 3 (PERMISSIONS-const + seed.ts + DB).
 *
 * Aktueller Status (Q1-Architektur-Investment, Schritt 1 + 4):
 *   - Dieser Catalog ist die NEUE Source-of-Truth.
 *   - Boot-Sync (sync-permissions.ts) hält die DB hieraus aktuell.
 *
 * TODO (Schritt 2 + 3, geplant):
 *   - `prisma/seed.ts` soll `PERMISSION_CATALOG` direkt importieren statt
 *     die manuelle `permissionsData`-Liste zu pflegen.
 *   - `src/lib/auth/permissions.ts` soll `PERMISSIONS`-const aus diesem
 *     Catalog re-exportieren statt manuell zu pflegen.
 *   - Bis dahin: Drift-Check via `scripts/check-permissions-drift.ts`.
 *
 * Spiegelt aktuell vollständig die seed.ts-Liste (~120 Permissions) wider,
 * inkl. aller Felder (name, module, action, displayName, description, sortOrder).
 */

export interface PermissionDef {
  /** Kanonischer Name, z. B. "accounting:read". Wird zum DB-Schlüssel. */
  name: string;
  /** Modul-Bereich, z. B. "accounting". */
  module: string;
  /** Aktion innerhalb des Moduls, z. B. "read". */
  action: string;
  /** Lesbarer Anzeigename (DE). */
  displayName: string;
  /** Optionale ausführliche Beschreibung. */
  description?: string;
  /** Sortier-Reihenfolge in der UI. */
  sortOrder: number;
  /** Optionale Gruppierung für UI-Tabs. */
  category?: string;
  /** Markierung für 4-Augen-Prinzip / Approval-Pflicht. */
  requiresApproval?: boolean;
}

/**
 * KANONISCHER CATALOG aller Permissions.
 *
 * Reihenfolge entspricht prisma/seed.ts und ist sinnvoll gruppiert.
 * sortOrder-Werte stammen aus seed.ts (NICHT der Index in dieser Liste!).
 */
export const PERMISSION_CATALOG: readonly PermissionDef[] = [
  // ── Parks ──────────────────────────────────────────────────────────────
  { name: "parks:read",   module: "parks", action: "read",   displayName: "Windparks anzeigen",     sortOrder: 1 },
  { name: "parks:create", module: "parks", action: "create", displayName: "Windparks erstellen",    sortOrder: 2 },
  { name: "parks:update", module: "parks", action: "update", displayName: "Windparks bearbeiten",   sortOrder: 3 },
  { name: "parks:delete", module: "parks", action: "delete", displayName: "Windparks löschen",      sortOrder: 4 },
  { name: "parks:export", module: "parks", action: "export", displayName: "Windparks exportieren",  sortOrder: 5 },

  // ── Turbines ───────────────────────────────────────────────────────────
  { name: "turbines:read",   module: "turbines", action: "read",   displayName: "Anlagen anzeigen",    sortOrder: 10 },
  { name: "turbines:create", module: "turbines", action: "create", displayName: "Anlagen erstellen",   sortOrder: 11 },
  { name: "turbines:update", module: "turbines", action: "update", displayName: "Anlagen bearbeiten",  sortOrder: 12 },
  { name: "turbines:delete", module: "turbines", action: "delete", displayName: "Anlagen löschen",     sortOrder: 13 },
  { name: "turbines:export", module: "turbines", action: "export", displayName: "Anlagen exportieren", sortOrder: 14 },

  // ── Funds ──────────────────────────────────────────────────────────────
  { name: "funds:read",   module: "funds", action: "read",   displayName: "Beteiligungen anzeigen",    sortOrder: 20 },
  { name: "funds:create", module: "funds", action: "create", displayName: "Beteiligungen erstellen",   sortOrder: 21 },
  { name: "funds:update", module: "funds", action: "update", displayName: "Beteiligungen bearbeiten",  sortOrder: 22 },
  { name: "funds:delete", module: "funds", action: "delete", displayName: "Beteiligungen löschen",     sortOrder: 23 },
  { name: "funds:export", module: "funds", action: "export", displayName: "Beteiligungen exportieren", sortOrder: 24 },

  // ── Shareholders ───────────────────────────────────────────────────────
  { name: "shareholders:read",   module: "shareholders", action: "read",   displayName: "Gesellschafter anzeigen",    sortOrder: 30 },
  { name: "shareholders:create", module: "shareholders", action: "create", displayName: "Gesellschafter erstellen",   sortOrder: 31 },
  { name: "shareholders:update", module: "shareholders", action: "update", displayName: "Gesellschafter bearbeiten",  sortOrder: 32 },
  { name: "shareholders:delete", module: "shareholders", action: "delete", displayName: "Gesellschafter löschen",     sortOrder: 33 },
  { name: "shareholders:export", module: "shareholders", action: "export", displayName: "Gesellschafter exportieren", sortOrder: 34 },

  // ── Plots ──────────────────────────────────────────────────────────────
  { name: "plots:read",   module: "plots", action: "read",   displayName: "Flurstücke anzeigen",    sortOrder: 40 },
  { name: "plots:create", module: "plots", action: "create", displayName: "Flurstücke erstellen",   sortOrder: 41 },
  { name: "plots:update", module: "plots", action: "update", displayName: "Flurstücke bearbeiten",  sortOrder: 42 },
  { name: "plots:delete", module: "plots", action: "delete", displayName: "Flurstücke löschen",     sortOrder: 43 },
  { name: "plots:export", module: "plots", action: "export", displayName: "Flurstücke exportieren", sortOrder: 44 },

  // ── Leases ─────────────────────────────────────────────────────────────
  { name: "leases:read",   module: "leases", action: "read",   displayName: "Pachtverträge anzeigen",    sortOrder: 50 },
  { name: "leases:create", module: "leases", action: "create", displayName: "Pachtverträge erstellen",   sortOrder: 51 },
  { name: "leases:update", module: "leases", action: "update", displayName: "Pachtverträge bearbeiten",  sortOrder: 52 },
  { name: "leases:delete", module: "leases", action: "delete", displayName: "Pachtverträge löschen",     sortOrder: 53 },
  { name: "leases:export", module: "leases", action: "export", displayName: "Pachtverträge exportieren", sortOrder: 54 },

  // ── Contracts ──────────────────────────────────────────────────────────
  { name: "contracts:read",   module: "contracts", action: "read",   displayName: "Verträge anzeigen",    sortOrder: 60 },
  { name: "contracts:create", module: "contracts", action: "create", displayName: "Verträge erstellen",   sortOrder: 61 },
  { name: "contracts:update", module: "contracts", action: "update", displayName: "Verträge bearbeiten",  sortOrder: 62 },
  { name: "contracts:delete", module: "contracts", action: "delete", displayName: "Verträge löschen",     sortOrder: 63 },
  { name: "contracts:export", module: "contracts", action: "export", displayName: "Verträge exportieren", sortOrder: 64 },

  // ── Documents ──────────────────────────────────────────────────────────
  { name: "documents:read",     module: "documents", action: "read",     displayName: "Dokumente anzeigen",         sortOrder: 70 },
  { name: "documents:create",   module: "documents", action: "create",   displayName: "Dokumente hochladen",        sortOrder: 71 },
  { name: "documents:update",   module: "documents", action: "update",   displayName: "Dokumente bearbeiten",       sortOrder: 72 },
  { name: "documents:delete",   module: "documents", action: "delete",   displayName: "Dokumente löschen",          sortOrder: 73 },
  { name: "documents:download", module: "documents", action: "download", displayName: "Dokumente herunterladen",    sortOrder: 74 },
  { name: "documents:export",   module: "documents", action: "export",   displayName: "Dokumente exportieren",      sortOrder: 75 },
  { name: "documents:approve",  module: "documents", action: "approve",  displayName: "Dokumente freigeben",        sortOrder: 76, requiresApproval: true },
  { name: "documents:publish",  module: "documents", action: "publish",  displayName: "Dokumente veröffentlichen",  sortOrder: 77 },
  { name: "documents:archive",  module: "documents", action: "archive",  displayName: "Dokumente archivieren",      sortOrder: 78 },

  // ── Invoices ───────────────────────────────────────────────────────────
  { name: "invoices:read",    module: "invoices", action: "read",    displayName: "Rechnungen anzeigen",     sortOrder: 80 },
  { name: "invoices:create",  module: "invoices", action: "create",  displayName: "Rechnungen erstellen",    sortOrder: 81 },
  { name: "invoices:update",  module: "invoices", action: "update",  displayName: "Rechnungen bearbeiten",   sortOrder: 82 },
  { name: "invoices:delete",  module: "invoices", action: "delete",  displayName: "Rechnungen löschen",      sortOrder: 83 },
  { name: "invoices:export",  module: "invoices", action: "export",  displayName: "Rechnungen exportieren",  sortOrder: 84 },
  { name: "invoices:approve", module: "invoices", action: "approve", displayName: "Rechnungen freigeben",    sortOrder: 85, requiresApproval: true },
  { name: "invoices:send",    module: "invoices", action: "send",    displayName: "Rechnungen versenden",    sortOrder: 86 },
  { name: "invoices:cancel",  module: "invoices", action: "cancel",  displayName: "Rechnungen stornieren",   sortOrder: 87 },
  { name: "invoices:correct", module: "invoices", action: "correct", displayName: "Rechnungen korrigieren",  sortOrder: 88 },

  // ── Votes ──────────────────────────────────────────────────────────────
  { name: "votes:read",   module: "votes", action: "read",   displayName: "Abstimmungen anzeigen",   sortOrder: 90 },
  { name: "votes:create", module: "votes", action: "create", displayName: "Abstimmungen erstellen",  sortOrder: 91 },
  { name: "votes:update", module: "votes", action: "update", displayName: "Abstimmungen bearbeiten", sortOrder: 92 },
  { name: "votes:delete", module: "votes", action: "delete", displayName: "Abstimmungen löschen",    sortOrder: 93 },
  { name: "votes:manage", module: "votes", action: "manage", displayName: "Abstimmungen verwalten",  sortOrder: 94 },

  // ── News ───────────────────────────────────────────────────────────────
  { name: "news:read",   module: "news", action: "read",   displayName: "Meldungen anzeigen",   sortOrder: 95 },
  { name: "news:create", module: "news", action: "create", displayName: "Meldungen erstellen",  sortOrder: 96 },
  { name: "news:update", module: "news", action: "update", displayName: "Meldungen bearbeiten", sortOrder: 97 },
  { name: "news:delete", module: "news", action: "delete", displayName: "Meldungen löschen",    sortOrder: 98 },

  // ── Service Events ─────────────────────────────────────────────────────
  { name: "service-events:read",   module: "service-events", action: "read",   displayName: "Service-Events anzeigen",    sortOrder: 100 },
  { name: "service-events:create", module: "service-events", action: "create", displayName: "Service-Events erstellen",   sortOrder: 101 },
  { name: "service-events:update", module: "service-events", action: "update", displayName: "Service-Events bearbeiten",  sortOrder: 102 },
  { name: "service-events:delete", module: "service-events", action: "delete", displayName: "Service-Events löschen",     sortOrder: 103 },
  { name: "service-events:export", module: "service-events", action: "export", displayName: "Service-Events exportieren", sortOrder: 104 },

  // ── Energy ─────────────────────────────────────────────────────────────
  { name: "energy:read",   module: "energy", action: "read",   displayName: "Stromabrechnungen anzeigen",    sortOrder: 105 },
  { name: "energy:create", module: "energy", action: "create", displayName: "Stromabrechnungen erstellen",   sortOrder: 106 },
  { name: "energy:update", module: "energy", action: "update", displayName: "Stromabrechnungen bearbeiten",  sortOrder: 107 },
  { name: "energy:delete", module: "energy", action: "delete", displayName: "Stromabrechnungen loeschen",    sortOrder: 108 },
  { name: "energy:export", module: "energy", action: "export", displayName: "Stromabrechnungen exportieren", sortOrder: 109 },

  // ── Reports ────────────────────────────────────────────────────────────
  { name: "reports:read",   module: "reports", action: "read",   displayName: "Berichte anzeigen",    sortOrder: 110 },
  { name: "reports:create", module: "reports", action: "create", displayName: "Berichte erstellen",   sortOrder: 111 },
  { name: "reports:export", module: "reports", action: "export", displayName: "Berichte exportieren", sortOrder: 112 },

  // ── Settings ───────────────────────────────────────────────────────────
  { name: "settings:read",   module: "settings", action: "read",   displayName: "Einstellungen anzeigen",   sortOrder: 120 },
  { name: "settings:update", module: "settings", action: "update", displayName: "Einstellungen bearbeiten", sortOrder: 121 },

  // ── Users ──────────────────────────────────────────────────────────────
  { name: "users:read",        module: "users", action: "read",        displayName: "Benutzer anzeigen",       sortOrder: 130 },
  { name: "users:create",      module: "users", action: "create",      displayName: "Benutzer erstellen",      sortOrder: 131 },
  { name: "users:update",      module: "users", action: "update",      displayName: "Benutzer bearbeiten",     sortOrder: 132 },
  { name: "users:delete",      module: "users", action: "delete",      displayName: "Benutzer löschen",        sortOrder: 133 },
  { name: "users:impersonate", module: "users", action: "impersonate", displayName: "Als Benutzer anmelden",   sortOrder: 134 },

  // ── Roles ──────────────────────────────────────────────────────────────
  { name: "roles:read",   module: "roles", action: "read",   displayName: "Rollen anzeigen",   sortOrder: 140 },
  { name: "roles:create", module: "roles", action: "create", displayName: "Rollen erstellen",  sortOrder: 141 },
  { name: "roles:update", module: "roles", action: "update", displayName: "Rollen bearbeiten", sortOrder: 142 },
  { name: "roles:delete", module: "roles", action: "delete", displayName: "Rollen löschen",    sortOrder: 143 },
  { name: "roles:assign", module: "roles", action: "assign", displayName: "Rollen zuweisen",   sortOrder: 144 },

  // ── Portal (Kommanditisten-Portal) ─────────────────────────────────────
  { name: "portal:access",         module: "portal", action: "read",   displayName: "Portal-Zugang",              sortOrder: 150 },
  { name: "portal:participations", module: "portal", action: "read",   displayName: "Portal-Beteiligungen",       sortOrder: 151 },
  { name: "portal:distributions",  module: "portal", action: "read",   displayName: "Portal-Ausschuettungen",     sortOrder: 152 },
  { name: "portal:documents",      module: "portal", action: "read",   displayName: "Portal-Dokumente",           sortOrder: 153 },
  { name: "portal:reports",        module: "portal", action: "read",   displayName: "Portal-Berichte",            sortOrder: 154 },
  { name: "portal:energyReports",  module: "portal", action: "read",   displayName: "Portal-Energieberichte",     sortOrder: 155 },
  { name: "portal:votes",          module: "portal", action: "read",   displayName: "Portal-Abstimmungen",        sortOrder: 156 },
  { name: "portal:proxies",        module: "portal", action: "read",   displayName: "Portal-Vollmachten",         sortOrder: 157 },
  { name: "portal:profile",        module: "portal", action: "update", displayName: "Portal-Profil bearbeiten",   sortOrder: 158 },

  // ── Mailings ───────────────────────────────────────────────────────────
  { name: "mailings:read",  module: "mailings", action: "read",  displayName: "Serienbriefe anzeigen",              sortOrder: 180 },
  { name: "mailings:write", module: "mailings", action: "write", displayName: "Serienbriefe erstellen/bearbeiten",  sortOrder: 181 },
  { name: "mailings:send",  module: "mailings", action: "send",  displayName: "Serienbriefe versenden",             sortOrder: 182 },

  // ── Admin (Tenant-Level) ───────────────────────────────────────────────
  { name: "admin:manage",              module: "admin", action: "manage",              displayName: "Administration verwalten",      sortOrder: 199 },
  { name: "admin:email",               module: "admin", action: "email",               displayName: "E-Mail-Verwaltung",             sortOrder: 204 },
  { name: "admin:billing-rules",       module: "admin", action: "billing-rules",       displayName: "Abrechnungsregeln verwalten",   sortOrder: 205 },
  { name: "admin:settlement-periods",  module: "admin", action: "settlement-periods",  displayName: "Abrechnungsperioden verwalten", sortOrder: 206 },
  { name: "admin:access-report",       module: "admin", action: "access-report",       displayName: "Zugriffsreport anzeigen",       sortOrder: 207 },
  { name: "admin:mass-communication",  module: "admin", action: "mass-communication",  displayName: "Massen-Kommunikation",          sortOrder: 208 },
  { name: "admin:invoice-settings",    module: "admin", action: "invoice-settings",    displayName: "Rechnungseinstellungen",        sortOrder: 209 },
  { name: "admin:templates",           module: "admin", action: "templates",           displayName: "Vorlagen verwalten",            sortOrder: 210 },
  { name: "admin:impersonate",         module: "admin", action: "impersonate",         displayName: "Benutzer impersonieren",        sortOrder: 211 },
  { name: "admin:tenants",             module: "admin", action: "tenants",             displayName: "Mandanten verwalten (Admin)",   description: "Tenant-Konfiguration und Mitgliederverwaltung", sortOrder: 270 },
  { name: "admin:system",              module: "admin", action: "system",              displayName: "System-Administration",         description: "Tenant-übergreifende System-Settings",          sortOrder: 271 },
  { name: "admin:audit",               module: "admin", action: "audit",               displayName: "Audit-Logs anzeigen (Admin)",   description: "Zugriff auf Audit-Trail",                      sortOrder: 272 },

  // ── System (Superadmin, cross-tenant) ──────────────────────────────────
  { name: "system:tenants",              module: "system", action: "tenants",              displayName: "Mandanten verwalten",        sortOrder: 220 },
  { name: "system:settings",             module: "system", action: "settings",             displayName: "System-Einstellungen",       sortOrder: 221 },
  { name: "system:health",               module: "system", action: "health",               displayName: "System & Wartung",           sortOrder: 222 },
  { name: "system:config",               module: "system", action: "config",               displayName: "System-Konfiguration",       sortOrder: 223 },
  { name: "system:audit",                module: "system", action: "audit",                displayName: "Audit-Logs anzeigen",        sortOrder: 224 },
  { name: "system:backup",               module: "system", action: "backup",               displayName: "Backup & Speicher",          sortOrder: 225 },
  { name: "system:marketing",            module: "system", action: "marketing",            displayName: "Marketing verwalten",        sortOrder: 226 },
  { name: "system:revenue-types",        module: "system", action: "revenue-types",        displayName: "Vergütungsarten verwalten",  sortOrder: 227 },
  { name: "system:fund-categories",      module: "system", action: "fund-categories",      displayName: "Gesellschaftstypen verwalten", sortOrder: 228 },
  { name: "system:settings:write",       module: "system", action: "settings-write",       displayName: "System-Einstellungen aendern", description: "Gesetzliche Werte (GWG/GewSt/Verzugszinsen) pflegen", sortOrder: 260 },
  { name: "system:tax-templates:write",  module: "system", action: "tax-templates-write",  displayName: "Steuer-Templates pflegen",   description: "Globale Steuer-Kategorien fuer alle Mandanten",    sortOrder: 261 },

  // ── Accounting (Buchhaltung) ───────────────────────────────────────────
  { name: "accounting:read",                       module: "accounting", action: "read",                   displayName: "Buchhaltung anzeigen",     sortOrder: 230 },
  { name: "accounting:create",                     module: "accounting", action: "create",                 displayName: "Buchungen erstellen",      sortOrder: 231 },
  { name: "accounting:update",                     module: "accounting", action: "update",                 displayName: "Buchungen bearbeiten",     sortOrder: 232 },
  { name: "accounting:delete",                     module: "accounting", action: "delete",                 displayName: "Buchungen loeschen",       sortOrder: 233 },
  { name: "accounting:period-lock:create",         module: "accounting", action: "period-lock",            displayName: "Periode sperren",          description: "Buchungsperiode schliessen (GoBD)",                                       sortOrder: 234 },
  { name: "accounting:period-lock:delete",         module: "accounting", action: "period-lock",            displayName: "Periode entsperren",       description: "Gesperrte Periode wieder oeffnen (Audit-pflichtig)",                      sortOrder: 235 },
  { name: "accounting:tax-code:read",              module: "accounting", action: "tax-code-read",          displayName: "Steuerschluessel anzeigen", sortOrder: 236 },
  { name: "accounting:tax-code:write",             module: "accounting", action: "tax-code-write",         displayName: "Steuerschluessel bearbeiten", sortOrder: 237 },
  { name: "accounting:value-adjustment:create",    module: "accounting", action: "value-adjustment",       displayName: "Wertberichtigungen anlegen", description: "EWB/PWB/Forderungsausfall buchen",                                       sortOrder: 238 },
  { name: "accounting:journal:reverse",            module: "accounting", action: "reverse",                displayName: "Buchungen stornieren",     description: "Generalumkehr fuer POSTED-Journals",                                      sortOrder: 239 },
  { name: "accounting:post",                       module: "accounting", action: "post",                   displayName: "Buchungen festschreiben",  description: "DRAFT-Buchungen in POSTED-Status setzen (§146 AO Unveraenderbarkeit ab da)", sortOrder: 240, requiresApproval: true },
  { name: "accounting:reverse",                    module: "accounting", action: "reverse",                displayName: "Buchungen stornieren",     description: "Generalumkehr fuer POSTED-Buchungen — eigene Permission gem. HGB-Verantwortungstrennung", sortOrder: 241, requiresApproval: true },
  { name: "accounting:report:bilanz",              module: "accounting", action: "report-bilanz",          displayName: "Bilanz anzeigen",                  sortOrder: 250 },
  { name: "accounting:report:gewst",               module: "accounting", action: "report-gewst",           displayName: "GewSt-Hinzurechnung anzeigen",     sortOrder: 251 },
  { name: "accounting:report:susa",                module: "accounting", action: "report-susa",            displayName: "Summen- und Saldenliste anzeigen", sortOrder: 252 },
  { name: "accounting:report:kontoblatt",          module: "accounting", action: "report-kontoblatt",      displayName: "Kontoblatt anzeigen",              sortOrder: 253 },
  { name: "accounting:report:euer",                module: "accounting", action: "report-euer",            displayName: "EUER §4(3) EStG anzeigen",         sortOrder: 254 },
  { name: "accounting:report:anlagenspiegel",      module: "accounting", action: "report-anlagenspiegel",  displayName: "Anlagenspiegel anzeigen",          sortOrder: 255 },
  { name: "accounting:year-end-close:execute",     module: "accounting", action: "year-end-close",         displayName: "Jahresabschluss ausfuehren",       description: "Saldenvortrag + Bilanz-Snapshot",                                       sortOrder: 256, requiresApproval: true },
  { name: "accounting:gobd-export:create",         module: "accounting", action: "gobd-export",            displayName: "GoBD Z3-Export erstellen",         description: "Datentraegeruberlassung fuer Betriebspruefung",                          sortOrder: 257 },
  { name: "accounting:datev-export:create",        module: "accounting", action: "datev-export",           displayName: "DATEV-Export erstellen",           sortOrder: 258 },

  // ── Management Billing (Betriebsführung) ───────────────────────────────
  { name: "management-billing:read",      module: "management-billing", action: "read",      displayName: "BF-Abrechnungen anzeigen", description: "Betriebsfuehrungsvertraege und Abrechnungen einsehen", sortOrder: 240 },
  { name: "management-billing:create",    module: "management-billing", action: "create",    displayName: "BF-Vertraege erstellen",   description: "Neue Betriebsfuehrungsvertraege anlegen",              sortOrder: 241 },
  { name: "management-billing:update",    module: "management-billing", action: "update",    displayName: "BF-Vertraege bearbeiten",  description: "Betriebsfuehrungsvertraege aendern",                   sortOrder: 242 },
  { name: "management-billing:delete",    module: "management-billing", action: "delete",    displayName: "BF-Vertraege loeschen",    description: "Betriebsfuehrungsvertraege entfernen",                 sortOrder: 243 },
  { name: "management-billing:calculate", module: "management-billing", action: "calculate", displayName: "BF-Abrechnungen berechnen", description: "Abrechnungen fuer Betriebsfuehrung kalkulieren",      sortOrder: 244 },
  { name: "management-billing:invoice",   module: "management-billing", action: "invoice",   displayName: "BF-Rechnungen generieren", description: "Rechnungen aus BF-Abrechnungen erstellen",             sortOrder: 245 },

  // ── CRM ────────────────────────────────────────────────────────────────
  { name: "crm:read",   module: "crm", action: "read",   displayName: "CRM anzeigen",             sortOrder: 280 },
  { name: "crm:create", module: "crm", action: "create", displayName: "CRM-Einträge erstellen",   sortOrder: 281 },
  { name: "crm:update", module: "crm", action: "update", displayName: "CRM-Einträge bearbeiten",  sortOrder: 282 },
  { name: "crm:delete", module: "crm", action: "delete", displayName: "CRM-Einträge löschen",     sortOrder: 283 },

  // ── Energy (granular) ──────────────────────────────────────────────────
  { name: "energy:scada:import",          module: "energy", action: "scada-import",          displayName: "SCADA-Daten importieren",            description: "Enercon WSD/UID-Dateien einlesen",     sortOrder: 290 },
  { name: "energy:settlements:finalize",  module: "energy", action: "settlements-finalize",  displayName: "Energie-Abrechnungen finalisieren",  description: "EnergySettlement von DRAFT → FINAL setzen", sortOrder: 291, requiresApproval: true },

  // ── Inbox (Eingangsrechnungen) ─────────────────────────────────────────
  { name: "inbox:read",    module: "inbox", action: "read",    displayName: "Eingangsrechnungen anzeigen",     sortOrder: 300 },
  { name: "inbox:create",  module: "inbox", action: "create",  displayName: "Eingangsrechnungen erstellen",    sortOrder: 301 },
  { name: "inbox:update",  module: "inbox", action: "update",  displayName: "Eingangsrechnungen bearbeiten",   sortOrder: 302 },
  { name: "inbox:delete",  module: "inbox", action: "delete",  displayName: "Eingangsrechnungen löschen",      sortOrder: 303 },
  { name: "inbox:approve", module: "inbox", action: "approve", displayName: "Eingangsrechnungen freigeben",    description: "Approval-Workflow für Eingangsrechnungen", sortOrder: 304, requiresApproval: true },
  { name: "inbox:export",  module: "inbox", action: "export",  displayName: "Eingangsrechnungen exportieren",  sortOrder: 305 },

  // ── Vendors (Kreditoren) ───────────────────────────────────────────────
  { name: "vendors:read",   module: "vendors", action: "read",   displayName: "Lieferanten anzeigen",   sortOrder: 310 },
  { name: "vendors:create", module: "vendors", action: "create", displayName: "Lieferanten erstellen",  sortOrder: 311 },
  { name: "vendors:update", module: "vendors", action: "update", displayName: "Lieferanten bearbeiten", sortOrder: 312 },
  { name: "vendors:delete", module: "vendors", action: "delete", displayName: "Lieferanten löschen",    sortOrder: 313 },

  // ── Wirtschaftsplan ────────────────────────────────────────────────────
  { name: "wirtschaftsplan:read",   module: "wirtschaftsplan", action: "read",   displayName: "Wirtschaftsplan anzeigen",   sortOrder: 320 },
  { name: "wirtschaftsplan:create", module: "wirtschaftsplan", action: "create", displayName: "Wirtschaftsplan erstellen",  sortOrder: 321 },
  { name: "wirtschaftsplan:update", module: "wirtschaftsplan", action: "update", displayName: "Wirtschaftsplan bearbeiten", sortOrder: 322 },
  { name: "wirtschaftsplan:delete", module: "wirtschaftsplan", action: "delete", displayName: "Wirtschaftsplan löschen",    sortOrder: 323 },
];

/**
 * Lookup-Map by name (für O(1) Zugriff im Sync und in Drift-Checks).
 */
export const PERMISSION_CATALOG_BY_NAME: ReadonlyMap<string, PermissionDef> = new Map(
  PERMISSION_CATALOG.map((p) => [p.name, p]),
);

/**
 * Konstanten-Schlüssel-Konvention: `accounting:report-bilanz` → `ACCOUNTING_REPORT_BILANZ`.
 *
 * Hinweis: Die bestehende `PERMISSIONS`-const in [permissions.ts](./permissions.ts)
 * nutzt teilweise abweichende Schlüssel (z. B. `ACCOUNTING_PERIOD_LOCK_CREATE`
 * statt der hier abgeleiteten Form). Daher generiert dieser Helper aktuell
 * KEINE Live-Constants — er ist nur Referenz für die spätere Codegen-Migration.
 */
export function toConstKey(name: string): string {
  return name.toUpperCase().replace(/[:.\-]/g, "_");
}
