# Ralph Fix Plan — WindparkManager

## High Priority (Security + Compliance)

### Person Soft-Delete (DSGVO + GoBD)
- [ ] Add `deletedAt DateTime?` to Person model in `prisma/schema.prisma`
- [ ] Add `@@index([tenantId, deletedAt])` to Person model
- [ ] Run `npx prisma generate` (do NOT run `prisma db push` — that's a deploy task)
- [ ] Grep all `prisma.person.findMany` / `findFirst` — add `deletedAt: null` to where
- [ ] Update `src/app/api/persons/[id]/route.ts` DELETE handler: soft-delete (`data: { deletedAt: new Date() }`) instead of hard-delete
- [ ] Ensure historical references (Leases, Invoices, Shareholders) still display deleted Persons (no `deletedAt: null` filter on relations)
- [ ] Add Vitest test for Person soft-delete logic
- [ ] Verify: `npx tsc --noEmit && npm run lint && npm run build`

### TypeScript Strictness — Zod Validation for JSON Fields
- [ ] Create `src/lib/schemas/tenant-settings.schema.ts` with Zod schema for TenantSettings
- [ ] Refactor `getTenantSettings()` in `src/lib/tenant-settings.ts` to validate via Zod after DB fetch
- [ ] Create `src/lib/schemas/system-config.schema.ts` for SystemConfig JSON field
- [ ] Refactor `src/lib/config/index.ts` to validate SystemConfigRecord via Zod instead of `as unknown as`
- [ ] Audit `src/lib/serialize.ts` — replace `as unknown as T` with constrained generic `<T extends Record<string, unknown>>`
- [ ] Replace top-5 `as unknown as Prisma.InputJsonValue` with `structuredClone(x) as unknown as Prisma.InputJsonValue` (already done in some places — make consistent)
- [ ] Verify: `npx tsc --noEmit && npm run lint && npm run build`

## Medium Priority (Observability + Performance)

### RequestId Adoption in API Routes
- [ ] Create `src/lib/api-handler.ts` wrapper that calls `withRequestContext()` + `generateRequestId()`
- [ ] Pilot: retrofit 5 high-traffic API routes to use the wrapper (invoices, parks, dashboard, energy, contracts)
- [ ] Document pattern in AGENT.md for new routes

### Sentry Context per Request
- [ ] In the API handler wrapper, call `Sentry.setUser({ id: userId })` + `Sentry.setTag("tenantId", tenantId)`
- [ ] Ensures Sentry issues carry user + tenant context for incident triage

### Bundle Size Measurement
- [ ] Run `npm run build:analyze` and document top-10 chunks in `.ralph/docs/generated/bundle-report.md`
- [ ] Identify remaining Recharts static imports outside analytics
- [ ] Lazy-load any remaining heavy client-side dependencies

## Low Priority (Tech Debt)

### eslint 9 → 10 Migration
- [ ] Wait for `eslint-config-next` to officially support ESLint 10
- [ ] When available: bump `eslint` + `eslint-config-next`, fix any new rule violations
- [ ] Verify: `npx tsc --noEmit && npm run lint && npm run build`

### Component i18n Restbestand
- [ ] Grep for hardcoded German strings in `src/components/` (~40% remaining)
- [ ] Extract to message files, use `useTranslations()` hook
- [ ] Keep all 3 locale files in sync

### Vitest Coverage Threshold Bump
- [ ] Current thresholds: lines 30%, functions 30%, branches 25%
- [ ] After Person Soft-Delete + TS Strictness tests: bump to 40%+ if coverage allows
- [ ] Run `npm run test:coverage` to verify

## Completed (by Claude — nicht von Ralph)

- [x] 10-Audit Research (Security, Multi-Tenancy, RBAC, DSGVO, Queue, Observability, Bundle, Date/TZ, Cache, TS)
- [x] Multi-Tenancy UPDATE/DELETE tenantId-Scoping (Phase A + Systemsweep: 59 fixes in 40 files)
- [x] Queue Stall-Hardening + Prisma Disconnect (billing.worker lockDuration 10min)
- [x] Date UTC-Fixes (invoice-generator, monthly-lease proration)
- [x] DSGVO PII-Logger (demo-request keine Email/Phone in Logs)
- [x] Observability Silent Catches (fs.rm warning statt silent)
- [x] RBAC vendors:write → vendors:create/update/delete
- [x] Bundle Lazy-Loading (6 Analytics Tabs + 4 Dashboard Chart Widgets dynamic)
- [x] Cache getTenantSettings Redis 10min TTL + invalidation
- [x] Redis maxmemory Safety-Check auf Worker-Startup
- [x] Bundle Analyzer (@next/bundle-analyzer + build:analyze script)
- [x] Sentry Context Enrichment (release, PII-scrub, ignoreErrors)
- [x] Session Invalidation (Permission-Version + bumpPermissionVersion)
- [x] Settlement-Calculator Tests (19 neue Tests)
- [x] Dead-Letter-Queue Persistence (FailedJob model + persistFailedJob)
- [x] Cookie Consent Log (ConsentLog model + API + Banner)
- [x] Retention Policy Service (GoBD 10/6 Jahre Purge + Admin-Trigger)
- [x] RequestId/TraceId Infrastruktur (AsyncLocalStorage + Pino mixin + billing.worker PoC)
- [x] Money-Test-Coverage (Dunning 22 Tests + Invoice-Generator 49 Tests)
- [x] Time-Konstanten zentralisiert (MS_PER_DAY in 13 Files)
- [x] E2E Tour-Flake Fix (fixtures.ts + visual baselines)
- [x] 4 Major Dependency Updates (nodemailer types, tailwind-merge 3, bcryptjs 3, dompurify 3)
- [x] Security patch updates (next 16.2.3, next-intl 4.9.1)

## Deployment Pending (User-Aktion auf Proxmox)

- [ ] `prisma db push` für FailedJob + ConsentLog Schemas
- [ ] Redis `maxmemory 256mb` + `allkeys-lru` konfigurieren
- [ ] Sentry Projekt + Auth-Token einrichten
- [ ] SMTP konfigurieren + Test-Mail
- [ ] Impressum/Datenschutz mit echtem Text befüllen

## Notes
- Focus on Person Soft-Delete first (DSGVO-Compliance > TS-Strictness)
- Each task should result in ONE commit with descriptive message
- Always run full verification pipeline before committing
- Update this file after each completed task
