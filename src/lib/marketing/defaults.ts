import type { MarketingConfig, LegalPages, SectionId } from "./types";

function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

// =============================================================================
// DEFAULT SECTION ORDER (all enabled)
// =============================================================================

export const DEFAULT_SECTION_ORDER: Array<{ id: SectionId; enabled: boolean }> = [
  { id: "hero", enabled: true },
  { id: "trustBar", enabled: true },
  { id: "features", enabled: true },
  { id: "showcase", enabled: true },
  { id: "stats", enabled: true },
  { id: "workflow", enabled: true },
  { id: "modules", enabled: true },
  { id: "pricing", enabled: true },
  { id: "testimonials", enabled: true },
  { id: "cta", enabled: true },
];

// =============================================================================
// DEFAULT MARKETING CONFIGURATION
// =============================================================================

export const DEFAULT_MARKETING_CONFIG: MarketingConfig = {
  sections: DEFAULT_SECTION_ORDER,

  hero: {
    title: "Windpark-Verwaltung in Minuten statt Tagen",
    subtitle:
      "Pachtabrechnung von 3 Tagen auf 30 Minuten. Automatisierte Betriebsdatenerfassung, transparentes Reporting und revisionssichere Archivierung \u2014 alles in einer Plattform.",
  },

  trustBar: {
    headline: "Vertrauen von Windpark-Betreibern in ganz Deutschland",
    stats: [
      { value: "50+", label: "Windparks" },
      { value: "200+", label: "Anlagen" },
      { value: "99.9%", label: "Uptime" },
    ],
  },

  features: [
    {
      title: "SCADA-Integration",
      description: "Sehen Sie auf einen Blick, welche Anlage wie viel produziert \u2014 Ausf\u00e4lle erkennen Sie, bevor sie Geld kosten.",
      icon: "activity",
    },
    {
      title: "Automatisierte Abrechnung",
      description: "Was fr\u00fcher 3 Tage dauerte, erledigen Sie jetzt in 30 Minuten \u2014 inklusive ZUGFeRD und automatischer Flurst\u00fcck-Zuordnung.",
      icon: "credit-card",
    },
    {
      title: "Gesellschafter-Portal",
      description: "Ihre Investoren informieren sich selbst \u2014 weniger R\u00fcckfragen, mehr Vertrauen.",
      icon: "users",
    },
    {
      title: "GoBD-konforme Archivierung",
      description: "Schluss mit Aktenordnern: 10 Jahre revisionssicher archiviert, jederzeit abrufbar.",
      icon: "shield",
    },
    {
      title: "Multi-Mandantenf\u00e4hig",
      description: "Ob 2 oder 20 Windparks \u2014 eine Installation, strikte Datentrennung, volle Kontrolle.",
      icon: "building",
    },
    {
      title: "Intelligentes Dashboard",
      description: "Ihre wichtigsten Kennzahlen auf einen Blick, automatische Berichte auf Knopfdruck.",
      icon: "layout-dashboard",
    },
  ],

  showcase: {
    title: "Erleben Sie WindparkManager",
    subtitle: "Eine Plattform f\u00fcr alle Bereiche der Windpark-Verwaltung.",
    tabs: [
      { id: "dashboard", label: "Dashboard", icon: "layout-dashboard", url: "dashboard" },
      { id: "billing", label: "Pachtabrechnung", icon: "receipt", url: "pachtabrechnung" },
      { id: "scada", label: "SCADA", icon: "activity", url: "scada" },
      { id: "portal", label: "Portal", icon: "users", url: "portal" },
    ],
    videoUrl: "",
  },

  stats: {
    items: [
      { end: 50, suffix: "+", label: "Windparks" },
      { end: 200, suffix: "+", label: "Anlagen" },
      { end: 500, suffix: "+", label: "Gesellschafter" },
      { end: 25, prefix: "\u20AC", suffix: "M+", label: "abgerechnet" },
    ],
  },

  workflow: {
    title: "So einfach funktioniert es",
    subtitle: "Von der Datenerfassung bis zur Gutschrift in drei Schritten.",
    steps: [
      { icon: "upload", title: "Daten importieren", description: "SCADA-Daten, Energieabrechnungen und Vertragsdaten automatisch einlesen." },
      { icon: "calculator", title: "Automatisch berechnen", description: "Pachtanteile, Gutschriften und Verteilungen werden sofort berechnet." },
      { icon: "send", title: "Gutschriften versenden", description: "ZUGFeRD-konforme Gutschriften per E-Mail oder im Portal bereitstellen." },
    ],
  },

  modules: {
    title: "Flexible Module f\u00fcr Ihre Anforderungen",
    subtitle: "Aktivieren Sie nur die Funktionen, die Sie brauchen. Jedes Modul kann einzeln freigeschaltet werden.",
    items: [
      { id: "accounting", title: "Buchhaltung", description: "SKR03-Kontenrahmen, automatische Buchungen, SuSa, BWA und UStVA.", icon: "calculator", badge: "Neu" },
      { id: "document-routing", title: "Dokument-Routing", description: "Automatische Sortierung von Rechnungen in OneDrive/DATEV-Ordner.", icon: "folder-sync", badge: "Neu" },
      { id: "inbox", title: "Rechnungseingang", description: "Digitaler Rechnungseingang mit automatischer Erkennung und Zuordnung.", icon: "inbox" },
      { id: "crm", title: "CRM & Kontakte", description: "Kontaktverwaltung, Aktivit\u00e4tenprotokoll und Kommunikationshistorie.", icon: "contact-round" },
      { id: "communication", title: "Serienbriefe", description: "Massenversand von Briefen und E-Mails an Gesellschafter und P\u00e4chter.", icon: "mail" },
      { id: "paperless", title: "Paperless-ngx", description: "Integration mit Paperless-ngx f\u00fcr digitale Dokumentenverwaltung.", icon: "scan" },
      { id: "wirtschaftsplan", title: "Wirtschaftsplan", description: "Budget-Planung, Kostenstellenmanagement und Soll-Ist-Vergleiche.", icon: "file-bar-chart" },
      { id: "management-billing", title: "Betriebsf\u00fchrung", description: "Abrechnungsregeln, Betriebsf\u00fchrungsgeb\u00fchren und Leistungserfassung.", icon: "briefcase" },
    ],
  },

  pricing: {
    basePrice: envInt("PRICING_BASE_PRICE", 50),
    turbinePrice: envInt("PRICING_TURBINE_PRICE", 10),
    userPrice: envInt("PRICING_USER_PRICE", 5),
    annualDiscountPercent: envInt("PRICING_ANNUAL_DISCOUNT_PERCENT", 10),
    maxTurbines: envInt("PRICING_MAX_TURBINES", 100),
    maxUsers: envInt("PRICING_MAX_USERS", 50),
  },

  testimonials: {
    title: "Was unsere Kunden sagen",
    items: [
      { initials: "TM", name: "Thomas M\u00fcller", role: "Gesch\u00e4ftsf\u00fchrer", company: "Windpark Nordsee GmbH", quote: "WindparkManager hat unsere Pachtabrechnung von 3 Tagen auf 30 Minuten reduziert." },
      { initials: "SW", name: "Sabine Weber", role: "Kaufm. Leitung", company: "Energiepark Mittelland", quote: "Endlich eine Software, die von Windpark-Praktikern entwickelt wurde." },
      { initials: "KB", name: "Dr. Klaus Bergmann", role: "Vorstand", company: "Wind Invest AG", quote: "Die SCADA-Integration gibt uns volle Transparenz \u00fcber alle 12 Parks \u2014 in Echtzeit." },
    ],
  },

  cta: {
    title: "Bereit f\u00fcr die Zukunft?",
    subtitle: "WindparkManager wurde von Branchenexperten entwickelt und wird bereits von zahlreichen Betreibergesellschaften eingesetzt. Starten Sie jetzt Ihre kostenlose Testphase.",
  },
};

// =============================================================================
// DEFAULT LEGAL PAGES
// =============================================================================

export const DEFAULT_LEGAL_PAGES: LegalPages = {
  impressum: [
    '<h2>Angaben gem\u00e4\u00df &sect; 5 TMG</h2>',
    '<p>[Firmenname]<br/>[Rechtsform]<br/>[Stra\u00dfe]<br/>[PLZ Ort]</p>',
    '<h3>Kontakt</h3>',
    '<p>Telefon: [Telefonnummer]<br/>E-Mail: [E-Mail-Adresse]</p>',
  ].join("\n"),

  datenschutz: [
    '<h2>1. Datenschutz auf einen Blick</h2>',
    '<p>Die folgenden Hinweise geben einen einfachen \u00dcberblick dar\u00fcber, was mit Ihren personenbezogenen Daten passiert.</p>',
  ].join("\n"),

  cookies: [
    '<h2>Welche Cookies verwenden wir?</h2>',
    '<p>WindparkManager verwendet ausschlie\u00dflich <strong>technisch notwendige Cookies</strong>.</p>',
  ].join("\n"),
};
