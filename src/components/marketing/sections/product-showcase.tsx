"use client";

import { useState } from "react";
import { LayoutDashboard, Receipt, Activity, Users } from "lucide-react";

// ============================================================================
// ProductShowcase -- Tabbed product showcase with CSS-art mockups for the
// WindparkManager marketing page.
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

  const barHeights = [
    "h-16", "h-24", "h-12", "h-32", "h-20", "h-28",
    "h-8", "h-24", "h-16", "h-28", "h-20", "h-12",
  ];

  return (
    <div>
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg bg-muted/50 p-3 space-y-1">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="text-lg font-bold">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Chart area */}
      <div className="rounded-lg bg-muted/30 p-4 h-40 flex items-end gap-1">
        {barHeights.map((h, i) => (
          <div
            key={i}
            className={`flex-1 bg-primary/60 rounded-t-sm ${h}`}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mockup: Pachtabrechnung (Lease Billing)
// ---------------------------------------------------------------------------
function BillingMockup() {
  const rows = [
    { width1: "w-24", width2: "w-20", amount: "\u20AC 4.280,00", status: "Bezahlt", statusColor: "bg-green-500/20 text-green-700 dark:text-green-400" },
    { width1: "w-28", width2: "w-16", amount: "\u20AC 3.150,00", status: "Bezahlt", statusColor: "bg-green-500/20 text-green-700 dark:text-green-400" },
    { width1: "w-20", width2: "w-24", amount: "\u20AC 5.720,00", status: "Offen", statusColor: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400" },
    { width1: "w-32", width2: "w-20", amount: "\u20AC 2.890,00", status: "Bezahlt", statusColor: "bg-green-500/20 text-green-700 dark:text-green-400" },
    { width1: "w-24", width2: "w-28", amount: "\u20AC 6.100,00", status: "Entwurf", statusColor: "bg-blue-500/20 text-blue-700 dark:text-blue-400" },
  ];

  return (
    <div>
      {/* Table header */}
      <div className="flex gap-4 text-xs font-medium text-muted-foreground border-b border-border/50 pb-2 mb-3">
        <span className="flex-1">Pachter</span>
        <span className="flex-1">Flurstueck</span>
        <span className="w-28 text-right">Betrag</span>
        <span className="w-20 text-right">Status</span>
      </div>

      {/* Table rows */}
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-4 text-sm py-2 border-b border-border/20">
          <span className="flex-1">
            <span className={`block bg-muted/40 rounded h-4 ${row.width1}`} />
          </span>
          <span className="flex-1">
            <span className={`block bg-muted/40 rounded h-4 ${row.width2}`} />
          </span>
          <span className="w-28 text-right text-xs font-medium">{row.amount}</span>
          <span className="w-20 flex justify-end">
            <span className={`rounded-full px-2 py-0.5 text-xs ${row.statusColor}`}>
              {row.status}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mockup: SCADA (Real-time turbine data)
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
    green: "bg-green-500",
    yellow: "bg-yellow-500",
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
              <span className="text-xs font-medium">{t.id}</span>
              <span className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${statusColors[t.status]}`} />
                <span className="text-xs text-muted-foreground">{statusLabels[t.status]}</span>
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Wind</span>
                <span className="font-medium">{t.wind}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Leistung</span>
                <span className="font-medium">{t.power}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mockup: Portal (Investor portal)
// ---------------------------------------------------------------------------
function PortalMockup() {
  return (
    <div>
      <p className="text-sm font-medium mb-4">Willkommen, Max Mustermann</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Beteiligungen */}
        <div className="rounded-lg border border-border/50 p-4">
          <p className="text-xs font-medium text-muted-foreground mb-3">Ihre Beteiligungen</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Windpark Nordsee I</p>
                <p className="text-xs text-muted-foreground">12.5% Anteil</p>
              </div>
              <span className="text-sm font-bold text-green-600 dark:text-green-400">+8.2%</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Windpark Ostsee II</p>
                <p className="text-xs text-muted-foreground">8.0% Anteil</p>
              </div>
              <span className="text-sm font-bold text-green-600 dark:text-green-400">+5.7%</span>
            </div>
          </div>
        </div>

        {/* Right: Abstimmungen */}
        <div className="rounded-lg border border-border/50 p-4">
          <p className="text-xs font-medium text-muted-foreground mb-3">Aktuelle Abstimmungen</p>
          <div className="space-y-2">
            <p className="text-sm font-medium">Jahresabschluss 2025</p>
            <p className="text-xs text-muted-foreground">Abstimmung endet am 15.03.2026</p>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Beteiligung</span>
                <span className="font-medium">73%</span>
              </div>
              <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                <div className="h-full w-[73%] rounded-full bg-primary/70" />
              </div>
            </div>
            <div className="flex gap-2 mt-2">
              <span className="rounded-full bg-green-500/20 text-green-700 dark:text-green-400 px-2 py-0.5 text-xs">
                Zustimmung: 68%
              </span>
              <span className="rounded-full bg-red-500/20 text-red-700 dark:text-red-400 px-2 py-0.5 text-xs">
                Ablehnung: 5%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab content mapping
// ---------------------------------------------------------------------------
const mockupComponents: Record<TabId, React.FC> = {
  dashboard: DashboardMockup,
  billing: BillingMockup,
  scada: ScadaMockup,
  portal: PortalMockup,
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export function ProductShowcase() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");

  const activeTabData = tabs.find((t) => t.id === activeTab)!;
  const MockupComponent = mockupComponents[activeTab];

  return (
    <section id="showcase" className="py-20 md:py-32 bg-muted/30">
      <div className="container mx-auto px-4 md:px-6">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Erleben Sie WindparkManager
          </h2>
          <p className="mt-4 text-muted-foreground md:text-lg max-w-2xl mx-auto">
            Eine Plattform für alle Bereiche der Windpark-Verwaltung.
          </p>
        </div>

        {/* Tab Bar */}
        <div className="mx-auto flex justify-center mb-8">
          <div className="bg-muted/50 rounded-xl p-1 inline-flex gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    "px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer",
                    "inline-flex items-center gap-2",
                    isActive
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                  aria-selected={isActive}
                  role="tab"
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Browser Chrome Frame */}
        <div className="mx-auto max-w-4xl rounded-2xl border border-border/50 bg-card overflow-hidden shadow-2xl">
          {/* Title bar */}
          <div className="h-10 bg-muted/50 border-b border-border/50 flex items-center px-4 gap-2">
            <span className="w-3 h-3 rounded-full bg-red-400" />
            <span className="w-3 h-3 rounded-full bg-yellow-400" />
            <span className="w-3 h-3 rounded-full bg-green-400" />
            <div className="ml-4 flex-1 bg-muted rounded-md h-6 flex items-center px-3 text-xs text-muted-foreground">
              app.windparkmanager.de/{activeTabData.url}
            </div>
          </div>

          {/* Content area with transition */}
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
    </section>
  );
}
