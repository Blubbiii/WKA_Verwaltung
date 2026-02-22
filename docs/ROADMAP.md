# Entwicklungs-Roadmap: WindparkManager (WPM)

## Status-Uebersicht

```
Phase 1          Phase 2          Phase 3          Phase 4          Phase 5          Phase 6          Phase 7          Phase 8          Phase 9          Phase 10         Phase 11
──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
FOUNDATION       CORE MODULES     ADVANCED         AUTOMATION       OPTIMIZATION     SCADA            AUDIT & FIX      UX & WIZARDS     FINAL POLISH     SHP & KARTE      BF-ABRECHNUNG
✅ FERTIG        ✅ FERTIG        ✅ FERTIG        ✅ FERTIG        ✅ FERTIG        ✅ FERTIG        ✅ FERTIG        ✅ FERTIG        ✅ FERTIG        ✅ FERTIG        ✅ FERTIG
──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
• Setup          • Parks          • Abstimmungen   • Auto-Billing   • Performance    • DBF-Import     • Security       • Wizards (5x)   • UI/UX Polish   • SHP-Import     • Cross-Tenant
• Auth           • Anlagen        • Vollmachten    • E-Mail         • Caching        • Mapping-UI     • API-Auth       • Marketing CMS  • Permission Audit• Park-Karte    • Stakeholder
• Multi-Tenant   • Beteiligungen  • Dokumente      • Wetter-API     • Dashboard      • Aggregation    • Konsistenz     • Analytics 8-Tab• Duplikat-Cleanup• Polygone      • Berechnung
• Admin UI       • Pacht          • Vertraege      • Scheduled Jobs • Sicherheit     • Analyse        • Navigation     • Berichte-Hub   • Admin Konsol.  • Vertragspartner• Rechnungen
• Basis Layout   • Abrechnungen   • Berichte       • Audit-Log      • Testing        • Analytics      • Datenfluss     • Dashboard UX   • Animations     • Park-Zuordn.  • Feature-Flags
• Permissions    • Portal         • News           • PDF/Storage    • Monitoring     • Portal         • Cleanup        • Sidebar Logo   • Glassmorphism  • Eigentümer    • PDF/Batch
──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
```

---

## Abgeschlossene Phasen (1-9)

<details>
<summary><strong>Phase 1: Foundation</strong> ✅ — Setup, Auth, Multi-Tenancy, Admin, Layout, Permissions</summary>

- Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, ESLint
- PostgreSQL (Docker), Prisma ORM, Seed-Daten
- Docker-Setup (dev + prod), Traefik, MinIO, Redis
- NextAuth.js, Login, JWT, Passwort-Reset
- Multi-Tenancy (Tenant-Model, Middleware, tenantId)
- Admin (Mandanten-CRUD, User-Verwaltung, Impersonation)
- Layout (Sidebar, Header, Breadcrumb, Dark Mode, Toasts)
- 75 Permissions, 5 System-Rollen, checkPermission/requirePermission
</details>

<details>
<summary><strong>Phase 2: Core Modules</strong> ✅ — Parks, Anlagen, Beteiligungen, Pacht, Rechnungen, Portal</summary>

- Windparks (CRUD, Karte, Pacht-Config, Erloesphasen)
- Windkraftanlagen (CRUD pro Park, technische Daten, Status)
- Service-Events (Wartung, Reparatur, Inspektion, Kosten)
- Beteiligungen (Fonds, Gesellschafter, Quoten, Kapitaluebersicht)
- Ausschuettungen (Verteilung nach Quote, Status-Workflow)
- Kommanditisten-Portal (Dashboard, Beteiligungen, Dokumente, Berichte)
- Pacht & Flaechen (Fluerstuecke, Verpaecher, n:m Vertraege, Kalender)
- Rechnungswesen (Rechnungen + Gutschriften, Nummernkreise, MwSt, PDF)
- Admin-Einstellungen (Nummernkreise, Dokumentvorlagen, Briefpapier)
</details>

<details>
<summary><strong>Phase 3: Advanced Features</strong> ✅ — Abstimmungen, Vollmachten, Dokumente, Vertraege, Reports, News</summary>

- Abstimmungssystem (Zeitraum, Optionen, Quorum, PDF-Export)
- Vollmachten (General/Einzel, mit Vollmacht abstimmen)
- Dokumentenmanagement (Upload, Kategorien, Versionierung, Volltext-Suche)
- Vertragsmanagement (Typen, Fristen, Erinnerungen, Dashboard-Widget)
- Pacht-Abrechnungsperioden (Status-Workflow, Vorschuss, Jahresend)
- Reporting & Export (PDF, Excel, CSV, Monatsbericht, Jahresbericht)
- News & Kommunikation (Rich-Text, Kategorien, Fonds-spezifisch)
</details>

<details>
<summary><strong>Phase 4: Automation</strong> ✅ — PDF, Billing, E-Mail, Wetter, Jobs, Audit, Storage</summary>

- PDF-Generierung (Branding, DIN 5008, Wasserzeichen)
- Automatische Abrechnungen (BillingRule, Cron, Dry-Run)
- E-Mail-Benachrichtigungen (SMTP/SendGrid/SES, Templates, Queue)
- Wetter-Integration (OpenWeatherMap, Redis-Cache, Charts)
- Background Jobs (BullMQ, 4 Queues, Retry, Dead Letter)
- Audit-Log (CRUD + Login/Export/Impersonate, Filter, Export)
- Datei-Storage (S3/MinIO, Presigned URLs, Speicherplatz-Tracking)
</details>

<details>
<summary><strong>Phase 5: Optimization</strong> ✅ — Dashboard, Sicherheit, UX, Performance, Monitoring, CI/CD</summary>

- Dashboard (19 Widgets, Drag & Drop, rollenbasierte Layouts, Redis-Cache)
- Sicherheit (AES-256-GCM Verschluesselung, Rate Limiting, Security Headers)
- Code-Qualitaet (React Query, formatCurrency, status-config, Loading States)
- Performance (N+1 Fixes, Composite Indexes, Bundle Size, Redis)
- Monitoring (Health-Check, Pino Logger, Sentry, Performance Metrics)
- Testing (Vitest Unit Tests, GitHub Actions CI/CD)
- UX-Konsistenz (Action-Icons, Labels, Row-Click, Formular-Konsistenz)
- Admin-Struktur (Permission-basierte Sidebar, Settings, Keyboard-Shortcuts)
- DATEV-Export, Batch-Operations, i18n (DE/EN)
</details>

<details>
<summary><strong>Phase 6: SCADA-Integration</strong> ✅ — Import, Mapping, Analyse, Analytics, Portal, Berichte</summary>

- Enercon DBF-Import (WSD/UID, 10-Min-Intervalle, 4 Standorte)
- SCADA-Mapping UI (Loc_xxxx+PlantNo → Park+Turbine)
- Analyse-Dashboards (Windrose, Produktion, Leistungskurve, Drill-Down)
- Energy Analytics (6 Tabs: Performance, Verfuegbarkeit, Vergleich, Stoerungen, Umwelt, Finanzen)
- Berichts-Konfigurator (22 Module, Portal-Sichtbarkeit)
- Portal Analytics Dashboard (KPIs, Trends, Turbinen-Tabelle)
</details>

<details>
<summary><strong>Phase 7: Audit & Stabilisierung</strong> ✅ — 43 Findings gefixt, 0 offen</summary>

- Kritisch: API-Auth, Permission-Enforcement, Password-Reset-Sicherheit
- Hoch: requirePermission auf allen Routes, Sidebar-Navigation, Role-Hierarchie
- Mittel: Zod-Validierung, Lease-Prorating, Upload-Fortschritt, Console.log Cleanup
- Business: DATEV-Export, Audit-Log Filter, Batch-Operations, Shortcuts
- Qualitaet: Unit Tests, CI/CD Pipeline, DB-Backups, Report-Templates
</details>

<details>
<summary><strong>Phase 8: UX-Optimierung & Workflow-Wizards</strong> ✅ — Marketing CMS, 5 Wizards, Analytics-Konsolidierung, Dashboard-UX</summary>

- Marketing-Seite: Scroll-Fix (overflow-hidden nur im Dashboard-Layout statt global)
- Admin-konfigurierbarer Marketing-Content (Hero, Features, Preisrechner, CTA ueber Tenant.settings)
- Marketing-Admin-UI (4 Tabs: Hero, Features, Preisrechner, CTA mit Live-Vorschau)
- Dynamische Marketing-Seite (SSR, Props statt hardcoded, Default-Fallbacks)
- Dynamische Legal-Pages (Impressum, Datenschutz, AGB ueber Admin konfigurierbar)
- 5 Workflow-Wizards:
  - Jahresendabrechnung/Settlement-Wizard (Park → Zeitraum → Datenquellen → Zusammenfassung → Erstellen)
  - Park-Einrichtungs-Wizard (Stammdaten → Turbinen → SCADA-Mapping → Topologie → Freigabe)
  - Pachtabrechnung/Lease-Settlement-Wizard (Pachtvertrag → Zeitraum → Kosten → Vorschau → Erstellen)
  - Vertrags-Wizard (Vertragstyp → Parteien → Konditionen → Dokumente → Freigabe)
  - Tenant-Onboarding-Wizard (Mandant → Admin-User → Einstellungen → Datenimport → Freigabe)
- Dashboard-Widget-Sizing: rowHeight 100→60px, alle Widget-Groessen recalculated
- Sidebar-Logo: tenantLogoUrl durch Auth-Session-Flow (JWT → Session → Sidebar)
- Analysen/Reports-Konsolidierung (10+ Seiten → 3 Seiten):
  - Analytics: 8-Tab Hub (+ Daten-Explorer, + Datenabgleich)
  - Berichte: 2-Tab Hub (Berichte & Export + Energie-Berichte)
  - Berichtsarchiv: unveraendert
</details>

<details>
<summary><strong>Phase 9: Final Polish & Hardening</strong> ✅ — UI/UX, Permission-Audit, Duplikat-Cleanup, Admin-Konsolidierung</summary>

**UI/UX Design-System Polish (17+ Dateien):**
- Tailwind Animations: shimmer, fade-in, slide-in-right, scale-in, ease-out-expo
- Glassmorphism Header: backdrop-blur-sm, semi-transparenter Hintergrund, sticky
- Button Micro-Interactions: active:scale-[0.98], hover:shadow-md, smooth transitions
- Skeleton Shimmer: Gradient-basierte Lade-Animation statt pulse
- Dialog Backdrop-Blur: Weichgezeichneter Overlay, shadow-xl
- Table Zebra-Striping: even:bg-muted/30, smooth hover transitions
- Toast Animations: ease-out-expo Timing, rounded-lg, shadow-xl
- Sidebar Active-Indicator: border-l-2 border-primary Akzentlinie
- Stats-Cards Gradient: from-primary/5, border-l-4, Gradient-Icon-Container
- Page-Header Gradient-Divider: h-px bg-gradient-to-r Trennlinie
- Empty-State Animation: fade-in-0, Gradient-Icon-Kreis
- Page-Loading Staggered: Gestaffelte Skeleton-Animation
- Dashboard Widgets: hover:shadow-md, Edit-Mode ring-1 ring-primary/10
- Card-Interactive CSS-Klasse: hover translateY(-1px), shadow-Uebergang
- Glass CSS-Klasse: backdrop-blur-md, semi-transparenter Hintergrund
- Badge Variants: success + warning Varianten mit passenden Farben

**Permission-Audit & Security Hardening (9 API-Routes gefixt):**
- 3 neue Permission-Konstanten: ADMIN_MANAGE, ENERGY_SCADA_IMPORT, ENERGY_SETTLEMENTS_FINALIZE
- Export-API: Dynamische Permission-Map pro Export-Typ (parks→parks:read, invoices→invoices:read etc.)
- Upload-API: documents:create Permission hinzugefuegt
- News-API: POST/PATCH/DELETE erfordern admin:manage
- Dashboard Stats: Resource-Level-Filtering mit getAllAccessibleIds() + robuster Fallback
- Dashboard Analytics: POST (Cache-Clear) erfordert requireAdmin()
- SCADA Import: Granulare energy:scada:import Permission
- Settlement Invoice-Erstellung: energy:settlements:finalize Permission
- SuperAdmin-Schutz auf Marketing, Verguetungsarten, Gesellschaftstypen Admin-Pages

**Duplikat-Funktionen bereinigt (4 redundante Seiten geloescht):**
- /energy/analysis/ geloescht → ersetzt durch Daten-Explorer Tab in Analytics
- /energy/scada/comparison/ geloescht → ersetzt durch Datenabgleich Tab in Analytics
- /energy/reports/ geloescht → ersetzt durch Energie-Berichte Tab in Reports
- /documents/new/ geloescht → Duplikat von /documents/upload
- Redirect von /energy/productions/comparison → /energy/analytics aktualisiert

**Super-Admin-Bereich konsolidiert (12-Tab Mega-Page → 5 fokussierte Pages):**
- Admin-Settings: Von 12 Tabs auf 3 reduziert (Allgemein, Portal, E-Mail)
- Neues /admin/invoices: 4 Tabs (Nummernkreise, Rechnungen, Rechnungsvorlagen, Positionsvorlagen)
- Neues /admin/templates: 2 Tabs (Dokumentvorlagen, Briefpapier)
- Neues /admin/revenue-types: CRUD fuer Verguetungsarten
- Neues /admin/fund-categories: CRUD fuer Gesellschaftstypen
- E-Mail-Seite: SMTP-Duplizierung entfernt, Verweis auf System-Config
- Sidebar: Marketing, Verguetungsarten, Gesellschaftstypen im System-Bereich (SUPERADMIN)
- Sidebar: Rechnungseinstellungen, Vorlagen im Administration-Bereich (ADMIN)

**i18n & Bug-Fixes:**
- 4 neue Translation-Keys (invoiceSettings, templates, revenueTypes, fundCategories) in DE + EN
- Cost-Allocation Page: API-Response-Format-Mismatch gefixt (data-Wrapper)
</details>

<details>
<summary><strong>Phase 10: SHP-Import, Flurstücks-Karte & Pachtvertrags-Erweiterungen</strong> ✅ — Shapefile-Import, Park-Karte mit Polygonen, Vertragspartner, Park-Zuordnung</summary>

**Shapefile (SHP) Import-System:**
- SHP-Parser Library (`shpjs`): ZIP- und Einzeldatei-Verarbeitung, GeoJSON-Konvertierung
- Feld-Mapping mit ALKIS-Auto-Detection: Plot-Felder (Gemarkung, Flur, Flurstück, Zähler/Nenner) + Eigentümer-Felder (Name, Adresse, Hausnummer, PLZ, Ort)
- Multi-Owner-Erkennung (Anzahl-Feld, Semikolon-Trenner, Erbengemeinschaft/GbR)
- Preview-API (`POST /api/plots/import-shp`): Parst SHP, erkennt Felder, gibt Vorschau zurück
- Confirm-API (`POST /api/plots/import-shp/confirm`): Erstellt automatisch Personen, Flurstücke und Pachtverträge in einer Transaktion
- Deduplizierung: Bestehende Personen werden wiederverwendet, Duplikat-Flurstücke übersprungen
- Owner-Override-System: Eigentümer-Namen im Wizard korrigierbar, einzelne Eigentümer überspringbar
- 5-Schritt Import-Wizard (`/leases/import-shp`): Upload → Feld-Mapping → Eigentümer-Review → Vertragsoptionen → Import & Ergebnis

**Park-Karte mit Flurstücks-Polygonen:**
- `geometry Json?` Feld im Plot-Model für GeoJSON-Polygone
- PlotGeoJsonLayer: Polygone farbcodiert nach Eigentümer mit Semi-Transparenz
- Vertragsstatus-Visualisierung: Aktiv=Eigentümer-Farbe, Entwurf=gestrichelt, Ohne Vertrag=Rot, Abgelaufen=Grau
- MapLayerControl: Floating-Panel mit Layer-Toggles (WEA, Flurstücke, Beschriftungen) + Eigentümer-Legende + Status-Legende
- Polygon-Popup: Flurstück-Details, Fläche, Eigentümer, Vertragsstatus mit Link
- Plot-API erweitert: `includeGeometry=true` + `includeLeases=true` Parameter für optimierte Datenabfrage

**Park-Zuordnung von Flurstücken & Verträgen:**
- Inline Park-Selector auf Lease-Edit-Seite: Pro Flurstück direkt den Park ändern
- Flurstücke-Tab auf Park-Detailseite: Gruppiert nach Vertrag (Lease → Flurstücke darunter)
- Vertragsstatus-Badges, Verpächter-Info, Gesamtfläche pro Vertrag
- "Flurstücke zuordnen" Dialog: Unzugeordnete Flurstücke mit Checkbox dem Park zuweisen
- "Vertrag zuordnen" Dialog: Ganze Verträge (mit allen Flurstücken) dem Park zuweisen
- Plot-API Filter: `noPark=true` für Flurstücke ohne Park-Zuordnung

**Vertragspartner-Feld (contractPartnerFundId):**
- Neues Feld `contractPartnerFundId` auf dem Lease-Model (Referenz zu Fund)
- API: Create + Update akzeptieren das Feld, GET inkludiert `contractPartnerFund { id, name, legalForm }`
- UI: "Vertragspartner"-Card auf Lease-Edit-Seite mit Fund-Dropdown und Link zur Gesellschaft

**PersonEditDialog:**
- Inline-Bearbeitung von Verpächter-Daten (Name, Adresse, Bankdaten) direkt im Lease-Edit
</details>

<details>
<summary><strong>Phase 11: Betriebsfuehrungs-Abrechnung (BF-Billing)</strong> ✅ — Cross-Tenant Stakeholder, Berechnung, Rechnungen, Feature-Flags</summary>

**Datenmodell (3 neue Models, 2 neue Enums):**
- `ParkStakeholder`: Cross-Tenant Verknuepfung (externe BF-Firma → Park → Rolle + Gebuehr)
- `StakeholderFeeHistory`: Historische Gebuehren-Aenderungen mit Gueltigkeitszeitraum
- `ManagementBilling`: Berechnete Abrechnung pro Stakeholder/Periode (DRAFT → CALCULATED → INVOICED)
- Enums: `ParkStakeholderRole` (DEVELOPER, GRID_OPERATOR, TECHNICAL_BF, COMMERCIAL_BF, OPERATOR)
- Enums: `ManagementBillingStatus` (DRAFT, CALCULATED, INVOICED, CANCELLED)

**Cross-Tenant Service (`src/lib/management-billing/`):**
- `cross-tenant-access.ts`: Sicherer Zugriff auf fremde Mandanten-Daten (validiert aktiven Stakeholder-Eintrag)
- `fee-resolver.ts`: Gebuehren-Aufloesung mit History-Fallback fuer Rueckwirkung
- `calculator.ts`: Kern-Berechnung (baseRevenue × feePercentage, MwSt-Berechnung)
- `types.ts`: TypeScript Interfaces fuer alle Management-Billing Typen

**API-Routes (12 Endpoints unter `/api/management-billing/`):**
- Stakeholder CRUD: Liste, Erstellen, Detail, Bearbeiten, Loeschen + Fee-History
- Abrechnungen: Liste, Einzelberechnung, Batch-Berechnung aller aktiven Vertraege
- Rechnungserstellung: Invoice im Provider-Mandant mit Nummernkreis-Integration
- PDF-Download: Nutzt bestehende `generateInvoicePdf()`-Pipeline
- Hilfs-Endpoints: available-tenants, available-parks, available-funds, overview (KPIs)

**UI-Seiten (7 Seiten unter `/management-billing/`):**
- Dashboard/Uebersicht: KPI-Cards (aktive Vertraege, offene Abrechnungen, Gesamtvolumen)
- Stakeholders: Tabelle, Neu-Anlegen, Detail mit Fee-History, Bearbeiten
- Abrechnungen: Tabelle mit Filter, Batch-Berechnung, Detail mit Berechnungs-Aufstellung

**UI-Komponenten (6 unter `/components/management-billing/`):**
- `stakeholder-form.tsx`: Cross-Tenant Mandant/Park/Rolle/Gebuehr-Formular
- `stakeholder-table.tsx`: Tabelle mit Rollen-Badge, Gebuehr, Status
- `billing-table.tsx`: Abrechnungen mit Betraegen, Status-Badge, Aktionen
- `billing-calculation-card.tsx`: Berechnungs-Aufstellung (Basis → Gebuehr → MwSt → Brutto)
- `fee-history-table.tsx`: Historische Gebuehren-Aenderungen
- `tenant-park-selector.tsx`: Cross-Tenant Mandant/Park/Fund Picker

**Feature-Flag-System (pro Mandant):**
- `management-billing.enabled` in `SystemConfig` (tenant-spezifisch oder global)
- Superadmin-Toggle in `/admin/system-config` → Tab "Features"
- Mandanten-Admin-Toggle in `/settings` → Tab "Module" (nur sichtbar mit `settings:update` Permission)
- Sidebar: Betriebsfuehrung-Eintrag nur sichtbar wenn Feature aktiviert
- `/api/features` Endpoint + `useFeatureFlags` Hook fuer Client-Side Visibility
- Alle 12 API-Routes pruefen tenant-spezifischen Feature-Flag

**Permissions (6 neue):**
- `management-billing:read`, `:create`, `:update`, `:delete`, `:calculate`, `:invoice`

**Rechnungsintegration:**
- Erstellt Standard-`Invoice` im Provider-Mandant (nutzt bestehendes Rechnungssystem)
- Automatische Nummernkreis-Integration (`InvoiceNumberSequence`)
- Empfaenger-Daten via Cross-Tenant-Access (Fund-Name + Adresse)
- PDF ueber bestehende `generateInvoicePdf()`-Pipeline

**Sicherheitsgarantie:**
- Kein bestehender Code modifiziert (nur neue Dateien + minimale Ergaenzungen)
- Bestehende API-Routes, Seiten, Prisma-Models: unberuehrt
- Feature standardmaessig deaktiviert → kein Impact auf bestehende Mandanten
</details>

---

## Meilensteine

| # | Beschreibung | Status |
|---|-------------|--------|
| M1 | Foundation: Login, Admin, Mandanten, Basis-UI | ✅ |
| M2 | Core: Parks, Anlagen, Beteiligungen, Pacht | ✅ |
| M3 | Portal: Kommanditisten-Portal | ✅ |
| M4 | Rechnungswesen: Invoicing mit PDF | ✅ |
| M5 | Advanced: Abstimmungen, Dokumente, Vertraege | ✅ |
| M6 | Automation: Billing, E-Mails, Wetter, Jobs | ✅ |
| M7 | Dashboard: Analytics, KPIs, Widget-System | ✅ |
| M8 | Security Hardening + UX-Konsistenz | ✅ |
| M9 | Monitoring: Sentry, Pino, Metrics | ✅ |
| M10 | SCADA: Import, Mapping, Analyse-Dashboards | ✅ |
| M11 | Energy Analytics: 6-Tab Dashboard, Portal, Berichte | ✅ |
| M12 | Stabilisierung: Permissions, Validierung, Backups | ✅ |
| M13 | Business-Features: DATEV, Audit-Filter, Batch-Ops | ✅ |
| M14 | Testing & CI/CD: Vitest, GitHub Actions | ✅ |
| M15 | i18n, Storage-Tracking, Dashboard-Caching | ✅ |
| M16 | Billing-Worker, E-Invoicing, Mahnwesen | ✅ |
| M17 | Workflow-Automation + Benachrichtigungen | ✅ |
| M18 | Marketing CMS + Admin-konfigurierbar | ✅ |
| M19 | 5 Workflow-Wizards (Settlement, Park, Lease, Contract, Tenant) | ✅ |
| M20 | Dashboard-UX + Sidebar-Logo + Widget-Sizing | ✅ |
| M21 | Analysen/Reports-Konsolidierung (10+ → 3 Seiten) | ✅ |
| M22 | UI/UX Design-System Polish (Animations, Glassmorphism, Micro-Interactions) | ✅ |
| M23 | Permission-Audit & Security Hardening (9 API-Routes, 3 neue Permissions) | ✅ |
| M24 | Duplikat-Cleanup (4 redundante Seiten entfernt) | ✅ |
| M25 | Admin-Bereich Konsolidierung (12-Tab → 5 fokussierte Pages) | ✅ |
| M26 | SHP-Import: Parser, Feld-Mapping, ALKIS-Auto-Detection, 5-Schritt-Wizard | ✅ |
| M27 | Park-Karte: Flurstücks-Polygone, Eigentümer-Farben, Vertragsstatus, Layer-Controls | ✅ |
| M28 | Park-Zuordnung: Flurstücke + Verträge dem Park zuweisen (2 UIs) | ✅ |
| M29 | Vertragspartner-Feld + PersonEditDialog auf Lease-Edit | ✅ |
| M30 | BF-Abrechnung: Cross-Tenant Stakeholder, Berechnung, Rechnungen | ✅ |
| M31 | Feature-Flag-System: Pro-Mandant Feature-Toggles, Sidebar-Integration | ✅ |
| M32 | Release: Production Deployment | ⏳ |

---

## Feature-Status

| Kategorie | Status |
|-----------|--------|
| Auth & Authorization | ✅ 100% |
| Parks & Turbines | ✅ 100% |
| Service Events | ✅ 100% |
| Funds & Shareholders | ✅ 100% |
| Distributions | ✅ 100% |
| Leases & Plots | ✅ 100% |
| Contracts | ✅ 100% |
| Documents | ✅ 100% |
| Invoices | ✅ 100% |
| Settlement Periods | ✅ 100% |
| Voting + Proxies | ✅ 100% |
| News | ✅ 100% |
| PDF Generation | ✅ 100% |
| Audit-Log | ✅ 100% |
| Email System | ✅ 100% |
| File Storage | ✅ 100% |
| Background Jobs | ✅ 100% |
| Auto-Billing | ✅ 100% |
| Weather Integration | ✅ 100% |
| Docker/DevOps | ✅ 100% |
| Portal UI | ✅ 100% |
| Reports/Export | ✅ 100% |
| Dashboard/Analytics | ✅ 100% |
| Sicherheit/Haertung | ✅ 100% |
| SCADA-Integration | ✅ 100% |
| Energy Analytics | ✅ 100% |
| i18n (DE/EN) | ✅ 100% |
| Testing/CI/CD | ✅ 100% |
| Marketing CMS | ✅ 100% |
| Workflow-Wizards (5x) | ✅ 100% |
| UX/Dashboard-Optimierung | ✅ 100% |
| UI/UX Design-System | ✅ 100% |
| Permission-Granularitaet | ✅ 100% |
| Admin-Struktur | ✅ 100% |
| SHP-Import & GeoJSON | ✅ 100% |
| Park-Karte (Polygone) | ✅ 100% |
| Flurstücks-Zuordnung | ✅ 100% |
| BF-Abrechnung (Cross-Tenant) | ✅ 100% |
| Feature-Flag-System | ✅ 100% |

---

## Offene Punkte

### Bekannte Bugs

**Bekannt (nicht blockierend):**
- [ ] Worker-Thread-Error im Dev-Server (Next.js 15.5.9 + Node v24.13.0 Inkompatibilitaet) — Seiten laden trotzdem korrekt, nur Error-Spam in der Konsole

### Fehlende Features (nach Prioritaet)

**Prioritaet 4 — Nice-to-Have:**
- [ ] OpenAPI/Swagger Dokumentation (/api/docs)
- [ ] ICS-Export fuer Kalender (Vertragsfristen, Kuendigungstermine)
- [ ] Portfolio-Verlauf/Timeline im Portal
- [ ] Favoriten/Lesezeichen (eigenes DB-Model)
- [ ] Mobile-optimiertes Layout (responsive Sidebar, Touch-Interaktionen)
- [ ] PWA-Support (Offline, Push-Notifications)

**Prioritaet 6 — Testing & Qualitaet:**
- [ ] Staging-Umgebung (separate DB, Preview Deployments)
- [ ] API-Versionierung (/api/v2/)
- [ ] API-Keys fuer externe Zugriffe
- [ ] Webhook-Support (Events an externe URLs)

---

## Rechnungsvorlagen — Ist-Zustand

Das Rechnungssystem ist funktional komplett mit anpassbaren Vorlagen:

**Vorhanden:**
- Einheitliches PDF-Template fuer Rechnungen + Gutschriften (`InvoiceTemplate.tsx`)
- Briefpapier-Verwaltung (Header/Footer-Bilder, Logo, Farben, DIN 5008)
- Dokumentvorlagen-Config (Sichtbarkeit von Positionen, MwSt, Bankdaten etc.)
- Nummernkreise mit Platzhaltern ({YEAR}, {NUMBER}) und fuehrenden Nullen
- Rechnungsspezifische Texte (Zahlungsziel, MwSt-Befreiung, Storno-Hinweise)
- Mandanten- ODER Park-spezifische Konfiguration (Fallback-Kette)
- Wasserzeichen (ENTWURF, STORNIERT)
- Storno-Gutschriften (automatisch mit negativen Betraegen)
- DATEV-Export
- XRechnung/ZUGFeRD (UBL 2.1, Validator, ZUGFeRD 2.2 COMFORT, Download-API)
- Skonto (Prozent + Frist, automatische Berechnung, PDF-Ausweis)
- Teilstorno / Korrekturrechnungen (Positions-Auswahl, Teilmengen, Korrekturrechnung)
- Mahnwesen (3 Mahnstufen + Verzugsgebuehren im Billing-Worker)
- Wiederkehrende Rechnungen (RecurringInvoice Model, Frequenz-Scheduling, Admin-UI)
- Abschlagsrechnungen (Pacht-Vorschussrechnungen, automatische monatliche Generierung)
- WYSIWYG-Editor (Block-basiert, Drag&Drop, Live-Vorschau, 15 Block-Typen)
- GoBD-konforme Archivierung (SHA-256 Hash-Chain, Integritaetspruefung, Betriebspruefungs-Export)

---

## Geschaetztes Einsparpotential (jaehrlich)

| Automatisierung | Einsparpotential |
|----------------|-----------------|
| Automatische Pacht-Vorschussrechnungen | ~24h pro Park/Jahr |
| Geplante Berichte (monatlich/quartalsweise) | ~240h/Jahr |
| Batch-Operationen (Massen-Genehmigung etc.) | ~100h/Jahr |
| Onboarding-Wizard (30 Gesellschafter x 30min) | ~180h/Jahr |
| Freigabe-Workflows (verhindert Nacharbeit) | ~50h/Jahr |
| 5 Workflow-Wizards (Settlement, Park, Lease, Contract, Tenant) | ~200h/Jahr |
| Konsolidierte Analysen/Berichte (weniger Navigation) | ~80h/Jahr |
| Admin-Marketing-CMS (keine Entwickler fuer Textaenderungen) | ~40h/Jahr |
| SHP-Import (Flurstücke + Eigentümer + Verträge in einem Schritt) | ~120h/Jahr |
| Park-Karte mit Vertragsstatus (sofortige Übersicht statt Excel-Listen) | ~60h/Jahr |
| BF-Abrechnung (automatische Berechnung + Rechnungserstellung statt manuell) | ~150h/Jahr |
| Feature-Flag pro Mandant (Self-Service Modul-Aktivierung ohne Entwickler) | ~20h/Jahr |
| **Gesamt** | **~1264h/Jahr (~158 Arbeitstage)** |

---

## Aenderungshistorie

### 21. Februar 2026 — Phase 11: Betriebsfuehrungs-Abrechnung (BF-Billing) + Feature-Flag-System

**Betriebsfuehrungs-Abrechnung (komplett neues Modul):**
- 3 neue Prisma-Models: `ParkStakeholder`, `StakeholderFeeHistory`, `ManagementBilling`
- Cross-Tenant Service (`src/lib/management-billing/`): Sicherer Datenzugriff, Fee-Resolution, Berechnung
- 12 API-Endpoints (`/api/management-billing/`): Stakeholder CRUD, Abrechnungen, Batch, Invoice, PDF
- 7 UI-Seiten (`/management-billing/`): Dashboard, Stakeholders (CRUD), Abrechnungen (Liste + Detail)
- 6 UI-Komponenten: Formulare, Tabellen, Berechnungs-Card, Fee-History, Tenant-Park-Selector
- 6 neue Permissions: `management-billing:read/create/update/delete/calculate/invoice`
- Rechnungsintegration: Erstellt Standard-Invoice im Provider-Mandant + PDF via bestehende Pipeline

**Feature-Flag-System (pro Mandant):**
- `management-billing.enabled` in `SystemConfig` mit tenant-spezifischer Auswertung
- Superadmin: Toggle in System-Konfiguration → Tab "Features"
- Mandanten-Admin: Toggle in `/settings` → Tab "Module" (permission-gated)
- `/api/features` Endpoint + `useFeatureFlags` Hook fuer Client-Side Visibility
- Sidebar: Items mit `featureFlag`-Eigenschaft werden automatisch ausgeblendet wenn deaktiviert
- Alle 12 Management-Billing API-Routes pruefen tenant-spezifischen Feature-Flag

**Neue Dateien (~35):**
- `src/lib/management-billing/` (4 Dateien: types, cross-tenant-access, fee-resolver, calculator)
- `src/app/api/management-billing/` (12 Route-Dateien)
- `src/app/(dashboard)/management-billing/` (7 Seiten-Dateien)
- `src/components/management-billing/` (6 Komponenten)
- `src/app/api/features/route.ts`, `src/app/api/admin/features/route.ts`
- `src/hooks/useFeatureFlags.ts`
- `src/components/settings/TenantFeaturesSettings.tsx`
- `src/components/admin/system-config/features-config-form.tsx`

**Geaenderte bestehende Dateien (minimal):**
- `prisma/schema.prisma` (3 neue Models + Tenant-Relation)
- `prisma/seed.ts` (6 neue Permissions)
- `src/components/layout/sidebar.tsx` (neuer Menue-Punkt + featureFlag-Check)
- `src/lib/config/index.ts` ("features" Kategorie + Config-Key)
- `src/app/api/admin/system-config/route.ts` ("features" in Zod-Validation)
- `src/app/(dashboard)/settings/page.tsx` (neuer "Module" Tab fuer Mandanten-Admins)
- `src/app/(dashboard)/admin/system-config/page.tsx` (neuer "Features" Tab)
- `src/messages/de.json` + `en.json` (4 neue i18n-Keys)

### 20. Februar 2026 — Phase 10: SHP-Import, Flurstücks-Karte & Pachtvertrags-Erweiterungen

**Shapefile-Import (komplett neues Feature):**
- `shpjs` NPM-Paket fuer ZIP/SHP-Parsing → GeoJSON-Konvertierung
- SHP-Parser Library (`src/lib/shapefile/`): Parser, Feld-Mapping, Auto-Detection
- ALKIS Feld-Patterns: 9 Plot-Felder + 8 Eigentümer-Felder (inkl. Zähler/Nenner-Split, Hausnummer)
- Multi-Owner-Erkennung: Anzahl-Feld, Semikolon/und-Trenner, Erbengemeinschaft/GbR-Keywords
- Preview-API (`POST /api/plots/import-shp`): SHP parsen, Felder erkennen, Vorschau ohne Speicherung
- Confirm-API (`POST /api/plots/import-shp/confirm`): Prisma-Transaktion erstellt Personen + Plots + Leases
- Eigentümer-Deduplizierung (Name+Adresse Matching), Duplikat-Flurstücks-Erkennung
- Owner-Override im Wizard: Namen korrigieren, Eigentümer überspringen
- 5-Schritt Import-Wizard (`/leases/import-shp`): Upload → Mapping → Eigentümer-Review → Optionen → Ergebnis

**Park-Karte mit Flurstücks-Polygonen:**
- `geometry Json?` Feld im Prisma Plot-Model (Migration)
- PlotGeoJsonLayer-Komponente: Polygone farbcodiert nach Eigentümer (deterministisches Hashing)
- Vertragsstatus-Visualisierung: Aktiv=Farbe, Entwurf=gestrichelt, Ohne Vertrag=Rot, Abgelaufen=Grau
- MapLayerControl: Floating-Panel mit Layer-Toggles + Eigentümer-Legende + Status-Legende
- Polygon-Klick-Popup: Flurstück-Details, Fläche, Eigentümer-Name, Vertragsstatus + Link
- Plot-API: `includeGeometry=true` und `includeLeases=true` für optimierte Kartenabfrage

**Park-Zuordnung (Flurstücke + Verträge):**
- Inline Park-Selector im Lease-Edit: `<Select>` pro Flurstück für schnelle Park-Änderung
- Neuer Flurstücke-Tab auf Park-Detailseite: Gruppierung nach Vertrag (Card pro Lease)
- Vertragsstatus-Badges, Verpächter-Info, Flächen-Summen pro Vertrag
- "Flurstücke zuordnen" Dialog: Bulk-Assign unzugeordneter Plots mit Checkbox
- "Vertrag zuordnen" Dialog: Ganze Leases (mit allen Plots) dem Park zuweisen
- Plot-API: `noPark=true` Filter für Flurstücke ohne Park

**Pachtvertrags-Erweiterungen:**
- `contractPartnerFundId` auf Lease-Model: Vertragspartner (Pächter-Gesellschaft)
- API: Create/Update/GET unterstützen das Feld mit Fund-Include
- "Vertragspartner"-Card im Lease-Edit mit Fund-Dropdown + Link zur Gesellschaft
- PersonEditDialog: Inline-Bearbeitung von Verpächter-Daten im Lease-Edit

**Neue Dateien (12):**
- `src/lib/shapefile/shp-parser.ts`, `field-mapping.ts`, `index.ts`
- `src/app/api/plots/import-shp/route.ts`, `confirm/route.ts`
- `src/app/(dashboard)/leases/import-shp/page.tsx`, `loading.tsx`
- `src/components/maps/PlotGeoJsonLayer.tsx`, `MapLayerControl.tsx`
- `src/components/leases/PersonEditDialog.tsx`

**Geänderte Dateien (10+):**
- `prisma/schema.prisma` (Plot.geometry, Lease.contractPartnerFundId, Fund reverse relations)
- `src/app/api/plots/route.ts` (includeGeometry, includeLeases, noPark Filter)
- `src/app/api/leases/route.ts` + `[id]/route.ts` (contractPartnerFundId)
- `src/app/(dashboard)/parks/[id]/page.tsx` (Flurstücke-Tab, Zuordnungs-Dialoge)
- `src/app/(dashboard)/leases/[id]/edit/page.tsx` (Park-Selector, Vertragspartner, PersonEdit)
- `src/components/maps/ParkMap.tsx`, `ParkMapContainer.tsx`, `index.ts`
- `src/components/layout/sidebar.tsx`, `src/messages/de.json`, `src/messages/en.json`

### 18. Februar 2026 — Phase 9: Final Polish & Hardening

**UI/UX Design-System Polish:**
- Tailwind Animations (shimmer, fade-in, slide-in-right, scale-in) + ease-out-expo Timing
- Glassmorphism Header (backdrop-blur-sm, sticky, semi-transparent)
- Button Micro-Interactions (active:scale-[0.98], hover:shadow-md)
- Skeleton Shimmer-Gradient statt pulse, Dialog Backdrop-Blur
- Table Zebra-Striping, Toast ease-out-expo, Sidebar border-l-2 Active-Indicator
- Stats-Cards Gradient-Hintergrund + border-l-4, Page-Header Gradient-Divider
- Empty-State + Page-Loading Animationen, Dashboard Widget hover:shadow-md
- Neue CSS-Klassen: .card-interactive, .glass, .animate-shimmer
- Badge success/warning Varianten

**Permission-Audit & Security:**
- 3 neue granulare Permissions: admin:manage, energy:scada:import, energy:settlements:finalize
- 9 API-Routes mit fehlenden/zu groben Permissions gefixt
- Resource-Level-Filtering auf Dashboard Stats (getAllAccessibleIds + Fallback)
- SuperAdmin-only Schutz auf Marketing, Verguetungsarten, Gesellschaftstypen Admin-Pages

**Duplikat-Cleanup:**
- 4 redundante Seiten geloescht (energy/analysis, energy/scada/comparison, energy/reports, documents/new)
- Redirect-Referenzen aktualisiert

**Admin-Bereich Konsolidierung:**
- Admin-Settings von 12 auf 3 Tabs reduziert
- 4 neue fokussierte Admin-Pages (invoices, templates, revenue-types, fund-categories)
- E-Mail-Seite SMTP-Duplizierung entfernt
- Sidebar-Reorganisation (Administration vs. System Gruppen)
- 4 neue i18n-Keys in DE + EN

**Bug-Fixes:**
- Cost-Allocation Page: API-Response-Format-Mismatch (data-Wrapper) gefixt
- Dashboard Stats: buildIdFilter robuster mit try/catch Fallback
- Settlement Periods: Prisma Client regeneriert (reviewedById Spalte existierte in DB)

### 18. Februar 2026 — Phase 8: UX-Optimierung, Wizards, Konsolidierung

**Marketing CMS:**
- Marketing-Seite Scroll-Fix (overflow-hidden nur im Dashboard-Layout)
- Admin-konfigurierbarer Marketing-Content (Hero, Features, Preisrechner, CTA) ueber Tenant.settings JSON
- Marketing-Admin-UI (`/admin/marketing`) mit 4 Tabs und Live-Vorschau
- Dynamische Marketing-Seite (SSR, Props statt hardcoded, Default-Fallbacks)
- Dynamische Legal-Pages (Impressum, Datenschutz, AGB ueber Admin konfigurierbar)

**5 Workflow-Wizards:**
- Jahresendabrechnung-Wizard: Park → Zeitraum → Datenquellen → Zusammenfassung → Erstellen
- Park-Einrichtungs-Wizard: Stammdaten → Turbinen → SCADA-Mapping → Topologie → Freigabe
- Pachtabrechnung-Wizard: Pachtvertrag → Zeitraum → Kosten → Vorschau → Erstellen
- Vertrags-Wizard: Vertragstyp → Parteien → Konditionen → Dokumente → Freigabe
- Tenant-Onboarding-Wizard: Mandant → Admin-User → Einstellungen → Datenimport → Freigabe

**Dashboard & UX:**
- Dashboard Widget-Sizing: rowHeight 100→60px, alle 4 Rollen-Layouts recalculated
- Sidebar-Logo: tenantLogoUrl durch Auth-Session-Flow (authorize → JWT → session → Sidebar)
- Logo-Darstellung: Next.js Image-Component, Fallback auf Wind-Icon + Tenant-Name

**Analysen/Reports-Konsolidierung (10+ Seiten → 3 Seiten):**
- Analytics-Seite: 8-Tab Hub (6 bestehende + Daten-Explorer + Datenabgleich)
  - Daten-Explorer: SCADA-Analyse mit 4 Sub-Tabs (Produktion, Leistungskurve, Windrose, Tagesverlauf)
  - Datenabgleich: SCADA vs. Netzbetreiber-Vergleich (KPIs, 3 Ansichten, Delta-Analyse)
- Berichte-Seite: 2-Tab Hub (Berichte & Export + Energie-Berichte)
  - Energie-Berichte: Konfigurierbarer SCADA-Berichtsersteller mit 6 Modulen
- Berichtsarchiv: unveraendert
- 3 neue Komponenten: DataExplorerTab, DataComparisonTab, EnergyReportBuilder

### 18. Februar 2026 — Feature-Runde 6: Batch-APIs, Integration Tests, E2E Tests
- Batch-APIs Backend (processBatch Utility, 4 Endpoints: Invoices, Settlements, Documents, Email + React Hook)
- Integration Tests mit Vitest (Setup, Helpers, Auth-Tests, Batch-Invoices, Batch-Documents, Batch-Settlements, processBatch — 35+ Cases)
- E2E Tests mit Playwright (Config, Auth-Fixture, 4 Page Objects, 5 Spec-Suites: Auth, Dashboard, Parks, Invoices, Navigation — 20+ Specs)

### 12. Februar 2026 — Feature-Runde 5: SCADA-Automation, Topologie, WYSIWYG, GoBD
- SCADA Auto-Import (Cron-Job, BullMQ, pro-Mapping Konfiguration, Import-Log-Tabelle)
- Anomalie-Erkennung (4 Algorithmen: Performance-Drop, Verfuegbarkeit, Leistungskurven-Abweichung, Datenqualitaet)
- Netz-Topologie-Visualisierung (SVG-Canvas, Drag&Drop, Auto-Layout, Live-Status-Farben, Verbindungs-Editor)
- WYSIWYG Rechnungsvorlagen-Editor (15 Block-Typen, Drag&Drop, Live-Vorschau, Merge-Variablen, Template-CRUD)
- GoBD-konforme Archivierung (SHA-256 Hash-Chain, Auto-Archive-Hooks, 10-Jahre Retention, Integritaetspruefung, Betriebspruefungs-Export)

### 12. Februar 2026 — Feature-Runde 4: E-Invoicing, Kommunikation, Abgleich, Skonto, Teilstorno
- XRechnung/ZUGFeRD E-Invoicing (UBL 2.1 XML, Validator, ZUGFeRD 2.2, Download-API, Leitweg-ID)
- Massen-Kommunikation (Empfaenger-Filter, Vorschau, Test-Versand, Versandhistorie)
- Zahlungs-Abgleich Dashboard (KPI-Cards, Monatsvergleich-Chart, Fund-Tabelle, Timeline, Donut)
- Skonto/Zahlungsrabatt (Prozent + Frist, automatische Berechnung, PDF-Hinweis, Zahlungsabwicklung)
- Teilstorno/Rechnungskorrektur (Partial-Cancel-Dialog, Correction-Dialog, Audit-Trail, Atomare Transaktionen)

### 12. Februar 2026 — Feature-Runde 3: Benachrichtigungen, Rechnungen, Onboarding, Lifecycle
- In-App Benachrichtigungszentrum (Bell-Icon, Unread-Count, Mark-Read API, 4 Notification-Endpoints)
- Automatische Pacht-Vorschussrechnungen (Lease-Advance Billing-Rule, monatliche Generierung)
- Gesellschafter-Onboarding-Wizard (5-Schritt-Wizard: Stammdaten → Beteiligung → Portal → Dokumente → Freigabe)
- Wiederkehrende Rechnungen (RecurringInvoice Model, Frequenz-Scheduling, CRUD-API, Admin-UI)
- Dokumenten-Lifecycle (DRAFT → PENDING_REVIEW → APPROVED → PUBLISHED → REJECTED, Approve/Reject API)

### 12. Februar 2026 — Workflow-Automation + Bug-Fixes
- ResizeObserver Debouncing (requestAnimationFrame statt direktem State-Update)
- DB-Transaktionen ergaenzt (Invoice, Document, Settlement, Distribution atomare Ops)
- Settlement-Freigabe-Workflow (PENDING_REVIEW Status, Approve/Reject API, Selbst-Genehmigung verhindert)
- Automatische Erinnerungen (4 Kategorien: Rechnungen, Vertraege, Settlements, Dokumente)
- Geplante Berichte (ScheduledReport Model, CRUD-API, Cron-Integration, E-Mail-Versand)

### 12. Februar 2026 — Audit-Fixes: Billing-Worker, E-Mail, N+1, Code-Quality
- Billing-Worker: 5 Prozessoren implementiert (Invoice, Settlement, Reminder, Fees, BulkInvoice)
- Password-Reset + Pachtzahlung E-Mail angebunden
- N+1 Queries gefixt (Resource-Access, Votes, Roles - 5 Dateien)
- parseInt Radix auf ~50 Aufrufen in 22 API-Dateien
- Management-Fee ANNUAL_REVENUE + NET_ASSET_VALUE echte DB-Queries
- Console.log Cleanup (~100 Stellen bereinigt)

### 12. Februar 2026 — i18n, Storage-Tracking, Dashboard-Caching
- next-intl Integration (DE/EN, Cookie-basiert, Language-Switcher)
- Speicherplatz-Tracking pro Mandant (storageUsedBytes/storageLimit, Admin-UI)
- Dashboard Redis-Caching (60s Stats, 300s Analytics, Cache-Invalidierung)

### 12. Februar 2026 — Massive Stabilisierung + Business-Features
- requirePermission() auf allen ~30+ API-Routes, Zod-Validierung
- DB-Backups (Retention 7d/4w/3m), Role-Hierarchie, Lease-Prorating
- DATEV-Export, Audit-Log Filter, Batch-Operations, Keyboard-Shortcuts
- Unit Tests (Vitest), CI/CD (GitHub Actions), PDF-Templates
- SCADA Drill-Down, KPI-Cards, Phase 7 komplett (43/43 Findings)

### 12. Februar 2026 — Portal-Analytics + Berichtsgenerator
- Portal Analytics Dashboard mit KPI-Cards, YoY-Chart, Turbinen-Tabelle
- Berichts-Konfigurator (22 Module, Portal-Sichtbarkeit)

### 11. Februar 2026 — Energy Analytics Dashboard
- 6-Tab Analytics (Performance, Verfuegbarkeit, Vergleich, Stoerungen, Umwelt, Finanzen)
- Shared Infrastructure (Types, Query-Helpers, 17 Module-Fetchers)

### 9. Februar 2026 — Park-Modell Umstrukturierung
- operatorFundId, Betriebsfuehrung-Felder, MaStR-Nummer

### 8. Februar 2026 — Projekt-Audit
- 43 Findings identifiziert und gefixt (Phasen 6.2, 6.3, 7)

### 7. Februar 2026 — Monitoring + SCADA Grundlagen
- Phase 5.9-5.14, Phase 6.1 abgeschlossen

### 5.-6. Februar 2026 — Dashboard, Automation, Security
- Dashboard Grid, 19 Widgets, Phase 4 komplett, Security Hardening

### Frueher — Phase 1-3
- Foundation, Core Modules, Advanced Features vollstaendig

---

```bash
# Entwicklungsserver starten
npm run dev

# Datenbank-Migrationen ausfuehren
npm run db:migrate

# Build ueberpruefen
npm run build

# Tests ausfuehren
npx vitest run
```
