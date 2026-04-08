import {
  Bell,
  LayoutDashboard,
  Wind,
  Wrench,
  Building2,
  FileText,
  Vote,
  FolderOpen,
  Receipt,
  BarChart3,
  Newspaper,
  Settings,
  Shield,
  LandPlot,
  Lock,
  ClipboardList,
  Activity,
  BarChart2,
  Mail,
  HardDrive,
  CreditCard,
  ScrollText,
  KeyRound,
  Archive,
  Cog,
  Zap,
  Radio,
  Users,
  CalendarClock,
  ToggleLeft,
  TrendingUp,
  FileBarChart,
  GitCompare,
  Banknote,
  Scale,
  Send,
  Network,
  AlertTriangle,
  Megaphone,
  Calculator,
  Coins,
  Upload,
  Briefcase,
  Percent,
  Landmark,
  BookOpen,
  ContactRound,
  Inbox,
  Wallet,
  FileSpreadsheet,
  FolderSync,
  Tag,
  Droplets,
  Code2,
  Link2,
  Map,
  Database,
} from "lucide-react";

// Re-export icons so sidebar.tsx can import them from here for SIDEBAR_LINK_ICONS
export {
  Bell,
  LayoutDashboard,
  Wind,
  Wrench,
  Building2,
  FileText,
  Vote,
  FolderOpen,
  Receipt,
  BarChart3,
  Newspaper,
  Settings,
  Shield,
  LandPlot,
  Lock,
  ClipboardList,
  Activity,
  BarChart2,
  Mail,
  HardDrive,
  CreditCard,
  ScrollText,
  KeyRound,
  Archive,
  Cog,
  Zap,
  Radio,
  Users,
  CalendarClock,
  ToggleLeft,
  TrendingUp,
  FileBarChart,
  GitCompare,
  Banknote,
  Scale,
  Send,
  Network,
  AlertTriangle,
  Megaphone,
  Calculator,
  Coins,
  Upload,
  Briefcase,
  Percent,
  Landmark,
  BookOpen,
  ContactRound,
  Inbox,
  Wallet,
  FileSpreadsheet,
  FolderSync,
  Tag,
  Droplets,
  Code2,
  Link2,
  Map,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NavChild {
  title: string;
  /** Translation key from nav.* namespace */
  titleKey?: string;
  href: string;
  icon?: React.ElementType;
  /** Feature flag that must be enabled for this child to be visible */
  featureFlag?: "management-billing" | "paperless" | "communication" | "crm" | "gis" | "inbox" | "wirtschaftsplan" | "accounting" | "document-routing"
    | "accounting.reports" | "accounting.bank" | "accounting.dunning" | "accounting.sepa" | "accounting.ustva"
    | "accounting.assets" | "accounting.cashbook" | "accounting.datev" | "accounting.yearend"
    | "accounting.costcenter" | "accounting.budget" | "accounting.quotes" | "accounting.liquidity"
    | "accounting.ocr" | "accounting.multibanking" | "accounting.zm"
    | "ppa-management" | "solar" | "storage"
    | "predictive-maintenance" | "investor-reports";
}

export interface NavItem {
  title: string;
  /** Translation key from nav.* namespace */
  titleKey?: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
  children?: NavChild[];
  /** Permission required to show this item (omit = always visible within its group) */
  permission?: string;
  /** Feature flag that must be enabled for this item to be visible */
  featureFlag?: "management-billing" | "paperless" | "communication" | "crm" | "gis" | "inbox" | "wirtschaftsplan" | "accounting" | "document-routing"
    | "accounting.reports" | "accounting.bank" | "accounting.dunning" | "accounting.sepa" | "accounting.ustva"
    | "accounting.assets" | "accounting.cashbook" | "accounting.datev" | "accounting.yearend"
    | "accounting.costcenter" | "accounting.budget" | "accounting.quotes" | "accounting.liquidity"
    | "accounting.ocr" | "accounting.multibanking" | "accounting.zm"
    | "ppa-management" | "solar" | "storage"
    | "predictive-maintenance" | "investor-reports";
}

export interface NavGroup {
  /** Label shown as section header (null = no header, e.g. Dashboard) */
  label: string | null;
  /** Translation key from nav.* namespace for the group label */
  labelKey?: string;
  items: NavItem[];
  /** Whether to show a separator line above this group */
  showSeparator?: boolean;
}

// ---------------------------------------------------------------------------
// Navigation structure
// ---------------------------------------------------------------------------

export const navGroups: NavGroup[] = [
  // ---- Dashboard (always visible to authenticated users) ----
  {
    label: null,
    items: [
      {
        title: "Dashboard",
        titleKey: "dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
      },
      {
        title: "Benachrichtigungen",
        titleKey: "notifications",
        href: "/notifications",
        icon: Bell,
      },
    ],
  },

  // ---- CRM ----
  {
    label: "CRM",
    labelKey: "crm",
    items: [
      {
        title: "Übersicht",
        titleKey: "crmOverview",
        href: "/crm",
        icon: Users,
        permission: "crm:read",
        featureFlag: "crm" as const,
      },
      {
        title: "Kontakte",
        titleKey: "crmContacts",
        href: "/crm/contacts",
        icon: ContactRound,
        permission: "crm:read",
        featureFlag: "crm" as const,
      },
    ],
  },

  // ---- Eingang (Inbox) ----
  {
    label: "Eingang",
    labelKey: "inbox",
    items: [
      {
        title: "Eingangsrechnungen",
        titleKey: "inboxInvoices",
        href: "/inbox",
        icon: Inbox,
        permission: "inbox:read",
        featureFlag: "inbox" as const,
      },
      {
        title: "Lieferanten",
        titleKey: "vendors",
        href: "/vendors",
        icon: Building2,
        permission: "vendors:read",
        featureFlag: "inbox" as const,
      },
    ],
  },

  // ---- Windparks (inkl. Energie & SCADA) ----
  {
    label: "Windparks",
    labelKey: "windparks",
    items: [
      {
        title: "Parks",
        titleKey: "parks",
        href: "/parks",
        icon: Wind,
        permission: "parks:read",
        children: [
          { title: "Übersicht", titleKey: "parksOverview", href: "/parks", icon: Wind },
        ],
      },
      {
        title: "Service-Events",
        titleKey: "serviceEvents",
        href: "/service-events",
        icon: Wrench,
        permission: "service-events:read",
      },
      {
        title: "Energie",
        titleKey: "energy",
        href: "/energy",
        icon: Zap,
        permission: "energy:read",
        children: [
          { title: "Übersicht", titleKey: "energyOverview", href: "/energy", icon: LayoutDashboard },
          { title: "Produktionsdaten", titleKey: "productionData", href: "/energy/productions", icon: BarChart3 },
          { title: "Netzbetreiber-Daten", titleKey: "gridOperatorData", href: "/energy/settlements", icon: FileBarChart },
          { title: "SCADA-Messdaten", titleKey: "scadaMeasurements", href: "/energy/scada/data", icon: Activity },
          { title: "SCADA-Zuordnung", titleKey: "scadaMapping", href: "/energy/scada", icon: Radio },
          { title: "Netz-Topologie", titleKey: "networkTopology", href: "/energy/topology", icon: Network },
          { title: "Anomalie-Erkennung", titleKey: "anomalyDetection", href: "/energy/scada/anomalies", icon: AlertTriangle },
          { title: "Energie-Analysen", titleKey: "energyAnalytics", href: "/energy/analytics", icon: TrendingUp },
        ],
      },
    ],
  },

  // ---- Betriebsführung (eigene Gruppe) ----
  {
    label: "Betriebsführung",
    labelKey: "managementBilling",
    items: [
      {
        title: "Betriebsführung",
        titleKey: "managementBilling",
        href: "/management-billing",
        icon: Briefcase,
        permission: "management-billing:read",
        featureFlag: "management-billing",
        children: [
          { title: "Übersicht", titleKey: "managementBillingOverview", href: "/management-billing" },
          { title: "BF-Verträge", titleKey: "managementStakeholders", href: "/management-billing/stakeholders" },
          { title: "Abrechnungen", titleKey: "managementBillings", href: "/management-billing/billings" },
          { title: "Tagesgeschäft", titleKey: "managementTasks", href: "/management-billing/tasks" },
          { title: "Begehungen", titleKey: "managementInspections", href: "/management-billing/inspections" },
          { title: "Versicherungen", titleKey: "managementInsurance", href: "/management-billing/insurance" },
          { title: "Optimierung", titleKey: "managementOptimization", href: "/management-billing/optimization" },
        ],
      },
    ],
  },

  // ---- Grundstücke & Pachten ----
  {
    label: "Grundstücke & Pachten",
    labelKey: "groundLeases",
    items: [
      {
        title: "Pacht",
        titleKey: "leases",
        href: "/leases",
        icon: LandPlot,
        permission: "leases:read",
        children: [
          { title: "Pachtverträge", titleKey: "leaseContracts", href: "/leases", icon: ScrollText },
          { title: "Pachtabrechnung", titleKey: "leaseSettlement", href: "/leases/settlement", icon: Calculator },
          { title: "Vorschüsse", titleKey: "advances", href: "/leases/advances", icon: Banknote },
          { title: "Zahlungen", titleKey: "payments", href: "/leases/payments", icon: CreditCard },
          { title: "SHP-Import", titleKey: "shpImport", href: "/leases/import-shp", icon: Upload },
        ],
      },
      {
        title: "GIS-Karte",
        titleKey: "gis",
        href: "/gis",
        icon: Map,
        permission: "plots:read",
        featureFlag: "gis" as const,
      },
      {
        title: "Fristen-Kalender",
        titleKey: "deadlines",
        href: "/verwaltung/fristen",
        icon: CalendarClock,
        permission: "leases:read",
      },
    ],
  },

  // ---- Finanzen (verschlankt) ----
  {
    label: "Finanzen",
    labelKey: "finances",
    items: [
      {
        title: "Rechnungen",
        titleKey: "invoices",
        href: "/invoices",
        icon: Receipt,
        permission: "invoices:read",
        children: [
          { title: "Übersicht", titleKey: "invoicesOverview", href: "/invoices", icon: Receipt },
          { title: "Angebote", titleKey: "accountingQuotes", href: "/buchhaltung/angebote", icon: FileText, featureFlag: "accounting.quotes" },
          { title: "Versandübersicht", titleKey: "invoiceDispatch", href: "/invoices/dispatch", icon: Send },
          { title: "Zahlungs-Abgleich", titleKey: "reconciliation", href: "/invoices/reconciliation", icon: Scale },
          { title: "Bank-Import", titleKey: "bankImport", href: "/invoices/bank-import", icon: Landmark },
          { title: "Mahnwesen", titleKey: "reminders", href: "/invoices/reminders", icon: Bell },
          { title: "Buchungsjournal", titleKey: "journalEntries", href: "/journal-entries", icon: BookOpen },
          { title: "PPA-Verträge", titleKey: "ppa", href: "/invoices/ppa", icon: Zap, featureFlag: "ppa-management" },
        ],
      },
      {
        title: "Verträge",
        titleKey: "contracts",
        href: "/contracts",
        icon: FileText,
        permission: "contracts:read",
      },
      {
        title: "Beteiligungen",
        titleKey: "funds",
        href: "/funds",
        icon: Building2,
        permission: "funds:read",
      },
      {
        title: "Wirtschaftsplan",
        titleKey: "wirtschaftsplan",
        href: "/wirtschaftsplan",
        icon: BarChart3,
        permission: "wirtschaftsplan:read",
        featureFlag: "wirtschaftsplan",
        children: [
          { title: "Übersicht", titleKey: "wirtschaftsplanOverview", href: "/wirtschaftsplan", icon: BarChart3 },
          { title: "Gewinn & Verlust", titleKey: "wirtschaftsplanPL", href: "/wirtschaftsplan/pl", icon: TrendingUp },
          { title: "Budgetplanung", titleKey: "wirtschaftsplanBudget", href: "/wirtschaftsplan/budget", icon: Wallet },
          { title: "Kostenstellen", titleKey: "wirtschaftsplanCostCenters", href: "/wirtschaftsplan/cost-centers", icon: Building2 },
        ],
      },
      {
        title: "Buchhaltung",
        titleKey: "accounting",
        href: "/buchhaltung",
        icon: Calculator,
        permission: "accounting:read",
        featureFlag: "accounting",
        children: [
          { title: "Kontenrahmen", titleKey: "accountingAccounts", href: "/admin/kontenrahmen", icon: BookOpen },
          { title: "Berichte", titleKey: "accountingReports", href: "/buchhaltung/berichte", icon: BarChart3, featureFlag: "accounting.reports" },
          { title: "Planung", titleKey: "accountingPlanning", href: "/buchhaltung/planung", icon: TrendingUp, featureFlag: "accounting.costcenter" },
          { title: "Banking", titleKey: "accountingBanking", href: "/buchhaltung/banking", icon: Landmark, featureFlag: "accounting.bank" },
          { title: "Zahlungen", titleKey: "accountingPayments", href: "/buchhaltung/zahlungen", icon: Send, featureFlag: "accounting.dunning" },
          { title: "Steuern & Meldungen", titleKey: "accountingTax", href: "/buchhaltung/steuern", icon: Percent, featureFlag: "accounting.ustva" },
          { title: "Kassenbuch", titleKey: "accountingCashbook", href: "/buchhaltung/kassenbuch", icon: Coins, featureFlag: "accounting.cashbook" },
          { title: "Export & Abschluss", titleKey: "accountingExport", href: "/buchhaltung/abschluss", icon: Archive, featureFlag: "accounting.datev" },
        ],
      },
      {
        title: "Dokumente",
        titleKey: "documents",
        href: "/documents",
        icon: FolderOpen,
        permission: "documents:read",
        children: [
          { title: "Übersicht", titleKey: "documentOverview", href: "/documents" },
          { title: "Paperless-ngx", titleKey: "paperless", href: "/documents/paperless", featureFlag: "paperless" },
        ],
      },
    ],
  },

  // ---- Kommunikation (inkl. Votes & News) ----
  {
    label: "Kommunikation",
    labelKey: "communication",
    items: [
      {
        title: "Übersicht",
        titleKey: "mailingsOverview",
        href: "/kommunikation",
        icon: Mail,
        permission: "mailings:read",
        featureFlag: "communication",
      },
      {
        title: "Vorlagen",
        titleKey: "mailingTemplates",
        href: "/kommunikation/vorlagen",
        icon: FileText,
        permission: "mailings:read",
        featureFlag: "communication",
      },
      {
        title: "E-Mail-Einstellungen",
        titleKey: "emailSettings",
        href: "/kommunikation/email",
        icon: Cog,
        permission: "admin:email",
        featureFlag: "communication",
      },
      {
        title: "Abstimmungen",
        titleKey: "votes",
        href: "/votes",
        icon: Vote,
        permission: "votes:read",
      },
      {
        title: "Meldungen",
        titleKey: "news",
        href: "/news",
        icon: Newspaper,
        permission: "news:read",
      },
    ],
  },

  // ---- Administration (permission-based, no role bypass) ----
  {
    label: "Administration",
    labelKey: "admin",
    showSeparator: true,
    items: [
      {
        title: "Einstellungen",
        titleKey: "settings",
        href: "/settings",
        icon: Settings,
        permission: "settings:read",
      },
      {
        title: "Rollen & Rechte",
        titleKey: "rolesPermissions",
        href: "/admin/roles",
        icon: Shield,
        permission: "roles:read",
      },
      {
        title: "Zugriffsreport",
        titleKey: "accessReport",
        href: "/admin/access-report",
        icon: KeyRound,
        permission: "admin:access-report",
      },
      {
        title: "Abrechnung",
        titleKey: "billing",
        href: "/admin/billing",
        icon: Receipt,
        permission: "admin:invoice-settings",
      },
      {
        title: "Dokumente & Vorlagen",
        titleKey: "documentsAdmin",
        href: "/admin/documents-admin",
        icon: FileText,
        permission: "admin:templates",
      },
      {
        title: "Dokument-Routing",
        titleKey: "documentRouting",
        href: "/admin/document-routing",
        icon: FolderSync,
        permission: "admin:manage",
        featureFlag: "document-routing" as const,
      },
      {
        title: "E-Mail-Routen",
        titleKey: "emailRoutes",
        href: "/admin/email-routes",
        icon: Mail,
        permission: "admin:manage",
      },
    ],
  },

  // ---- System (SUPERADMIN only, pinned bottom) ----
  {
    label: "System",
    labelKey: "system",
    showSeparator: true,
    items: [
      {
        title: "Mandanten",
        titleKey: "tenants",
        href: "/admin/tenants",
        icon: Network,
        permission: "system:tenants",
      },
      {
        title: "Einstellungen",
        titleKey: "systemSettings",
        href: "/admin/settings",
        icon: Cog,
        permission: "system:settings",
      },
      {
        title: "System",
        titleKey: "systemAdmin",
        href: "/admin/system-admin",
        icon: Activity,
        permission: "system:health",
      },
      {
        title: "Monitoring",
        titleKey: "monitoringAdmin",
        href: "/admin/monitoring-admin",
        icon: BarChart2,
        permission: "system:health",
      },
      {
        title: "Stammdaten",
        titleKey: "masterData",
        href: "/admin/master-data",
        icon: Database,
        permission: "system:settings",
      },
      {
        title: "Marketing",
        titleKey: "marketing",
        href: "/admin/marketing",
        icon: Megaphone,
        permission: "system:marketing",
      },
      {
        title: "Kontenrahmen",
        titleKey: "chartOfAccounts",
        href: "/admin/kontenrahmen",
        icon: ClipboardList,
        permission: "system:settings",
      },
      {
        title: "Versionsverwaltung",
        titleKey: "versionManagement",
        href: "/admin/version",
        icon: Tag,
        permission: "system:config",
      },
    ],
  },
];
