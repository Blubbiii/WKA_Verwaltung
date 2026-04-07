"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import {
  Wind,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Menu,
  Shield,
  GripVertical,
  RotateCcw,
  Globe,
  ExternalLink,
  Monitor,
  Calendar,
  Database,
  Server,
  Cloud,
  BarChart3,
  Zap,
  FileText,
  Calculator,
  Briefcase,
  Mail,
  Code2,
  Settings,
  Link2,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { useState, useCallback, useMemo, useId } from "react";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useSidebarOrder } from "@/hooks/useSidebarOrder";
import { useSidebarLinks } from "@/hooks/useSidebarLinks";
import type { NavChild, NavItem, NavGroup } from "@/config/nav-config";
import { navGroups } from "@/config/nav-config";

export type { NavChild, NavItem, NavGroup };

// ---------------------------------------------------------------------------
// Dynamic sidebar-link icon resolver
// ---------------------------------------------------------------------------

const SIDEBAR_LINK_ICONS: Record<string, React.ElementType> = {
  Globe,
  Monitor,
  BarChart3,
  Zap,
  FileText,
  Calculator,
  Briefcase,
  Mail,
  Calendar,
  Database,
  Server,
  Cloud,
  Code2,
  Settings,
  Link2,
};

function getSidebarLinkIcon(name: string): React.ElementType {
  return SIDEBAR_LINK_ICONS[name] ?? Globe;
}

// ---------------------------------------------------------------------------
// Group pinning: top (Dashboard) and bottom (Admin, System) are fixed
// ---------------------------------------------------------------------------

const PINNED_BOTTOM_KEYS = new Set(["admin", "system"]);

/** Partition navGroups into pinned-top, reorderable middle, pinned-bottom */
function partitionGroups(groups: NavGroup[]) {
  const pinnedTop: NavGroup[] = [];
  const middle: NavGroup[] = [];
  const pinnedBottom: NavGroup[] = [];

  for (const g of groups) {
    if (g.label === null) pinnedTop.push(g);
    else if (g.labelKey && PINNED_BOTTOM_KEYS.has(g.labelKey)) pinnedBottom.push(g);
    else middle.push(g);
  }

  return { pinnedTop, middle, pinnedBottom };
}

/** Sort groups by the saved order array */
function sortGroupsByOrder(groups: NavGroup[], order: string[]): NavGroup[] {
  const orderMap = new Map(order.map((key, idx) => [key, idx]));
  return [...groups].sort((a, b) => {
    const idxA = orderMap.get(a.labelKey ?? "") ?? Infinity;
    const idxB = orderMap.get(b.labelKey ?? "") ?? Infinity;
    return idxA - idxB;
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Sidebar() {
  const pathname = usePathname();
  const { hasPermission, roleHierarchy, loaded: permissionsLoaded } = usePermissions();
  const { data: session } = useSession();
  const t = useTranslations();
  const { isFeatureEnabled } = useFeatureFlags();
  const { groupOrder, updateOrder, resetOrder, isDefault } = useSidebarOrder();
  const customLinks = useSidebarLinks();

  const tenantLogoUrl = session?.user?.tenantLogoUrl;
  const tenantName = session?.user?.tenantName;

  const dndId = useId();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Partition and sort groups
  const { pinnedTop, middle, pinnedBottom } = useMemo(
    () => partitionGroups(navGroups),
    []
  );
  const sortedMiddle = useMemo(
    () => sortGroupsByOrder(middle, groupOrder),
    [middle, groupOrder]
  );

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = groupOrder.indexOf(active.id as string);
      const newIndex = groupOrder.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;

      updateOrder(arrayMove(groupOrder, oldIndex, newIndex));
    },
    [groupOrder, updateOrder]
  );

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
    if (roleHierarchy >= 100) return true;
    return hasPermission(item.permission);
  };

  /** Check if a nav group should be visible (at least 1 item must be visible) */
  const isGroupVisible = (group: NavGroup): boolean => {
    if (roleHierarchy >= 100) return true;
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
      <li key={item.href} data-tour={item.titleKey ? `sidebar-${item.titleKey}` : undefined}>
        {hasChildren ? (
          <>
            <button
              onClick={() => toggleExpanded(item.href)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 w-full",
                isActive
                  ? "bg-primary/10 text-sidebar-accent-foreground border-l-[3px] border-primary"
                  : "text-sidebar-foreground/80 hover:bg-primary/5 hover:text-sidebar-accent-foreground border-l-[3px] border-transparent"
              )}
              title={collapsed ? itemTitle : undefined}
              aria-expanded={itemExpanded}
            >
              <item.icon className={cn("h-5 w-5 shrink-0", isActive ? "text-primary" : "text-sidebar-foreground/65")} />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">{itemTitle}</span>
                  {itemExpanded ? (
                    <ChevronDown className={cn("h-4 w-4", isActive ? "text-primary/70" : "text-sidebar-foreground/40")} />
                  ) : (
                    <ChevronRight className={cn("h-4 w-4", isActive ? "text-primary/70" : "text-sidebar-foreground/40")} />
                  )}
                </>
              )}
            </button>
            {!collapsed && itemExpanded && (
              <ul className="mt-1 ml-4 space-y-1">
                {item.children!
                  .filter((child) => !child.featureFlag || isFeatureEnabled(child.featureFlag))
                  .map((child) => {
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
                          "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200",
                          isChildItemActive
                            ? "bg-primary/10 text-sidebar-accent-foreground border-l-[3px] border-primary"
                            : "text-sidebar-foreground/80 hover:bg-primary/5 hover:text-sidebar-accent-foreground border-l-[3px] border-transparent"
                        )}
                        aria-current={isChildItemActive ? "page" : undefined}
                      >
                        {ChildIcon && (
                          <ChildIcon className={cn("h-4 w-4 shrink-0", isChildItemActive ? "text-primary" : "text-sidebar-foreground/65")} />
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
              "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200",
              isActive
                ? "bg-primary/10 text-sidebar-accent-foreground border-l-[3px] border-primary"
                : "text-sidebar-foreground/80 hover:bg-primary/5 hover:text-sidebar-accent-foreground border-l-[3px] border-transparent"
            )}
            title={collapsed ? itemTitle : undefined}
            aria-current={isActive ? "page" : undefined}
          >
            <item.icon className={cn("h-5 w-5 shrink-0", isActive ? "text-primary" : "text-sidebar-foreground/65")} />
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
  // Group rendering helper
  // -----------------------------------------------------------------------

  const renderGroupContent = (
    group: NavGroup,
    groupIdx: number,
    options?: { dragListeners?: Record<string, unknown>; showDragHandle?: boolean }
  ) => {
    if (!isGroupVisible(group)) return null;

    const visibleItems = getVisibleItems(group);
    if (visibleItems.length === 0) return null;

    const groupExpanded = isGroupExpanded(group, visibleItems);

    return (
      <div
        key={group.label ?? `group-${groupIdx}`}
        data-tour={group.labelKey ? `sidebar-group-${group.labelKey}` : undefined}
        className={cn("mb-4", groupIdx > 0 && group.label && !group.showSeparator && !collapsed && "pt-2")}
      >
        {group.showSeparator && (
          <div className="mx-3 mb-3 h-px bg-gradient-to-r from-transparent via-sidebar-border to-transparent" />
        )}

        {group.label && !collapsed && (
          <div className="flex items-center w-full px-4 mb-1.5 group/header">
            {/* Drag handle — only for reorderable groups */}
            {options?.showDragHandle && (
              <span
                className="cursor-grab active:cursor-grabbing mr-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors opacity-0 group-hover/header:opacity-100"
                title={t("sidebar.dragToReorder")}
                {...(options.dragListeners ?? {})}
              >
                <GripVertical className="h-3 w-3" />
              </span>
            )}
            <button
              onClick={() => toggleGroup(group.label!)}
              className="flex items-center justify-between flex-1 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="border-b border-dashed border-sidebar-border/50 pb-0.5 pr-2">{getGroupLabel(group)}</span>
              {groupExpanded ? (
                <ChevronDown className="h-3 w-3 text-primary/60" />
              ) : (
                <ChevronRight className="h-3 w-3 text-primary/60" />
              )}
            </button>
          </div>
        )}

        {(groupExpanded || collapsed) && (
          <ul className="space-y-1 px-2">
            {visibleItems.map(renderNavItem)}
          </ul>
        )}
      </div>
    );
  };

  // Sortable group wrapper that passes drag listeners down
  const renderSortableGroup = (group: NavGroup, groupIdx: number) => {
    const key = group.labelKey!;
    return (
      <SortableGroupItem key={key} id={key}>
        {(listeners) =>
          renderGroupContent(group, groupIdx, {
            dragListeners: listeners,
            showDragHandle: sortedMiddle.filter((g) => isGroupVisible(g)).length > 1,
          })
        }
      </SortableGroupItem>
    );
  };

  // Visible sortable IDs for SortableContext
  const visibleSortableIds = useMemo(
    () =>
      sortedMiddle
        .filter((g) => isGroupVisible(g) && getVisibleItems(g).length > 0)
        .map((g) => g.labelKey!),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sortedMiddle, roleHierarchy, permissionsLoaded]
  );

  // -----------------------------------------------------------------------
  // Main render
  // -----------------------------------------------------------------------

  return (
    <aside
      data-tour="sidebar"
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
        <div className="flex items-center gap-1">
          {!collapsed && !isDefault && (
            <Button
              variant="ghost"
              size="icon"
              onClick={resetOrder}
              className="h-8 w-8"
              title={t("sidebar.resetOrder")}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
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
      </div>

      {/* Navigation */}
      <nav
        className="flex-1 overflow-y-auto py-4"
        aria-label={t("sidebar.mainNavigation")}
      >
        {/* Pinned top: Dashboard */}
        {pinnedTop.map((group, idx) => renderGroupContent(group, idx))}

        {/* Reorderable middle groups */}
        {!collapsed ? (
          <DndContext
            id={dndId}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={visibleSortableIds}
              strategy={verticalListSortingStrategy}
            >
              {sortedMiddle.map((group, idx) =>
                renderSortableGroup(group, pinnedTop.length + idx)
              )}
            </SortableContext>
          </DndContext>
        ) : (
          sortedMiddle.map((group, idx) =>
            renderGroupContent(group, pinnedTop.length + idx)
          )
        )}

        {/* Dynamic custom links — shown before pinned Admin/System groups */}
        {customLinks.length > 0 && (
          <div className="mb-4 pt-2">
            <div className="mx-3 mb-3 h-px bg-gradient-to-r from-transparent via-sidebar-border to-transparent" />
            {!collapsed && (
              <div className="px-4 mb-1.5">
                <span className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Links
                </span>
              </div>
            )}
            <ul className="space-y-1 px-2">
              {customLinks.map((link) => {
                const IconComp = getSidebarLinkIcon(link.icon);
                return (
                  <li key={link.id}>
                    <a
                      href={link.url}
                      target={link.openInNewTab ? "_blank" : "_self"}
                      rel="noopener noreferrer"
                      title={collapsed ? link.label : link.description ?? undefined}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 text-sidebar-foreground/80 hover:bg-primary/5 hover:text-sidebar-accent-foreground border-l-[3px] border-transparent"
                    >
                      <IconComp className="h-5 w-5 shrink-0 text-sidebar-foreground/65" />
                      {!collapsed && (
                        <>
                          <span className="flex-1">{link.label}</span>
                          <ExternalLink className="h-3.5 w-3.5 text-sidebar-foreground/30 shrink-0" />
                        </>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Pinned bottom: Admin, System */}
        {pinnedBottom.map((group, idx) =>
          renderGroupContent(group, pinnedTop.length + sortedMiddle.length + idx)
        )}
      </nav>

      {/* Trust badges footer */}
      {!collapsed && (
        <div className="flex items-center gap-1.5 px-4 py-2 text-[11px] text-muted-foreground/60">
          <Shield className="h-3 w-3" />
          <span>DSGVO-konform</span>
          <span className="text-muted-foreground/30">|</span>
          <span>GoBD-gerecht</span>
        </div>
      )}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Inner sortable component (needs useSortable inside SortableContext)
// ---------------------------------------------------------------------------

function SortableGroupItem({
  id,
  children,
}: {
  id: string;
  children: (listeners: Record<string, unknown>) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {children(listeners ?? {})}
    </div>
  );
}
