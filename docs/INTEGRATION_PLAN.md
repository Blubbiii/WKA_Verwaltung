# Integrationsplan: Fehlende Features Phase 1.3 - 3.7

**Erstellt:** 5. Februar 2026
**Basis:** ROADMAP.md Analyse
**Status:** Planungsdokument

---

## Zusammenfassung

Dieses Dokument listet alle fehlenden Features aus Phase 1.3 bis 3.7 auf, gruppiert nach Prioritaet und mit Abhaengigkeiten. Es dient als Grundlage fuer die strukturierte Implementierung.

### Gesamtuebersicht

| Prioritaet | Anzahl Features | Geschaetzter Gesamtaufwand |
|------------|-----------------|----------------------------|
| Hoch       | 12              | Gross                      |
| Mittel     | 15              | Mittel-Gross               |
| Niedrig    | 8               | Klein-Mittel               |

---

## Phase 1: Foundation - Fehlende Features

### 1.3 Docker-Setup

| Feature | Beschreibung | Aufwand | Prioritaet |
|---------|--------------|---------|------------|
| **1.3.1** Dockerfile Production | Multi-Stage Dockerfile fuer optimiertes Production Image | Mittel | Mittel |
| **1.3.2** Traefik Reverse Proxy | SSL-Terminierung, Routing, Load Balancing | Mittel | Mittel |
| **1.3.3** MinIO Storage | S3-kompatibler Object Storage fuer Dateien | Klein | Hoch |
| **1.3.4** Redis Cache | In-Memory Cache fuer Sessions und Daten | Klein | Mittel |

**Benoetigte Dateien:**
- `Dockerfile` (neu)
- `docker-compose.prod.yml` (neu)
- `traefik/traefik.yml` (neu)
- `traefik/dynamic.yml` (neu)
- `.env.production.example` (neu)

**Abhaengigkeiten:**
- 1.3.3 (MinIO) sollte vor 4.7 (File Storage) implementiert werden - **BEREITS ERLEDIGT**
- 1.3.4 (Redis) wird benoetigt fuer 4.5 (Background Jobs)

---

### 1.4 Authentifizierung

| Feature | Beschreibung | Aufwand | Prioritaet |
|---------|--------------|---------|------------|
| **1.4.1** Passwort-Reset | E-Mail basierter Passwort-Reset Flow | Mittel | Hoch |

**Benoetigte Dateien:**
- `src/app/forgot-password/page.tsx` (neu)
- `src/app/reset-password/page.tsx` (neu)
- `src/app/api/auth/forgot-password/route.ts` (neu)
- `src/app/api/auth/reset-password/route.ts` (neu)
- `src/lib/email/templates/password-reset.tsx` (neu)

**Abhaengigkeiten:**
- Benoetigt E-Mail-System (4.3) - kann zunaechst mit Mock implementiert werden

---

### 1.8.4 Datensatz-Level Berechtigungen

| Feature | Beschreibung | Aufwand | Prioritaet |
|---------|--------------|---------|------------|
| **1.8.4.1** ResourceAccess Model | Zugriff auf bestimmte Entitaeten einschraenken | Gross | Niedrig |
| **1.8.4.2** UI Einschraenkung | Parks/Funds bei Rollenzuweisung einschraenken | Mittel | Niedrig |
| **1.8.4.3** Listen-Filterung | Automatische Filterung basierend auf ResourceAccess | Mittel | Niedrig |
| **1.8.4.4** API resourceId-Check | Permission-Check mit Ressourcen-ID | Klein | Niedrig |

**Benoetigte Dateien:**
- `prisma/schema.prisma` (erweitern - ResourceAccess Model)
- `src/lib/auth/resourceAccess.ts` (neu)
- `src/components/admin/resource-access-dialog.tsx` (neu)
- Alle API-Routes (erweitern mit resourceId-Check)

**Abhaengigkeiten:**
- Aufbauend auf bestehendem Permission-System (1.8.1-1.8.3)
- Optional - kann nach Bedarf implementiert werden

---

### 1.8.5 Audit & Compliance

| Feature | Beschreibung | Aufwand | Prioritaet |
|---------|--------------|---------|------------|
| **1.8.5.1** Bericht "Wer hat Zugriff auf was?" | Report ueber effektive Berechtigungen aller User | Mittel | Mittel |
| **1.8.5.2** Export Berechtigungs-Matrix | Excel/PDF Export der Rollen-Berechtigungs-Matrix | Klein | Niedrig |
| **1.8.5.3** Benachrichtigung bei Rechte-Aenderungen | E-Mail bei Rollen-Aenderung an betroffene User | Klein | Niedrig |

**Benoetigte Dateien:**
- `src/app/(dashboard)/admin/access-report/page.tsx` (neu)
- `src/app/api/admin/access-report/route.ts` (neu)
- `src/app/api/admin/permissions/export/route.ts` (neu)

**Abhaengigkeiten:**
- 1.8.5.3 benoetigt E-Mail-System (4.3)

---

## Phase 2: Core Modules - Fehlende Features

### 2.6 Kommanditisten-Portal

| Feature | Beschreibung | Aufwand | Prioritaet |
|---------|--------------|---------|------------|
| **2.6.1** Persoenliche Daten bearbeiten | User kann eigene Stammdaten aendern | Mittel | Hoch |
| **2.6.2** Monatsberichte einsehen | Gesellschafter sieht zugeordnete Monatsberichte | Mittel | Mittel |

**Benoetigte Dateien:**
- `src/app/(portal)/portal/profile/page.tsx` (erweitern)
- `src/app/(portal)/portal/profile/edit/page.tsx` (neu)
- `src/app/api/portal/my-profile/route.ts` (erweitern - PUT)
- `src/components/portal/profile-edit-form.tsx` (neu)
- `src/app/(portal)/portal/reports/page.tsx` (neu)
- `src/app/api/portal/my-reports/route.ts` (neu)

**Abhaengigkeiten:**
- 2.6.2 benoetigt Report-System (3.6)

---

### 2.7 Pacht & Flaechen

| Feature | Beschreibung | Aufwand | Prioritaet |
|---------|--------------|---------|------------|
| **2.7.1** Pachtzahlungs-Uebersicht | Dashboard fuer alle faelligen/bezahlten Pachtzahlungen | Mittel | Hoch |

**Benoetigte Dateien:**
- `src/app/(dashboard)/leases/payments/page.tsx` (neu)
- `src/app/api/leases/payments/route.ts` (neu)
- `src/components/leases/payment-overview-table.tsx` (neu)
- `src/components/leases/payment-calendar.tsx` (neu)

**Abhaengigkeiten:**
- Aufbauend auf bestehendem Lease-System
- Verknuepfung mit Invoice-System fuer Zahlungsstatus

---

## Phase 3: Advanced Features - Fehlende Features

### 3.1 Abstimmungssystem

| Feature | Beschreibung | Aufwand | Prioritaet |
|---------|--------------|---------|------------|
| **3.1.1** Ergebnis-Export (PDF) | Abstimmungsergebnis als PDF exportieren | Mittel | Hoch |

**Benoetigte Dateien:**
- `src/lib/pdf/templates/vote-result.tsx` (neu)
- `src/app/api/votes/[id]/export/route.ts` (neu)
- Button in `src/app/(dashboard)/votes/[id]/page.tsx` (erweitern)

**Abhaengigkeiten:**
- Nutzt bestehendes PDF-System (react-pdf)
- Nutzt Letterhead-Templates

---

### 3.2 Vollmachten

| Feature | Beschreibung | Aufwand | Prioritaet |
|---------|--------------|---------|------------|
| **3.2.1** Vollmachts-Dokument hochladen | PDF der unterschriebenen Vollmacht speichern | Klein | Mittel |

**Benoetigte Dateien:**
- `src/app/(dashboard)/votes/proxies/[id]/upload/page.tsx` (neu)
- `src/app/api/proxies/[id]/document/route.ts` (neu)
- `prisma/schema.prisma` (VoteProxy.documentUrl bereits vorhanden)

**Abhaengigkeiten:**
- Nutzt bestehendes Storage-System (MinIO)

---

### 3.3 Dokumentenmanagement

| Feature | Beschreibung | Aufwand | Prioritaet |
|---------|--------------|---------|------------|
| **3.3.1** Dokument-Suche (Volltext) | Suche in Dokumenten-Metadaten und optional Inhalt | Gross | Mittel |
| **3.3.2** Download-Tracking (Audit) | Protokollierung wer wann welches Dokument heruntergeladen hat | Klein | Mittel |

**Benoetigte Dateien:**
- `src/app/(dashboard)/documents/search/page.tsx` (neu)
- `src/app/api/documents/search/route.ts` (neu)
- `src/components/documents/search-dialog.tsx` (neu)
- `src/lib/audit.ts` (erweitern - DOCUMENT_DOWNLOAD Event)
- `src/app/api/documents/[id]/download/route.ts` (erweitern - Audit-Log)

**Abhaengigkeiten:**
- 3.3.1: Optional PostgreSQL Full-Text-Search oder Elasticsearch
- 3.3.2: Nutzt bestehendes Audit-System

---

### 3.4 Vertragsmanagement

| Feature | Beschreibung | Aufwand | Prioritaet |
|---------|--------------|---------|------------|
| **3.4.1** Dokument an Vertrag anhaengen | Vertragsscans und Anhange hochladen | Klein | Hoch |
| **3.4.2** Fristenwarnung konfigurieren | Konfigurierbare Erinnerungen (30/60/90 Tage) | Mittel | Hoch |

**Benoetigte Dateien:**
- `src/app/(dashboard)/contracts/[id]/documents/page.tsx` (neu)
- `src/components/contracts/contract-documents.tsx` (neu)
- `src/app/api/contracts/[id]/documents/route.ts` (neu)
- `src/app/(dashboard)/contracts/[id]/reminders/page.tsx` (neu)
- `src/components/contracts/reminder-settings.tsx` (neu)
- `prisma/schema.prisma` (Contract.reminderDays bereits vorhanden)

**Abhaengigkeiten:**
- 3.4.1: Nutzt bestehendes Document-System
- 3.4.2: Vollstaendige Funktionalitaet benoetigt E-Mail-System (4.3)

---

### 3.5 Pacht-Abrechnungsperioden

| Feature | Beschreibung | Aufwand | Prioritaet |
|---------|--------------|---------|------------|
| **3.5.1** Automatische Berechnung | Erloese vs. Mindestpacht automatisch berechnen | Gross | Hoch |
| **3.5.2** Abrechnungsuebersicht/Report | Zusammenfassender Bericht pro Periode | Mittel | Hoch |

**Benoetigte Dateien:**
- `src/lib/settlement/calculator.ts` (neu)
- `src/app/api/admin/settlement-periods/[id]/calculate/route.ts` (erweitern)
- `src/lib/pdf/templates/settlement-report.tsx` (neu)
- `src/app/api/admin/settlement-periods/[id]/report/route.ts` (neu)
- `src/app/(dashboard)/admin/settlement-periods/[id]/report/page.tsx` (neu)

**Abhaengigkeiten:**
- Benoetigt vollstaendige Pacht-Konfiguration pro Park
- Nutzt RevenuePhases fuer Prozentsatz-Berechnung

---

### 3.6 Reporting & Export

| Feature | Beschreibung | Aufwand | Prioritaet |
|---------|--------------|---------|------------|
| **3.6.1** Monatsbericht-Template | Standard-Vorlage fuer monatliche Reports | Gross | Hoch |
| **3.6.2** Jahresbericht-Template | Jahresuebersicht mit allen KPIs | Gross | Hoch |
| **3.6.3** Gesellschafterliste (PDF) | Export aller Gesellschafter eines Fonds | Mittel | Hoch |
| **3.6.4** Beteiligungsuebersicht (PDF) | Kapital- und Quoten-Uebersicht | Mittel | Hoch |
| **3.6.5** Abstimmungsergebnis (PDF) | Siehe 3.1.1 | - | - |
| **3.6.6** PDF mit Mandanten-Branding | Logo und Farben in allen PDFs | Klein | Hoch |
| **3.6.7** Excel-Export (xlsx) | Tabellen als Excel exportieren | Mittel | Hoch |
| **3.6.8** CSV-Export | Einfacher Datenexport | Klein | Mittel |
| **3.6.9** Bericht-Archiv | Generierte Berichte speichern und wieder abrufen | Mittel | Niedrig |

**Benoetigte Dateien:**
- `src/lib/pdf/templates/monthly-report.tsx` (neu)
- `src/lib/pdf/templates/annual-report.tsx` (neu)
- `src/lib/pdf/templates/shareholder-list.tsx` (neu)
- `src/lib/pdf/templates/participation-overview.tsx` (neu)
- `src/lib/export/excel.ts` (neu) - xlsx Package
- `src/lib/export/csv.ts` (neu)
- `src/app/api/reports/[type]/pdf/route.ts` (neu)
- `src/app/api/reports/[type]/excel/route.ts` (neu)
- `src/app/api/reports/[type]/csv/route.ts` (neu)
- `src/app/(dashboard)/reports/archive/page.tsx` (neu)
- `prisma/schema.prisma` (GeneratedReport Model - neu)

**Abhaengigkeiten:**
- 3.6.6: Nutzt bestehendes Letterhead-System
- 3.6.7: Benoetigt xlsx Package (npm install xlsx)

---

### 3.7 News & Kommunikation

| Feature | Beschreibung | Aufwand | Prioritaet |
|---------|--------------|---------|------------|
| **3.7.1** News-Kategorisierung | Kategorien wie "Allgemein", "Finanzen", "Technik" | Klein | Niedrig |
| **3.7.2** Rich-Text-Editor | WYSIWYG Editor fuer News-Inhalte | Mittel | Mittel |

**Benoetigte Dateien:**
- `prisma/schema.prisma` (NewsCategory Enum hinzufuegen)
- `src/components/news/news-category-badge.tsx` (neu)
- `src/components/ui/rich-text-editor.tsx` (neu) - TipTap oder Lexical
- `src/app/(dashboard)/news/new/page.tsx` (erweitern)
- `src/app/(dashboard)/news/[id]/edit/page.tsx` (erweitern)

**Abhaengigkeiten:**
- 3.7.2: Benoetigt Rich-Text-Editor Package (npm install @tiptap/react)

---

## Priorisierte Implementierungsreihenfolge

### Welle 1: Kritische Features (Prioritaet HOCH)

Diese Features haben den hoechsten Business-Value und sollten zuerst implementiert werden.

```
1. Passwort-Reset (1.4.1)
   Aufwand: Mittel | Abhaengigkeit: E-Mail (Mock moeglich)

2. Reporting-System Basis (3.6)
   a) PDF mit Mandanten-Branding (3.6.6)
   b) Gesellschafterliste PDF (3.6.3)
   c) Beteiligungsuebersicht PDF (3.6.4)
   d) Excel-Export (3.6.7)
   Aufwand: Gross | Nutzt bestehende PDF-Infrastruktur

3. Abstimmungs-Ergebnis Export (3.1.1)
   Aufwand: Mittel | Nutzt Report-System

4. Pacht-Abrechnungen (3.5)
   a) Automatische Berechnung (3.5.1)
   b) Abrechnungs-Report (3.5.2)
   Aufwand: Gross | Kern-Business-Logik

5. Vertragsmanagement erweitern (3.4)
   a) Dokumente anhaengen (3.4.1)
   b) Fristenwarnung (3.4.2)
   Aufwand: Mittel | Wichtig fuer Compliance

6. Portal: Daten bearbeiten (2.6.1)
   Aufwand: Mittel | User-Facing Feature

7. Pachtzahlungs-Uebersicht (2.7.1)
   Aufwand: Mittel | Finanz-Uebersicht
```

### Welle 2: Wichtige Features (Prioritaet MITTEL)

Nach Abschluss von Welle 1.

```
8. Docker Production Setup (1.3)
   a) Dockerfile (1.3.1)
   b) Traefik (1.3.2)
   c) Redis (1.3.4)
   Aufwand: Mittel | Deployment-Vorbereitung

9. Audit-Erweiterungen (1.8.5)
   a) Zugriffs-Report (1.8.5.1)
   Aufwand: Mittel

10. Vollmachts-Dokument Upload (3.2.1)
    Aufwand: Klein

11. Dokument-System erweitern (3.3)
    a) Download-Tracking (3.3.2)
    b) Volltext-Suche (3.3.1)
    Aufwand: Mittel-Gross

12. Portal Monatsberichte (2.6.2)
    Aufwand: Mittel | Abhaengig von 3.6

13. CSV-Export (3.6.8)
    Aufwand: Klein

14. Rich-Text-Editor News (3.7.2)
    Aufwand: Mittel
```

### Welle 3: Nice-to-Have Features (Prioritaet NIEDRIG)

Optional oder nach Bedarf.

```
15. Datensatz-Level Berechtigungen (1.8.4)
    a) ResourceAccess Model (1.8.4.1)
    b) UI Einschraenkung (1.8.4.2)
    c) Listen-Filterung (1.8.4.3)
    d) API resourceId-Check (1.8.4.4)
    Aufwand: Gross | Komplex, nur bei Bedarf

16. Berechtigungs-Matrix Export (1.8.5.2)
    Aufwand: Klein

17. Benachrichtigung Rechte-Aenderung (1.8.5.3)
    Aufwand: Klein | Benoetigt E-Mail

18. Bericht-Archiv (3.6.9)
    Aufwand: Mittel

19. News-Kategorisierung (3.7.1)
    Aufwand: Klein
```

---

## Abhaengigkeitsdiagramm

```
E-Mail-System (4.3) - NOCH NICHT IMPLEMENTIERT
    │
    ├── 1.4.1 Passwort-Reset (kann mit Mock starten)
    ├── 1.8.5.3 Benachrichtigung Rechte-Aenderung
    └── 3.4.2 Fristenwarnung (vollstaendig)

PDF-System (bereits implementiert)
    │
    ├── 3.1.1 Abstimmungs-Export
    ├── 3.5.2 Abrechnungs-Report
    ├── 3.6.1 Monatsbericht
    ├── 3.6.2 Jahresbericht
    ├── 3.6.3 Gesellschafterliste
    └── 3.6.4 Beteiligungsuebersicht

Storage-System (bereits implementiert)
    │
    ├── 3.2.1 Vollmachts-Dokument
    ├── 3.3.2 Download-Tracking
    └── 3.4.1 Vertrags-Dokumente

Report-System (3.6)
    │
    └── 2.6.2 Portal Monatsberichte

Redis (1.3.4)
    │
    └── 4.5 Background Jobs (Phase 4)
```

---

## Technische Anforderungen

### Neue Dependencies

```json
{
  "xlsx": "^0.18.5",           // Excel Export
  "@tiptap/react": "^2.x",     // Rich-Text Editor
  "@tiptap/starter-kit": "^2.x",
  "nodemailer": "^6.x"         // E-Mail (spaeter)
}
```

### Schema-Erweiterungen

```
1. NewsCategory Enum (fuer 3.7.1)
2. GeneratedReport Model (fuer 3.6.9)
3. ResourceAccess Model (fuer 1.8.4 - optional)
```

### Neue Lib-Module

```
src/lib/
├── export/
│   ├── excel.ts      # xlsx Export Utilities
│   └── csv.ts        # CSV Export Utilities
├── settlement/
│   └── calculator.ts # Pacht-Abrechnungs-Logik
└── email/
    ├── provider.ts   # E-Mail Provider (spaeter)
    └── templates/    # E-Mail Templates
```

---

## Zeitschaetzung

| Welle | Features | Geschaetzter Aufwand | Empfohlene Reihenfolge |
|-------|----------|---------------------|------------------------|
| 1     | 7 Features | 3-4 Wochen | Zuerst |
| 2     | 7 Features | 2-3 Wochen | Nach Welle 1 |
| 3     | 5 Features | 1-2 Wochen | Optional/Bei Bedarf |

**Gesamtaufwand:** ca. 6-9 Wochen Entwicklungszeit

---

## Naechste Schritte

1. **Entscheidung:** Welche Features aus Welle 1 haben die hoechste Prioritaet?
2. **Feature Specs:** Fuer jedes Feature eine detaillierte Spezifikation erstellen
3. **Sprint Planning:** Features in Sprints aufteilen
4. **Implementierung:** Mit Passwort-Reset oder Report-System starten

---

## Anhang: Feature-Status-Matrix

| Phase | Feature | Status | Prioritaet | Aufwand |
|-------|---------|--------|------------|---------|
| 1.3.1 | Dockerfile Production | Ausstehend | Mittel | Mittel |
| 1.3.2 | Traefik Reverse Proxy | Ausstehend | Mittel | Mittel |
| 1.3.3 | MinIO Storage | Erledigt | - | - |
| 1.3.4 | Redis Cache | Ausstehend | Mittel | Klein |
| 1.4.1 | Passwort-Reset | Ausstehend | Hoch | Mittel |
| 1.8.4.1 | ResourceAccess Model | Ausstehend | Niedrig | Gross |
| 1.8.4.2 | UI Einschraenkung | Ausstehend | Niedrig | Mittel |
| 1.8.4.3 | Listen-Filterung | Ausstehend | Niedrig | Mittel |
| 1.8.4.4 | API resourceId-Check | Ausstehend | Niedrig | Klein |
| 1.8.5.1 | Zugriffs-Report | Ausstehend | Mittel | Mittel |
| 1.8.5.2 | Matrix-Export | Ausstehend | Niedrig | Klein |
| 1.8.5.3 | Rechte-Benachrichtigung | Ausstehend | Niedrig | Klein |
| 2.6.1 | Daten bearbeiten | Ausstehend | Hoch | Mittel |
| 2.6.2 | Monatsberichte | Ausstehend | Mittel | Mittel |
| 2.7.1 | Pachtzahlungs-Uebersicht | Ausstehend | Hoch | Mittel |
| 3.1.1 | Ergebnis-Export PDF | Ausstehend | Hoch | Mittel |
| 3.2.1 | Vollmachts-Dokument | Ausstehend | Mittel | Klein |
| 3.3.1 | Volltext-Suche | Ausstehend | Mittel | Gross |
| 3.3.2 | Download-Tracking | Ausstehend | Mittel | Klein |
| 3.4.1 | Vertrags-Dokumente | Ausstehend | Hoch | Klein |
| 3.4.2 | Fristenwarnung | Ausstehend | Hoch | Mittel |
| 3.5.1 | Auto-Berechnung | Ausstehend | Hoch | Gross |
| 3.5.2 | Abrechnungs-Report | Ausstehend | Hoch | Mittel |
| 3.6.1 | Monatsbericht | Ausstehend | Hoch | Gross |
| 3.6.2 | Jahresbericht | Ausstehend | Hoch | Gross |
| 3.6.3 | Gesellschafterliste | Ausstehend | Hoch | Mittel |
| 3.6.4 | Beteiligungsuebersicht | Ausstehend | Hoch | Mittel |
| 3.6.6 | Mandanten-Branding | Ausstehend | Hoch | Klein |
| 3.6.7 | Excel-Export | Ausstehend | Hoch | Mittel |
| 3.6.8 | CSV-Export | Ausstehend | Mittel | Klein |
| 3.6.9 | Bericht-Archiv | Ausstehend | Niedrig | Mittel |
| 3.7.1 | News-Kategorien | Ausstehend | Niedrig | Klein |
| 3.7.2 | Rich-Text-Editor | Ausstehend | Mittel | Mittel |
