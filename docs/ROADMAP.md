# Entwicklungs-Roadmap: WindparkManager (WPM)

## Phasen-Übersicht

```
Phase 1          Phase 2          Phase 3          Phase 4          Phase 5
────────────────────────────────────────────────────────────────────────────────
FOUNDATION       CORE MODULES     ADVANCED         AUTOMATION       OPTIMIZATION
                                  FEATURES
────────────────────────────────────────────────────────────────────────────────
• Setup          • Parks          • Abstimmungen   • Auto-Billing   • Performance
• Auth           • Anlagen        • Vollmachten    • E-Mail         • Caching
• Multi-Tenant   • Beteiligungen  • Dokumente      • Wetter-API     • Mobile App
• Admin UI       • Pacht          • Verträge       • Scheduled Jobs • Analytics
• Basis Layout   • Abrechnungen   • Berichte       • Audit-Log      • API v2
────────────────────────────────────────────────────────────────────────────────
```

---

## Phase 1: Foundation (Grundlagen)

### Ziele
- Projekt-Setup und Infrastruktur
- Authentifizierung und Multi-Tenancy
- Admin-Bereich für Mandantenverwaltung
- Basis-Layout und Navigation

### Tasks

#### 1.1 Projekt-Setup
- [ ] Next.js 15 Projekt initialisieren
- [ ] TypeScript konfigurieren
- [ ] Tailwind CSS + shadcn/ui Setup
- [ ] ESLint + Prettier konfigurieren
- [ ] Ordnerstruktur anlegen
- [ ] Git Repository einrichten

#### 1.2 Datenbank & ORM
- [ ] PostgreSQL (Docker) aufsetzen
- [ ] Prisma/Drizzle ORM konfigurieren
- [ ] Initiales Schema migrieren
- [ ] Seed-Daten erstellen

#### 1.3 Docker-Setup
- [ ] Dockerfile erstellen
- [ ] docker-compose.yml konfigurieren
- [ ] Traefik Reverse Proxy einrichten
- [ ] MinIO Storage aufsetzen
- [ ] Redis Cache einrichten

#### 1.4 Authentifizierung
- [ ] NextAuth.js / Auth.js Setup
- [ ] Login-Seite erstellen
- [ ] Passwort-Reset implementieren
- [ ] Session-Management
- [ ] JWT-Token Handling

#### 1.5 Multi-Tenancy
- [ ] Tenant-Model implementieren
- [ ] Row Level Security (RLS) aktivieren
- [ ] Tenant-Kontext Middleware
- [ ] Tenant-Resolver (Subdomain/Header)

#### 1.6 Admin-Bereich (Superadmin)
- [ ] Admin-Layout erstellen
- [ ] Mandanten-Liste
- [ ] Mandanten erstellen/bearbeiten
- [ ] Logo-Upload für Mandanten
- [ ] Branding-Einstellungen (Farben)
- [ ] User-Verwaltung (pro Mandant)
- [ ] Rollen-Zuweisung (Admin, Manager, Viewer)
- [ ] Impersonation-Funktion

#### 1.7 Basis-Layout (User-Portal)
- [ ] Responsive Sidebar
- [ ] Header mit User-Menü
- [ ] Breadcrumb-Navigation
- [ ] Dark/Light Mode Toggle
- [ ] Toast-Benachrichtigungen
- [ ] Empty States
- [ ] Loading Skeletons

### Deliverables Phase 1
- Funktionierendes Login-System
- Admin kann Mandanten anlegen
- Admin kann sich als User einloggen
- Basis-UI mit Navigation

---

## Phase 2: Core Modules (Kernmodule)

### Ziele
- Windpark- und Anlagenverwaltung
- Beteiligungsverwaltung (Fonds + Gesellschafter kombiniert)
- Pacht- und Flächenverwaltung
- CRUD-Operationen für alle Entitäten

### Tasks

#### 2.1 Windparks
- [ ] Park-Liste mit Suche/Filter/Sortierung
- [ ] Park-Details Seite mit Tabs
- [ ] Park erstellen/bearbeiten Formular
- [ ] Park-Dashboard (Übersicht)
- [ ] Standort-Karte (Leaflet/Mapbox)
- [ ] Park löschen (Soft-Delete)

#### 2.2 Windkraftanlagen
- [ ] Anlagen-Liste pro Park
- [ ] Anlagen-Details mit technischen Daten
- [ ] Anlage erstellen/bearbeiten
- [ ] Technische Datenfelder (Leistung, Nabenhöhe, etc.)
- [ ] Status-Verwaltung (aktiv, Wartung, stillgelegt)
- [ ] Anlage einem Park zuordnen

#### 2.3 Service-Events
- [ ] Service-Event erfassen
- [ ] Event-Typen (Wartung, Reparatur, Inspektion)
- [ ] Kosten-Tracking
- [ ] Durchführende Firma erfassen
- [ ] Service-Historie pro Anlage
- [ ] Dokumente anhängen

#### 2.4 Beteiligungen (Fonds + Gesellschafter kombiniert)
- [ ] Fonds/Gesellschafts-Übersicht
- [ ] Fonds erstellen/bearbeiten
- [ ] Gesellschafter-Liste pro Fonds
- [ ] Gesellschafter erstellen/bearbeiten
- [ ] Beteiligungsquoten verwalten
- [ ] Einlagen und Ausschüttungen
- [ ] Kapitalübersicht (Gesamt, pro Gesellschafter)
- [ ] Kontakt- und Bankdaten
- [ ] Fonds-Park Zuordnung (welcher Park gehört zu welchem Fonds)

#### 2.5 Kommanditisten-Portal (separater Bereich für Gesellschafter)
- [ ] Portal-Login für Gesellschafter
- [ ] Eigenes Dashboard
- [ ] Meine Beteiligungen anzeigen
- [ ] Ausschüttungshistorie
- [ ] Persönliche Daten einsehen/bearbeiten
- [ ] Dokumente für mich
- [ ] Monatsberichte einsehen

#### 2.6 Pacht & Flächen
- [ ] Flurstück-Verwaltung (Gemarkung, Flur, Flurstück)
- [ ] Verpächter-Verwaltung (Kontakt, Bank)
- [ ] Pachtvertrag-Erfassung
- [ ] Laufzeit, Kündigungsfristen
- [ ] Pachtzins (jährlich/monatlich)
- [ ] Anpassungsklauseln (Index, Festbetrag)
- [ ] Pachtzahlungs-Übersicht
- [ ] Flurstück einem Park zuordnen

#### 2.7 Basis-Abrechnungen
- [ ] Manuelle Rechnung erstellen
- [ ] Manuelle Gutschrift erstellen
- [ ] Rechnungs-/Gutschriftsnummer
- [ ] Positionen hinzufügen
- [ ] Brutto/Netto/MwSt Berechnung
- [ ] PDF-Vorschau
- [ ] Status (Entwurf, Gesendet, Bezahlt)

### Deliverables Phase 2
- Vollständige CRUD für alle Kernentitäten
- Verknüpfungen: Park ↔ Fonds ↔ Gesellschafter ↔ Flurstücke
- Kommanditisten-Portal mit Beteiligungsübersicht
- Manuelle Rechnungserstellung

---

## Phase 3: Advanced Features (Erweiterte Funktionen)

### Ziele
- Abstimmungssystem mit Vollmachten
- Dokumentenmanagement mit Versionierung
- Vertragsmanagement mit Fristen
- Berichts-Generierung

### Tasks

#### 3.1 Abstimmungssystem
- [ ] Abstimmung erstellen (Titel, Beschreibung, Optionen)
- [ ] Abstimmungszeitraum festlegen
- [ ] Stimmberechtigte automatisch aus Gesellschaftern
- [ ] Abstimmungs-Seite für Gesellschafter
- [ ] Stimme abgeben (Ja/Nein/Enthaltung oder Multiple Choice)
- [ ] Ergebnis nach Köpfen berechnen
- [ ] Ergebnis nach Kapitalanteil berechnen
- [ ] Quorum prüfen
- [ ] Ergebnis-Anzeige
- [ ] Ergebnis-Export (PDF)

#### 3.2 Vollmachten
- [ ] Vollmacht erteilen (Vollmachtgeber → Vollmachtnehmer)
- [ ] Generalvollmacht (für alle Abstimmungen)
- [ ] Einzelvollmacht (für eine Abstimmung)
- [ ] Vollmacht widerrufen
- [ ] Mit Vollmacht abstimmen
- [ ] Anzeige "Stimme für X Personen ab"
- [ ] Vollmacht-Übersicht
- [ ] Vollmachts-Dokument hochladen

#### 3.3 Dokumentenmanagement
- [ ] Dokument-Upload (Drag & Drop, Multi-File)
- [ ] Kategorien (Vertrag, Protokoll, Bericht, Rechnung, etc.)
- [ ] Zuordnung zu Entitäten (Park, Fonds, Gesellschafter, Vertrag)
- [ ] Versionierung (neue Version hochladen)
- [ ] Versionshistorie anzeigen
- [ ] Ältere Version herunterladen
- [ ] Dokument-Suche (Volltext optional)
- [ ] Dokument-Preview (PDF im Browser)
- [ ] Download-Tracking (Audit)
- [ ] Dokument archivieren (nicht löschen)

#### 3.4 Vertragsmanagement
- [ ] Vertrag erfassen
- [ ] Vertragstypen (Pacht, Wartung, Versicherung, Netzanschluss, Direktvermarktung)
- [ ] Vertragspartner
- [ ] Laufzeit (Start, Ende, unbefristet)
- [ ] Kündigungsfrist
- [ ] Automatische Verlängerung (ja/nein)
- [ ] Jährlicher Wert
- [ ] Zuordnung zu Park/Anlage
- [ ] Dokument anhängen
- [ ] Fristen-Kalender (Monats-/Jahresansicht)
- [ ] Fristenwarnung konfigurieren (30/60/90 Tage vorher)
- [ ] Dashboard-Widget "Auslaufende Verträge"

#### 3.5 Reporting & Export
- [ ] Monatsbericht-Template
- [ ] Jahresbericht-Template
- [ ] Gesellschafterliste
- [ ] Beteiligungsübersicht
- [ ] Abstimmungsergebnis
- [ ] PDF-Export mit Mandanten-Branding (Logo, Farben)
- [ ] Excel-Export (xlsx)
- [ ] CSV-Export
- [ ] Bericht-Archiv (generierte Berichte speichern)

### Deliverables Phase 3
- Funktionierendes Abstimmungssystem mit Vollmachten
- Revisionssicheres Dokumentenarchiv mit Versionierung
- Vertragsmanagement mit automatischen Fristenwarnungen
- Branded PDF-Berichte und Excel-Export

---

## Phase 4: Automation (Automatisierung)

### Ziele
- Automatische Abrechnungserstellung
- E-Mail-Benachrichtigungen
- Wetter-Integration
- Background Jobs
- Vollständiges Audit-Log

### Tasks

#### 4.1 Automatische Abrechnungen
- [ ] Abrechnungsregeln definieren (Admin)
- [ ] Regel: Monatliche Pachtzahlung
- [ ] Regel: Jährliche Ausschüttung an Gesellschafter
- [ ] Regel: Quartalsweise Verwaltungsgebühr
- [ ] Cron-Job für Abrechnungslauf
- [ ] Abrechnungs-Protokoll (Log was erstellt wurde)
- [ ] Vorschau vor Ausführung
- [ ] Manueller Trigger möglich

#### 4.2 PDF-Generierung mit Branding
- [ ] PDF-Template-System
- [ ] Mandanten-Logo einfügen
- [ ] Mandanten-Farben verwenden
- [ ] Anschrift des Mandanten
- [ ] Fußzeile mit Kontaktdaten
- [ ] Automatische Seitennummerierung

#### 4.3 E-Mail-Benachrichtigungen
- [ ] E-Mail-Templates (HTML)
- [ ] Willkommens-E-Mail (neuer User)
- [ ] Passwort-Reset E-Mail
- [ ] Neue Abstimmung verfügbar
- [ ] Abstimmung endet in X Tagen
- [ ] Neues Dokument verfügbar
- [ ] Neue Gutschrift/Rechnung
- [ ] Vertragsfrist-Erinnerung
- [ ] System-Meldung vom Admin
- [ ] Benachrichtigungs-Präferenzen pro User

#### 4.4 Wetter-Integration
- [ ] OpenWeatherMap API anbinden
- [ ] API-Key konfigurierbar
- [ ] Wetterdaten für Windpark-Standorte abrufen
- [ ] Wetterdaten-Cache (Redis, 30 Min TTL)
- [ ] Wetter-Widget im Dashboard (Wind, Temp)
- [ ] Historische Wetterdaten speichern
- [ ] Cron-Job für regelmäßigen Abruf

#### 4.5 Background Jobs (Worker)
- [ ] BullMQ Setup mit Redis
- [ ] Separater Worker-Process (Docker Container)
- [ ] E-Mail-Queue
- [ ] PDF-Generation Queue
- [ ] Wetter-Sync Queue
- [ ] Job-Retry bei Fehler
- [ ] Dead Letter Queue
- [ ] Job-Dashboard (optional: Bull Board)

#### 4.6 Audit-Log
- [ ] Automatisches Logging aller Änderungen (Trigger)
- [ ] Log: CREATE, UPDATE, DELETE Aktionen
- [ ] Log: Wer hat wann was geändert
- [ ] Log: Alte und neue Werte speichern
- [ ] Log: Login-Events
- [ ] Log: Impersonation-Events
- [ ] Log: Dokument-Downloads
- [ ] Audit-Log Viewer im Admin-Bereich
- [ ] Filter nach User, Entität, Zeitraum
- [ ] Export Audit-Log

### Deliverables Phase 4
- Automatische Erstellung von Rechnungen/Gutschriften
- E-Mail-Benachrichtigungen bei wichtigen Events
- Wetterdaten im Dashboard für jeden Windpark
- Vollständiges, revisionssicheres Audit-Log
- Background Job Processing

---

## Phase 5: Optimization (Optimierung)

### Ziele
- Performance-Optimierung
- Erweiterte Analytics
- Mobile App / PWA
- API v2 für Integrationen

### Tasks

#### 5.1 Performance
- [ ] Database Query Analyse und Optimierung
- [ ] Fehlende Indexes identifizieren
- [ ] N+1 Queries beheben
- [ ] Redis Caching für häufige Abfragen
- [ ] Image Optimization (next/image)
- [ ] Lazy Loading für Listen
- [ ] Virtualisierung für große Tabellen
- [ ] Bundle Size analysieren und reduzieren

#### 5.2 Erweitertes Caching
- [ ] Dashboard-Statistiken cachen (1 Min)
- [ ] User-Permissions cachen (5 Min)
- [ ] Tenant-Settings cachen (10 Min)
- [ ] Wetterdaten cachen (30 Min)
- [ ] Cache-Invalidierung bei Änderungen

#### 5.3 Analytics & KPIs
- [ ] Dashboard mit Geschäfts-KPIs
- [ ] Gesamtkapazität aller Parks
- [ ] Gesamte Beteiligungssumme
- [ ] Anzahl Gesellschafter
- [ ] Offene Rechnungen
- [ ] Anstehende Fristen
- [ ] User-Aktivitäts-Tracking
- [ ] Performance-Metriken (Response Times)

#### 5.4 Mobile / PWA
- [ ] Responsive Design überarbeiten
- [ ] Touch-optimierte Interaktionen
- [ ] PWA Manifest
- [ ] Service Worker für Offline-Fähigkeit
- [ ] Push Notifications (optional)
- [ ] App-Icon für Homescreen

#### 5.5 API v2 (für Integrationen)
- [ ] OpenAPI/Swagger Dokumentation
- [ ] API-Versionierung (/api/v2/)
- [ ] API-Keys für externe Zugriffe
- [ ] Rate Limiting
- [ ] Webhook-Support (Events an externe URLs senden)
- [ ] GraphQL Endpoint (optional)

#### 5.6 Integrationen (optional)
- [ ] DATEV-Export für Buchhaltung
- [ ] ICS-Export für Kalender (Fristen)
- [ ] SCADA-Anbindung (Produktionsdaten)

### Deliverables Phase 5
- Schnelle, responsive Anwendung
- PWA für Mobile-Zugriff
- Dokumentierte API für externe Integrationen
- Analytics-Dashboard mit KPIs

---

## Meilensteine

| Meilenstein | Beschreibung |
|-------------|--------------|
| **M1** | Foundation: Login, Admin, Mandanten, Basis-UI lauffähig |
| **M2** | Core: Parks, Anlagen, Beteiligungen, Pacht CRUD fertig |
| **M3** | Portal: Kommanditisten-Portal funktioniert |
| **M4** | Advanced: Abstimmungen, Dokumente, Verträge, Berichte |
| **M5** | Automation: Auto-Abrechnungen, E-Mails, Wetter, Audit |
| **M6** | Release: Production-ready, Monitoring, Dokumentation |

---

## Qualitätssicherung

### Testing
- [ ] Unit Tests für Business-Logik
- [ ] Integration Tests für API-Endpoints
- [ ] E2E Tests für kritische User-Flows (Login, Abstimmung, Rechnung)
- [ ] Test-Coverage > 70%

### Code-Qualität
- [ ] ESLint + Prettier im CI
- [ ] TypeScript strict mode
- [ ] Code Reviews vor Merge
- [ ] Keine any-Types ohne Grund

### Infrastruktur
- [ ] CI/CD Pipeline (GitHub Actions)
- [ ] Staging-Umgebung
- [ ] Automatische Backups täglich
- [ ] Monitoring (Uptime, Errors)
- [ ] Alerting bei Fehlern

---

## Quick Start

```bash
# 1. Repository klonen
git clone https://github.com/your-org/windparkmanager.git
cd windparkmanager

# 2. Dependencies installieren
npm install

# 3. Environment konfigurieren
cp .env.example .env
# .env bearbeiten und Werte setzen

# 4. Docker starten (Datenbank, Redis, MinIO)
docker compose up -d db redis minio

# 5. Datenbank migrieren
npm run db:migrate

# 6. Seed-Daten laden (optional)
npm run db:seed

# 7. Development Server starten
npm run dev

# 8. Browser öffnen
# http://localhost:3000
```

---

## Nächster Schritt

**Starten mit Phase 1.1: Projekt-Setup**

```bash
npx create-next-app@latest windparkmanager --typescript --tailwind --eslint --app --src-dir
```
