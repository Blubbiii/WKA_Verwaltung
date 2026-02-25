import type { MarketingConfig, LegalPages } from "./types";

// =============================================================================
// DEFAULT MARKETING CONFIGURATION
// =============================================================================

export const DEFAULT_MARKETING_CONFIG: MarketingConfig = {
  hero: {
    title: "Die Zukunft der Windpark-Verwaltung",
    subtitle:
      "Optimieren Sie Ihre Erträge mit intelligenter Verwaltungssoftware. Von SCADA-Anbindung bis zur automatisierten Abrechnung - alles in einer Plattform.",
  },
  features: [
    {
      title: "SCADA-Integration",
      description:
        "Automatische Erfassung und Analyse von Betriebsdaten Ihrer Windkraftanlagen in Echtzeit.",
      icon: "activity",
    },
    {
      title: "Automatisierte Abrechnung",
      description:
        "Stromerlös-Abrechnungen, Gutschriften und Gesellschafter-Ausschuettungen auf Knopfdruck.",
      icon: "credit-card",
    },
    {
      title: "Gesellschafter-Portal",
      description:
        "Selbstbedienungsportal für Gesellschafter mit Dokumentenzugang, Abstimmungen und Berichten.",
      icon: "users",
    },
    {
      title: "GoBD-konforme Archivierung",
      description:
        "Revisionssichere Dokumentenarchivierung mit Integritaetsprüfung und Audit-Trail.",
      icon: "shield",
    },
    {
      title: "Multi-Mandantenfaehig",
      description:
        "Verwalten Sie mehrere Windparks und Gesellschaften in einer einzigen Installation.",
      icon: "building",
    },
    {
      title: "Intelligentes Dashboard",
      description:
        "Konfigurierbare Dashboards mit Echtzeit-KPIs, Diagrammen und Benachrichtigungen.",
      icon: "layout-dashboard",
    },
  ],
  pricing: {
    basePrice: 50,
    turbinePrice: 10,
    userPrice: 5,
    annualDiscountPercent: 10,
    maxTurbines: 100,
    maxUsers: 50,
  },
  cta: {
    title: "Bereit für die Zukunft?",
    subtitle:
      "WindparkManager wurde von Branchenexperten entwickelt und wird bereits von zahlreichen Betreibergesellschaften eingesetzt. Starten Sie jetzt Ihre kostenlose Testphase.",
  },
};

// =============================================================================
// DEFAULT LEGAL PAGES
// =============================================================================

export const DEFAULT_LEGAL_PAGES: LegalPages = {
  impressum: "",
  datenschutz: "",
  cookies: "",
};
