# UI/UX Konzept: WindparkManager (WPM)

> **Stand:** 25. Februar 2026
> **Version:** 2.0 (aktualisiert auf Ist-Zustand)

## 1. Seitenstruktur / Sitemap

```
WindparkManager
│
├── AUTH (oeffentlich)
│   ├── /login
│   ├── /forgot-password
│   └── /reset-password
│
├── MARKETING (oeffentlich)
│   ├── / (Startseite — Admin-konfigurierbar)
│   ├── /impressum
│   └── /datenschutz
│
├── DASHBOARD (/dashboard) — 107 Seiten
│   ├── /dashboard ─── Hauptdashboard (27 Widgets, Drag & Drop)
│   │
│   ├── /parks ─── Windparks (Liste, Karte, Detail, Wetter)
│   ├── /service-events ─── Wartung & Service
│   │
│   ├── /invoices ─── Rechnungen (Uebersicht, Versand, Abgleich)
│   ├── /contracts ─── Vertraege (Liste, Detail, Kalender, ICS-Export)
│   ├── /funds ─── Beteiligungen (Liste, Detail, Onboarding)
│   ├── /energy ─── Energie (12+ Seiten: Produktion, SCADA, Analytics, Topologie)
│   ├── /management-billing ─── BF-Abrechnung (Feature-Flag)
│   │
│   ├── /leases ─── Pacht (Vertraege, Abrechnung, Vorschuesse, Zahlungen, SHP, Umlagen)
│   ├── /documents ─── Dokumente (Liste, Upload, Detail)
│   ├── /votes ─── Abstimmungen (Liste, Neu, Detail, Vollmachten)
│   ├── /news ─── Meldungen (Liste, Neu, Detail)
│   ├── /reports ─── Berichte (Erstellen, Archiv)
│   ├── /settings ─── Benutzer-Einstellungen
│   │
│   └── /admin ─── Administration (23+ Seiten)
│       ├── /admin/roles ─── Rollen & Rechte
│       ├── /admin/settlement-periods ─── Abrechnungsperioden
│       ├── /admin/billing-rules ─── Abrechnungsregeln
│       ├── /admin/tax-rates ─── Steuersaetze
│       ├── /admin/webhooks ─── Webhook-Verwaltung
│       ├── /admin/email ─── E-Mail-Vorlagen
│       ├── /admin/templates ─── Dokumentvorlagen
│       ├── /admin/archive ─── GoBD-Archiv
│       ├── /admin/audit-logs ─── Audit-Logs
│       ├── /admin/tenants ─── Mandanten
│       ├── /admin/system ─── System-Gesundheit
│       ├── /admin/backup ─── Backup & Speicher
│       └── ... (weitere Admin-Seiten)
│
└── PORTAL (/portal) — 12 Seiten
    ├── /portal ─── Startseite
    ├── /portal/profile ─── Profil
    ├── /portal/participations ─── Beteiligungen
    ├── /portal/distributions ─── Ausschuettungen
    ├── /portal/votes ─── Abstimmungen
    ├── /portal/proxies ─── Vollmachten
    ├── /portal/documents ─── Dokumente
    ├── /portal/reports ─── Berichte
    ├── /portal/energy-reports ─── Energieberichte
    ├── /portal/energy-analytics ─── Energy-Analytics
    └── /portal/settings ─── Einstellungen
```

## 2. Layout-Struktur

### 2.1 Haupt-Layout (Desktop)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ HEADER (Glassmorphism)                                      [🔔] [👤 User ▼]│
│ [Tenant-Logo]  [Suche... Cmd+K]                          [🌙/☀] [DE/EN]    │
├────────────────┬────────────────────────────────────────────────────────────┤
│                │                                                            │
│   SIDEBAR      │                    MAIN CONTENT                           │
│   (Brand Navy) │                                                            │
│                │  ┌─────────────────────────────────────────────────────┐  │
│ 📊 Dashboard   │  │  Page Header                    [+ Neu] [Export ⬇] │  │
│ 🏭 Windparks   │  ├─────────────────────────────────────────────────────┤  │
│ ⚡ Energie     │  │                                                     │  │
│ 💶 Rechnungen  │  │              Content Area                           │  │
│ 📄 Vertraege   │  │                                                     │  │
│ 💰 Beteil.     │  │                                                     │  │
│ 📍 Pacht       │  │                                                     │  │
│ 📁 Dokumente   │  │                                                     │  │
│ 🗳️ Abstimmungen│  └─────────────────────────────────────────────────────┘  │
│ 📰 Meldungen   │                                                            │
│ 📈 Berichte    │                                                            │
│ ─────────────  │                                                            │
│ ⚙ Administration│                                                            │
│ 🔧 System      │                                                            │
└────────────────┴────────────────────────────────────────────────────────────┘
```

### 2.2 6 Layout-Dateien

| Layout | Pfad | Zweck |
|--------|------|-------|
| Root | `src/app/layout.tsx` | Basis-Layout, Providers, i18n |
| Dashboard | `src/app/(dashboard)/layout.tsx` | Sidebar + Header (auth-geschuetzt) |
| Admin | `src/app/(dashboard)/admin/layout.tsx` | Admin-spezifische Navigation |
| Energy | `src/app/(dashboard)/energy/layout.tsx` | Energie-Unternavigation |
| Portal | `src/app/(portal)/layout.tsx` | Portal-Layout (vereinfacht) |
| Marketing | `src/app/(marketing)/layout.tsx` | Oeffentliche Seiten |

## 3. Dashboard (27 Widgets)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Dashboard                                      [Widget hinzufuegen ⊕] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │
│  │ 🏭 Parks     │ │ ⚡ Anlagen   │ │ 👥 Gesellsch.│ │ 📄 Vertraege │  │
│  │     12       │ │     48       │ │    156       │ │     23       │  │
│  │   aktiv      │ │   in Betrieb │ │   aktiv      │ │   auslaufend │  │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘  │
│                                                                         │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │
│  │ ⚡ Ertrag    │ │ 📊 Verfuegb.│ │ 🌬️ Wind     │ │ 💶 Pacht     │  │
│  │  12.450 MWh  │ │    97.3%     │ │   8.5 m/s    │ │   142.000€   │  │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘  │
│                                                                         │
│  ┌─────────────────────────────────┐ ┌─────────────────────────────┐   │
│  │ 📊 Monatliche Rechnungen       │ │ 🌤️ Wetter Uebersicht       │   │
│  │ (12 Monate Balkendiagramm)     │ │ (pro Park)                  │   │
│  └─────────────────────────────────┘ └─────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────┐ ┌─────────────────────────────┐   │
│  │ ⚠️ Anstehende Fristen          │ │ 📰 Letzte Aktivitaeten      │   │
│  └─────────────────────────────────┘ └─────────────────────────────┘   │
│                                                                         │
│  Widget-Grid: 12 Spalten, rowHeight 100px, Drag & Drop zum Umordnen    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Widget-Kategorien (27 Widgets)

| Kategorie | Widgets | Groesse |
|-----------|---------|---------|
| KPI | 12 (Parks, Turbines, Shareholders, Capital, Invoices, Contracts, Documents, Votes, Energy-Yield, Availability, Wind-Speed, Lease-Revenue) | 3x2 |
| Chart | 6 (Monthly-Invoices, Capital-Development, Documents-By-Type, Turbine-Status, Production-Forecast, Revenue-By-Park) | 4x3 |
| List | 5 (Deadlines, Activities, Expiring-Contracts, Pending-Actions, Lease-Overview) | 4x3 |
| Utility | 2 (Weather, Quick-Actions) | 3x2 |
| Admin | 4 (System-Status, Audit-Log, Billing-Jobs, Webhook-Status) | 4x3 |

## 4. Design-System

### 4.1 Brand Identity: Warm Navy

```css
:root {
  /* Brand-Farbe: Warm Navy */
  --primary: 215 50% 40%;         /* #335E99 (Light Mode) */
  --primary-foreground: 210 40% 98%;

  /* Dark Mode */
  .dark {
    --primary: 215 55% 58%;       /* #598ACF (Dark Mode) */
  }

  /* 12 Chart-Variablen */
  --chart-1: 215 50% 40%;
  --chart-2: 215 45% 55%;
  --chart-3: 25 85% 55%;
  --chart-4: 142 45% 42%;
  --chart-5: 350 60% 55%;
  /* ... bis --chart-12 */
}
```

### 4.2 shadcn/ui Komponenten (41 Basis-Komponenten)

**Basis:** Button, Input, Label, Textarea, Select, Checkbox, Radio, Switch, Slider
**Layout:** Card, Separator, Tabs, Accordion, Collapsible, Resizable
**Daten:** Table, Data Table, Badge, Avatar, Progress
**Feedback:** Alert, Toast, Skeleton (Shimmer-Animation)
**Overlay:** Dialog, Sheet, Dropdown Menu, Popover, Command, Context Menu
**Navigation:** Navigation Menu, Breadcrumb, Pagination
**Formulare:** Form, Calendar, Date Picker, Combobox

### 4.3 Animations & Micro-Interactions

- `shimmer` — Skeleton Loading Animation
- `fade-in` — Elemente einblenden
- `slide-in-right` — Seitliche Einblendung
- `scale-in` — Skalierungs-Animation
- Glassmorphism Header (`backdrop-blur`)
- Button Micro-Interactions (hover scale)
- Table Zebra-Striping
- Sidebar Active-Indicator
- Stats-Cards Gradient
- `.card-interactive` — Hover-Effekt fuer klickbare Cards

## 5. Navigation (Sidebar)

### 5.1 Desktop Sidebar (6 Gruppen, 35+ Items)

| Gruppe | Items | Permission |
|--------|-------|------------|
| **Dashboard** | Dashboard | Alle |
| **Windparks** | Parks, Service-Events | parks:read, service-events:read |
| **Finanzen** | Rechnungen (3 Sub), Vertraege, Beteiligungen, Energie (8 Sub), BF (3 Sub) | invoices:read, contracts:read, funds:read, energy:read |
| **Verwaltung** | Pacht (5 Sub), Dokumente, Abstimmungen, Meldungen, Berichte (2 Sub) | leases:read, documents:read, votes:read, reports:read |
| **Administration** | Einstellungen, Rollen, Perioden, Regeln, Zugriff, E-Mail, Vorlagen, GoBD | settings:read, roles:read, admin:* |
| **System** | Mandanten, System-Settings, Wartung, Config, Audit, Backup, Marketing, Revenue-Types, Tax-Rates, Fund-Categories, Webhooks | system:*, admin:manage |

### 5.2 Features
- Collapsible Groups (expandieren bei aktiver Seite)
- Permission-basierte Sichtbarkeit
- Feature-Flag-Integration (z.B. management-billing)
- Tenant-Logo im Sidebar-Header
- Dark Mode: Brand Navy Hintergrund
- Active-Indicator Animation

### 5.3 Keyboard Shortcuts

| Shortcut | Aktion |
|----------|--------|
| `Cmd/Ctrl + K` | Globale Suche oeffnen |
| `Cmd/Ctrl + N` | Neuer Eintrag (kontextbezogen) |
| `Cmd/Ctrl + S` | Speichern |
| `Esc` | Dialog/Modal schliessen |

## 6. Responsive Breakpoints

```css
sm: 640px   /* Mobile Landscape */
md: 768px   /* Tablet */
lg: 1024px  /* Desktop */
xl: 1280px  /* Large Desktop */
2xl: 1536px /* Extra Large */
```

| Breakpoint | Sidebar | Tabellen | Cards | Dashboard |
|------------|---------|----------|-------|-----------|
| < 768px | Hidden (Hamburger) | Horizontal Scroll | 1 Spalte | 1 Spalte |
| 768-1024px | Collapsed (Icons) | Responsive | 2 Spalten | 2 Spalten |
| > 1024px | Expanded | Full | 3-4 Spalten | 12-Spalten Grid |

## 7. Workflow-Wizards (5 Stueck)

| Wizard | Schritte | Route |
|--------|----------|-------|
| Jahresendabrechnung | Park → Zeitraum → Datenquellen → Zusammenfassung → Erstellen | /energy/settlements/wizard |
| Park-Einrichtung | Stammdaten → Turbinen → SCADA-Mapping → Topologie → Freigabe | /parks/new (Wizard-Modus) |
| Pachtabrechnung | Pachtvertrag → Zeitraum → Kosten → Vorschau → Erstellen | /leases/settlement/new |
| Vertrags-Wizard | Vertragstyp → Parteien → Konditionen → Dokumente → Freigabe | /contracts/new (Wizard-Modus) |
| SHP-Import | Datei-Upload → Vorschau → Zuordnung → Bestaetigung → Ergebnis | /leases/import-shp |

## 8. Accessibility (A11y)

- **WCAG 2.1 AA** Compliance
- Keyboard-Navigation fuer alle interaktiven Elemente
- ARIA-Labels fuer Icons und Buttons
- Fokus-Indikatoren sichtbar (ring-2 ring-offset-2)
- Kontrast mindestens 4.5:1
- Skip-Links fuer Hauptinhalt
- Screenreader-freundliche Tabellen
- Dark Mode unterstuetzt

## 9. i18n (Internationalisierung)

- **next-intl** Bibliothek
- 2 Sprachen: Deutsch (Standard), Englisch
- Cookie-basierter Sprachwechsel
- Alle UI-Texte in `src/messages/de.json` und `en.json`
- Sidebar-Navigation ueber `titleKey` (z.B. `nav.parks`)
