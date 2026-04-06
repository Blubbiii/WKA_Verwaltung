# E2E Tests (Playwright)

Smoke-Tests für kritische User-Flows.

## Voraussetzungen

1. **Postgres läuft** (`docker compose up -d postgres` oder lokale Instanz)
2. **DB ist geseedet** (`npm run db:seed`)
3. **Dev-Server läuft** auf `http://localhost:3050` (wird von Playwright
   automatisch gestartet, falls nicht bereits aktiv)

## Ausführen

```bash
npm run test:e2e          # Headless
npm run test:e2e:ui       # UI-Modus (interaktiv)
npm run test:e2e:headed   # Sichtbarer Browser
npm run test:e2e:report   # HTML-Report öffnen
```

## Test-User

Standard (aus Seed): `admin@windparkmanager.de` / `admin123`

Override via Env-Vars:
```bash
E2E_EMAIL=user@example.com E2E_PASSWORD=secret npm run test:e2e
```

## Struktur

- `auth.setup.ts` — einmaliger Login, speichert Session in `.auth/user.json`
- `smoke.spec.ts` — Dashboard, Navigation, Theme, Responsive-Breakpoints
- `.auth/` — Session-State (gitignored)

## CI

Im CI-Modus (`CI=true`):
- Retries: 2
- Reporter: `github`
- Kein webServer (wird extern gestartet, z.B. via Docker)
