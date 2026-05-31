# Real-Test Plan — WindparkManager

**Test-Umgebung:** Proxmox (`http://192.168.178.101:3050`)
**Test-Strategie:** Leerer Mandant, alle Funktionen systematisch durch
**Fehler-Reporting:** Hierarchisch nummeriert, z.B. `5.1.1` = Bereich 5, Test 1, Schritt 1

> **Konvention für Fehler-Meldungen:** "Bei **5.1.1** kommt: `<Fehlermeldung/Screenshot/Beschreibung>`"

---

## 🔧 Vor dem Test — Pflicht-Vorbereitungen

| Schritt | Beschreibung | Befehl/Aktion |
|---------|--------------|---------------|
| **0.1** | Neuestes Image auf Proxmox deployen | Portainer → Stack `windparkmanager` → Recreate with `pull latest image` |
| **0.2** | `prisma db push` für neue Tabellen (`FailedJob`, `ConsentLog`) | `docker exec -it <app-container> sh -c "NODE_PATH=/prisma-cli/node_modules /prisma-cli/node_modules/.bin/prisma db push --skip-generate"` |
| **0.3** | Redis-Memory-Check (optional, aber empfohlen) | `docker exec windparkmanager-redis-1 redis-cli CONFIG SET maxmemory 256mb && CONFIG SET maxmemory-policy allkeys-lru` |
| **0.4** | App-Container neu starten nach DB-Push | Portainer → Container `app` → Restart |
| **0.5** | Server erreichbar? | Browser: `http://192.168.178.101:3050/login` lädt ohne 5xx |

**Erst weitermachen wenn 0.1–0.5 ✓.**

---

## 1. Initial Setup & Auth

**Voraussetzungen:** Pflicht-Vorbereitungen abgeschlossen.

### 1.1 Login mit Superadmin
- **1.1.1** Browser → `/login` öffnen — Login-Form ist sichtbar, kein Layout-Bruch
- **1.1.2** Mit Superadmin-Credentials einloggen — Redirect zu `/dashboard`
- **1.1.3** Header zeigt eigenen Namen + aktive Mandanten-Anzeige
- **1.1.4** Sidebar zeigt alle Navigation-Items (Administration sichtbar)
- **1.1.5** Footer zeigt Version, Impressum-Link, Datenschutz-Link, Cookie-Settings

### 1.2 Cookie-Banner
- **1.2.1** Banner ist beim ersten Besuch sichtbar
- **1.2.2** "Verstanden" klicken → Banner verschwindet
- **1.2.3** Page-Reload → Banner erscheint NICHT erneut
- **1.2.4** DB-Check (optional, Admin): Tabelle `consent_logs` hat neuen Eintrag

### 1.3 Logout
- **1.3.1** User-Menü oben rechts → Logout
- **1.3.2** Redirect zu `/login`
- **1.3.3** Direktaufruf einer geschützten Page wie `/dashboard` → Redirect zu `/login`

### 1.4 Password Reset (optional, nur wenn SMTP konfiguriert)
- **1.4.1** Login-Page → "Passwort vergessen?" Link
- **1.4.2** Email-Adresse eingeben → Bestätigungs-Message
- **1.4.3** Reset-Email empfangen (Spam-Ordner checken)
- **1.4.4** Reset-Link klicken → neues Passwort setzen → Login mit neuem PW funktioniert

---

## 2. Mandanten-Verwaltung & Switching

**Voraussetzungen:** 1.1 ✓ (eingeloggt als Superadmin).

### 2.1 Neuen Test-Mandanten anlegen
- **2.1.1** `/admin/tenants` → "Neuer Mandant"
- **2.1.2** Pflichtfelder: Name, Slug, Kontakt-Email — Speichern erfolgreich
- **2.1.3** Mandant erscheint in der Liste mit Status "ACTIVE"
- **2.1.4** Detail-Seite öffnen → alle Felder editierbar

### 2.2 Tenant-Switching
- **2.2.1** Header → Tenant-Switcher Dropdown öffnen
- **2.2.2** Neuen Test-Mandanten auswählen
- **2.2.3** Page reloaded, Header zeigt neuen Mandanten-Namen
- **2.2.4** Alle Listen (Parks, Personen, Invoices) sind LEER (frischer Mandant)
- **2.2.5** Browser-Cookie `wpm-active-tenant` ist gesetzt (DevTools → Application → Cookies)

### 2.3 Tenant-Settings
- **2.3.1** `/settings` öffnen → Mandanten-Einstellungen-Tab
- **2.3.2** Felder: Firmenname, Email, Telefon, Adresse, IBAN, BIC, Steuer-IDs — alle editierbar
- **2.3.3** Speichern → Toast "Erfolgreich gespeichert"
- **2.3.4** Page-Reload → Werte sind persistiert

---

## 3. User & Rollen-Management

**Voraussetzungen:** 2.1 ✓ (Test-Mandant angelegt + aktiv).

### 3.1 User anlegen
- **3.1.1** `/admin/users` → "Neuer User"
- **3.1.2** Pflichtfelder: Email, Vor-/Nachname, Initial-Passwort — Speichern OK
- **3.1.3** User erscheint in Liste, Status "ACTIVE"

### 3.2 Rolle zuweisen
- **3.2.1** User-Detail öffnen → "Rollen" Tab
- **3.2.2** Rolle aus Dropdown auswählen (z.B. "MANAGER")
- **3.2.3** Zuweisen klicken → Rolle erscheint in der Liste des Users
- **3.2.4** Cache-Invalidation: bei nächstem Request hat User die neue Permission

### 3.3 Custom Role anlegen
- **3.3.1** `/admin/roles` → "Neue Rolle"
- **3.3.2** Name + Hierarchie-Level + Permissions auswählen
- **3.3.3** Speichern → Rolle in Liste sichtbar
- **3.3.4** Rolle in einer User-Zuweisung verwenden — funktioniert

### 3.4 Login mit Test-User
- **3.4.1** Logout, Login mit dem in 3.1 angelegten User
- **3.4.2** Sidebar zeigt nur die für die Rolle erlaubten Items
- **3.4.3** Geschützte Pages außerhalb der Permission → 403/Redirect

---

## 4. Stammdaten — Personen

**Voraussetzungen:** 2.1 ✓, 3.4 ✓ (eingeloggt als MANAGER+).

### 4.1 Person (natürliche Person) anlegen
- **4.1.1** `/crm` oder `/persons` → "Neue Person"
- **4.1.2** Type "Natürliche Person", Pflichtfelder: Vor-/Nachname
- **4.1.3** Optional: Adresse, Email, Telefon, IBAN, BIC
- **4.1.4** Speichern → Person erscheint in Liste

### 4.2 Person (juristisch / Firma) anlegen
- **4.2.1** Type "Juristische Person" → Feld "Firmenname" wird Pflicht
- **4.2.2** Steuer-ID, USt-ID, Handelsregister-Nr eingeben
- **4.2.3** Speichern erfolgreich

### 4.3 Person bearbeiten
- **4.3.1** Person aus Liste öffnen → Felder editierbar
- **4.3.2** Speichern → geänderte Werte werden angezeigt

### 4.4 Person Soft-Delete
- **4.4.1** Person ohne Referenzen löschen → erfolgreich entfernt
- **4.4.2** Person MIT Referenzen (z.B. Pachtvertrag) löschen → Fehler "kann nicht gelöscht werden"

### 4.5 360°-Ansicht
- **4.5.1** Person mit Referenzen öffnen → Sidebar zeigt verknüpfte Pachten, Verträge, Beteiligungen, Rechnungen

---

## 5. Stammdaten — Parks & Turbinen

**Voraussetzungen:** 2.1 ✓.

### 5.1 Windpark anlegen
- **5.1.1** `/parks` → "Neuer Park"
- **5.1.2** Name, Adresse, Inbetriebnahme-Datum, Min-Pacht/Turbine, WEA-Share %, Pool-Share %
- **5.1.3** Speichern → Park in Liste
- **5.1.4** Detail-Seite öffnen → alle Felder editierbar
- **5.1.5** Karten-Tab → Leaflet-Map lädt (kein leerer Bereich)

### 5.2 Turbine anlegen
- **5.2.1** Park-Detail → "Turbine hinzufügen"
- **5.2.2** Designation (z.B. "WEA 01"), Hersteller, Modell, Leistung-kW, Status "ACTIVE"
- **5.2.3** Speichern → Turbine in Park-Liste

### 5.3 Park-Liste & Filter
- **5.3.1** `/parks` → Status-Filter "Active" → nur aktive Parks
- **5.3.2** Such-Feld → Park-Name eintippen → Filter funktioniert
- **5.3.3** Sortierung nach Name / Datum funktioniert
- **5.3.4** CSV-Export → Datei wird heruntergeladen

### 5.4 Plot/Flurstück anlegen
- **5.4.1** Park-Detail → "Plots" Tab → "Neues Flurstück"
- **5.4.2** Flurstücks-Nr, Flur-Nr, Gemarkung, Größe-qm
- **5.4.3** Plot-Bereiche (WEA_STANDORT, POOL, WEG, AUSGLEICH, KABEL) anlegen
- **5.4.4** Speichern → Plot mit Bereichen in Park

### 5.5 Plot-Import via SHP (optional)
- **5.5.1** `/leases/import-shp` → SHP-Datei + DBF hochladen
- **5.5.2** Import-Vorschau zeigt erkannte Plots
- **5.5.3** Import bestätigen → Plots werden angelegt

---

## 6. Pacht — Leases & Settlement

**Voraussetzungen:** 4.1 ✓ (Pachtgeber-Person), 5.4 ✓ (Plot mit Bereichen).

### 6.1 Pachtvertrag anlegen
- **6.1.1** `/leases/new` → Lessor (Pachtgeber) auswählen
- **6.1.2** Park auswählen → Plot(s) zuweisen
- **6.1.3** Beginn-/End-Datum, Status "ACTIVE"
- **6.1.4** Optional: Mindestpacht-Override pro Lease
- **6.1.5** Speichern → Pachtvertrag in Liste, Person-Detail zeigt jetzt die Pacht

### 6.2 Settlement-Period anlegen (Vorschuss)
- **6.2.1** `/leases/settlement/new` → Park + Jahr auswählen, Type "ADVANCE"
- **6.2.2** Interval "QUARTERLY", Monat = 1 (Q1)
- **6.2.3** Anlegen → Period in Liste
- **6.2.4** Period-Detail → "Berechnen" → zeigt pro Pachtgeber den Vorschuss-Betrag

### 6.3 Advance-Gutschriften erzeugen
- **6.3.1** Period-Detail → "Gutschriften erstellen"
- **6.3.2** Liste der zu erstellenden Invoices wird gezeigt
- **6.3.3** Bestätigen → Invoices werden angelegt
- **6.3.4** `/invoices` → neue Gutschriften sichtbar mit Status "DRAFT"
- **6.3.5** Period zeigt jetzt Status "IN_PROGRESS"

### 6.4 Settlement-Period anlegen (Final/Jahresend)
- **6.4.1** `/leases/settlement/new` → Park + Jahr, Type "FINAL"
- **6.4.2** Optional: Verknüpfte Energy-Settlement (totalRevenue)
- **6.4.3** Berechnen → zeigt Endabrechnung pro Lease mit Vorschuss-Verrechnung
- **6.4.4** Final-Gutschriften erstellen → Invoices mit Restbetrag

### 6.5 Settlement-Approval
- **6.5.1** Period-Detail → "Genehmigen" (nur Admin) → Status "APPROVED"
- **6.5.2** Nach Approval kann Period nicht mehr gelöscht werden

---

## 7. Rechnungen & Mahnwesen

**Voraussetzungen:** 6.3 ✓ (mindestens 1 Invoice existiert).

### 7.1 Invoice manuell anlegen
- **7.1.1** `/invoices/new` → Empfänger (Person), Invoice-Type, Position(en), Datum
- **7.1.2** Tax-Berechnung automatisch (basierend auf Tenant-Settings)
- **7.1.3** Speichern → Invoice mit Status "DRAFT", auto-generierte Invoice-Nr

### 7.2 Invoice senden (Email)
- **7.2.1** Invoice öffnen → "Per Email senden"
- **7.2.2** Empfänger-Email vorausgefüllt aus Person → bestätigen
- **7.2.3** Email-Job wird in Queue eingestellt → Status "SENT", `sentAt` gesetzt
- **7.2.4** Empfänger erhält Email mit PDF-Anhang

### 7.3 Mark-Paid
- **7.3.1** Invoice → "Als bezahlt markieren" → Datum + Methode
- **7.3.2** Status "PAID", `paidAt` gesetzt
- **7.3.3** Dashboard "Offene Rechnungen" KPI sinkt

### 7.4 Invoice stornieren
- **7.4.1** Invoice (Status SENT) → "Stornieren" → Bestätigung
- **7.4.2** Status "CANCELLED", `cancelledAt` gesetzt
- **7.4.3** Eine stornierte Invoice kann nicht erneut storniert werden

### 7.5 XRechnung-Export
- **7.5.1** Invoice öffnen → "XRechnung exportieren" → XML-Download
- **7.5.2** XML enthält IBAN, BIC, Empfänger, Positionen, Tax-Aufschlüsselung

### 7.6 PDF-Download
- **7.6.1** Invoice öffnen → "PDF herunterladen" → PDF mit Briefkopf, Adresse, Tabelle
- **7.6.2** PDF-Vorschau im Browser funktioniert

### 7.7 Mahnwesen
- **7.7.1** Eine überfällige Invoice anlegen (`dueDate` < heute, Status SENT)
- **7.7.2** `/admin/dunning` → "Mahnungen erkennen" → Invoice erscheint als Kandidat
- **7.7.3** Mahnung erstellen → Dunning-Run mit Level 1, Mahngebühr aus Settings
- **7.7.4** Per Email senden funktioniert

### 7.8 Bulk-Aktionen
- **7.8.1** Liste mehrere Invoices selektieren → BatchActionBar erscheint
- **7.8.2** "Approve" auf 3 Drafts → alle 3 werden zu SENT
- **7.8.3** Single Selection abwählen → Count im Bar aktualisiert sich

### 7.9 CSV-Export
- **7.9.1** `/invoices` → "Export → CSV" → Datei lädt
- **7.9.2** CSV enthält Invoice-Nr, Empfänger, Brutto, Status, Datum

---

## 8. Energie & SCADA

**Voraussetzungen:** 5.2 ✓ (Turbine angelegt). SCADA-Daten optional.

### 8.1 Energie-Dashboard
- **8.1.1** `/energy` → Übersicht lädt mit KPIs (Produktion, Verfügbarkeit, Wind)
- **8.1.2** Park-Filter funktioniert
- **8.1.3** Zeitraum-Selector (Heute, 7 Tage, 30 Tage, Akt. Monat) funktioniert

### 8.2 Produktion (manuell oder Import)
- **8.2.1** `/energy/productions` → Liste lädt (leer wenn keine Daten)
- **8.2.2** Manuelle Erfassung → Turbine, Datum, kWh, Betriebsstunden
- **8.2.3** Eintrag erscheint in Liste

### 8.3 Energie-Settlement (Netzbetreiber-Abrechnung)
- **8.3.1** `/energy/settlements/new` → Park + Jahr + Monat + Netzbetreiber + Brutto-Erlös
- **8.3.2** Speichern → Status "DRAFT"
- **8.3.3** "Berechnen" → Verteilung pro Fund anhand Produktionsanteil
- **8.3.4** "Genehmigen" → Status "CALCULATED"

### 8.4 SCADA Upload (optional, wenn DBF-Files vorhanden)
- **8.4.1** `/energy/scada/upload` → DBF-Datei hochladen → Vorschau zeigt Records
- **8.4.2** Import bestätigen → Job in Queue, Status "PROCESSING"
- **8.4.3** Nach ~1 min: Status "COMPLETED", Daten in `/energy/scada/data`

### 8.5 Anomaly-Detection
- **8.5.1** `/energy/scada/anomalies` → Liste lädt (leer ist OK)
- **8.5.2** Anomaly-Config in Admin anpassen funktioniert

### 8.6 Energy Analytics
- **8.6.1** `/energy/analytics` → Tab "Tagesbericht" lädt mit Charts (recharts)
- **8.6.2** Tab-Wechsel "Produktion & Vergleich" → lazy-loaded, dann Charts
- **8.6.3** Tab "Werkzeuge", "Finanzen & Technik" — alle laden ohne Crash
- **8.6.4** Park-Filter wirkt auf alle Tabs

---

## 9. Dokumente

**Voraussetzungen:** 2.1 ✓.

### 9.1 Dokument hochladen
- **9.1.1** `/documents` → "Upload" → PDF/DOCX-Datei wählen
- **9.1.2** Kategorie + Beschreibung + Verknüpfung (Park/Person/Vertrag) wählen
- **9.1.3** Upload → Datei erscheint in Liste mit Vorschau-Icon

### 9.2 Approval-Workflow
- **9.2.1** Upload → Status "DRAFT"
- **9.2.2** "Zur Prüfung einreichen" → Status "PENDING_REVIEW", Notification an Admins
- **9.2.3** Admin: "Genehmigen" → Status "APPROVED"
- **9.2.4** "Veröffentlichen" → Status "PUBLISHED", `publishedAt` gesetzt

### 9.3 Versionierung
- **9.3.1** Dokument-Detail → "Neue Version hochladen"
- **9.3.2** Neue Version wird mit `parentId` verknüpft, alte Version bleibt
- **9.3.3** Version-Liste zeigt alle Versionen chronologisch

### 9.4 Download
- **9.4.1** Dokument-Detail → "Download" → Original-Datei lädt
- **9.4.2** Berechtigung: anderer User ohne Permission → 403

### 9.5 Archivieren
- **9.5.1** Bulk: 3 Dokumente selektieren → "Archivieren" → `isArchived: true`
- **9.5.2** Standard-Liste zeigt archivierte Dokumente NICHT mehr
- **9.5.3** Filter "Archiviert" zeigt sie wieder

---

## 10. CRM, Mailings & Webhooks

**Voraussetzungen:** 4.1 ✓ (mindestens 1 Person).

### 10.1 Activity erfassen
- **10.1.1** Person-Detail → "Activity hinzufügen" → Type (Call, Email, Note), Beschreibung
- **10.1.2** Speichern → Activity in Person-Timeline

### 10.2 Mailing-Template anlegen
- **10.2.1** `/admin/mailings` → "Template anlegen" → Subject, HTML-Body mit Platzhaltern
- **10.2.2** Speichern → Template in Liste

### 10.3 Massen-Mailing
- **10.3.1** `/mailings/new` → Template auswählen, Empfänger filtern (z.B. alle Pachtgeber)
- **10.3.2** Vorschau → personalisierte Anrede sichtbar
- **10.3.3** Senden → Jobs in Email-Queue → Status nach Versand "COMPLETED"

### 10.4 Webhook konfigurieren
- **10.4.1** `/admin/webhooks` → "Neuer Webhook" → URL, Event (z.B. `invoice.sent`), Secret
- **10.4.2** Aktivieren → Status "ACTIVE"
- **10.4.3** Test-Event auslösen (z.B. Invoice senden) → Webhook-Aufruf in Webhook-Detail-Logs

---

## 11. Buchhaltung

**Voraussetzungen:** Kontenrahmen aktiviert (Tenant-Setting).

### 11.1 Kontenrahmen
- **11.1.1** `/admin/kontenrahmen` → Default-Kontenrahmen importieren (SKR04 oder ähnliches)
- **11.1.2** Konten in Liste sichtbar

### 11.2 Journal-Buchung
- **11.2.1** `/buchhaltung/journal/new` → Soll/Haben-Konten, Betrag, Belegnummer, Datum
- **11.2.2** Buchung speichern → in Journal-Liste

### 11.3 Bank-Import (MT940)
- **11.3.1** `/buchhaltung/bank/import` → MT940-Datei hochladen
- **11.3.2** Vorschau zeigt Transaktionen
- **11.3.3** Auto-Matching: zugeordnete Invoices vorgeschlagen
- **11.3.4** Import bestätigen → Transaktionen im Konto, Invoices ggf. als bezahlt markiert

### 11.4 Eingangsrechnung erfassen
- **11.4.1** `/inbox` → "Neue Eingangsrechnung" → Vendor, Datum, Betrag, Datei
- **11.4.2** Speichern → in Inbox-Liste mit Status "RECEIVED"
- **11.4.3** "Genehmigen" → Status "APPROVED"
- **11.4.4** SEPA-Zahlungsbatch erstellen → Inbox-Rechnung kann zugeordnet werden

---

## 12. Wirtschaftsplan & Reports

**Voraussetzungen:** 11.1 ✓.

### 12.1 Cost Center anlegen
- **12.1.1** `/wirtschaftsplan/cost-centers/new` → Name, Verantwortlicher, Park-Zuordnung
- **12.1.2** Speichern → in Liste

### 12.2 Annual Budget
- **12.2.1** `/wirtschaftsplan/budget/new` → Jahr, Cost Center, Plan-Werte pro Konto
- **12.2.2** Speichern → in Liste, Status "DRAFT"
- **12.2.3** Genehmigen → Status "APPROVED"

### 12.3 P&L Auswertung
- **12.3.1** `/wirtschaftsplan/pl` → Zeitraum + Cost Center auswählen
- **12.3.2** Tabelle zeigt Soll/Ist pro Konto mit Abweichung

### 12.4 Reports
- **12.4.1** `/reports` → Report-Type auswählen (z.B. "Vertrags-Übersicht")
- **12.4.2** Filter setzen → "Generieren" → PDF lädt
- **12.4.3** Zeitplan: Scheduled Report anlegen (z.B. monatlich) → Job in Queue

---

## 13. Admin & System

**Voraussetzungen:** Eingeloggt als SUPERADMIN.

### 13.1 Cache verwalten
- **13.1.1** `/admin/cache` → Stats werden angezeigt (Hit-Rate, Size)
- **13.1.2** "Cache leeren" → erfolgreich, Hit-Rate fällt auf 0%

### 13.2 Queue-Monitoring
- **13.2.1** `/admin/monitoring-admin` → Queue-Status pro Queue (active/waiting/failed)
- **13.2.2** Recharts laden ohne Crash
- **13.2.3** FailedJob-Liste zeigt gestorbene Jobs (initial leer)

### 13.3 Audit-Logs
- **13.3.1** `/admin/access-report` oder `/admin/audit-logs` → Liste der letzten Aktionen
- **13.3.2** Filter nach User/Aktion/Entity funktioniert

### 13.4 Backup
- **13.4.1** `/admin/system-admin/backup` → "Backup starten" → DB-Dump wird erstellt
- **13.4.2** Backup-Liste zeigt Eintrag mit Timestamp + Größe
- **13.4.3** Restore-Knopf vorhanden (NICHT klicken im echten Test!)

### 13.5 Retention Policy (GoBD-Purge)
- **13.5.1** `POST /api/admin/retention/run` (via curl oder Admin-UI falls vorhanden)
- **13.5.2** Response zeigt `totalDeleted` (= 0 bei frischem Mandant)
- **13.5.3** Idempotent: zweiter Aufruf wieder 0

### 13.6 System-Status / Health
- **13.6.1** `/api/health` → JSON: `{"status":"ok","database":"connected","redis":"connected","s3":"connected"}`
- **13.6.2** `/admin/system-admin` → System-Tab zeigt Versionen, Uptime, Connections

### 13.7 Feature-Flags
- **13.7.1** `/admin/marketing` oder `/admin/settings` → Feature-Flags-Tab
- **13.7.2** Flag toggeln (z.B. "Meilisearch-Search") → Speichern
- **13.7.3** Effekt im UI: Such-Feature erscheint/verschwindet

---

## 14. Portal (Shareholder-Bereich)

**Voraussetzungen:** Mindestens 1 Shareholder mit User-Account angelegt.

### 14.1 Portal-Login
- **14.1.1** Logout → Login mit Shareholder-User
- **14.1.2** Redirect zu `/portal` (nicht `/dashboard`!)
- **14.1.3** Header zeigt nur Portal-Navigation

### 14.2 Eigene Beteiligungen
- **14.2.1** `/portal/holdings` → Liste der Funds in denen Shareholder ist
- **14.2.2** Beteiligungs-Höhe + Stake-Prozent sichtbar

### 14.3 Eigene Daten / Profil
- **14.3.1** `/portal/profile` → Eigene Adresse + Bank-Daten editierbar
- **14.3.2** Speichern erfolgreich (Person.update funktioniert)

### 14.4 Eigene Dokumente
- **14.4.1** `/portal/documents` → Nur Dokumente sichtbar die mit Shareholder verknüpft sind
- **14.4.2** Download funktioniert
- **14.4.3** Andere Mandanten-Dokumente NICHT sichtbar (Multi-Tenancy)

### 14.5 DSGVO-Datenauskunft (Art. 15)
- **14.5.1** `/portal/my-data/export` → JSON-Download
- **14.5.2** Datei enthält alle eigenen Daten (Person, Shareholders, ContactLinks)

### 14.6 Energie-Analytics (Portal)
- **14.6.1** `/portal/energy-analytics` → Charts nur für eigene Beteiligungen
- **14.6.2** Lazy-Load funktioniert (kein Crash)

---

## 15. Multi-Tenancy Security-Tests

**Voraussetzungen:** 2.1 ✓, ein 2. Test-Mandant angelegt, in beiden je 1 Park.

### 15.1 Tenant A → Park B nicht sichtbar
- **15.1.1** Eingeloggt als User in Tenant A → `/parks` zeigt nur A-Parks
- **15.1.2** Direkter URL-Aufruf `/parks/<B-park-id>` → 404 (nicht 403, nicht "leeres Layout")

### 15.2 Direkter API-Aufruf gegen Tenant B
- **15.2.1** Mit Tenant-A-Session: `curl -b cookies.txt http://...:3050/api/parks/<B-park-id>` → 404
- **15.2.2** PUT auf B-Park: → 404 (nicht 200)
- **15.2.3** DELETE auf B-Park: → 404

### 15.3 Tenant-Switch + History
- **15.3.1** In Tenant A bei `/parks` → Tenant-Switch zu B → URL bleibt `/parks` aber Liste zeigt B-Parks
- **15.3.2** Browser-Back-Knopf → keine Tenant-A-Daten im Cache sichtbar

---

## 16. UI / Accessibility / Performance

### 16.1 Dark Mode
- **16.1.1** Header → Toggle "Dunkles Design" → Theme wechselt sofort
- **16.1.2** Page-Reload → Dark Mode bleibt erhalten (localStorage)
- **16.1.3** Charts (Recharts) zeigen Dark-Theme Farben

### 16.2 Glass-Style (falls Feature aktiv)
- **16.2.1** `/settings` → Appearance → "Glas" auswählen
- **16.2.2** Cards bekommen Backdrop-Blur, Background-Gradient sichtbar
- **16.2.3** Zurück auf "Klassisch" → originaler Look kehrt zurück

### 16.3 Sprache wechseln
- **16.3.1** Header → Sprache → "English" → UI wechselt zu Englisch
- **16.3.2** "Deutsch" zurück → DE-Strings
- **16.3.3** "Deutsch persönlich" (de-personal) → Du-Form statt Sie-Form

### 16.4 Mobile-Viewport
- **16.4.1** DevTools → Mobile-Viewport (iPhone 14)
- **16.4.2** Hamburger-Menü links oben → Sidebar als Sheet
- **16.4.3** Tabellen werden scrollbar oder zu Cards (responsiv)

### 16.5 Keyboard-Navigation
- **16.5.1** Tab durch Navigation → Focus-Outlines sichtbar
- **16.5.2** Ctrl+K → Command-Palette öffnet
- **16.5.3** "Skip to main content" Link beim ersten Tab

---

## 📋 Test-Durchführung — Reihenfolge & Tipps

**Empfohlene Reihenfolge:** 0 → 1 → 2 → 3 → 4/5 (parallel) → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16

**Tipps:**
- Bei Fehler in einem Schritt: trotzdem den Rest des Bereichs testen — Folge-Fehler werden weniger nutzbringend ohne den Vorgänger-Fix, aber Liste sind oft besser als nur Stop
- Bei Crash / weißem Bildschirm: Browser-DevTools → Console + Network → screenshotten für Triage
- Bei Backend-Fehlern: Docker-Logs (`docker logs windparkmanager-app-1`) parallel öffnen
- Bei langen Test-Sessions: Tenant zwischendurch wechseln und in beiden Mandanten was machen → testet Cache-Invalidation

**Fehler-Meldung-Format (für mich):**
```
5.1.4: Beim Klick auf Karten-Tab kommt: <Screenshot|Fehlertext|Console-Error>
```

---

## ✅ Nach dem Test

Sobald alle 16 Bereiche durch sind:
- Findings konsolidieren als GitHub Issues mit Labels nach Bereich
- Quickfixes (kleine Bugs) sofort
- Größere Findings priorisieren

Viel Erfolg! 🚀
