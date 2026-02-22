"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Building2,
  Wallet,
  FolderOpen,
  FileText,
  Vote,
  Wind,
  ChevronLeft,
  Menu,
  UserCircle,
  Users,
  Settings,
  TrendingUp,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  permission?: string; // Required portal permission name (omit = always visible)
  badge?: number;
}

const portalNavItems: NavItem[] = [
  {
    title: "Übersicht",
    href: "/portal",
    icon: LayoutDashboard,
    // No permission needed - always visible
  },
  {
    title: "Meine Beteiligungen",
    href: "/portal/participations",
    icon: Building2,
    permission: "portal:participations",
  },
  {
    title: "Ausschüttungen",
    href: "/portal/distributions",
    icon: Wallet,
    permission: "portal:distributions",
  },
  {
    title: "Dokumente",
    href: "/portal/documents",
    icon: FolderOpen,
    permission: "portal:documents",
  },
  {
    title: "Berichte",
    href: "/portal/reports",
    icon: FileText,
    permission: "portal:reports",
  },
  {
    title: "Anlagen-Performance",
    href: "/portal/energy-analytics",
    icon: Activity,
    permission: "portal:energyReports",
  },
  {
    title: "Energieberichte",
    href: "/portal/energy-reports",
    icon: TrendingUp,
    permission: "portal:energyReports",
  },
  {
    title: "Abstimmungen",
    href: "/portal/votes",
    icon: Vote,
    permission: "portal:votes",
  },
  {
    title: "Vollmachten",
    href: "/portal/proxies",
    icon: Users,
    permission: "portal:proxies",
  },
  {
    title: "Mein Profil",
    href: "/portal/profile",
    icon: UserCircle,
    // Always visible
  },
  {
    title: "Einstellungen",
    href: "/portal/settings",
    icon: Settings,
    // Always visible
  },
];

export function PortalSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/portal/my-permissions")
      .then((res) => (res.ok ? res.json() : { permissions: [] }))
      .then((data) => {
        setPermissions(data.permissions || []);
        setPermissionsLoaded(true);
      })
      .catch(() => {
        setPermissionsLoaded(true);
      });
  }, []);

  // Filter nav items by permission
  const visibleItems = portalNavItems.filter((item) => {
    if (!item.permission) return true; // No permission required - always visible
    if (!permissionsLoaded) return true; // Show all while loading to avoid layout shift
    return permissions.includes(item.permission);
  });

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-sidebar-border">
        {!collapsed && (
          <Link href="/portal" className="flex items-center gap-2">
            <Wind className="h-6 w-6 text-primary" />
            <span className="font-semibold text-lg">Anleger-Portal</span>
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="h-8 w-8"
        >
          {collapsed ? (
            <Menu className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-2">
          {visibleItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/portal" && pathname.startsWith(item.href));
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                  title={collapsed ? item.title : undefined}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1">{item.title}</span>
                      {item.badge && (
                        <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Back to Admin (for users with admin role) */}
      <div className="border-t border-sidebar-border py-4 px-2">
        {!collapsed && (
          <p className="px-3 text-xs text-muted-foreground mb-2">
            Ihr persönliches Anleger-Portal
          </p>
        )}
      </div>
    </aside>
  );
}
