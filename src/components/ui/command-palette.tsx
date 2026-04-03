"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { useTranslations } from "next-intl";
import {
  Wind, Receipt, FileText, Users, Settings, BarChart3,
  Map, LandPlot, Building2, Search, ArrowRight,
} from "lucide-react";

/**
 * Command Palette — Spotlight search (Ctrl+K)
 * Searches across pages, parks, invoices, contacts, and actions.
 */

const PAGES = [
  { name: "Dashboard", href: "/dashboard", icon: BarChart3, group: "Seiten" },
  { name: "Windparks", href: "/parks", icon: Wind, group: "Seiten" },
  { name: "Rechnungen", href: "/invoices", icon: Receipt, group: "Seiten" },
  { name: "Verträge", href: "/contracts", icon: FileText, group: "Seiten" },
  { name: "Beteiligungen", href: "/funds", icon: Building2, group: "Seiten" },
  { name: "Dokumente", href: "/documents", icon: FileText, group: "Seiten" },
  { name: "Pachtverträge", href: "/leases", icon: LandPlot, group: "Seiten" },
  { name: "GIS-Karte", href: "/gis", icon: Map, group: "Seiten" },
  { name: "Einstellungen", href: "/settings", icon: Settings, group: "Seiten" },
  { name: "Kontakte", href: "/crm/contacts", icon: Users, group: "Seiten" },
  { name: "Energie", href: "/energy", icon: BarChart3, group: "Seiten" },
];

const ACTIONS = [
  { name: "Neue Rechnung", href: "/invoices/new", icon: Receipt, group: "Aktionen" },
  { name: "Neuer Windpark", href: "/parks/new", icon: Wind, group: "Aktionen" },
  { name: "Dokument hochladen", href: "/documents/upload", icon: FileText, group: "Aktionen" },
  { name: "Dokumenten-Explorer", href: "/documents/explorer", icon: FileText, group: "Aktionen" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const router = useRouter();
  const t = useTranslations("header");

  // Ctrl+K / Cmd+K toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const navigate = useCallback((href: string) => {
    setOpen(false);
    setSearch("");
    router.push(href);
  }, [router]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg z-[9999]" onClick={(e) => e.stopPropagation()}>
        <Command
          className="bg-background border rounded-xl shadow-2xl overflow-hidden"
          filter={(value, search) => {
            if (value.toLowerCase().includes(search.toLowerCase())) return 1;
            return 0;
          }}
        >
          <div className="flex items-center gap-2 px-4 border-b">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder={t("search")}
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden sm:inline-flex items-center rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
              Nichts gefunden
            </Command.Empty>

            <Command.Group heading="Seiten" className="text-xs text-muted-foreground font-semibold uppercase tracking-wide px-2 py-1.5">
              {PAGES.map((page) => (
                <Command.Item
                  key={page.href}
                  value={page.name}
                  onSelect={() => navigate(page.href)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer data-[selected=true]:bg-accent transition-colors"
                >
                  <page.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="flex-1">{page.name}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-data-[selected=true]:opacity-100" />
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Separator className="my-2 h-px bg-border" />

            <Command.Group heading="Aktionen" className="text-xs text-muted-foreground font-semibold uppercase tracking-wide px-2 py-1.5">
              {ACTIONS.map((action) => (
                <Command.Item
                  key={action.href}
                  value={action.name}
                  onSelect={() => navigate(action.href)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer data-[selected=true]:bg-accent transition-colors"
                >
                  <action.icon className="h-4 w-4 text-primary shrink-0" />
                  <span className="flex-1">{action.name}</span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>

          <div className="border-t px-4 py-2 text-[10px] text-muted-foreground flex items-center gap-4">
            <span>↑↓ navigieren</span>
            <span>↵ öffnen</span>
            <span>ESC schließen</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
