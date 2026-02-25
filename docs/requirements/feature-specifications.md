# Feature Specifications: WindparkManager (WPM)

> **Stand:** 25. Februar 2026
> **Version:** 2.0 (aktualisiert auf Ist-Zustand)

## Uebersicht der Module

| # | Modul | Status | Komplexitaet |
|---|-------|--------|-------------|
| 1 | Multi-Tenancy & Admin-Bereich | ✅ Implementiert | Hoch |
| 2 | Authentifizierung & Autorisierung | ✅ Implementiert | Hoch |
| 3 | Park- und Anlagenverwaltung | ✅ Implementiert | Mittel |
| 4 | Gesellschafter-/Kommanditistenverwaltung | ✅ Implementiert | Hoch |
| 5 | Pacht- und Flaechenverwaltung | ✅ Implementiert | Hoch |
| 6 | Abstimmungssystem | ✅ Implementiert | Hoch |
| 7 | Dokumentenmanagement | ✅ Implementiert | Mittel |
| 8 | Abrechnungssystem | ✅ Implementiert | Hoch |
| 9 | Vertragsmanagement | ✅ Implementiert | Mittel |
| 10 | Benachrichtigungssystem | ✅ Implementiert | Mittel |
| 11 | Wetter-Integration | ✅ Implementiert | Niedrig |
| 12 | Reporting & Export | ✅ Implementiert | Mittel |
| 13 | Energie/SCADA | ✅ Implementiert | Hoch |
| 14 | Dashboard & Widgets | ✅ Implementiert | Mittel |
| 15 | Webhook-System | ✅ Implementiert | Mittel |
| 16 | Betriebsfuehrung (BF-Billing) | ✅ Implementiert | Hoch |
| 17 | Feature-Flag-System | ✅ Implementiert | Niedrig |

---

## Modul 1: Multi-Tenancy & Admin-Bereich ✅

### Implementierte Features
- Mandanten-CRUD (Name, Slug, Logo, Farben, Kontaktdaten)
- Mandanten-Branding (Logo, Primaerfarbe, Briefkoepfe, E-Mail-Templates)
- User-Verwaltung pro Mandant
- Impersonation (SuperAdmin als anderer User, mit Audit-Log)
- Tenant-Settings (Logo, Adresse, DATEV/GoBD-Konfiguration)
- Feature-Flags pro Mandant
- Cross-Tenant BF-Abrechnung (ParkStakeholder)

### Seiten
- `/admin/tenants` — Mandanten-Verwaltung
- `/admin/system-settings` — System-Einstellungen
- `/admin/system-config` — System-Konfiguration
- `/settings` — Mandanten-Einstellungen

---

## Modul 2: Authentifizierung & Autorisierung ✅

### Implementierte Features
- NextAuth.js v5 mit Credentials Provider (JWT-Sessions)
- 6-stufige Rollen-Hierarchie: SUPERADMIN (100) → PORTAL (20)
- 75 granulare Permissions in 15 Kategorien
- Editierbare Rollen (SuperAdmin kann Rollen erstellen/aendern)
- Resource Access (Datensatz-Level Berechtigungen)
- Permission-Cache (Redis-basiert, TTL 300s)
- Passwort-Reset (E-Mail-basiert, Token mit 1h Ablauf)

### Rollen-Matrix

| Aktion | SUPERADMIN | ADMIN | MANAGER | MITARBEITER | NUR_LESEN | PORTAL |
|--------|------------|-------|---------|-------------|-----------|--------|
| System verwalten | ✓ | - | - | - | - | - |
| Mandanten verwalten | ✓ | - | - | - | - | - |
| User verwalten | ✓ | ✓ | - | - | - | - |
| Abrechnungen | ✓ | ✓ | ✓ | - | - | - |
| Daten bearbeiten | ✓ | ✓ | ✓ | ✓ (eingeschr.) | - | - |
| Daten ansehen | ✓ | ✓ | ✓ | ✓ | ✓ | - |
| Portal (eigene Daten) | - | - | - | - | - | ✓ |
| Impersonation | ✓ | - | - | - | - | - |

### Seiten
- `/login` — Anmeldung
- `/forgot-password` — Passwort vergessen
- `/reset-password` — Passwort zuruecksetzen
- `/admin/roles` — Rollen & Rechte verwalten
- `/admin/access-report` — Zugriffsreport

---

## Modul 3: Park- und Anlagenverwaltung ✅

### Implementierte Features
- Windpark-CRUD (Name, Standort, Koordinaten, Inbetriebnahme, Status)
- Windkraftanlagen-CRUD (Hersteller, Typ, Leistung, Nabenhoehe, Rotor)
- Service-Events (Wartung, Reparatur, Inspektion, Kosten-Tracking)
- Erloesphasen (ParkRevenuePhase: Verguetungssaetze ueber Zeit)
- Netz-Topologie (SVG-Canvas, Drag&Drop, Auto-Layout, Live-Status)
- Wetterdaten pro Park (OpenWeatherMap, Dashboard-Widget)
- GeoJSON-Karte mit Flurstuecks-Polygonen

### Seiten
- `/parks` — Parks-Uebersicht + Karte
- `/parks/[id]` — Park-Detail (Anlagen, Vertraege, Flurstuecke)
- `/parks/[id]/weather` — Wetterdaten
- `/service-events` — Service-Events

---

## Modul 4: Gesellschafter-/Kommanditistenverwaltung ✅

### Implementierte Features
- Fund-CRUD (Gesellschaften) mit FundCategory
- Shareholder-CRUD (Gesellschafter mit Kapitalanteil, Quoten)
- Fund-Hierarchie (Mutter-/Tochtergesellschaften mit validFrom/validTo)
- Ausschuettungen (Distribution mit Status-Workflow)
- Portal-Zugang (Shareholder → User Verknuepfung)
- Onboarding-Wizard fuer Gesellschafter
- Automatische Quoten-Neuberechnung ($transaction mit Atomicity)
- Letterhead-Konfiguration pro Fund

### Seiten
- `/funds` — Gesellschaften-Uebersicht
- `/funds/[id]` — Detail (Gesellschafter, Ausschuettungen, Dokumente)
- `/funds/onboarding` — Onboarding-Wizard

---

## Modul 5: Pacht- und Flaechenverwaltung ✅

### Implementierte Features
- Lease-CRUD (Pachtvertraege) mit n:m Plot-Zuordnung
- Flurstuecke (Plot) mit Teilflaechen (PlotArea: WEA_STANDORT, POOL, WEG, AUSGLEICH, KABEL)
- Pachtabrechnung (Vorschuss + Endabrechnung mit Verrechnung)
- Umlageverfahren (ParkCostAllocation mit Positionen)
- Nutzungsentgelte (Usage-Fees mit Setup + Berechnung)
- SHP-Import (Shapefile → Flurstuecke + Eigentuemer, ALKIS-Auto-Detection)
- GeoJSON-Polygone in Park-Karte (farbcodiert nach Eigentuemer/Vertragsstatus)
- Mindestpacht-Pruefung
- Vertragspartner-Feld (contractPartnerFundId)

### Seiten
- `/leases` — Pachtvertraege
- `/leases/settlement` — Pachtabrechnung
- `/leases/advances` — Vorschuesse
- `/leases/payments` — Zahlungen
- `/leases/import-shp` — SHP-Import (5-Schritt-Wizard)
- `/leases/cost-allocation` — Umlageverfahren
- `/leases/usage-fees` — Nutzungsentgelte

---

## Modul 6: Abstimmungssystem ✅

### Implementierte Features
- Vote-CRUD (Zeitraum, Optionen, Quorum, Kapitalmehrheit)
- Stimmabgabe (Ja/Nein/Enthaltung oder custom)
- Vollmachten (VoteProxy mit Dokument-Upload)
- Ergebnis-Auswertung (nach Koepfen + nach Kapitalanteil)
- PDF-Export (Ergebnisbericht mit Letterhead)
- Portal-Integration (Gesellschafter stimmen online ab)

### Seiten
- `/votes` — Abstimmungen
- `/votes/new` — Neue Abstimmung
- `/votes/[id]` — Detail + Ergebnis
- `/votes/proxies` — Vollmachten

---

## Modul 7: Dokumentenmanagement ✅

### Implementierte Features
- Document-CRUD (Upload, Kategorien, Tags)
- Versionierung (Self-Relation: parentId + versions[])
- Approval-Workflow (PENDING → APPROVED / REJECTED)
- Volltext-Suche (PostgreSQL-basiert)
- Download-Tracking (Audit-Log)
- GoBD-Archivierung (SHA-256 Hash-Chain, 10-Jahre Retention)
- DocumentTemplate (WYSIWYG-Editor, 15 Block-Typen)
- Optionale Zuordnung: Park, Turbine, Fund, Contract, Shareholder
- Portal-Zugang (Gesellschafter sehen zugeordnete Dokumente)

### Seiten
- `/documents` — Dokumenten-Uebersicht
- `/documents/upload` — Upload
- `/documents/[id]` — Detail + Versionen

---

## Modul 8: Abrechnungssystem ✅

### Implementierte Features
- Invoice-CRUD (Rechnungen + Gutschriften)
- PDF-Generierung (DIN 5008, Letterhead, Wasserzeichen)
- Nummernkreise (InvoiceNumberSequence: {YEAR}/{NUMBER})
- Steuersaetze (TaxRateConfig: STANDARD/REDUCED/EXEMPT mit Gueltigkeitszeitraum)
- Skonto (Prozent + Frist, Auto-Apply bei Zahlung innerhalb Frist)
- Teilstorno / Korrekturrechnungen
- Mahnwesen (3 Stufen + Verzugsgebuehren, Billing-Worker)
- Wiederkehrende Rechnungen (RecurringInvoice, Frequenz-Scheduling)
- Abschlagsrechnungen (Pacht-Vorschuss, monatliche Generierung)
- E-Invoicing: XRechnung (UBL 2.1), ZUGFeRD 2.2 COMFORT
- DATEV-Export (Standard-Buchungsformat)
- Batch-Versand (bis 50 Rechnungen gleichzeitig)
- Sammelrechnungen (Consolidated Invoices)
- BillingRules (4 Typen, 5 Frequenzen, Cron, Dry-Run)
- BF-Abrechnung (Cross-Tenant, ManagementBilling)

### Seiten
- `/invoices` — Rechnungs-Uebersicht
- `/invoices/new` — Neue Rechnung
- `/invoices/[id]` — Detail + PDF + Versand
- `/invoices/dispatch` — Versanduebersicht
- `/invoices/reconciliation` — Zahlungs-Abgleich
- `/admin/billing-rules` — Abrechnungsregeln
- `/admin/settlement-periods` — Abrechnungsperioden
- `/admin/tax-rates` — Steuersaetze
- `/admin/invoices` — Rechnungseinstellungen

---

## Modul 9: Vertragsmanagement ✅

### Implementierte Features
- Contract-CRUD (6 Typen: LEASE, SERVICE, INSURANCE, GRID_CONNECTION, MARKETING, OTHER)
- Fristen-Erinnerungen (konfigurierbare reminderDays[], Reminder-Worker)
- Kalender-Ansicht (/contracts/calendar)
- ICS-Export (RFC 5545, importierbar in Outlook/Google Calendar)
- Vertrags-Dokumente (Upload, Zuordnung)
- Auto-Renewal (automatische Verlaengerung bei autoRenewal=true)

### Seiten
- `/contracts` — Vertrags-Uebersicht
- `/contracts/new` — Neuer Vertrag
- `/contracts/[id]` — Detail + Dokumente
- `/contracts/calendar` — Fristen-Kalender + ICS-Export

---

## Modul 10: Benachrichtigungssystem ✅

### Implementierte Features
- In-App Notifications (Bell Icon, Unread Count)
- E-Mail-Benachrichtigungen (SMTP/SendGrid/SES via BullMQ)
- User-Praeferenzen (pro Kategorie ein-/ausschaltbar)
- Massen-Kommunikation (Admin an ausgewaehlte User)
- Reminder-Worker (taeglich 08:00):
  - Ueberfaellige Rechnungen
  - Auslaufende Vertraege
  - Offene Abrechnungsperioden
  - Pendente Dokumente

### Benachrichtigungstypen

| Ereignis | E-Mail | In-App | Webhook |
|----------|--------|--------|---------|
| Neues Dokument | ✓ | ✓ | ✓ |
| Neue Abstimmung | ✓ | ✓ | ✓ |
| Abstimmung endet | ✓ | ✓ | ✓ |
| Vertragsfrist | ✓ | ✓ | ✓ |
| Rechnung erstellt | ✓ | ✓ | ✓ |
| Rechnung ueberfaellig | ✓ | ✓ | ✓ |
| Service-Event | ✓ | ✓ | ✓ |
| Abrechnung erstellt | ✓ | ✓ | ✓ |
| System-Meldung | ✓ | ✓ | - |

---

## Modul 11: Wetter-Integration ✅

### Implementierte Features
- OpenWeatherMap API-Integration
- Redis-Cache (TTL 30 Min)
- Dashboard-Widget (Windgeschwindigkeit, Temperatur, Wetterlage)
- Historische Daten (WeatherData Model)
- BullMQ weather-Queue fuer periodischen Sync
- Korrelationsanalyse mit Produktionsdaten (Energy Analytics)

---

## Modul 12: Reporting & Export ✅

### Implementierte Features
- PDF-Berichte (Monatsbericht, Jahresbericht, Gesellschafterliste, Beteiligungsuebersicht)
- Excel-Export (xlsx, alle Entitaeten)
- CSV-Export (alle Entitaeten, mit Filteroptionen)
- DATEV-Export (Buchungsformat)
- ICS-Kalenderexport (Vertragsfristen, Pachttermine)
- Bericht-Archiv (GeneratedReport, /reports/archive)
- Geplante Berichte (ScheduledReport, Cron via Report-Queue)
- Energieberichte (EnergyReportConfig, 22 Module, Portal-Sichtbarkeit)
- GoBD-Archiv-Export (Betriebspruefung)

### Seiten
- `/reports` — Berichte erstellen
- `/reports/[type]` — Report-Viewer
- `/reports/archive` — Berichtsarchiv
- `/admin/archive` — GoBD-Archiv

---

## Modul 13: Energie/SCADA ✅

### Implementierte Features
- Enercon SCADA-Import (DBF/WSD/UID, 10-Min-Intervalle)
- SCADA-Mapping (Loc_xxxx + PlantNo → Park + Turbine)
- Auto-Import (BullMQ scada-auto-import Queue, taeglich 02:00)
- TurbineProduction (Monatssummen: kWh, Betriebsstunden, Verfuegbarkeit)
- EnergySettlement (Netzbetreiber-Abrechnung, Verteilmodus)
- Anomalie-Erkennung (4 Algorithmen: Performance-Drop, Verfuegbarkeit, Kurven-Abweichung, Datenqualitaet)
- Energy Analytics (8 Tabs: Performance, Verfuegbarkeit, Vergleich, Stoerungen, Umwelt, Finanzen, Daten-Explorer, Datenabgleich)
- Netz-Topologie (SVG-Canvas, Drag&Drop, Auto-Layout, Live-Status)
- Portal-Analytics (KPIs, Trends, Turbinen-Tabelle)
- Berichts-Konfigurator (22 Module, Portal-Sichtbarkeit)

### Seiten
- `/energy` — Uebersicht
- `/energy/productions` — Produktionsdaten
- `/energy/settlements` — NB-Abrechnungen
- `/energy/scada` — SCADA-Mapping
- `/energy/scada/data` — Messdaten
- `/energy/scada/anomalies` — Anomalie-Erkennung
- `/energy/topology` — Netz-Topologie
- `/energy/analytics` — Energy Analytics (8 Tabs)

---

## Modul 14: Dashboard & Widgets ✅

### Implementierte Features
- 12-Spalten Grid (react-grid-layout, Drag & Drop)
- 27 Dashboard-Widgets (KPI, Chart, List, Utility, Admin)
- Redis-Cache fuer Widget-Daten (TTL 60-300s)
- Rollen-basierte Default-Layouts
- Persistente Widget-Konfiguration pro User
- Lazy Loading fuer Recharts-Komponenten

---

## Modul 15: Webhook-System ✅

### Implementierte Features
- 13 Event-Typen in 6 Kategorien
- HMAC-SHA256 Signatur (X-Webhook-Signature)
- BullMQ-Queue (3 Retries, exponentieller Backoff)
- Admin-UI (/admin/webhooks) mit CRUD, Test-Event, Delivery-Log
- Non-blocking Integration in bestehende API-Routes

---

## Modul 16: Betriebsfuehrung (BF-Billing) ✅

### Implementierte Features
- Cross-Tenant ParkStakeholder (BF-Firma → Park → Rolle + Gebuehr)
- StakeholderFeeHistory (historische Gebuehren)
- ManagementBilling (DRAFT → CALCULATED → INVOICED)
- Fee-Resolution mit History-Fallback
- Combined Calculate-and-Invoice Endpoint
- Rechnungsintegration mit Invoice-Pipeline

### Seiten
- `/management-billing` — Uebersicht
- `/management-billing/stakeholders` — BF-Vertraege
- `/management-billing/billings` — Abrechnungen

---

## Modul 17: Feature-Flag-System ✅

### Implementierte Features
- Pro-Mandant Feature-Toggles (SystemConfig)
- SuperAdmin + Mandanten-Admin Konfiguration
- Sidebar-Integration (Items mit featureFlag automatisch ausgeblendet)
- `/api/features` Endpoint + `useFeatureFlags` Hook
- API-Gating (Feature-Check in Route Handlern)

---

## Audit-Log ✅

### Protokollierte Aktionen
- CREATE, UPDATE, DELETE: Alle Entitaeten
- VIEW: Sensible Daten (optional)
- EXPORT: Datenexporte
- LOGIN: User-Anmeldungen
- IMPERSONATE: Admin hat User impersoniert

### Log-Felder
- Timestamp, User-ID, Tenant-ID
- Aktion, Entitaet (Tabelle), Entitaets-ID
- Alte Werte (JSON), Neue Werte (JSON)
- IP-Adresse, User-Agent

### GoBD-Konformitaet
- SHA-256 Hash-Chain (ArchiveVerificationLog)
- 10-Jahre Retention Policy
- Betriebspruefungs-Export (/admin/archive)
