# Changelog

All notable changes to WindparkManager.

## [Unreleased]

### Added — April 2026 Audit-Refactor

- **Structured API errors** (`src/lib/api-errors.ts`) — `apiError(code, status, opts)` helper with 25 stable error codes (NOT_FOUND, FORBIDDEN, VALIDATION_FAILED, etc.). Response format now `{ code, error, details? }` for client-side i18n.
- **Client-side error translator** (`src/lib/api-error-client.ts`) — `translateApiError(res, t)` parses structured errors and returns localized messages via `useTranslations("apiErrors")`.
- **Centralized config modules:**
  - `src/lib/config/redis.ts` — `getBaseRedisOptions()` shared by cache, queue, and rate-limit (no more 3× duplicated URL parsing)
  - `src/lib/config/pagination.ts` — `PAGE_SIZE_DEFAULT/LARGE/DROPDOWN/CSV_EXPORT/MAX` (env-overridable)
- **`apiErrors` i18n namespace** — 25 keys in all 3 message files (de, en, de-personal)

### Changed — April 2026 Audit-Refactor

- **All 474 API routes refactored** to use `apiError()` (~1960 replacements, -4756 lines net via collapsing multi-line error returns)
- **Internal helpers migrated** — `api-utils.ts` (`badRequest`, `notFound`, `forbidden`, `serverError`, `handleApiError`), `auth/withPermission.ts`, `auth/apiKeyAuth.ts`, `rate-limit.ts` all return via `apiError()` internally. Result: 252 indirect callers automatically benefit from structured errors.
- **`apiError()` extended** with optional `headers` parameter for rate-limit `Retry-After` support.
- **i18n converted** ~110 components to next-intl in 2 waves (~280 toast calls + dialogs + form labels). All toasts/dialogs/forms/buttons/tables now translated.
- **i18n converted** ~72 dashboard pages (Contracts, Funds, Documents, Energy, Admin, GIS, Inbox, Portal, Service-Events, etc.). Pages are ~95% i18n-complete; remaining are redirect stubs.
- **Mahngebühren bug fixed** — `billing.worker.ts` now reads `reminderFee1/2/3` from `TenantSettings` instead of hardcoded 5/10€ (overrode tenant config).
- **Skonto defaults** in `invoices/new` now load from `TenantSettings.defaultSkontoPercent/Days` instead of hardcoded.
- **Seed passwords** — `prisma/seed.ts` now reads from `SEED_SUPERADMIN_PASSWORD` / `SEED_DEMO_ADMIN_PASSWORD` env vars (defaults remain for dev).
- **Backup script hardened** — `scripts/verify-backup.sh` no longer falls back to `devpassword`; requires `POSTGRES_PASSWORD` explicitly.

### Removed — April 2026 Audit-Refactor

- **Dead code** `src/lib/cache/api-cache.ts` (in-memory cache, never imported anywhere)
- **21 unused imports** across API routes (mostly `apiLogger as logger` left over from API-Refactor, `z` in leases routes, `handleApiError` in onboarding, etc.)
- **Several unused types/constants** — `DeliverBody`, `OperationalTaskStatus`, `ParkAvailRow`, `VALID_ROLES`, `eventTypeKeys`, `cellToString`
- **7 unused `(err)` parameters** in catch blocks (anomalies page) — replaced with bare `catch {}`

### Fixed — April 2026 Audit-Refactor

- **All 72 ESLint warnings** — codebase now reports 0 errors, 0 warnings
  - 32× `t` missing in useCallback/useEffect dep arrays (i18n migration follow-up)
  - 21× unused vars / imports
  - `service-events/page.tsx`: `events` array wrapped in `useMemo` (prevented stale dep arrays)
  - `admin/roles/page.tsx` + `RoleManagement.tsx` + `load-config-dialog.tsx`: `fetchData` converted to `useCallback`
  - `virtual-table.tsx`: TanStack Virtual library incompatibility suppressed with documented `eslint-disable-next-line`
- **2 React Compiler errors** in energy import pages — `validateAndSelectFile` `useCallback` dependency missing `t`

### Added

- **E2E Test Suite** — 247 Playwright tests across 19 files, 3 browsers (Chromium, Firefox, WebKit)
- **Responsive Design Overhaul** — mobile, tablet, and desktop layouts across the entire application
- **UX-Paket** — loading skeletons, error boundaries, bulk actions, inline editing
- **Predictive Maintenance** — degradation analysis, fault prediction via SCADA analytics
- **Weather Forecast** — 7-day forecast integration via Open-Meteo API per park location
- **PPA Management** — Power Purchase Agreement CRUD with status workflow
- **Solar & Storage** — support for solar parks and battery storage assets
- **Investor Reports** — quarterly investor PDF reports with modular sections
- **B2C UI Polish** — 15 measures including typography, contrast, onboarding wizard, mobile nav
- **Design System Document** — 773-line design system specification
- **Command Palette** — Cmd+K live search with keyboard navigation
- **Filter Feedback** — visual filter indicators with active filter count
- **Widget Visibility** — per-role dashboard widget configuration
- **Notification Deadlines Tab** — deadline tracking in notification center
- **Three-language system** — Deutsch (formell), Deutsch (Du), English
- **Fund-specific SMTP** — individual email sending per Gesellschaft
- **VirtualTable component** — virtualized rendering for 500+ row tables
- **Import validation** — client-side validation for CSV/Excel imports
- **API cache infrastructure** — Redis-backed response caching
- **Health check & offline indicator** — system health monitoring, offline detection, slow-query logging
- **SSO/OIDC login** — Authentik integration via NextAuth provider

### Changed
- **Design System Compliance** — 343 files updated to match design tokens (loading.tsx, error.tsx, EmptyState, Badge variants)
- **Code Audits** — 15 systematic audits completed, all findings resolved:
  - Audit 2: Performance optimizations (N+1 queries)
  - Audit 3: Zod validation + TypeScript fixes
  - Audit 6: Error handling gaps closed
  - Audit 7: N+1 query optimizations
  - Audit 8: 13 accessibility issues fixed
  - Audit 9: API response format standardized, `parsePaginationParams()` in 32 routes, `handleApiError()` in 114 routes, status colors centralized
  - Audit 10: .env.example updated
  - Audit 14: API response format standardized
  - Audit 16: Circular dependency auth/permissions resolved
- **Major package upgrades** — Next.js 16, React 19, Prisma 7, Tailwind CSS 4, Zod 4, Recharts 3, Node.js 24
- **SWR to React Query migration** — all 35 data-fetching files migrated to useQuery/useApiQuery
- **Admin sidebar consolidation** — 26 to 15 entries with tabbed pages
- **Accounting sidebar consolidation** — 18 to 8 entries with lazy-loaded tabs
- **Sidebar restructured** — 9 top-level groups (Windparks, BF, Grundstuecke, Kommunikation, Berichte as separate groups)
- **Dashboard** — widget tile grid with free positioning, system font
- **Brand color** — warm navy palette (primary light `#335E99`, dark `#598ACF`)
- **Console.error replaced** — structured pino logger in 14 locations
- **Dead code removal** — 2 unused hooks, 2 unused exports, 1 unused package (swr)
- **Hardcoded values centralized** — security and config constants extracted

### Fixed
- **E2E test stability** — auth timeouts, serial-to-parallel execution, strict-mode violations (.or() chains removed)
- **ESLint cleanup** — warnings reduced from 108 to 0, JSX in try/catch, unused vars, setState-in-effect
- **Security hardening** — XSS fixes, IDOR fixes, cookie security, Excel injection prevention, tenant isolation in 6+ API routes
- **GIS bugs** — polygon disappearing after save (race condition), create-panel not shown (reducer bug), state overwrite bugs, dark mode, coordinate search
- **Cookie secure:true on HTTP** — broke auth completely on local network deployments
- **Prisma 7 migration issues** — config file, URL handling, JSON null filters, db push flags
- **Dashboard error display** — error messages now shown in production (not just dev)
- **Fund distribution rounding** — compensation for rounding errors in distribution calculations
- **Invoice decimal serialization** — Prisma Decimal string concatenation fixed to Number addition
- **Invoice MwSt display** — grouped by item tax rates instead of invoice-level 0%
- **LegalForm duplication** — +/& normalization in 5 PDF templates
- **Sidebar system group** — superadmin menu restored after consolidation
- **Onboarding banner** — setState in useEffect error resolved
- **Recharts 3 TypeScript errors** — all chart components updated
- **Redis noeviction policy** — compact pino logs in production

## [0.5.0] — 2026-03-28

### Added
- **GIS Module** — Leaflet map, plot/cable drawing, layer management, tile switching, coordinate search, Shapefile import, area report, lease status colors, buffer zones, heatmap, annotations CRUD, plot split/merge/bulk API
- **QGIS Integration** — 7-step import wizard, project import, template export, roundtrip (export + re-import with update), layer color and transparency configuration
- **Document Explorer** — virtual folder structure, ZIP download, Steuerberater export, drag & drop upload
- **Market Value Comparison** — SMARD API (BnetzA), monthly averages, bar chart EEG vs. market price
- **Design Overhaul** — sidebar navy, header branding, KPI spacing, landing page (hero, trust bar, CTAs, footer badges), marketing video upload
- **Admin Consolidation** — 26 to 15 sidebar entries, 5 tabbed pages, 14 redirect stubs
- **Full-Stack Security Audit** — XSS fix, IDOR fixes, cookie security, Excel injection, soft-delete
- **Soft-Delete** — deletedAt for Park, Fund, Lease, Contract, Document via Prisma Extension
- **Notes field** — free-text notes on Park and Turbine models

### Fixed
- **Cookie secure:true** on HTTP breaking auth
- **GIS critical bugs** — create-panel, polygon persistence, reducer state overwrites
- **Fund distribution rounding** compensation
- **Document Explorer API** bugs from test audit

## [0.4.0] — 2026-03-15

### Added
- **Lexware Features Phase 1-4** — EUER, GuV, cost center report, budget comparison, quotes with status workflow (DRAFT to INVOICED), liquidity planning, OCR re-trigger, multibanking (bank account CRUD, CSV parser), ZM/EU reporting (BZSt XML export)
- **Backup Service** — TimescaleDB-compatible, daily/weekly/monthly cron, retention 7/4/3, on-demand via Docker profile
- **n8n SCADA Integration** — API endpoints for file upload and import trigger, PowerShell upload script, Windows scheduled task, n8n workflow

### Changed
- **Accounting sidebar** — 18 to 8 entries with tab pages and lazy loading
- **16 granular feature flags** for upselling

## [0.3.0] — 2026-03-08

### Added
- **Buchhaltungspaket** (all 4 phases) — SKR03 chart of accounts, auto-booking, SuSa, BWA, UStVA, bank import, dunning, SEPA XML, depreciation (AfA), cash book, DATEV export, annual closing
- **DSGVO Art. 15+17** — data export and account deletion
- **Demo Request** — `/register` marketing page with API endpoint
- **Paperless-ngx Addon** — feature-flag-controlled, API client, BullMQ queue/worker, 7 API routes, browser page, sync button, auto-archive hooks

### Changed
- **Brand color** — warm navy palette applied across CSS vars, charts, sidebar dark mode

### Fixed
- **PDF layout** — address block spacing (DIN 5008), sender line duplication
- **Invoice detail** — MwSt grouping by item tax rates, Prisma Decimal serialization
- **LegalForm duplication** — +/& normalization in 5 templates
- **CRM** — contact edit dialog and API extension
- **Invoices** — sortable column headers (number, type, sender, recipient, date, amounts, status)

## [0.2.0] — 2026-02-25

### Added
- **Dashboard Grid System** — 12-column grid, react-grid-layout, widget registry, default layouts
- **Energy/SCADA** — Enercon WSD/UID file import, 22 file types, anomaly detection, power curve, wind rose
- **RBAC** — role-based access control with granular permissions
- **Fund Hierarchy** — parent/child fund relationships
- **i18n** — German + English with next-intl
- **Security Audit** — comprehensive security review and fixes

### Changed
- **Spring cleaning** — 24 files deleted, -7,959 lines of dead code, 3 unused npm dependencies removed
