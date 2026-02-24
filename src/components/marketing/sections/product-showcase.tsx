"use client";

import { useState } from "react";
import { LayoutDashboard, Receipt, Activity, Users } from "lucide-react";

// ============================================================================
// ProductShowcase -- Vertical tabs with modernized browser frame.
// Client Component (needs useState for tab switching).
// ============================================================================

const tabs = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, url: "dashboard" },
  { id: "billing", label: "Pachtabrechnung", icon: Receipt, url: "pachtabrechnung" },
  { id: "scada", label: "SCADA", icon: Activity, url: "scada" },
  { id: "portal", label: "Portal", icon: Users, url: "portal" },
] as const;

type TabId = (typeof tabs)[number]["id"];

// ---------------------------------------------------------------------------
// Mockup: Dashboard
// ---------------------------------------------------------------------------
function DashboardMockup() {
  const stats = [
    { label: "Windparks", value: "12" },
    { label: "Anlagen", value: "48" },
    { label: "Leistung", value: "96 MW" },
    { label: "Ertrag", value: "\u20AC2.4M" },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg bg-muted/50 p-3 space-y-1">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="text-lg font-mono font-bold">{stat.value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg bg-muted/30 p-4 h-40 flex items-end gap-1">
        {[16, 24, 12, 32, 20, 28, 8, 24, 16, 28, 20, 12].map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-sm"
            style={{
              height: `${h * 2.5}%`,
              backgroundColor: "hsl(var(--m-primary) / 0.5)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mockup: Pachtabrechnung
// ---------------------------------------------------------------------------
function BillingMockup() {
  const rows = [
    { amount: "\u20AC 4.280,00", status: "Bezahlt", statusColor: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400" },
    { amount: "\u20AC 3.150,00", status: "Bezahlt", statusColor: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400" },
    { amount: "\u20AC 5.720,00", status: "Offen", statusColor: "bg-amber-500/20 text-amber-700 dark:text-amber-400" },
    { amount: "\u20AC 2.890,00", status: "Bezahlt", statusColor: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400" },
    { amount: "\u20AC 6.100,00", status: "Entwurf", statusColor: "bg-sky-500/20 text-sky-700 dark:text-sky-400" },
  ];

  return (
    <div>
      <div className="flex gap-4 text-xs font-medium text-muted-foreground border-b border-border/50 pb-2 mb-3">
        <span className="flex-1">Pächter</span>
        <span className="flex-1">Flurstück</span>
        <span className="w-28 text-right">Betrag</span>
        <span className="w-20 text-right">Status</span>
      </div>
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-4 text-sm py-2 border-b border-border/20">
          <span className="flex-1"><span className="block bg-muted/40 rounded h-4 w-24" /></span>
          <span className="flex-1"><span className="block bg-muted/40 rounded h-4 w-20" /></span>
          <span className="w-28 text-right text-xs font-mono font-medium">{row.amount}</span>
          <span className="w-20 flex justify-end">
            <span className={`rounded-full px-2 py-0.5 text-xs ${row.statusColor}`}>{row.status}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mockup: SCADA
// ---------------------------------------------------------------------------
function ScadaMockup() {
  const turbines = [
    { id: "WEA 01", wind: "7.2 m/s", power: "1.8 MW", status: "green" },
    { id: "WEA 02", wind: "6.8 m/s", power: "1.6 MW", status: "green" },
    { id: "WEA 03", wind: "7.5 m/s", power: "1.9 MW", status: "green" },
    { id: "WEA 04", wind: "5.1 m/s", power: "0.9 MW", status: "yellow" },
    { id: "WEA 05", wind: "0.0 m/s", power: "0.0 MW", status: "red" },
    { id: "WEA 06", wind: "7.0 m/s", power: "1.7 MW", status: "green" },
  ];

  const statusColors: Record<string, string> = {
    green: "bg-emerald-500",
    yellow: "bg-amber-500",
    red: "bg-red-500",
  };

  const statusLabels: Record<string, string> = {
    green: "In Betrieb",
    yellow: "Warnung",
    red: "Stillstand",
  };

  return (
    <div>
      <p className="text-sm font-medium mb-4">Echtzeit-Betriebsdaten</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {turbines.map((t) => (
          <div key={t.id} className="rounded-lg border border-border/50 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-medium">{t.id}</span>
              <span className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${statusColors[t.status]}`} />
                <span className="text-xs text-muted-foreground">{statusLabels[t.status]}</span>
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Wind</span>
                <span className="font-mono font-medium">{t.wind}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Leistung</span>
                <span className="font-mono font-medium">{t.power}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mockup: Portal
// ---------------------------------------------------------------------------
function PortalMockup() {
  return (
    <div>
      <p className="text-sm font-medium mb-4">Willkommen, Max Mustermann</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border/50 p-4">
          <p className="text-xs font-medium text-muted-foreground mb-3">Ihre Beteiligungen</p>
          <div className="space-y-3">
            {[
              { name: "Windpark Nordsee I", share: "12.5%", change: "+8.2%" },
              { name: "Windpark Ostsee II", share: "8.0%", change: "+5.7%" },
            ].map((p) => (
              <div key={p.name} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.share} Anteil</p>
                </div>
                <span className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">{p.change}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-border/50 p-4">
          <p className="text-xs font-medium text-muted-foreground mb-3">Aktuelle Abstimmungen</p>
          <p className="text-sm font-medium">Jahresabschluss 2025</p>
          <p className="text-xs text-muted-foreground mb-2">Abstimmung endet am 15.03.2026</p>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Beteiligung</span>
              <span className="font-mono font-medium">73%</span>
            </div>
            <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
              <div
                className="h-full w-[73%] rounded-full"
                style={{ backgroundColor: "hsl(var(--m-primary) / 0.6)" }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const mockupComponents: Record<TabId, React.FC> = {
  dashboard: DashboardMockup,
  billing: BillingMockup,
  scada: ScadaMockup,
  portal: PortalMockup,
};

export function ProductShowcase() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");

  const activeTabData = tabs.find((t) => t.id === activeTab)!;
  const MockupComponent = mockupComponents[activeTab];

  return (
    <section id="showcase" className="py-20 md:py-32 bg-muted/20">
      <div className="container mx-auto px-4 md:px-6">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-12">
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl tracking-tight">
            Erleben Sie WindparkManager
          </h2>
          <p className="mt-4 text-[hsl(var(--m-text-muted))] md:text-lg max-w-2xl mx-auto">
            Eine Plattform für alle Bereiche der Windpark-Verwaltung.
          </p>
        </div>

        {/* Desktop: Vertical tabs + content | Mobile: horizontal tabs + content */}
        <div className="mx-auto max-w-5xl flex flex-col md:flex-row gap-6">
          {/* Tab sidebar (desktop) / Tab bar (mobile) */}
          <div className="md:w-48 shrink-0">
            <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={[
                      "flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer whitespace-nowrap",
                      isActive
                        ? "bg-card shadow-sm text-foreground md:border-l-[3px] md:border-l-[hsl(var(--m-primary))]"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                    ].join(" ")}
                    aria-selected={isActive}
                    role="tab"
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content area with browser frame */}
          <div className="flex-1 rounded-2xl border border-border/50 bg-card overflow-hidden shadow-xl">
            {/* Title bar */}
            <div className="h-10 bg-muted/50 border-b border-border/50 flex items-center px-4 gap-2">
              <span className="w-3 h-3 rounded-full bg-slate-400/40" />
              <span className="w-3 h-3 rounded-full bg-slate-400/40" />
              <span className="w-3 h-3 rounded-full bg-slate-400/40" />
              <div className="ml-3 flex-1 bg-muted rounded-md h-6 flex items-center px-3 text-xs font-mono text-muted-foreground max-w-xs">
                app.windparkmanager.de/{activeTabData.url}
              </div>
            </div>

            {/* Mockup content */}
            <div className="p-6 min-h-[320px] md:min-h-[400px]">
              <div
                key={activeTab}
                className="animate-in fade-in duration-300"
              >
                <MockupComponent />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
