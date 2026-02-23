"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import {
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
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Menu,
  LandPlot,
  Lock,
  ClipboardList,
  Activity,
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useCallback } from "react";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NavChild {
  title: string;
  /** Translation key from nav.* namespace */
  titleKey?: string;
  href: string;
  icon?: React.ElementType;
}

interface NavItem {
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
  featureFlag?: "management-billing";
}

interface NavGroup {
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

const navGroups: NavGroup[] = [
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
    ],
  },

  // ---- Windparks ----
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
      },
      {
        title: "Service-Events",
        titleKey: "serviceEvents",
        href: "/service-events",
        icon: Wrench,
        permission: "service-events:read",
      },
    ],
  },

  // ---- Finanzen ----
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
          { title: "Uebersicht", titleKey: "invoicesOverview", href: "/invoices", icon: Receipt },
          { title: "Versanduebersicht", titleKey: "invoiceDispatch", href: "/invoices/dispatch", icon: Send },
          { title: "Zahlungs-Abgleich", titleKey: "reconciliation", href: "/invoices/reconciliation", icon: Scale },
        ],
      },
      {
        title: "Vertraege",
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
        title: "Energie",
        titleKey: "energy",
        href: "/energy",
        icon: Zap,
        permission: "energy:read",
        children: [
          { title: "Uebersicht", titleKey: "energyOverview", href: "/energy", icon: LayoutDashboard },
          { title: "Produktionsdaten", titleKey: "productionData", href: "/energy/productions", icon: BarChart3 },
          { title: "Netzbetreiber-Daten", titleKey: "gridOperatorData", href: "/energy/settlements", icon: FileBarChart },
          { title: "SCADA-Messdaten", titleKey: "scadaMeasurements", href: "/energy/scada/data", icon: Activity },
          { title: "SCADA-Zuordnung", titleKey: "scadaMapping", href: "/energy/scada", icon: Radio },
          { title: "Netz-Topologie", titleKey: "networkTopology", href: "/energy/topology", icon: Network },
          { title: "Analysen", titleKey: "energyAnalytics", href: "/energy/analytics", icon: TrendingUp },
          { title: "Anomalie-Erkennung", titleKey: "anomalyDetection", href: "/energy/scada/anomalies", icon: AlertTriangle },
        ],
      },
      {
        title: "Betriebsfuehrung",
        titleKey: "managementBilling",
        href: "/management-billing",
        icon: Briefcase,
        permission: "management-billing:read",
        featureFlag: "management-billing",
        children: [
          { title: "Uebersicht", titleKey: "managementBillingOverview", href: "/management-billing" },
          { title: "BF-Vertraege", titleKey: "managementStakeholders", href: "/management-billing/stakeholders" },
          { title: "Abrechnungen", titleKey: "managementBillings", href: "/management-billing/billings" },
        ],
      },
    ],
  },

  // ---- Verwaltung ----
  {
    label: "Verwaltung",
    labelKey: "administration",
    items: [
      {
        title: "Pacht",
        titleKey: "leases",
        href: "/leases",
        icon: LandPlot,
        permission: "leases:read",
        children: [
          { title: "Pachtvertraege", titleKey: "leaseContracts", href: "/leases", icon: ScrollText },
          { title: "Pachtabrechnung", titleKey: "leaseSettlement", href: "/leases/settlement", icon: Calculator },
          { title: "Vorschuesse", titleKey: "advances", href: "/leases/advances", icon: Banknote },
          { title: "Zahlungen", titleKey: "payments", href: "/leases/payments", icon: CreditCard },
          { title: "SHP-Import", titleKey: "shpImport", href: "/leases/import-shp", icon: Upload },
        ],
      },
      {
        title: "Dokumente",
        titleKey: "documents",
        href: "/documents",
        icon: FolderOpen,
        permission: "documents:read",
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
      {
        title: "Berichte",
        titleKey: "reports",
        href: "/reports",
        icon: BarChart3,
        permission: "reports:read",
        children: [
          { title: "Berichte erstellen", titleKey: "createReports", href: "/reports", icon: BarChart3 },
          { title: "Berichtsarchiv", titleKey: "reportArchive", href: "/reports/archive", icon: Archive },
        ],
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
        title: "Abrechnungsperioden",
        titleKey: "settlementPeriods",
        href: "/admin/settlement-periods",
        icon: CalendarClock,
        permission: "admin:settlement-periods",
      },
      {
        title: "Abrechnungsregeln",
        titleKey: "billingRules",
        href: "/admin/billing-rules",
        icon: Receipt,
        permission: "admin:billing-rules",
      },
      {
        title: "Zugriffsreport",
        titleKey: "accessReport",
        href: "/admin/access-report",
        icon: KeyRound,
        permission: "admin:access-report",
      },
      {
        title: "E-Mail-Vorlagen",
        titleKey: "emailTemplates",
        href: "/admin/email",
        icon: Mail,
        permission: "admin:email",
      },
      {
        title: "Massen-Kommunikation",
        titleKey: "massCommunication",
        href: "/admin/mass-communication",
        icon: Send,
        permission: "admin:mass-communication",
      },
      {
        title: "Rechnungseinstellungen",
        titleKey: "invoiceSettings",
        href: "/admin/invoices",
        icon: Receipt,
        permission: "admin:invoice-settings",
      },
      {
        title: "Vorlagen",
        titleKey: "templates",
        href: "/admin/templates",
        icon: FileText,
        permission: "admin:templates",
      },
      {
        title: "GoBD-Archiv",
        titleKey: "gobdArchive",
        href: "/admin/archive",
        icon: Archive,
        permission: "admin:manage",
      },
    ],
  },

  // ---- System (permission-based, typically Superadmin only) ----
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
        title: "System & Wartung",
        titleKey: "systemHealth",
        href: "/admin/system",
        icon: Activity,
        permission: "system:health",
      },
      {
        title: "System-Konfiguration",
        titleKey: "systemConfig",
        href: "/admin/system-config",
        icon: Cog,
        permission: "system:config",
      },
      {
        title: "Audit-Logs",
        titleKey: "auditLogs",
        href: "/admin/audit-logs",
        icon: ClipboardList,
        permission: "system:audit",
      },
      {
        title: "Backup & Speicher",
        titleKey: "backupStorage",
        href: "/admin/backup",
        icon: HardDrive,
        permission: "system:backup",
      },
      {
        title: "Marketing",
        titleKey: "marketing",
        href: "/admin/marketing",
        icon: Megaphone,
        permission: "system:marketing",
      },
      {
        title: "Verguetungsarten",
        titleKey: "revenueTypes",
        href: "/admin/revenue-types",
        icon: Coins,
        permission: "system:revenue-types",
      },
      {
        title: "Steuersaetze",
        titleKey: "taxRates",
        href: "/admin/tax-rates",
        icon: Percent,
        permission: "system:settings",
      },
      {
        title: "Gesellschaftstypen",
        titleKey: "fundCategories",
        href: "/admin/fund-categories",
        icon: Building2,
        permission: "system:fund-categories",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// (Role hierarchy helper removed — all visibility is now permission-based)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Sidebar() {
  const pathname = usePathname();
  const { hasPermission, role, loaded: permissionsLoaded } = usePermissions();
  const { data: session } = useSession();
  const t = useTranslations();
  const { isFeatureEnabled } = useFeatureFlags();

  const tenantLogoUrl = session?.user?.tenantLogoUrl;
  const tenantName = session?.user?.tenantName;

  const [collapsed, setCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  /** Resolve the display title for a nav item or child using translations */
  const getTitle = (item: { title: string; titleKey?: string }) => {
    if (item.titleKey) {
      return t(`nav.${item.titleKey}`);
    }
    return item.title;
  };

  /** Resolve the display label for a nav group using translations */
  const getGroupLabel = (group: NavGroup) => {
    if (group.labelKey) {
      return t(`nav.${group.labelKey}`);
    }
    return group.label;
  };

  // Auto-expand items based on current path
  const isChildActive = (item: NavItem) => {
    if (!item.children) return false;
    return item.children.some(
      (child) =>
        pathname === child.href || pathname.startsWith(child.href + "/")
    );
  };

  const toggleExpanded = (href: string) => {
    setExpandedItems((prev) =>
      prev.includes(href)
        ? prev.filter((h) => h !== href)
        : [...prev, href]
    );
  };

  const isExpanded = (item: NavItem) => {
    return expandedItems.includes(item.href) || isChildActive(item);
  };

  // Group collapse/expand
  const toggleGroup = useCallback((label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  /** Check if a group should show its items */
  const isGroupExpanded = useCallback(
    (group: NavGroup, items: NavItem[]): boolean => {
      // Groups without label (Dashboard) are always expanded
      if (!group.label) return true;
      // If current page is inside this group, always expand
      const hasActiveItem = items.some((item) => {
        if (pathname === item.href || pathname.startsWith(item.href + "/"))
          return true;
        if (item.children)
          return item.children.some(
            (c) => pathname === c.href || pathname.startsWith(c.href + "/")
          );
        return false;
      });
      if (hasActiveItem) return true;
      // Otherwise respect user's collapse toggle
      return !collapsedGroups.has(group.label);
    },
    [pathname, collapsedGroups]
  );

  // -----------------------------------------------------------------------
  // Visibility helpers
  // -----------------------------------------------------------------------

  /** Check if a nav item should be visible */
  const isItemVisible = (item: NavItem): boolean => {
    // Check feature flag first (applies to all roles including SUPERADMIN)
    if (item.featureFlag && !isFeatureEnabled(item.featureFlag)) return false;
    if (!item.permission) return true; // No permission required
    if (!permissionsLoaded) return true; // Show while loading to prevent layout shift
    // Only SUPERADMIN bypasses permission checks
    if (role === "SUPERADMIN") return true;
    return hasPermission(item.permission);
  };

  /** Check if a nav group should be visible (at least 1 item must be visible) */
  const isGroupVisible = (group: NavGroup): boolean => {
    if (role === "SUPERADMIN") return true;
    // Group is visible when at least one of its items is visible
    return group.items.some(isItemVisible);
  };

  /** Filter items in a group and return only visible ones */
  const getVisibleItems = (group: NavGroup): NavItem[] => {
    return group.items.filter(isItemVisible);
  };

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  const renderNavItem = (item: NavItem) => {
    const hasChildren = item.children && item.children.length > 0;
    const itemExpanded = hasChildren && isExpanded(item);
    const isActive = hasChildren
      ? isChildActive(item)
      : pathname === item.href || pathname.startsWith(item.href + "/");
    const itemTitle = getTitle(item);

    return (
      <li key={item.href}>
        {hasChildren ? (
          <>
            <button
              onClick={() => toggleExpanded(item.href)}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 w-full",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground border-l-2 border-transparent"
              )}
              title={collapsed ? itemTitle : undefined}
              aria-expanded={itemExpanded}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">{itemTitle}</span>
                  {itemExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </>
              )}
            </button>
            {!collapsed && itemExpanded && (
              <ul className="mt-1 ml-4 space-y-1">
                {item.children!.map((child) => {
                  const isChildItemActive =
                    pathname === child.href ||
                    pathname.startsWith(child.href + "/");
                  const ChildIcon = child.icon;
                  const childTitle = getTitle(child);
                  return (
                    <li key={child.href}>
                      <Link
                        href={child.href}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200",
                          isChildItemActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-primary"
                            : "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground border-l-2 border-transparent"
                        )}
                        aria-current={isChildItemActive ? "page" : undefined}
                      >
                        {ChildIcon && (
                          <ChildIcon className="h-4 w-4 shrink-0" />
                        )}
                        <span>{childTitle}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : (
          <Link
            href={item.href}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-primary"
                : "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground border-l-2 border-transparent"
            )}
            title={collapsed ? itemTitle : undefined}
            aria-current={isActive ? "page" : undefined}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1">{itemTitle}</span>
                {item.badge && (
                  <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                )}
              </>
            )}
          </Link>
        )}
      </li>
    );
  };

  // -----------------------------------------------------------------------
  // Main render
  // -----------------------------------------------------------------------

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-20 px-4 border-b border-sidebar-border">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
            {tenantLogoUrl ? (
              <Image
                src={tenantLogoUrl}
                alt={tenantName || "Logo"}
                width={180}
                height={56}
                className="h-14 w-auto object-contain"
                priority
              />
            ) : (
              <>
                <Wind className="h-6 w-6 text-primary shrink-0" />
                <span className="font-semibold text-lg truncate">{tenantName || "WPM"}</span>
              </>
            )}
          </Link>
        )}
        {collapsed && tenantLogoUrl && (
          <Link href="/dashboard" className="mx-auto">
            <Image
              src={tenantLogoUrl}
              alt={tenantName || "Logo"}
              width={32}
              height={32}
              className="h-8 w-8 object-contain"
              priority
            />
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="h-8 w-8"
          aria-label={
            collapsed
              ? t("sidebar.expand")
              : t("sidebar.collapse")
          }
        >
          {collapsed ? (
            <Menu className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav
        className="flex-1 overflow-y-auto py-4"
        aria-label={t("sidebar.mainNavigation")}
      >
        {navGroups.map((group, groupIdx) => {
          // Check group-level visibility
          if (!isGroupVisible(group)) return null;

          // Filter items within the group by permission
          const visibleItems = getVisibleItems(group);

          // Hide the group entirely if no items are visible
          if (visibleItems.length === 0) return null;

          const groupExpanded = isGroupExpanded(group, visibleItems);

          return (
            <div key={group.label ?? `group-${groupIdx}`} className={cn("mb-4", groupIdx > 0 && group.label && !group.showSeparator && !collapsed && "pt-2")}>
              {/* Separator before Administration and System groups */}
              {group.showSeparator && (
                <div className="mx-3 mb-3 border-t border-sidebar-border/60" />
              )}

              {/* Section label - clickable to collapse/expand */}
              {group.label && !collapsed && (
                <button
                  onClick={() => toggleGroup(group.label!)}
                  className="flex items-center justify-between w-full px-4 mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span>{getGroupLabel(group)}</span>
                  {groupExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </button>
              )}

              {/* Items - show when expanded or in icon-only mode */}
              {(groupExpanded || collapsed) && (
                <ul className="space-y-1 px-2">
                  {visibleItems.map(renderNavItem)}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
