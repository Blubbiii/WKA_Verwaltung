# System-Architektur: WindparkManager (WPM)

## 1. System-Übersicht

```
                                    ┌─────────────────────────────────────┐
                                    │           LOAD BALANCER             │
                                    │         (Traefik/Nginx)             │
                                    └─────────────┬───────────────────────┘
                                                  │
                    ┌─────────────────────────────┼─────────────────────────────┐
                    │                             │                             │
                    ▼                             ▼                             ▼
        ┌───────────────────┐       ┌───────────────────┐       ┌───────────────────┐
        │   ADMIN-PORTAL    │       │   USER-PORTAL     │       │   API-ENDPOINTS   │
        │   (Next.js)       │       │   (Next.js)       │       │   (Next.js API)   │
        │                   │       │                   │       │                   │
        │ • Mandanten       │       │ • Dashboard       │       │ • REST API        │
        │ • User-Verwaltung │       │ • Windparks       │       │ • Webhooks        │
        │ • System-Config   │       │ • Abrechnungen    │       │ • Export-Service  │
        │ • Impersonation   │       │ • Dokumente       │       │                   │
        └─────────┬─────────┘       └─────────┬─────────┘       └─────────┬─────────┘
                  │                           │                           │
                  └───────────────────────────┼───────────────────────────┘
                                              │
                                              ▼
                              ┌───────────────────────────────┐
                              │        SUPABASE LAYER         │
                              │                               │
                              │  ┌─────────┐  ┌─────────┐    │
                              │  │  Auth   │  │ Storage │    │
                              │  └────┬────┘  └────┬────┘    │
                              │       │            │         │
                              │  ┌────▼────────────▼────┐    │
                              │  │     PostgreSQL       │    │
                              │  │  (Row Level Sec.)    │    │
                              │  └──────────────────────┘    │
                              └───────────────────────────────┘
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    │                         │                         │
                    ▼                         ▼                         ▼
        ┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
        │   MAIL-SERVICE    │   │  WEATHER-API      │   │   PDF-GENERATOR   │
        │   (SMTP/Resend)   │   │  (OpenWeather)    │   │   (Puppeteer)     │
        └───────────────────┘   └───────────────────┘   └───────────────────┘
```

## 2. Komponenten-Beschreibung

### 2.1 Frontend-Schicht

| Komponente | Technologie | Beschreibung |
|------------|-------------|--------------|
| Admin-Portal | Next.js 15 + App Router | Superadmin-Bereich für Mandanten- und User-Verwaltung |
| User-Portal | Next.js 15 + App Router | Hauptanwendung für Endbenutzer (Kommanditisten, Verwalter) |
| UI-Bibliothek | shadcn/ui + Tailwind | Konsistente, barrierefreie Komponenten |

### 2.2 Backend-Schicht

| Komponente | Technologie | Beschreibung |
|------------|-------------|--------------|
| API Routes | Next.js API Routes | REST-Endpoints für CRUD-Operationen |
| Auth | Supabase Auth | JWT-basierte Authentifizierung mit RLS |
| Database | PostgreSQL 15 | Relationale Datenbank mit Row Level Security |
| Storage | Supabase Storage | Dateispeicher für Dokumente, Logos, Anhänge |
| Realtime | Supabase Realtime | Live-Updates für Benachrichtigungen |

### 2.3 Externe Services

| Service | Zweck |
|---------|-------|
| SMTP (Resend/Mailgun) | E-Mail-Versand (Benachrichtigungen, Berichte) |
| OpenWeatherMap API | Wetterdaten für Korrelationsanalysen |
| Puppeteer/Playwright | PDF-Generierung für Berichte/Rechnungen |

## 3. Multi-Tenancy Konzept

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SHARED DATABASE                             │
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │
│  │  Tenant A   │  │  Tenant B   │  │  Tenant C   │                │
│  │  (tenant_id │  │  (tenant_id │  │  (tenant_id │                │
│  │   = uuid1)  │  │   = uuid2)  │  │   = uuid3)  │                │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                │
│         │                │                │                        │
│         ▼                ▼                ▼                        │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │              ROW LEVEL SECURITY (RLS)                    │     │
│  │                                                          │     │
│  │  Policy: tenant_id = auth.jwt() -> 'tenant_id'          │     │
│  │  Jeder User sieht NUR Daten seines Mandanten            │     │
│  └──────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

### Branding pro Mandant
- Logo (Header, Berichte, Rechnungen)
- Primärfarbe / Akzentfarbe
- Firmenname
- Kontaktdaten für Footer

## 4. Datenfluss

### 4.1 Authentifizierung
```
User → Login-Form → Supabase Auth → JWT mit tenant_id → RLS-Policies → Datenzugriff
```

### 4.2 Dokumenten-Upload
```
User → Upload-Form → API-Route → Virus-Scan → Supabase Storage → DB-Eintrag → Audit-Log
```

### 4.3 Abrechnungserstellung
```
Cron-Job → Berechnung → Invoice-Erstellung → PDF-Generierung → E-Mail-Versand → Audit-Log
```

### 4.4 E-Mail-Benachrichtigung
```
Event (Trigger) → Notification-Queue → Template-Rendering → SMTP-Versand → Status-Update
```

## 5. Sicherheitskonzept

### 5.1 Authentifizierung & Autorisierung
- **JWT-Token** mit kurzer Laufzeit (1h) + Refresh-Token
- **Row Level Security (RLS)** auf Datenbankebene
- **Rollen-basierte Zugriffskontrolle (RBAC)**:
  - `superadmin`: Zugriff auf alle Mandanten
  - `admin`: Mandanten-Admin, kann User verwalten
  - `manager`: Kann Daten bearbeiten
  - `viewer`: Nur Lesezugriff

### 5.2 Datensicherheit
- **Verschlüsselung**: TLS 1.3 für Transport, AES-256 für Storage
- **Audit-Log**: Alle Änderungen werden protokolliert
- **Backup**: Tägliche automatische Backups mit 30-Tage Retention
- **DSGVO-konform**: Datenexport, Löschfunktion

### 5.3 Input-Validierung
- Server-seitige Validierung mit Zod
- Prepared Statements (SQL Injection Prevention)
- XSS-Schutz durch React-Escaping
- CSRF-Token für Formulare

## 6. Skalierbarkeit

### Horizontale Skalierung
```
                    ┌─────────────┐
                    │   Traefik   │
                    │   (LB)      │
                    └──────┬──────┘
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
      ┌─────────┐    ┌─────────┐    ┌─────────┐
      │ App #1  │    │ App #2  │    │ App #3  │
      └─────────┘    └─────────┘    └─────────┘
           │               │               │
           └───────────────┼───────────────┘
                           ▼
                    ┌─────────────┐
                    │  Supabase   │
                    │  (Managed)  │
                    └─────────────┘
```

### Performance-Optimierungen
- **Caching**: Redis für Session-Cache und häufige Abfragen
- **CDN**: Statische Assets über CDN
- **Database**: Connection Pooling, Indexierung
- **Lazy Loading**: Code-Splitting für Frontend

## 7. Docker-Container-Struktur

```yaml
services:
  app:           # Next.js Application
  db:            # PostgreSQL Database
  storage:       # MinIO (S3-kompatibel) für Dokumente
  redis:         # Cache & Session Store
  traefik:       # Reverse Proxy & SSL
  mail:          # Mail-Service (optional)
  backup:        # Backup-Container
```

## 8. Entwicklungsumgebung vs. Produktion

| Aspekt | Development | Production |
|--------|-------------|------------|
| Database | Lokale PostgreSQL | Supabase Cloud oder Self-hosted |
| Storage | Lokales Dateisystem | Supabase Storage / MinIO |
| Auth | Supabase Local | Supabase Auth |
| Mail | Mailhog (Fake-SMTP) | Resend / Mailgun |
| SSL | Self-signed | Let's Encrypt |

## 9. Monitoring & Logging

- **Application Monitoring**: Sentry für Error-Tracking
- **Infrastructure**: Prometheus + Grafana
- **Logging**: Strukturiertes JSON-Logging
- **Health Checks**: /api/health Endpoint
- **Alerting**: Discord/Slack Webhooks bei Fehlern
