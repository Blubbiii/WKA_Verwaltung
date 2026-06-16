"use client";

/**
 * Global Command Palette (Cmd+K / Ctrl+K)
 *
 * Strukturiertes Modal mit drei Sektionen:
 *   1. Recent     — letzte 5 besuchte Pages aus localStorage
 *   2. Quick Actions — kuratierte Liste mit ~10 Schnellaktionen
 *   3. Navigation — alle Items aus nav-config.ts (Permission/Feature-gefiltert)
 *
 * Such-Logik: Fuzzy-Match auf Title + titleKey + Tag-Aliases (case-insensitive).
 * Keyboard: ↑/↓ wechselt Selection (durch cmdk), Enter führt aus, Esc schliesst.
 * Verwendet die `cmdk`-Library (bereits installiert) für Filtering + Selection.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Command } from "cmdk";
import { useTranslations } from "next-intl";
import {
  Search,
  ArrowRight,
  Clock,
  Zap,
  Receipt,
  Inbox,
  TrendingUp,
  BarChart3,
  GitCompare,
  Landmark,
  FileText,
  ShieldCheck,
  Bell,
  LayoutDashboard,
} from "lucide-react";
import { navGroups, type NavItem, type NavChild } from "@/config/nav-config";
import { usePermissions } from "@/hooks/usePermissions";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";

// ---------------------------------------------------------------------------
// Recent pages (localStorage)
// ---------------------------------------------------------------------------

const RECENT_STORAGE_KEY = "wpm-recent-pages";
const RECENT_LIMIT = 5;

interface RecentEntry {
  href: string;
  title: string;
  visitedAt: number;
}

function readRecent(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

function writeRecent(entry: RecentEntry): void {
  if (typeof window === "undefined") return;
  try {
    const current = readRecent().filter((e) => e.href !== entry.href);
    const next = [entry, ...current].slice(0, RECENT_LIMIT);
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage may be full / blocked — silently ignore
  }
}

// ---------------------------------------------------------------------------
// Quick Actions (kuratiert)
// ---------------------------------------------------------------------------

interface QuickAction {
  /** stable id used for the cmdk value (also used for fuzzy-matching aliases) */
  id: string;
  href: string;
  icon: React.ElementType;
  /** Search aliases (German short forms) */
  aliases: string[];
  /** Translation key in commandPalette.actions */
  i18nKey:
    | "newInvoice"
    | "uploadInboxInvoice"
    | "openGuv"
    | "openBwa"
    | "parkComparison"
    | "startBankImport"
    | "newContract"
    | "checkApprovals"
    | "runReminders"
    | "openDashboard";
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: "new-invoice", href: "/invoices/new", icon: Receipt, aliases: ["rg", "rechnung", "invoice", "neu"], i18nKey: "newInvoice" },
  { id: "upload-inbox", href: "/inbox", icon: Inbox, aliases: ["eingang", "upload", "scan", "er"], i18nKey: "uploadInboxInvoice" },
  { id: "open-guv", href: "/buchhaltung/guv", icon: TrendingUp, aliases: ["guv", "gewinn", "verlust", "pl"], i18nKey: "openGuv" },
  { id: "open-bwa", href: "/buchhaltung/bwa", icon: BarChart3, aliases: ["bwa", "auswertung"], i18nKey: "openBwa" },
  { id: "park-comparison", href: "/parks", icon: GitCompare, aliases: ["vergleich", "parks", "wind"], i18nKey: "parkComparison" },
  { id: "bank-import", href: "/invoices/bank-import", icon: Landmark, aliases: ["bank", "import", "camt", "mt940"], i18nKey: "startBankImport" },
  { id: "new-contract", href: "/contracts/new", icon: FileText, aliases: ["vertrag", "neu", "contract"], i18nKey: "newContract" },
  { id: "check-approvals", href: "/approvals", icon: ShieldCheck, aliases: ["genehmigung", "freigabe", "approval"], i18nKey: "checkApprovals" },
  { id: "run-reminders", href: "/invoices/reminders", icon: Bell, aliases: ["mahnung", "mahnlauf", "reminder"], i18nKey: "runReminders" },
  { id: "open-dashboard", href: "/dashboard", icon: LayoutDashboard, aliases: ["start", "home", "übersicht"], i18nKey: "openDashboard" },
];

// ---------------------------------------------------------------------------
// Nav-flattening: ein Eintrag pro href (Items + Children)
// ---------------------------------------------------------------------------

interface FlatNavEntry {
  href: string;
  /** Translation key in nav.* — fallback: title */
  titleKey?: string;
  title: string;
  icon?: React.ElementType;
  permission?: string;
  featureFlag?: string;
}

function flattenNav(): FlatNavEntry[] {
  const out: FlatNavEntry[] = [];
  const seen = new Set<string>();
  for (const group of navGroups) {
    for (const item of group.items as NavItem[]) {
      if (!seen.has(item.href)) {
        seen.add(item.href);
        out.push({
          href: item.href,
          titleKey: item.titleKey,
          title: item.title,
          icon: item.icon,
          permission: item.permission,
          featureFlag: item.featureFlag,
        });
      }
      if (item.children) {
        for (const child of item.children as NavChild[]) {
          if (seen.has(child.href)) continue;
          seen.add(child.href);
          out.push({
            href: child.href,
            titleKey: child.titleKey,
            title: child.title,
            icon: child.icon,
            // child inherits parent permission if not set explicitly
            permission: item.permission,
            featureFlag: child.featureFlag ?? item.featureFlag,
          });
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("commandPalette");
  const tNav = useTranslations("nav");

  const { hasPermission, loaded: permsLoaded } = usePermissions();
  const { isFeatureEnabled } = useFeatureFlags();

  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd+K / Ctrl+K toggle (preventDefault hijacks browser address-bar shortcut)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Refresh recent on open
  useEffect(() => {
    if (open) {
      setRecent(readRecent());
      setSearch("");
      // focus input shortly after dialog mounts
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Track current page into recent on navigation (does NOT touch document.title — TabTitleSync stays untouched)
  const flatNav = useMemo(() => flattenNav(), []);
  const navByHref = useMemo(() => {
    const m = new Map<string, FlatNavEntry>();
    for (const n of flatNav) m.set(n.href, n);
    return m;
  }, [flatNav]);

  useEffect(() => {
    if (!pathname) return;
    const entry = navByHref.get(pathname);
    if (!entry) return;
    const title = entry.titleKey ? safeT(tNav, entry.titleKey, entry.title) : entry.title;
    writeRecent({ href: pathname, title, visitedAt: Date.now() });
  }, [pathname, navByHref, tNav]);

  const visibleNav = useMemo(() => {
    if (!permsLoaded) return [];
    return flatNav.filter((entry) => {
      if (entry.permission && !hasPermission(entry.permission)) return false;
      if (entry.featureFlag && !isFeatureEnabled(entry.featureFlag as Parameters<typeof isFeatureEnabled>[0])) return false;
      return true;
    });
  }, [flatNav, hasPermission, isFeatureEnabled, permsLoaded]);

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      setSearch("");
      router.push(href);
    },
    [router],
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("placeholder")}
      className="fixed inset-0 z-[9998]"
      onClick={() => setOpen(false)}
    >
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="fixed top-[15%] left-1/2 -translate-x-1/2 w-[92vw] max-w-xl z-[9999]"
        onClick={(e) => e.stopPropagation()}
      >
        <Command
          className="bg-background border rounded-xl shadow-2xl overflow-hidden"
          // Fuzzy: include alias-string in value, cmdk does substring scoring
          filter={(value, searchTerm) => {
            if (!searchTerm) return 1;
            const v = value.toLowerCase();
            const s = searchTerm.toLowerCase().trim();
            if (v.includes(s)) return 1;
            // token-by-token: every token must appear somewhere
            const tokens = s.split(/\s+/).filter(Boolean);
            return tokens.every((tok) => v.includes(tok)) ? 0.5 : 0;
          }}
        >
          <div className="flex items-center gap-2 px-4 border-b">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
            <Command.Input
              ref={inputRef}
              value={search}
              onValueChange={setSearch}
              placeholder={t("placeholder")}
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden sm:inline-flex items-center rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
              {t("empty")}
            </Command.Empty>

            {/* Recent */}
            {recent.length > 0 && !search && (
              <Command.Group
                heading={t("sections.recent")}
                className="text-xs text-muted-foreground font-semibold uppercase tracking-wide px-2 py-1.5"
              >
                {recent.map((r) => (
                  <Command.Item
                    key={`recent-${r.href}`}
                    value={`recent ${r.title} ${r.href}`}
                    onSelect={() => navigate(r.href)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer data-[selected=true]:bg-accent transition-colors"
                  >
                    <Clock className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                    <span className="flex-1 truncate">{r.title}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground opacity-60" aria-hidden />
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Quick Actions */}
            <Command.Group
              heading={t("sections.quickActions")}
              className="text-xs text-muted-foreground font-semibold uppercase tracking-wide px-2 py-1.5"
            >
              {QUICK_ACTIONS.map((action) => {
                const label = t(`actions.${action.i18nKey}`);
                const value = [label, ...action.aliases, action.href].join(" ");
                const Icon = action.icon;
                return (
                  <Command.Item
                    key={action.id}
                    value={value}
                    onSelect={() => navigate(action.href)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer data-[selected=true]:bg-accent transition-colors"
                  >
                    <Icon className="h-4 w-4 text-primary shrink-0" aria-hidden />
                    <span className="flex-1">{label}</span>
                    <Zap className="h-3 w-3 text-primary/60 shrink-0" aria-hidden />
                  </Command.Item>
                );
              })}
            </Command.Group>

            {/* Navigation */}
            {visibleNav.length > 0 && (
              <Command.Group
                heading={t("sections.navigation")}
                className="text-xs text-muted-foreground font-semibold uppercase tracking-wide px-2 py-1.5"
              >
                {visibleNav.map((entry) => {
                  const label = entry.titleKey ? safeT(tNav, entry.titleKey, entry.title) : entry.title;
                  const value = `${label} ${entry.titleKey ?? ""} ${entry.href}`;
                  const Icon = entry.icon;
                  return (
                    <Command.Item
                      key={`nav-${entry.href}`}
                      value={value}
                      onSelect={() => navigate(entry.href)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer data-[selected=true]:bg-accent transition-colors"
                    >
                      {Icon ? (
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                      ) : (
                        <span className="h-4 w-4 shrink-0" aria-hidden />
                      )}
                      <span className="flex-1 truncate">{label}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground opacity-50" aria-hidden />
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}
          </Command.List>

          <div className="border-t px-4 py-2 text-[10px] text-muted-foreground flex items-center gap-4">
            <span>{t("shortcutHint")}</span>
            <span className="ml-auto">↑↓ ↵</span>
          </div>
        </Command>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: safe translation lookup — falls Key fehlt, fallback statt Error
// ---------------------------------------------------------------------------

function safeT(
  tn: ReturnType<typeof useTranslations>,
  key: string,
  fallback: string,
): string {
  try {
    const v = tn(key);
    // next-intl returns the key itself if missing — treat that as fallback
    if (!v || v === key) return fallback;
    return v;
  } catch {
    return fallback;
  }
}
