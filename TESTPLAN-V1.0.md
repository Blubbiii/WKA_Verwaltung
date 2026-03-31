# WindparkManager v1.0 — Testplan

**Version:** 0.5.0 → 1.0.0
**Ziel:** Alle Features verifizieren, Bugs fixen, Production-Ready
**Umfang:** 120+ Seiten, 100+ API-Routes, 132 Prisma-Models, 25 Feature-Flags

---

## Teststrategie

**Reihenfolge:** Kritisch → Hoch → Mittel → Niedrig
**Pro Test:** Status (PASS/FAIL/SKIP), Bug-Beschreibung wenn FAIL, Datum

---

## 1. FUNDAMENT (Kritisch)

### 1.1 Auth & Login
| # | Test | Erwartet | Status |
|---|------|----------|--------|
| 1.1.1 | Login mit E-Mail + Passwort | Dashboard erscheint | |
| 1.1.2 | Login mit falschem Passwort | Fehlermeldung, kein Zugang | |
| 1.1.3 | Login Rate-Limit (6x falsch) | "Zu viele Versuche" nach 5x | |
| 1.1.4 | Passwort vergessen → E-Mail | Reset-Link wird versendet | |
| 1.1.5 | Passwort zurücksetzen mit Token | Neues Passwort funktioniert | |
| 1.1.6 | Logout | Redirect zu Login, Session gelöscht | |
| 1.1.7 | Session-Timeout (24h) | Automatisch ausgeloggt | |
| 1.1.8 | SSO/Authentik Login (wenn konfiguriert) | Redirect zu Provider, dann Dashboard | |

### 1.2 Berechtigungen & Rollen
| # | Test | Erwartet | Status |
|---|------|----------|--------|
| 1.2.1 | Admin sieht Admin-Menü | Administration-Gruppe sichtbar | |
| 1.2.2 | SuperAdmin sieht System-Menü | System-Gruppe sichtbar | |
| 1.2.3 | Normaler User sieht KEIN Admin-Menü | Gruppen versteckt | |
| 1.2.4 | Portal-User sieht nur Portal | Keine Dashboard-Seiten | |
| 1.2.5 | API-Zugriff ohne Session → 401 | Alle geschützten Endpoints | |
| 1.2.6 | API-Zugriff ohne Permission → 403 | Z.B. admin:manage als User | |
| 1.2.7 | Tenant-Isolation: User A sieht keine Daten von Tenant B | Keine Cross-Tenant-Leaks | |

### 1.3 Navigation & Layout
| # | Test | Erwartet | Status |
|---|------|----------|--------|
| 1.3.1 | Sidebar: Alle Gruppen klappbar | Expand/Collapse funktioniert | |
| 1.3.2 | Sidebar: Collapsed-Modus | Icons sichtbar, Tooltips | |
| 1.3.3 | Sidebar: Drag-Reorder | Gruppen verschiebbar | |
| 1.3.4 | Header: Tenant-Name/Logo sichtbar | Links neben Suche | |
| 1.3.5 | Header: Theme Toggle (Dark/Light) | Wechselt korrekt | |
| 1.3.6 | Header: Sprache wechseln (DE/EN) | UI-Texte ändern sich | |
| 1.3.7 | Breadcrumb: Korrekte Pfad-Anzeige | Auf jeder Seite | |
| 1.3.8 | Mobile: Sidebar-Toggle | Öffnet/schließt | |

---

## 2. KERNFUNKTIONEN (Kritisch)

### 2.1 Dashboard
| # | Test | Erwartet | Status |
|---|------|----------|--------|
| 2.1.1 | Dashboard lädt mit Widgets | KPI-Cards sichtbar | |
| 2.1.2 | Widget hinzufügen | Widget-Auswahl öffnet, Widget erscheint | |
| 2.1.3 | Widget entfernen | Widget verschwindet | |
| 2.1.4 | Widgets verschieben (Drag) | Position ändert sich | |
| 2.1.5 | Dashboard speichern | Layout bleibt nach Reload | |
| 2.1.6 | KPI-Werte korrekt | Parks, Turbinen, Rechnungen stimmen | |
| 2.1.7 | Empty-Dashboard State | "Widget hinzufügen" CTA | |

### 2.2 Windparks
| # | Test | Erwartet | Status |
|---|------|----------|--------|
| 2.2.1 | Parks-Liste laden | Alle Parks des Tenants | |
| 2.2.2 | Park erstellen | Formular → Speichern → In Liste | |
| 2.2.3 | Park bearbeiten | Daten ändern → Speichern | |
| 2.2.4 | Park-Detail: Turbinen-Liste | Alle Turbinen des Parks | |
| 2.2.5 | Turbine erstellen | Dialog → Speichern → In Liste | |
| 2.2.6 | Turbine bearbeiten | Daten ändern → Speichern | |
| 2.2.7 | Park-Karte (Map) | Leaflet-Karte mit Turbinen-Markern | |
| 2.2.8 | Service-Event erstellen | Formular → Speichern | |
| 2.2.9 | Park P&L Ansicht | Erlöse/Kosten-Übersicht | |

### 2.3 Rechnungen & Gutschriften
| # | Test | Erwartet | Status |
|---|------|----------|--------|
| 2.3.1 | Rechnungen-Liste | Sortierbar, filterbar | |
| 2.3.2 | Rechnung erstellen | Empfänger, Positionen, Beträge | |
| 2.3.3 | Rechnung als PDF | PDF wird generiert, korrekte Daten | |
| 2.3.4 | Rechnung versenden (E-Mail) | E-Mail wird gesendet | |
| 2.3.5 | Rechnung stornieren | Status "Storniert", Storno-Rechnung | |
| 2.3.6 | Gutschrift erstellen | Typ "CREDIT_NOTE" | |
| 2.3.7 | Rechnung als bezahlt markieren | Status wechselt zu "PAID" | |
| 2.3.8 | XRechnung/ZUGFeRD Export | XML wird erzeugt | |
| 2.3.9 | Nummernkreis-Logik | Fortlaufende Nummer pro Jahr | |
| 2.3.10 | Rechnungskorrektur | Positionen ändern, neue Rechnung | |
| 2.3.11 | Mahnwesen | Mahnung erzeugen für überfällige RG | |
| 2.3.12 | Bank-Import (CSV/MT940) | Transaktionen einlesen, abgleichen | |

### 2.4 Pacht & Grundstücke
| # | Test | Erwartet | Status |
|---|------|----------|--------|
| 2.4.1 | Pachtverträge-Liste | Alle Verträge mit Status | |
| 2.4.2 | Pachtvertrag erstellen | Pächter, Flurstücke, Laufzeit | |
| 2.4.3 | Pachtvertrag bearbeiten | Daten ändern | |
| 2.4.4 | Pachtabrechnung erstellen | Wizard → Berechnung → Gutschriften | |
| 2.4.5 | Vorschuss-Zahlungen | Vorschüsse erfassen und abrechnen | |
| 2.4.6 | Kostenallokation | Kosten auf Pächter verteilen | |
| 2.4.7 | Flurstücke einem Vertrag zuordnen | Über Dialog oder GIS | |

### 2.5 Beteiligungen (Funds)
| # | Test | Erwartet | Status |
|---|------|----------|--------|
| 2.5.1 | Gesellschaften-Liste | Alle Funds anzeigen | |
| 2.5.2 | Fund erstellen | Name, Typ, Gesellschafter | |
| 2.5.3 | Fund-Detail: Gesellschafter | Liste mit Anteilen | |
| 2.5.4 | Gesellschafter hinzufügen | Person zuordnen, Anteil setzen | |
| 2.5.5 | Fund-Hierarchie | Parent/Child Beziehungen | |
| 2.5.6 | Ausschüttung berechnen | Pro Gesellschafter nach Anteil | |
| 2.5.7 | Onboarding-Wizard | Schritt-für-Schritt Anlage | |

---

## 3. ENERGY & SCADA (Hoch)

### 3.1 SCADA-Daten
| # | Test | Erwartet | Status |
|---|------|----------|--------|
| 3.1.1 | SCADA-Dateien importieren (DBF/WSD) | Daten in DB, korrekte Zuordnung | |
| 3.1.2 | SCADA-Turbinen-Zuordnung | Mapping PlantNo → Turbine | |
| 3.1.3 | Auto-Import Konfiguration | Cronjob läuft, neue Dateien erkannt | |
| 3.1.4 | n8n SCADA-Trigger API | POST /api/energy/scada/n8n/trigger | |
| 3.1.5 | Anomalie-Erkennung | Schwellwerte, Alarme | |
| 3.1.6 | Leistungskurve anzeigen | Power-Curve Chart | |

### 3.2 Produktionsdaten
| # | Test | Erwartet | Status |
|---|------|----------|--------|
| 3.2.1 | Produktion manuell erfassen | kWh pro Turbine/Monat | |
| 3.2.2 | Produktion CSV-Import | Datei hochladen, Daten erstellt | |
| 3.2.3 | Produktionsvergleich | Turbinen nebeneinander | |
| 3.2.4 | Verfügbarkeitsberechnung | Prozent pro Turbine | |

### 3.3 Energie-Abrechnungen (Settlements)
| # | Test | Erwartet | Status |
|---|------|----------|--------|
| 3.3.1 | Settlement erstellen | Park, Monat, Netzbetreiber-Daten | |
| 3.3.2 | Settlement berechnen | Verteilung nach Modus (SMOOTHED etc.) | |
| 3.3.3 | Settlement → Gutschriften erzeugen | Rechnungen pro Gesellschaft | |
| 3.3.4 | Settlement abschließen | Status CLOSED | |
| 3.3.5 | Vergütungsarten konfigurieren | EEG, DV, Sonstige | |

### 3.4 Marktwert-Vergleiche
| # | Test | Erwartet | Status |
|---|------|----------|--------|
| 3.4.1 | SMARD-Daten synchronisieren | POST /api/energy/market-prices/sync | |
| 3.4.2 | Marktwert-Vergleich anzeigen | Bar-Chart EEG vs. Markt | |
| 3.4.3 | Kumulative Differenz | Line-Chart über 12 Monate | |
| 3.4.4 | Empfehlung (EEG/DV) | Korrekt basierend auf Differenz | |

### 3.5 Energy Analytics
| # | Test | Erwartet | Status |
|---|------|----------|--------|
| 3.5.1 | Performance-Dashboard | KPIs, Trend-Charts | |
| 3.5.2 | Finanzanalyse | Monatliche Erlöse, verlorene Erlöse | |
| 3.5.3 | Turbinen-Vergleich | Produktion nebeneinander | |
| 3.5.4 | Verfügbarkeits-Analyse | Zeitstrahl, Ausfälle | |
| 3.5.5 | Umwelt-Daten (Schattenwurf) | Kumulierte Stunden | |

---

## 4. GIS-MODUL (Hoch)

| # | Test | Erwartet | Status |
|---|------|----------|--------|
| 4.1 | Karte lädt mit allen Parks | Marker sichtbar | |
| 4.2 | Tile-Switcher (OSM/Satellit/Topo) | Karte wechselt | |
| 4.3 | Flurstück einzeichnen (Polygon) | Polygon bleibt sichtbar | |
| 4.4 | Flurstück-Create-Panel öffnet | Nach Finish → Panel rechts | |
| 4.5 | Flurstück speichern | Park zuordnen, DB-Eintrag | |
| 4.6 | Annotation zeichnen (Polyline) | Kabeltrasse/Zuwegung | |
| 4.7 | Annotation speichern | Name, Typ, Park | |
| 4.8 | Layer-Panel: Ebenen ein/aus | Plots/Turbinen/Parks togglen | |
| 4.9 | Feature-Info Panel | Klick auf Plot → Details rechts | |
| 4.10 | Lease-Status-Farben | Grün/Gelb/Rot/Grau | |
| 4.11 | Buffer-Zonen | Kreise um WEA-Standorte | |
| 4.12 | Heatmap | Farbintensität nach Fläche | |
| 4.13 | Koordinatensuche | Lat/Lng → Karte zentriert | |
| 4.14 | GeoJSON Export | Datei wird heruntergeladen | |
| 4.15 | Shapefile Import | .shp/.zip → Features auf Karte | |
| 4.16 | Drucken | Karte ohne Controls drucken | |
| 4.17 | Flächenreport (Excel) | Download .xlsx | |
| 4.18 | Messen (Fläche/Strecke) | Ergebnis in m²/km | |
| 4.19 | Einstellungen (Buffer-Radius, Opacity) | Slider funktioniert | |

---

## 5. DOKUMENTE (Hoch)

### 5.1 Dokumentenverwaltung
| # | Test | Erwartet | Status |
|---|------|----------|--------|
| 5.1.1 | Dokument hochladen | PDF/Word/Excel/Bild | |
| 5.1.2 | Dokument-Preview | PDF im Browser | |
| 5.1.3 | Dokument herunterladen | Datei wird gespeichert | |
| 5.1.4 | Kategorie zuordnen | CONTRACT/REPORT/etc. | |
| 5.1.5 | Park/Fund zuordnen | Dropdown-Auswahl | |
| 5.1.6 | Versionierung | Neue Version hochladen | |
| 5.1.7 | Approval-Workflow | DRAFT→REVIEW→APPROVED→PUBLISHED | |
| 5.1.8 | Suche (Volltext) | Titel, Dateiname, Beschreibung | |
| 5.1.9 | Batch-Aktionen | Kategorie ändern, Löschen | |

### 5.2 Dokumenten-Explorer
| # | Test | Erwartet | Status |
|---|------|----------|--------|
| 5.2.1 | Explorer laden | Ordner-Baum links erscheint | |
| 5.2.2 | Ordner-Navigation | Park → Jahr → Kategorie | |
| 5.2.3 | Dateien anzeigen | Rechte Seite zeigt Files | |
| 5.2.4 | ZIP-Download (Auswahl) | Mehrere Dateien als ZIP | |
| 5.2.5 | Steuerberater-Export | Alle Belege eines Jahres als ZIP | |
| 5.2.6 | Drag & Drop Upload | Auto-Kategorisierung | |
| 5.2.7 | Rechnungs-PDFs in Explorer | Unter "Rechnungen & Gutschriften" | |

---

## 6. BUCHHALTUNG (Hoch)

| # | Test | Erwartet | Status |
|---|------|----------|--------|
| 6.1 | Kontenrahmen laden (SKR03) | Alle Konten sichtbar | |
| 6.2 | Buchung erstellen | Soll/Haben, Konto, Betrag | |
| 6.3 | SuSa (Summen & Salden) | Korrekte Salden pro Konto | |
| 6.4 | BWA (Betriebswirtschaftl. Auswertung) | Monatliche Übersicht | |
| 6.5 | EÜR | Einnahmen-Überschuss-Rechnung | |
| 6.6 | GuV | Gewinn- und Verlustrechnung | |
| 6.7 | USt-Voranmeldung | Korrekte Steuerbeträge | |
| 6.8 | DATEV-Export | CSV für Steuerberater | |
| 6.9 | SEPA-XML generieren | Valide SEPA-Datei | |
| 6.10 | Anlagenverwaltung (AfA) | Abschreibungen berechnen | |
| 6.11 | Kassenbuch | Ein-/Ausgaben erfassen | |
| 6.12 | Jahresabschluss | Konten abschließen | |
| 6.13 | Angebote (Quotes) | Erstellen → Versenden → In Rechnung umwandeln | |
| 6.14 | Liquiditätsplanung | Cashflow-Prognose | |
| 6.15 | Kostenstellen | Kosten zuordnen, Report | |
| 6.16 | Budget Soll/Ist | Vergleich anzeigen | |

---

## 7. PORTAL (Hoch)

| # | Test | Erwartet | Status |
|---|------|----------|--------|
| 7.1 | Portal-Login (Gesellschafter) | Portal-Dashboard | |
| 7.2 | Beteiligungen anzeigen | Anteile, Ausschüttungen | |
| 7.3 | Dokumente einsehen | Nur zugeordnete Dokumente | |
| 7.4 | Abstimmungen teilnehmen | Stimme abgeben | |
| 7.5 | Vollmacht erteilen | Proxy für Abstimmung | |
| 7.6 | Energie-Reports | Produktionsdaten einsehen | |
| 7.7 | Profil bearbeiten | Eigene Daten ändern | |
| 7.8 | Portal-User sieht KEIN Dashboard | Redirect zu /portal | |

---

## 8. KOMMUNIKATION (Mittel)

| # | Test | Erwartet | Status |
|---|------|----------|--------|
| 8.1 | E-Mail senden (Einzel) | SMTP-Versand erfolgreich | |
| 8.2 | Massen-E-Mail | An mehrere Empfänger | |
| 8.3 | E-Mail-Vorlagen | Template laden, personalisieren | |
| 8.4 | Abstimmung erstellen | Titel, Optionen, Teilnehmer | |
| 8.5 | Abstimmung auswerten | Ergebnis anzeigen | |
| 8.6 | News/Meldung erstellen | Rich-Text Editor | |
| 8.7 | Benachrichtigungen | Badge-Counter, Liste, Gelesen-Status | |

---

## 9. CRM (Mittel)

| # | Test | Erwartet | Status |
|---|------|----------|--------|
| 9.1 | Kontakte-Liste | Personen + Unternehmen | |
| 9.2 | Kontakt erstellen | Formular mit allen Feldern | |
| 9.3 | Kontakt bearbeiten | Daten ändern | |
| 9.4 | CRM-Dashboard | Aktivitäten-Übersicht | |

---

## 10. ADMIN-BEREICH (Hoch)

### 10.1 Administration
| # | Test | Erwartet | Status |
|---|------|----------|--------|
| 10.1.1 | Einstellungen (4 Tabs) | Allgemein, Portal, E-Mail, Schwellenwerte | |
| 10.1.2 | Rollen & Rechte | Rollen erstellen, Permissions zuweisen | |
| 10.1.3 | Zugriffsreport | User-Permissions-Matrix | |
| 10.1.4 | Abrechnung-Tab: Nummernkreise | Sequences konfigurieren | |
| 10.1.5 | Abrechnung-Tab: Regeln | Billing Rules CRUD | |
| 10.1.6 | Abrechnung-Tab: Perioden | Settlement-Periods CRUD | |
| 10.1.7 | Dokumente-Tab: Vorlagen | Templates + Briefpapier | |
| 10.1.8 | Dokumente-Tab: Archiv | GoBD-Archiv durchsuchen | |

### 10.2 System (SuperAdmin)
| # | Test | Erwartet | Status |
|---|------|----------|--------|
| 10.2.1 | Mandanten-Verwaltung (5 Tabs) | CRUD, Benutzer, Rollen, Flags, Limits | |
| 10.2.2 | System-Tab: Health | Server-Status, DB-Status | |
| 10.2.3 | System-Tab: Config | E-Mail, Weather, Storage | |
| 10.2.4 | System-Tab: Feature-Flags | Module ein/ausschalten | |
| 10.2.5 | System-Tab: Backup | Backups erstellen, wiederherstellen | |
| 10.2.6 | Monitoring-Tab: Dashboard | Live-Metriken | |
| 10.2.7 | Monitoring-Tab: Analytics | BI-Dashboard | |
| 10.2.8 | Monitoring-Tab: Audit-Logs | Aktionen durchsuchen | |
| 10.2.9 | Stammdaten-Tab: Vergütungsarten | CRUD | |
| 10.2.10 | Stammdaten-Tab: Steuersätze | CRUD mit Verlinkung | |
| 10.2.11 | Stammdaten-Tab: Gesellschaftstypen | CRUD | |
| 10.2.12 | Stammdaten-Tab: Webhooks | CRUD + Test-Funktion | |
| 10.2.13 | Stammdaten-Tab: SCADA-Codes | CRUD + Upload | |
| 10.2.14 | Stammdaten-Tab: Sidebar-Links | CRUD | |
| 10.2.15 | Marketing-Seite | Landing Page konfigurieren | |

---

## 11. LANDING PAGE & MARKETING (Mittel)

| # | Test | Erwartet | Status |
|---|------|----------|--------|
| 11.1 | Landing Page lädt | Hero, Features, Pricing sichtbar | |
| 11.2 | Hero-Headline korrekt | "Windpark-Verwaltung in Minuten statt Tagen" | |
| 11.3 | Trust-Bar | 5 Firmennamen, keine leeren Boxen | |
| 11.4 | CTA-Buttons | "Demo anfordern" konsistent | |
| 11.5 | Footer Trust-Badges | Made in Germany, DSGVO, GoBD | |
| 11.6 | Register-Form | 3 Felder + DSGVO-Checkbox | |
| 11.7 | Demo-Request absenden | Toast "Vielen Dank", E-Mail wird gesendet | |
| 11.8 | Responsive (Mobile) | Alle Sections korrekt | |
| 11.9 | Dark Mode | Korrekte Farben | |
| 11.10 | Impressum/Datenschutz/Cookies | Seiten laden mit Inhalt | |

---

## 12. REDIRECT-STUBS (Mittel)

Alle alten Admin-URLs müssen korrekt weiterleiten:

| # | Alte URL | Redirect zu | Status |
|---|---------|-------------|--------|
| 12.1 | /admin/invoices | /admin/billing?tab=nummernkreise | |
| 12.2 | /admin/billing-rules | /admin/billing?tab=regeln | |
| 12.3 | /admin/settlement-periods | /admin/billing?tab=perioden | |
| 12.4 | /admin/templates | /admin/documents-admin?tab=vorlagen | |
| 12.5 | /admin/archive | /admin/documents-admin?tab=archiv | |
| 12.6 | /admin/system | /admin/system-admin?tab=health | |
| 12.7 | /admin/system-config | /admin/system-admin?tab=config | |
| 12.8 | /admin/system-settings | /admin/system-admin?tab=flags | |
| 12.9 | /admin/backup | /admin/system-admin?tab=backup | |
| 12.10 | /admin/monitoring | /admin/monitoring-admin?tab=monitoring | |
| 12.11 | /admin/analytics | /admin/monitoring-admin?tab=analytics | |
| 12.12 | /admin/revenue-types | /admin/master-data?tab=verguetung | |
| 12.13 | /admin/fund-categories | /admin/master-data?tab=gesellschaftstypen | |

---

## 13. SECURITY & DSGVO (Kritisch)

| # | Test | Erwartet | Status |
|---|------|----------|--------|
| 13.1 | XSS-Schutz: HTML in Eingabefeldern | Wird escaped, kein Script-Exec | |
| 13.2 | CSRF: API-Calls ohne Session | 401 Unauthorized | |
| 13.3 | Tenant-Isolation: Cross-Tenant API-Call | 404 oder leeres Ergebnis | |
| 13.4 | Passwort-Hashing: bcrypt 12 Rounds | Nicht im Klartext | |
| 13.5 | File-Upload: Nur erlaubte Typen | Exe/Script wird abgelehnt | |
| 13.6 | File-Upload: Magic-Number Validierung | Spoofed Files erkannt | |
| 13.7 | DSGVO: Datenexport (Art. 15) | Alle User-Daten als ZIP | |
| 13.8 | DSGVO: Account löschen (Art. 17) | User + Daten gelöscht | |
| 13.9 | Audit-Log: Admin-Aktionen | Jede Änderung protokolliert | |
| 13.10 | Cookie Secure-Flag | Nur HTTPS bei HTTPS-URL | |
| 13.11 | CSP-Header | Korrekte Content-Security-Policy | |
| 13.12 | Rate-Limiting | Login, Upload, PDF, API | |

---

## 14. PERFORMANCE & STABILITÄT (Mittel)

| # | Test | Erwartet | Status |
|---|------|----------|--------|
| 14.1 | Dashboard-Ladezeit | < 3 Sekunden | |
| 14.2 | Parks-Liste (50+ Parks) | < 2 Sekunden | |
| 14.3 | GIS-Karte (100+ Plots) | Kein Lag beim Zoomen | |
| 14.4 | Rechnungs-PDF Generierung | < 5 Sekunden | |
| 14.5 | SCADA-Import (1000 Datenpunkte) | < 30 Sekunden | |
| 14.6 | ZIP-Download (50 Dateien) | < 15 Sekunden | |
| 14.7 | Build erfolgreich | `next build` ohne Fehler | |
| 14.8 | TypeScript fehlerfrei | `tsc --noEmit` → 0 Errors | |
| 14.9 | ESLint fehlerfrei | 0 Errors (Warnings ok) | |
| 14.10 | Docker-Build | Image wird gebaut | |
| 14.11 | Container startet | Health-Check grün | |

---

## 15. DEPLOYMENT-CHECKLISTE (vor v1.0 Release)

| # | Punkt | Status |
|---|-------|--------|
| 15.1 | `prisma db push` auf Server (MarketPrice Model) | |
| 15.2 | Soft-Delete Extension aktiv (Park, Fund, Lease, Contract, Document) | |
| 15.3 | n8n SCADA Workflow importiert + aktiviert | |
| 15.4 | Feature-Flags für aktive Module konfiguriert | |
| 15.5 | Backup-Service läuft (daily/weekly/monthly) | |
| 15.6 | Redis mit Passwort konfiguriert | |
| 15.7 | SMTP E-Mail-Versand getestet | |
| 15.8 | SSL/HTTPS konfiguriert (wenn extern zugänglich) | |
| 15.9 | Impressum/Datenschutz mit echtem Text | |
| 15.10 | Admin-User mit sicherem Passwort | |
| 15.11 | .env Secrets rotiert (kein devpassword) | |
| 15.12 | npm audit — keine critical Vulnerabilities | |
| 15.13 | Monitoring/Alerting eingerichtet (Sentry) | |

---

## Zusammenfassung

| Priorität | Tests | Bereich |
|-----------|-------|---------|
| **Kritisch** | 45 | Auth, Dashboard, Rechnungen, Pacht, Funds, Security |
| **Hoch** | 85 | Energy, GIS, Dokumente, Buchhaltung, Portal, Admin |
| **Mittel** | 50 | Kommunikation, CRM, Landing Page, Redirects, Performance |
| **Gesamt** | **~180 Tests** | |

**Ziel:** Alle Tests PASS → Version 1.0.0 Release
