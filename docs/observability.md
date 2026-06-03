# Observability (Sentry + Health Checks)

## Sentry Setup

### Config-Files
- `sentry.server.config.ts` — Node-Runtime (API Routes, Server Components)
- `sentry.client.config.ts` — Browser
- `sentry.edge.config.ts` — Edge Runtime (Middleware)

### Aktivierung
- Nur in Production aktiv (`enabled: NODE_ENV === "production"`)
- ENV: `SENTRY_DSN` (server/edge), `NEXT_PUBLIC_SENTRY_DSN` (client)
- Release-Tagging: `windparkmanager@<package.json version>`

## PII-Scrubbing (DSGVO Art. 5 Datenminimierung)

Alle drei Configs nutzen `beforeSend(event)` mit Helpers aus
`src/lib/observability/pii.ts`:

| Feld | Verhalten |
|---|---|
| `event.user.email` | maskiert: `***@domain.com` (Domain bleibt für Geo-Korrelation) |
| `event.user.ip_address` | maskiert: erste 2 Oktette + `.x.x` (IPv4) bzw. erstes Hextet (IPv6) |
| `event.user.username` | komplett entfernt |
| `event.request.data.*` (server) | rekursiv: `password`, `token`, `secret`, `apiKey`, `iban`, `bic`, `email`, `phone`, … → `[Filtered]` |
| `event.request.query_string` | `password|token|secret|apiKey=...` → `[Filtered]` |
| `event.message` + `event.extra` (server) | IBAN- und BIC-Pattern → `IBAN-***` / `BIC-***` |

`event.user.id` bleibt erhalten für Issue-Korrelation.

### Erweiterung
Neue sensible Felder in `PII_KEYS` (in `sentry.server.config.ts`) eintragen.
Für komplexe Strukturen Helpers in `src/lib/observability/pii.ts` ergänzen.

## Health Checks

### Öffentlich: `GET /api/health`
- Body: `{ status: "ok" | "degraded" }`
- Status: 200 (alle Checks ok) oder 503
- Checks: DB (Timeout 2s) + Redis-Ping (Timeout 1s)
- Kein Versions-Leak, keine Diagnostics → Reconnaissance-Hardening
- `HEAD /api/health` für Docker `HEALTHCHECK` (kein Body)

### Admin-only: `GET /api/admin/system/status`
- Gated via `requireAdmin()` (Permission `admin:system`)
- Liefert: `status`, `database`, `storage`, `uptime`, `version`, `lastCheck`
- Nutzbar für Admin-Dashboard / interne Diagnostics
- Quelle: `src/app/api/admin/system/status/route.ts`

## Monitoring-Setup
- Traefik / externe Probes → `/api/health`
- Docker `HEALTHCHECK` → `HEAD /api/health`
- Admin-UI → `/api/admin/system/status`
