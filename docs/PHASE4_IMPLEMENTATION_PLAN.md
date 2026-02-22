# Phase 4: Implementierungsplan

## Zusammenfassung

Dieser Plan beschreibt die verbleibenden Features von Phase 4 in priorisierter Reihenfolge unter Beruecksichtigung technischer Abhaengigkeiten.

**Status Phase 4:**
- [x] 4.1 PDF-Generierung mit Branding (90% - Wasserzeichen fehlt)
- [x] 4.6 Audit-Log (95% - Export fehlt)
- [x] 4.7 Datei-Storage (95%)
- [ ] 4.2 Automatische Abrechnungen (0%)
- [ ] 4.3 E-Mail-Benachrichtigungen (0%)
- [ ] 4.4 Wetter-Integration (0%)
- [ ] 4.5 Background Jobs (0%)

---

## Priorisierte Reihenfolge

```
Prioritaet 1          Prioritaet 2          Prioritaet 3
[FUNDAMENT]           [KERN-FEATURES]       [ERWEITERUNGEN]
────────────────────────────────────────────────────────────────
4.5 Background Jobs   4.3 E-Mail-System     4.4 Wetter-Integration
        ↓                    ↓                     ↓
        └────────────→ 4.2 Auto-Abrechnungen      │
                              │                    │
4.1 Wasserzeichen     4.6 Audit-Export            │
        │                    │                    │
        └──────────── (benoetigt alles) ←─────────┘
```

### Begruendung der Reihenfolge:

1. **4.5 Background Jobs (BullMQ)** zuerst, weil:
   - E-Mails muessen asynchron versendet werden (kein Blocking)
   - Automatische Abrechnungen als Cron-Jobs laufen
   - Wetter-Sync periodisch im Hintergrund
   - PDF-Generierung fuer grosse Dokumente

2. **4.3 E-Mail-System** vor Auto-Abrechnungen, weil:
   - Auto-Abrechnungen muessen Benachrichtigungen senden
   - Passwort-Reset E-Mails (bereits implementiert, aber ohne Provider)

3. **4.2 Auto-Abrechnungen** benoetigt:
   - Background Jobs fuer Cron-Ausfuehrung
   - E-Mail fuer Benachrichtigungen

4. **4.1 Wasserzeichen & 4.6 Audit-Export** sind unabhaengig

5. **4.4 Wetter-Integration** ist "nice-to-have"

---

## Feature 4.5: Background Jobs (BullMQ)

### Beschreibung
Asynchrone Job-Verarbeitung mit BullMQ fuer CPU-intensive oder zeitverzoegerte Aufgaben.

### Begruendung: Warum BullMQ?
- **Redis-basiert**: Redis ist bereits in docker-compose.dev.yml vorhanden
- **Typsicher**: Exzellente TypeScript-Unterstuetzung
- **Zuverlaessig**: Automatische Retries, Dead Letter Queue
- **Skalierbar**: Separate Worker-Prozesse moeglich
- **Monitoring**: Bull Board fuer Admin-Dashboard

### Neue Dateien

```
src/
├── lib/
│   └── queue/
│       ├── index.ts              # Queue-Exports und Factory
│       ├── connection.ts         # Redis-Verbindung
│       ├── queues/
│       │   ├── email.queue.ts    # E-Mail Queue Definition
│       │   ├── pdf.queue.ts      # PDF-Generierung Queue
│       │   └── weather.queue.ts  # Wetter-Sync Queue
│       └── workers/
│           ├── email.worker.ts   # E-Mail Worker
│           ├── pdf.worker.ts     # PDF Worker
│           └── weather.worker.ts # Wetter Worker
├── app/
│   └── api/
│       └── admin/
│           └── jobs/
│               ├── route.ts      # Job-Status API
│               └── [id]/
│                   └── route.ts  # Einzelner Job
└── workers/
    └── index.ts                  # Standalone Worker Entrypoint
```

### Benoetigte Packages

```bash
npm install bullmq ioredis
npm install -D @types/ioredis
```

### Schema-Aenderungen
Keine Prisma-Aenderungen noetig - BullMQ speichert alles in Redis.

### Docker-Aenderungen

```yaml
# docker-compose.dev.yml - Worker Service hinzufuegen
services:
  worker:
    build: .
    command: npm run worker
    depends_on:
      - redis
    environment:
      - REDIS_URL=redis://redis:6379
```

### API-Endpoints

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/admin/jobs` | GET | Liste aller Jobs (paginiert) |
| `/api/admin/jobs/[id]` | GET | Job-Details |
| `/api/admin/jobs/[id]` | DELETE | Job abbrechen |
| `/api/admin/jobs/stats` | GET | Queue-Statistiken |

### Abhaengigkeiten
- Redis (bereits in Docker Compose)

---

## Feature 4.3: E-Mail-Benachrichtigungen

### Beschreibung
Vollstaendiges E-Mail-System mit Templates, Provider-Abstraktion und Benutzer-Praeferenzen.

### Begruendung: Warum Nodemailer + React Email?
- **Nodemailer**: Flexibel, unterstuetzt SMTP, SendGrid, AWS SES
- **React Email**: Typsichere Templates, wiederverwendbare Komponenten
- **Provider-agnostisch**: Einfacher Wechsel zwischen Providern

### Neue Dateien

```
src/
├── lib/
│   └── email/
│       ├── index.ts              # Email Service Export
│       ├── provider.ts           # Provider-Abstraktion (SMTP, SendGrid, SES)
│       ├── templates/
│       │   ├── base-layout.tsx   # Basis-Layout
│       │   ├── welcome.tsx       # Willkommens-E-Mail
│       │   ├── password-reset.tsx # Passwort-Reset
│       │   ├── new-vote.tsx      # Neue Abstimmung
│       │   ├── vote-reminder.tsx # Abstimmungs-Erinnerung
│       │   ├── new-document.tsx  # Neues Dokument
│       │   ├── new-invoice.tsx   # Neue Rechnung/Gutschrift
│       │   ├── contract-reminder.tsx # Vertragsfristen
│       │   └── system-message.tsx # System-Nachricht
│       └── sender.ts             # Queue-Integration
├── app/
│   └── api/
│       └── admin/
│           └── email/
│               ├── route.ts      # E-Mail-Einstellungen CRUD
│               ├── test/
│               │   └── route.ts  # Test-E-Mail senden
│               └── templates/
│                   └── route.ts  # Template-Vorschau
└── components/
    └── settings/
        └── notification-preferences.tsx # User Praeferenzen UI
```

### Benoetigte Packages

```bash
npm install nodemailer @react-email/components
npm install -D @types/nodemailer
```

### Schema-Aenderungen

```prisma
// In schema.prisma hinzufuegen:

model EmailTemplate {
  id          String   @id @default(uuid())
  name        String   // z.B. "welcome", "password-reset"
  subject     String   // E-Mail Betreff (mit Platzhaltern)
  htmlContent String   @db.Text // HTML Template
  textContent String?  @db.Text // Plain-Text Alternative
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, name])
  @@map("email_templates")
}

// User-Model erweitern:
model User {
  // ... existing fields ...

  // E-Mail Praeferenzen
  emailPreferences Json @default("{\"votes\": true, \"documents\": true, \"invoices\": true, \"contracts\": true, \"system\": true}")
}

// Tenant-Model erweitern:
model Tenant {
  // ... existing fields ...

  // E-Mail Provider Konfiguration (verschluesselt)
  emailProvider     String? // "smtp", "sendgrid", "ses"
  emailConfig       Json?   // Provider-spezifische Config
  emailFromAddress  String?
  emailFromName     String?

  emailTemplates    EmailTemplate[]
}
```

### E-Mail-Typen

| Typ | Trigger | Empfaenger |
|-----|---------|------------|
| Willkommen | User erstellt | Neuer User |
| Passwort-Reset | Reset angefordert | User |
| Neue Abstimmung | Vote erstellt | Alle Gesellschafter |
| Abstimmungs-Erinnerung | X Tage vor Ende | Nicht abgestimmte |
| Neues Dokument | Dokument hochgeladen | Betroffene User |
| Neue Rechnung | Rechnung versendet | Empfaenger |
| Vertragsfrist | X Tage vor Deadline | Manager |
| System-Nachricht | Admin sendet | Ausgewaehlte User |

### Abhaengigkeiten
- **4.5 Background Jobs**: E-Mails werden ueber Queue versendet

---

## Feature 4.2: Automatische Abrechnungen

### Beschreibung
Regelbasierte automatische Erstellung von Rechnungen/Gutschriften mit Cron-Jobs.

### Neue Dateien

```
src/
├── lib/
│   └── billing/
│       ├── index.ts              # Billing Service Export
│       ├── rules/
│       │   ├── types.ts          # Rule-Interfaces
│       │   ├── monthly-lease.ts  # Monatliche Pachtzahlung
│       │   ├── annual-distribution.ts # Jaehrliche Ausschuettung
│       │   └── quarterly-fee.ts  # Quartalsweise Gebuehr
│       ├── executor.ts           # Regel-Ausfuehrung
│       └── scheduler.ts          # Cron-Job Integration
├── app/
│   ├── (dashboard)/
│   │   └── admin/
│   │       └── billing-rules/
│   │           ├── page.tsx      # Regel-Uebersicht
│   │           └── [id]/
│   │               └── page.tsx  # Regel bearbeiten
│   └── api/
│       └── admin/
│           └── billing-rules/
│               ├── route.ts      # CRUD
│               ├── [id]/
│               │   ├── route.ts
│               │   └── execute/
│               │       └── route.ts # Manuell ausfuehren
│               └── preview/
│                   └── route.ts  # Vorschau vor Ausfuehrung
└── components/
    └── admin/
        └── billing-rules/
            ├── rule-form.tsx     # Regel-Formular
            ├── rule-list.tsx     # Regel-Liste
            └── execution-log.tsx # Ausfuehrungs-Protokoll
```

### Benoetigte Packages

```bash
npm install cron-parser
```

### Schema-Aenderungen

```prisma
// In schema.prisma hinzufuegen:

enum BillingRuleType {
  LEASE_PAYMENT      // Pachtzahlung
  DISTRIBUTION       // Ausschuettung
  MANAGEMENT_FEE     // Verwaltungsgebuehr
  CUSTOM             // Benutzerdefiniert
}

enum BillingRuleFrequency {
  MONTHLY
  QUARTERLY
  SEMI_ANNUAL
  ANNUAL
  CUSTOM_CRON
}

model BillingRule {
  id          String                @id @default(uuid())
  name        String
  description String?
  ruleType    BillingRuleType
  frequency   BillingRuleFrequency
  cronPattern String?               // Fuer CUSTOM_CRON
  dayOfMonth  Int?                  // 1-28 fuer monatlich

  // Regel-Parameter (JSON)
  parameters  Json                  // z.B. { amount, percentage, fundId }

  isActive    Boolean               @default(true)
  lastRunAt   DateTime?
  nextRunAt   DateTime?

  createdAt   DateTime              @default(now())
  updatedAt   DateTime              @updatedAt

  tenantId    String
  tenant      Tenant                @relation(fields: [tenantId], references: [id])

  executions  BillingRuleExecution[]

  @@index([tenantId])
  @@index([nextRunAt])
  @@map("billing_rules")
}

model BillingRuleExecution {
  id             String   @id @default(uuid())
  status         String   // "success", "failed", "partial"
  startedAt      DateTime @default(now())
  completedAt    DateTime?

  // Ergebnis
  invoicesCreated Int     @default(0)
  totalAmount     Decimal? @db.Decimal(15, 2)
  errorMessage    String?
  details         Json?    // Detailliertes Log

  ruleId         String
  rule           BillingRule @relation(fields: [ruleId], references: [id])

  @@index([ruleId])
  @@index([startedAt])
  @@map("billing_rule_executions")
}

// Tenant-Relation erweitern:
model Tenant {
  // ... existing fields ...
  billingRules BillingRule[]
}
```

### Regel-Typen

| Typ | Beschreibung | Parameter |
|-----|--------------|-----------|
| LEASE_PAYMENT | Monatliche/jaehrliche Pachtzahlung | parkId, calculation method |
| DISTRIBUTION | Ausschuettung an Gesellschafter | fundId, totalAmount, percentage |
| MANAGEMENT_FEE | Verwaltungsgebuehr | amount, recipientType |
| CUSTOM | Benutzerdefiniert | customFields |

### Abhaengigkeiten
- **4.5 Background Jobs**: Cron-Jobs laufen als Worker
- **4.3 E-Mail**: Benachrichtigung nach Ausfuehrung

---

## Feature 4.1: Wasserzeichen fuer PDFs

### Beschreibung
Wasserzeichen-Overlay fuer PDF-Dokumente (ENTWURF, VERTRAULICH, etc.)

### Neue Dateien

```
src/
└── lib/
    └── pdf/
        ├── utils/
        │   └── watermark.ts      # Wasserzeichen-Logik
        └── templates/
            └── components/
                └── Watermark.tsx # React-PDF Watermark Component
```

### Keine neuen Packages noetig
@react-pdf/renderer ist bereits installiert.

### Schema-Aenderungen
Keine.

### Watermark-Typen

| Typ | Text | Farbe | Verwendung |
|-----|------|-------|------------|
| DRAFT | "ENTWURF" | Grau 50% | Rechnungen im DRAFT-Status |
| CONFIDENTIAL | "VERTRAULICH" | Rot 30% | Sensible Dokumente |
| SAMPLE | "MUSTER" | Grau 50% | Vorschau/Demo |
| COPY | "KOPIE" | Grau 30% | Duplikate |

### Integration
- InvoiceTemplate.tsx: Watermark wenn status === "DRAFT"
- PDF-Preview: Watermark fuer nicht-finale Dokumente
- API-Option: `?watermark=draft` Query-Parameter

---

## Feature 4.6: Audit-Log Export

### Beschreibung
Export des Audit-Logs als CSV und PDF fuer Compliance-Anforderungen.

### Neue Dateien

```
src/
├── lib/
│   └── pdf/
│       ├── templates/
│       │   └── AuditLogTemplate.tsx # PDF Template
│       └── generators/
│           └── auditLogPdf.tsx    # PDF Generator
└── app/
    └── api/
        └── admin/
            └── audit-logs/
                └── export/
                    └── route.ts   # Export Endpoint
```

### Keine neuen Packages noetig
xlsx ist bereits installiert.

### Schema-Aenderungen
Keine.

### Export-Formate

| Format | Beschreibung |
|--------|--------------|
| CSV | Alle Felder, UTF-8 mit BOM |
| PDF | Formatierter Bericht mit Filtern |
| XLSX | Excel mit Formatierung |

### API

```
GET /api/admin/audit-logs/export?format=csv&from=2026-01-01&to=2026-01-31&entityType=PARK
```

---

## Feature 4.4: Wetter-Integration

### Beschreibung
Wetterdaten fuer Windpark-Standorte von OpenWeatherMap API.

### Neue Dateien

```
src/
├── lib/
│   └── weather/
│       ├── index.ts              # Weather Service
│       ├── openweathermap.ts     # API Client
│       ├── cache.ts              # Redis Cache
│       └── types.ts              # TypeScript Types
├── app/
│   ├── api/
│   │   └── weather/
│   │       └── [parkId]/
│   │           └── route.ts      # Wetterdaten Endpoint
│   └── (dashboard)/
│       └── parks/
│           └── [id]/
│               └── weather/
│                   └── page.tsx  # Wetter-Seite
└── components/
    └── parks/
        └── weather-widget.tsx    # Dashboard Widget
```

### Benoetigte Packages

```bash
npm install ioredis   # Bereits mit BullMQ installiert
```

### Schema-Aenderungen
WeatherData Model existiert bereits in schema.prisma.

### Umgebungsvariablen

```env
OPENWEATHERMAP_API_KEY=your-api-key
WEATHER_CACHE_TTL=1800  # 30 Minuten
```

### Cron-Job Integration
- Alle 30 Minuten: Wetterdaten fuer alle aktiven Parks abrufen
- Worker speichert in WeatherData Tabelle
- Cache in Redis fuer schnellen Zugriff

### Abhaengigkeiten
- **4.5 Background Jobs**: Periodischer Sync als Cron-Job

---

## Neue npm Packages (Zusammenfassung)

```json
{
  "dependencies": {
    "bullmq": "^5.x",
    "ioredis": "^5.x",
    "nodemailer": "^6.x",
    "@react-email/components": "^0.x",
    "cron-parser": "^4.x"
  },
  "devDependencies": {
    "@types/nodemailer": "^6.x"
  }
}
```

**Installationsbefehl:**
```bash
npm install bullmq ioredis nodemailer @react-email/components cron-parser
npm install -D @types/nodemailer
```

---

## Schema-Aenderungen (Zusammenfassung)

```prisma
// Neue Models:
- EmailTemplate          # E-Mail-Vorlagen
- BillingRule            # Abrechnungsregeln
- BillingRuleExecution   # Ausfuehrungs-Protokoll

// Erweiterte Models:
- User                   # + emailPreferences
- Tenant                 # + emailProvider, emailConfig, emailFromAddress, emailFromName
                        # + billingRules (Relation)

// Bereits existierend (keine Aenderung):
- WeatherData
- AuditLog
```

---

## Implementierungs-Zeitplan

### Woche 1: Background Jobs (4.5)
- Tag 1-2: BullMQ Setup, Redis-Verbindung, Connection-Pool
- Tag 3: Queue-Definitionen (email, pdf, weather)
- Tag 4: Worker-Implementierung und Docker-Setup
- Tag 5: Admin-API und Tests

### Woche 2: E-Mail-System (4.3)
- Tag 1-2: Provider-Abstraktion (SMTP, SendGrid)
- Tag 3-4: Templates mit React Email
- Tag 5: Queue-Integration und User-Praeferenzen

### Woche 3: Auto-Abrechnungen (4.2)
- Tag 1-2: Schema-Migration, Regel-Models
- Tag 3: Rule-Engine und Executor
- Tag 4: Cron-Job Integration
- Tag 5: Admin-UI und Preview

### Woche 4: Abschluss
- Tag 1: Wasserzeichen (4.1)
- Tag 2: Audit-Export (4.6)
- Tag 3-4: Wetter-Integration (4.4)
- Tag 5: Integration Tests, Dokumentation

---

## Risiken und Mitigation

| Risiko | Wahrscheinlichkeit | Auswirkung | Mitigation |
|--------|-------------------|------------|------------|
| Redis-Verbindungsprobleme | Mittel | Hoch | Connection-Pool, Health-Checks |
| E-Mail-Provider Rate-Limits | Niedrig | Mittel | Queue mit Throttling |
| OpenWeatherMap API-Limits | Niedrig | Niedrig | Caching, Batch-Requests |
| Cron-Job Race-Conditions | Mittel | Hoch | Distributed Locks |

---

## Checkliste vor Implementierung

- [ ] Redis lokal testen (docker-compose up redis)
- [ ] OpenWeatherMap API-Key beantragen
- [ ] E-Mail-Provider waehlen (SendGrid empfohlen fuer Produktion)
- [ ] Schema-Migration planen (Downtime?)
- [ ] Worker-Deployment-Strategie definieren

---

## Naechste Schritte

1. **Review dieses Plans** durch das Team
2. **API-Key** fuer OpenWeatherMap beantragen
3. **E-Mail-Provider** auswaehlen (SendGrid Free Tier fuer Start)
4. **Mit 4.5 (Background Jobs) beginnen** als Fundament

---

*Erstellt: 05.02.2026*
*Autor: Solution Architect Agent*
