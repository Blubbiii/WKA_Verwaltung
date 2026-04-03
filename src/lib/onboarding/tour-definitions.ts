/**
 * Tour Step Definitions
 *
 * All steps for the main product tour in DE and EN.
 * Elements are targeted via data-tour="..." attributes.
 */

import type { DriveStep } from "driver.js";

export interface TourStep extends DriveStep {
  /** Page the user must be on for this step (skipped otherwise) */
  requiresPage?: string;
  /** Minimum role required to show this step */
  minRole?: "VIEWER" | "MANAGER" | "ADMIN" | "SUPERADMIN";
}

const DE_STEPS: TourStep[] = [
  // Welcome
  {
    popover: {
      title: "Willkommen bei WindparkManager! 👋",
      description:
        "Wir zeigen Ihnen in wenigen Schritten die wichtigsten Bereiche der Anwendung. Sie können die Tour jederzeit mit Escape abbrechen.",
    },
  },
  // Sidebar
  {
    element: '[data-tour="sidebar"]',
    popover: {
      title: "Navigation",
      description:
        "Die Hauptnavigation ist nach Themen gruppiert: Windparks, Finanzen, Verwaltung und Administration.",
      side: "right",
      align: "start",
    },
  },
  // Dashboard
  {
    element: '[data-tour="sidebar-dashboard"]',
    popover: {
      title: "Dashboard",
      description:
        "Ihr personalisiertes Dashboard mit KPIs, Diagrammen und Widgets. Sie können es frei anpassen.",
      side: "right",
      align: "start",
    },
  },
  // Windparks Group
  {
    element: '[data-tour="sidebar-group-windparks"]',
    popover: {
      title: "Windparks",
      description:
        "Verwalten Sie hier Ihre Windparks, Turbinen und Service-Events. Jeder Park hat eigene Stammdaten, Karten und Anlagen.",
      side: "right",
      align: "start",
    },
  },
  // Finanzen Group
  {
    element: '[data-tour="sidebar-group-finances"]',
    popover: {
      title: "Finanzen",
      description:
        "Rechnungen, Verträge, Beteiligungen (Gesellschaften), Energiedaten und Betriebsführung — alles rund um die Finanzen.",
      side: "right",
      align: "start",
    },
  },
  // Invoices
  {
    element: '[data-tour="sidebar-invoices"]',
    popover: {
      title: "Rechnungen",
      description:
        "Erstellen und verwalten Sie Rechnungen, Gutschriften und DATEV-Exporte. Inklusive Versandübersicht und Zahlungsabgleich.",
      side: "right",
      align: "start",
    },
  },
  // Funds
  {
    element: '[data-tour="sidebar-funds"]',
    popover: {
      title: "Beteiligungen",
      description:
        "Verwalten Sie Gesellschaften (GbR, GmbH & Co. KG), Gesellschafter-Anteile, Ausschüttungen und Hierarchien.",
      side: "right",
      align: "start",
    },
  },
  // Energy
  {
    element: '[data-tour="sidebar-energy"]',
    popover: {
      title: "Energiedaten",
      description:
        "SCADA-Daten importieren, Produktionsdaten auswerten, Netzbetreiber-Abrechnungen und Analysen einsehen.",
      side: "right",
      align: "start",
    },
  },
  // Verwaltung Group
  {
    element: '[data-tour="sidebar-group-administration"]',
    popover: {
      title: "Verwaltung",
      description:
        "Pachtverträge, Dokumente, Abstimmungen, Meldungen und Berichte — alles für die laufende Verwaltung.",
      side: "right",
      align: "start",
    },
  },
  // Leases
  {
    element: '[data-tour="sidebar-leases"]',
    popover: {
      title: "Pacht",
      description:
        "Verwalten Sie Pachtverträge, erstellen Sie Abrechnungen, Vorschüsse und Zahlungen an Grundeigentümer.",
      side: "right",
      align: "start",
    },
  },
  // Documents
  {
    element: '[data-tour="sidebar-documents"]',
    popover: {
      title: "Dokumente",
      description:
        "Zentrales Dokumentenmanagement mit Kategorien, Versionierung und optionaler Paperless-ngx Integration.",
      side: "right",
      align: "start",
    },
  },
  // Reports
  {
    element: '[data-tour="sidebar-reports"]',
    popover: {
      title: "Berichte",
      description:
        "Erstellen Sie individuelle Berichte (Monats-/Jahresberichte, Portfolioübersichten) und greifen Sie auf das Berichtsarchiv zu.",
      side: "right",
      align: "start",
    },
  },
  // Administration Group (admin only)
  {
    element: '[data-tour="sidebar-group-admin"]',
    popover: {
      title: "Administration",
      description:
        "Einstellungen, Rollen & Rechte, Abrechnungsperioden, Abrechnungsregeln, E-Mail-Vorlagen und mehr.",
      side: "right",
      align: "start",
    },
    minRole: "ADMIN",
  },
  // Header: Search
  {
    element: '[data-tour="header-search"]',
    popover: {
      title: "Suche",
      description:
        "Nutzen Sie die globale Suche (Ctrl+K) um schnell zu Windparks, Gesellschaften, Verträgen oder Rechnungen zu springen.",
      side: "bottom",
      align: "start",
    },
  },
  // Header: Theme
  {
    element: '[data-tour="header-theme-toggle"]',
    popover: {
      title: "Design umschalten",
      description: "Wechseln Sie zwischen hellem und dunklem Design.",
      side: "bottom",
      align: "center",
    },
  },
  // Header: User Menu
  {
    element: '[data-tour="header-user-menu"]',
    popover: {
      title: "Benutzermenü",
      description:
        "Hier finden Sie Ihr Profil, persönliche Einstellungen, die Tour-Neustartfunktion und die Abmeldung.",
      side: "bottom",
      align: "end",
    },
  },
  // Dashboard customize
  {
    element: '[data-tour="dashboard-customize"]',
    popover: {
      title: "Dashboard anpassen",
      description:
        "Klicken Sie hier, um Widgets hinzuzufügen, zu entfernen oder neu anzuordnen. Ihr Layout wird automatisch gespeichert.",
      side: "bottom",
      align: "end",
    },
    requiresPage: "/dashboard",
  },
  // Finish
  {
    popover: {
      title: "Tour abgeschlossen! 🎉",
      description:
        "Sie kennen jetzt die wichtigsten Bereiche. Sie können die Tour jederzeit über das Benutzermenü erneut starten. Viel Erfolg!",
    },
  },
];

const EN_STEPS: TourStep[] = [
  {
    popover: {
      title: "Welcome to WindparkManager! 👋",
      description:
        "We'll show you the most important areas of the application in a few steps. You can cancel the tour at any time by pressing Escape.",
    },
  },
  {
    element: '[data-tour="sidebar"]',
    popover: {
      title: "Navigation",
      description:
        "The main navigation is grouped by topic: Wind Farms, Finances, Administration, and System.",
      side: "right",
      align: "start",
    },
  },
  {
    element: '[data-tour="sidebar-dashboard"]',
    popover: {
      title: "Dashboard",
      description:
        "Your personalized dashboard with KPIs, charts, and widgets. You can customize it freely.",
      side: "right",
      align: "start",
    },
  },
  {
    element: '[data-tour="sidebar-group-windparks"]',
    popover: {
      title: "Wind Farms",
      description:
        "Manage your wind farms, turbines, and service events here. Each park has its own master data, maps, and assets.",
      side: "right",
      align: "start",
    },
  },
  {
    element: '[data-tour="sidebar-group-finances"]',
    popover: {
      title: "Finances",
      description:
        "Invoices, contracts, investments (funds), energy data, and management billing — everything financial.",
      side: "right",
      align: "start",
    },
  },
  {
    element: '[data-tour="sidebar-invoices"]',
    popover: {
      title: "Invoices",
      description:
        "Create and manage invoices, credit notes, and DATEV exports. Including dispatch overview and payment reconciliation.",
      side: "right",
      align: "start",
    },
  },
  {
    element: '[data-tour="sidebar-funds"]',
    popover: {
      title: "Investments",
      description:
        "Manage funds (GbR, GmbH & Co. KG), shareholder interests, distributions, and hierarchies.",
      side: "right",
      align: "start",
    },
  },
  {
    element: '[data-tour="sidebar-energy"]',
    popover: {
      title: "Energy Data",
      description:
        "Import SCADA data, evaluate production data, view grid operator settlements and analytics.",
      side: "right",
      align: "start",
    },
  },
  {
    element: '[data-tour="sidebar-group-administration"]',
    popover: {
      title: "Administration",
      description:
        "Lease contracts, documents, votes, news, and reports — everything for ongoing management.",
      side: "right",
      align: "start",
    },
  },
  {
    element: '[data-tour="sidebar-leases"]',
    popover: {
      title: "Leases",
      description:
        "Manage lease contracts, create settlements, advances, and payments to landowners.",
      side: "right",
      align: "start",
    },
  },
  {
    element: '[data-tour="sidebar-documents"]',
    popover: {
      title: "Documents",
      description:
        "Central document management with categories, versioning, and optional Paperless-ngx integration.",
      side: "right",
      align: "start",
    },
  },
  {
    element: '[data-tour="sidebar-reports"]',
    popover: {
      title: "Reports",
      description:
        "Create individual reports (monthly/annual reports, portfolio overviews) and access the report archive.",
      side: "right",
      align: "start",
    },
  },
  {
    element: '[data-tour="sidebar-group-administration"]',
    popover: {
      title: "Administration",
      description:
        "Settings, roles & permissions, settlement periods, billing rules, email templates, and more.",
      side: "right",
      align: "start",
    },
    minRole: "ADMIN",
  },
  {
    element: '[data-tour="header-search"]',
    popover: {
      title: "Search",
      description:
        "Use the global search (Ctrl+K) to quickly jump to wind farms, funds, contracts, or invoices.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-tour="header-theme-toggle"]',
    popover: {
      title: "Toggle Theme",
      description: "Switch between light and dark design.",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: '[data-tour="header-user-menu"]',
    popover: {
      title: "User Menu",
      description:
        "Here you find your profile, personal settings, the tour restart function, and sign-out.",
      side: "bottom",
      align: "end",
    },
  },
  {
    element: '[data-tour="dashboard-customize"]',
    popover: {
      title: "Customize Dashboard",
      description:
        "Click here to add, remove, or rearrange widgets. Your layout is saved automatically.",
      side: "bottom",
      align: "end",
    },
    requiresPage: "/dashboard",
  },
  {
    popover: {
      title: "Tour Complete! 🎉",
      description:
        "You now know the most important areas. You can restart the tour at any time via the user menu. Good luck!",
    },
  },
];

const DE_PERSONAL_STEPS: TourStep[] = [
  {
    popover: {
      title: "Hey, willkommen! 👋",
      description:
        "Wir zeigen dir in ein paar Schritten, wo du alles findest. Du kannst die Tour jederzeit mit Escape abbrechen.",
    },
  },
  {
    element: '[data-tour="sidebar"]',
    popover: {
      title: "Deine Navigation",
      description:
        "Hier findest du alles, schön nach Themen sortiert: Windparks, Finanzen, Verwaltung und Admin-Bereich.",
      side: "right",
      align: "start",
    },
  },
  {
    element: '[data-tour="sidebar-dashboard"]',
    popover: {
      title: "Dein Dashboard",
      description:
        "Dein persönliches Dashboard — mit KPIs, Diagrammen und Widgets. Kannst du frei anpassen!",
      side: "right",
      align: "start",
    },
  },
  {
    element: '[data-tour="sidebar-group-windparks"]',
    popover: {
      title: "Deine Windparks",
      description:
        "Hier verwaltest du deine Windparks, Turbinen und Service-Events. Jeder Park hat eigene Stammdaten und Karten.",
      side: "right",
      align: "start",
    },
  },
  {
    element: '[data-tour="sidebar-group-finances"]',
    popover: {
      title: "Deine Finanzen",
      description:
        "Rechnungen, Verträge, Beteiligungen, Energiedaten — alles rund ums Geld findest du hier.",
      side: "right",
      align: "start",
    },
  },
  {
    element: '[data-tour="sidebar-invoices"]',
    popover: {
      title: "Deine Rechnungen",
      description:
        "Erstell und verwalte Rechnungen, Gutschriften und DATEV-Exporte. Mit Versandübersicht und Zahlungsabgleich.",
      side: "right",
      align: "start",
    },
  },
  {
    element: '[data-tour="sidebar-funds"]',
    popover: {
      title: "Deine Gesellschaften",
      description:
        "Verwalte Gesellschaften, Gesellschafter-Anteile, Ausschüttungen und Hierarchien.",
      side: "right",
      align: "start",
    },
  },
  {
    element: '[data-tour="sidebar-energy"]',
    popover: {
      title: "Deine Energiedaten",
      description:
        "SCADA-Daten importieren, Produktionszahlen checken, Abrechnungen und Analysen ansehen.",
      side: "right",
      align: "start",
    },
  },
  {
    element: '[data-tour="sidebar-group-administration"]',
    popover: {
      title: "Verwaltung",
      description:
        "Pachtverträge, Dokumente, Abstimmungen, Berichte — alles für den laufenden Betrieb.",
      side: "right",
      align: "start",
    },
  },
  {
    element: '[data-tour="sidebar-leases"]',
    popover: {
      title: "Deine Pachtverträge",
      description:
        "Verwalte Pachtverträge und erstelle Abrechnungen für Grundeigentümer.",
      side: "right",
      align: "start",
    },
  },
  {
    element: '[data-tour="sidebar-documents"]',
    popover: {
      title: "Deine Dokumente",
      description:
        "Zentrales Dokumentenmanagement mit Kategorien und Versionierung. Alles an einem Ort!",
      side: "right",
      align: "start",
    },
  },
  {
    element: '[data-tour="sidebar-reports"]',
    popover: {
      title: "Deine Berichte",
      description:
        "Erstell individuelle Berichte und greif auf dein Berichtsarchiv zu.",
      side: "right",
      align: "start",
    },
  },
  {
    element: '[data-tour="sidebar-group-admin"]',
    popover: {
      title: "Admin-Bereich",
      description:
        "Einstellungen, Rollen & Rechte, Abrechnungsregeln und mehr — nur für Admins sichtbar.",
      side: "right",
      align: "start",
    },
    minRole: "ADMIN",
  },
  {
    element: '[data-tour="header-search"]',
    popover: {
      title: "Schnellsuche",
      description:
        "Drück Ctrl+K und spring direkt zu Windparks, Gesellschaften oder Rechnungen. Super praktisch!",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-tour="header-theme-toggle"]',
    popover: {
      title: "Hell oder Dunkel?",
      description: "Wechsel zwischen hellem und dunklem Design — ganz wie du magst.",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: '[data-tour="header-user-menu"]',
    popover: {
      title: "Dein Menü",
      description:
        "Hier findest du dein Profil, persönliche Einstellungen und kannst die Tour nochmal starten.",
      side: "bottom",
      align: "end",
    },
  },
  {
    element: '[data-tour="dashboard-customize"]',
    popover: {
      title: "Dashboard anpassen",
      description:
        "Klick hier, um Widgets hinzuzufügen oder umzusortieren. Dein Layout wird automatisch gespeichert!",
      side: "bottom",
      align: "end",
    },
    requiresPage: "/dashboard",
  },
  {
    popover: {
      title: "Fertig — du kennst dich aus! 🎉",
      description:
        "Du kannst die Tour jederzeit über dein Benutzermenü nochmal starten. Viel Spaß mit WindparkManager!",
    },
  },
];

export function getMainTourSteps(locale: "de" | "de-personal" | "en"): TourStep[] {
  if (locale === "en") return EN_STEPS;
  if (locale === "de-personal") return DE_PERSONAL_STEPS;
  return DE_STEPS;
}
