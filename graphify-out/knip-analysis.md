# Knip Dead-Code Audit — WPM (WindparkManager)

**Tool:** `knip@6.25.0` · **Run:** 2026-07-08 · **Config:** default (no `knip.json` in repo)
**Reports:** `knip-report.json` (raw) · `knip-parsed.json` (aggregated)

---

## 1. Executive Summary

| Kategorie | Count |
|---|---|
| Unused files | **39** |
| Unused exports | **855** |
| Unused types | **384** |
| Unused dependencies | **9** |
| Unused devDependencies | **6** |
| Duplicate exports (named+default) | **23** |
| Unlisted imports (used, not in package.json) | **52** |

**Wichtig:** Von den 855 Exports stecken ~60 % in `**/index.ts` Barrel-Files (Queue/PDF/Weather/Email/Dashboard/Billing). Direkt-Imports umgehen die Barrels — die Exports sind nicht "tot", die Barrels sind bloß nicht der Import-Pfad. Löschen einzelner Exports darin ist riskant und meist wenig lohnend; besser: Barrels als Ganzes bewerten.

---

## 2. SAFE — vermutlich sicher löschbar (10-15)

Diese Files haben KEINE Referenzen im Code (auch nicht via String/dynamic import geprüft):

| # | Pfad | Warum sicher |
|---|---|---|
| 1 | `src/hooks/useT.ts` | Grep zeigt: nur Self-Reference. Projekt nutzt next-intl `useTranslations` direkt. |
| 2 | `src/hooks/useUnreadNotifications.ts` | Kein Consumer im Code. |
| 3 | `src/lib/api-error-client.ts` | Ersetzt durch `@/lib/api-errors`. |
| 4 | `src/lib/client-fetch.ts` | Nicht importiert. |
| 5 | `src/lib/db-health-check.ts` | Kein Referenz — /admin nutzt eigene Health-Route. |
| 6 | `src/lib/security/safe-path.ts` | Nicht importiert. |
| 7 | `src/lib/bank-import/csv-parser.ts` + `src/lib/bank-import/index.ts` | Bank-Import läuft über anderen Parser. |
| 8 | `src/lib/energy/solar-performance.ts` | Kein Consumer (Solar noch nicht MVP). |
| 9 | `src/lib/weather/dwd-client.ts` | DWD-Client wurde ersetzt/nicht ausgerollt. |
| 10 | `src/lib/email/weekly-digest.tsx` | Nicht in Queue oder Cron referenziert. |
| 11 | `src/lib/queue/workers/webhook.worker.ts` | **Nicht in `workers/index.ts` registriert** — Worker wird nie gestartet. Achtung: Falls Webhook-Feature geplant, hier prüfen. |
| 12 | `src/components/ui/loading-button.tsx` | Codebase nutzt Standard `<Button>` + `disabled/loading`-Prop. |
| 13 | `src/components/ui/toast-helpers.ts` + `src/components/ui/toaster.tsx` | Projekt nutzt `sonner` direkt via `import { toast } from "sonner"`. |
| 14 | `src/components/ui/amount-input.tsx` | Nur eine Instanz einer sonst nicht verwendeten Custom-Input-Variante. |
| 15 | Barrels ohne Consumer: `src/lib/scada/index.ts`, `src/lib/shapefile/index.ts`, `src/lib/dashboard/index.ts`, `src/components/admin/system-config/index.ts` | Alle direkt-Imports umgehen die Barrels. |

**Unused deps (SAFE zu entfernen):**
- `@radix-ui/react-accordion` (Accordion nicht mehr verwendet)
- `@tanstack/react-table`, `@tanstack/react-virtual` (bewusst zu shadcn/plain-Tables migriert)
- `zustand` (State ist Server-driven / React Context)
- `@uppy/dashboard`, `@uppy/drag-drop`, `@uppy/progress-bar`, `@uppy/react` (Upload läuft via uploader-v2)
- `@types/uuid` (crypto.randomUUID())

**Unused devDeps (SAFE):**
- `@eslint/eslintrc` (flat config → nicht mehr benötigt)
- `@types/bcryptjs` (bcryptjs bringt eigene Types)
- `@types/react-grid-layout`

---

## 3. CAUTION — manuell prüfen bevor entfernen

| Pfad | Grund für Vorsicht |
|---|---|
| `src/components/energy/analytics/market-comparison.tsx` | API-Route `/api/energy/analytics/market-comparison` existiert und wird von der Komponente aufgerufen. Entweder Feature war rausgenommen → beide löschen, oder Dynamic-Import fehlt irgendwo. **User klären.** |
| `src/components/dashboard/widgets/since-last-visit-widget.tsx` | Registry-Entry existiert in `widget-registry.ts:334` ("Opt-in"), aber `widget-renderer.tsx` lädt die Komponente **nicht**. Fehlender Loader-Case → entweder Renderer nachrüsten oder Registry-Entry + Widget + `/api/dashboard/since-last-visit/route.ts` zusammen entfernen. |
| `src/components/energy/reports/energy-report-builder.tsx`, `load-config-dialog.tsx`, `save-config-dialog.tsx` | Report-Builder-UI. Prüfen ob Feature bewusst offline gestellt wurde. |
| `src/components/buchhaltung/LiquidityIndicatorWidget.tsx` | Dashboard-Widget-Kandidat — Registry checken. |
| `src/components/admin/ResourceAccessDialog.tsx` | Admin-Dialog. Prüfen ob per String/Route referenziert. |
| `src/types/reports.ts` | Report-Types — evtl. Prisma-Generic-Verwendung. |
| Alle 20 duplicate exports (named + default in Email-Templates, Route-ErrorBoundary, SafeHtml, RichTextEditor …) | Bewusstes Pattern: named für Tests + default für React-Email. **NICHT anfassen** — nur konsolidieren wenn ohnehin Refactor. |
| Barrel-Exports in `src/lib/queue/index.ts` (77), `workers/index.ts` (58), `pdf/index.ts` (44), `weather/index.ts` (38) | Barrel-Files, deren Einzelexports von direkten Import-Pfaden umgangen werden. Barrel kann bleiben (Public-API-Fassade), Löschen einzelner Zeilen bringt kaum Wert. |
| `src/config/nav-config.ts` (57 unused exports) | Nav-Config wird zur Laufzeit via Objekt-Traversierung genutzt — knip kann String-Lookup nicht sehen. **NICHT löschen.** |
| Alle 52 "unlisted imports" `@prisma/client-runtime-utils` | Prisma-interne Utility, wird beim Runtime von Prisma-Client aufgelöst. In `package.json` als Transitive vorhanden. Keine Action nötig. |

---

## 4. DANGER / False-Positives — NIEMALS löschen

- **`e2e/auth.setup.ts`** — Playwright-Setup-Project (`playwright.config.ts` testMatch `.setup.ts`). Läuft vor allen E2E-Tests.
- **`public/pdf.worker.min.mjs`** — wird via `pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"` in `DocumentPreviewDialogPDF.tsx:62` zur Laufzeit geladen. Muss im Bundle bleiben.
- **`prisma/migrate-*.ts`** — Einmal-Migrations-Skripte für Prod-DB. Nicht in Runtime-Code, aber **im Repo lassen** als Audit-Trail. (Alternativ nach `docs/migrations-archive/` verschieben.)
- **`scripts/*.ts`** (backfill/encrypt-webhook-secrets/post-deploy) — CLI-Ops-Skripte, per `tsx` gestartet, kein statischer Import. **Behalten.**
- Alles unter `src/app/**/route.ts`, `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `middleware.ts`, `instrumentation.ts` — Next.js file-based routing (knip meldet für dieses Repo hier nichts, aber als Regel notieren).
- **`src/messages/*.json`** — i18n-Keys per String-Zugriff.
- **BullMQ-Queue-Definitionen** — auch wenn knip Exports als "unused" flaggt, werden Job-Handler per Job-Name aus DB-Payloads getriggert.

---

## 5. Empfohlene erste Aktion (Top 10, hoher Value / niedriges Risiko)

Ein einziger PR:

1. `git rm src/hooks/useT.ts`
2. `git rm src/hooks/useUnreadNotifications.ts`
3. `git rm src/lib/api-error-client.ts`
4. `git rm src/lib/client-fetch.ts`
5. `git rm src/lib/db-health-check.ts`
6. `git rm src/lib/security/safe-path.ts`
7. `git rm src/components/ui/loading-button.tsx src/components/ui/toast-helpers.ts src/components/ui/toaster.tsx src/components/ui/amount-input.tsx`
8. `git rm src/lib/email/weekly-digest.tsx`
9. `git rm src/lib/energy/solar-performance.ts src/lib/weather/dwd-client.ts src/lib/bank-import/csv-parser.ts src/lib/bank-import/index.ts`
10. `npm uninstall @radix-ui/react-accordion @tanstack/react-table @tanstack/react-virtual zustand @uppy/dashboard @uppy/drag-drop @uppy/progress-bar @uppy/react @types/uuid` + devDeps `@eslint/eslintrc @types/bcryptjs @types/react-grid-layout`

**Verifikation vor Commit (Memory-Regel):**
```
npx tsc --noEmit && npm run lint && npm run build
```
Alle 3 müssen grün sein. **Wenn Build failed → rollback.**

**Follow-up-Entscheidungen für User (getrennter PR):**
- Report-Builder-Komponenten: aktivieren oder löschen?
- `webhook.worker.ts`: Feature einführen oder Queue+Worker+Route zusammen entfernen?
- `since-last-visit-widget`: Renderer nachrüsten oder komplett entfernen (Registry + Widget + API-Route)?
- `market-comparison`: Feature reaktivieren oder Component+Route entfernen?

---

*Erzeugt aus `knip-report.json` (173 KB) via `node knip-analysis.mjs`. Für Detail-Item-Listen der 855 Exports / 384 Types siehe `knip-parsed.json`.*
