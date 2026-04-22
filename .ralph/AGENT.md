# Ralph Agent Configuration — WindparkManager

## Prerequisites
- Node.js >= 24.0.0
- PostgreSQL (via Docker on 192.168.178.101)
- Redis (via Docker, optional for dev — in-memory fallback exists)

## Build Instructions

```bash
# Full verification pipeline (MUST pass before ANY commit)
npx tsc --noEmit && npm run lint && npm run build

# Individual checks
npx tsc --noEmit          # TypeScript strict mode (0 errors required)
npm run lint              # ESLint flat config (0 errors, 0 warnings required)
npm run build             # Next.js production build (~40s)
```

## Test Instructions

```bash
# Unit tests (Vitest) — currently 293 tests, all must pass
npm test                  # = vitest run
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage thresholds

# E2E tests (Playwright) — against Proxmox deployment
E2E_BASE_URL=http://192.168.178.101:3050 npm run test:e2e

# Visual regression only
E2E_BASE_URL=http://192.168.178.101:3050 npx playwright test e2e/visual-regression.spec.ts
```

## Run Instructions

```bash
# Dev server (Turbopack, port 3050)
npm run dev

# Workers (BullMQ — separate process)
npm run worker            # Production
npm run worker:dev        # Dev with file-watch

# Bundle analysis
npm run build:analyze     # Opens .next/analyze/client.html
```

## Database

```bash
# Generate Prisma client after schema changes
npx prisma generate

# Push schema to DB (NO migrate — no complete migration history)
npx prisma db push

# Seed
npm run db:seed

# Studio (GUI)
npm run db:studio
```

## Docker Deployment (Proxmox)
- Server: 192.168.178.101, Portainer, ghcr.io/blubbiii/wka_verwaltung:latest
- Multi-stage Dockerfile: deps → builder → prisma-cli → runner
- App container user: `nextjs` (uid 1001)
- Schema sync in container: `prisma db push` (NOT `migrate deploy`)

## Key File Locations
| Area | Path |
|------|------|
| API Routes | `src/app/api/` |
| Business Logic | `src/lib/` |
| UI Components | `src/components/` |
| Prisma Schema | `prisma/schema.prisma` |
| i18n Messages | `src/messages/{de,en,de-personal}.json` |
| E2E Tests | `e2e/` |
| Unit Tests | `src/**/*.test.ts` |
| Queue Workers | `src/lib/queue/workers/` |
| Auth Config | `src/lib/auth/` |
| Cache Layer | `src/lib/cache/` |

## Notes
- NEVER `prisma db pull` — destroys schema (see PROMPT.md)
- Prisma JSON fields are cast via `as unknown as X` — prefer Zod validation
- `cn()` helper in `src/lib/utils.ts` wraps `twMerge(clsx(inputs))`
- All API routes use `apiError()` from `@/lib/api-errors`
