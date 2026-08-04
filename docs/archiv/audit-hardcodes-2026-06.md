# Audit: Hardcoded Werte & Texte — 2026-06-04

Drittes Audit nach den Welle-1-5-Refactors. Drei parallele Agents haben Business-Werte, UI-Texte und Config-Konstanten unabhängig analysiert.

**Quintessenz:** ~80 Fundstellen, davon **5 KRITISCH**, **15 HOCH**, **~60 MEDIUM**. Die kritischen Stellen sind alle korrigierbar in <1 Tag; die Mehrheit sind UI-Texte (`error.tsx`-Template ×196).

---

## A. Business-Werte (Tax / Skonto / Mahnung / SKR-Konten / Retention)

### KRITISCH

**A-1 · Hardcoded 30-Tage-Fallback bei fehlender `dueDate`**
- [src/lib/accounting/reports/liquidity.ts:165](src/lib/accounting/reports/liquidity.ts#L165), [:177](src/lib/accounting/reports/liquidity.ts#L177)
- [src/app/api/buchhaltung/angebote/[id]/convert/route.ts:42](src/app/api/buchhaltung/angebote/[id]/convert/route.ts#L42)
- Code: `const date = inv.dueDate || new Date(inv.invoiceDate.getTime() + 30 * 86400000);`
- → `paymentTermDays` aus `getTenantSettings(tenantId)` laden — Tenants mit 14-Tage-Terms werden sonst falsch kalkuliert

### HOCH

**A-2 · `DEFAULT_ROUNDING_TOLERANCE_EUR = 0.02` hardcoded**
- [src/lib/banking/skonto-matcher.ts:19](src/lib/banking/skonto-matcher.ts#L19)
- → `bankMatchToleranceEur` aus `getTenantSettings()` (Field existiert bereits!)

**A-3 · `RETENTION_POLICY` als `as const` — Settings-Felder ignoriert**
- [src/lib/retention/retention-service.ts:33-43](src/lib/retention/retention-service.ts#L33-L43)
- TenantSettings hat `gobdRetentionYearsInvoice/Contract` (Zeile 149-150) — wird vom Service NICHT gelesen
- → Service umstellen auf `getTenantSettings(tenantId)`

**A-4 · `reminderDays1-3` + `reminderFee1-3` Defaults dupliziert**
- [src/lib/tenant-settings.ts:154-159](src/lib/tenant-settings.ts#L154-L159) (Source of Truth)
- [src/app/api/admin/tenant-settings/route.ts:158-163](src/app/api/admin/tenant-settings/route.ts#L158-L163) (Duplikat)
- → Re-Import aus `tenant-settings.ts` statt Doppelung

### MEDIUM (gesetzlich fix — Kommentar genügt)

**A-5 · `AWV_THRESHOLD_EUR = 12500`** ([src/lib/accounting/awv-check.ts:15](src/lib/accounting/awv-check.ts#L15)) — §67 AWV, korrekt fix
**A-6 · `GWG_SOFORT_THRESHOLD_NET_EUR = 800`** ([src/lib/accounting/afa.ts:52-68](src/lib/accounting/afa.ts#L52-L68)) — §6 EStG, korrekt fix. Aber: Konstanten und `DEFAULT_AFA_CONFIG` dupliziert → eine Quelle wählen
**A-7 · `KLEINBETRAG_THRESHOLD_EUR = 250`** ([src/lib/accounting/incoming-invoice-validator.ts:39](src/lib/accounting/incoming-invoice-validator.ts#L39)) — §33 UStDV, korrekt fix

### Hinweis (für später)
**A-8 · Contract-Reminder-Tage in `business-thresholds.ts`** sind zentral, aber nicht pro-Tenant konfigurierbar — Feature-Request, kein Bug.

---

## B. UI-Texte (i18n-Lücken)

### KRITISCH

**B-1 · `error.tsx` Template in ~196 Routen identisch hardcoded**
- Stichprobe: [src/app/(dashboard)/admin/access-report/error.tsx:27-29](src/app/(dashboard)/admin/access-report/error.tsx#L27-L29)
- Code:
  ```tsx
  <CardTitle>Ein Fehler ist aufgetreten</CardTitle>
  <CardDescription>Bitte versuchen Sie es erneut...</CardDescription>
  <Button>Erneut versuchen</Button>
  ```
- → Vereinheitlichen über `<RouteErrorBoundary />` (existiert bereits seit Welle 3 in `src/components/ui/route-error-boundary.tsx`) — alle 196 Files ersetzen durch 5-Zeilen-Wrapper
- **Impact:** Größte Einzelmaßnahme. ~80% aller i18n-Schmerzen.

### HOCH

**B-2 · Admin-Forms mit hardcoded Zod-Messages + Labels**
- [src/components/admin/RoleManagement.tsx:82-84](src/components/admin/RoleManagement.tsx#L82-L84) — `"Name ist erforderlich"`, `"Ungültiger Farbcode"`
- [src/components/admin/UserManagement.tsx:165-169](src/components/admin/UserManagement.tsx#L165-L169) — 5 Validations + `moduleLabels` als String-Map
- [src/components/admin/billing-rules/rule-form.tsx:56,70-89](src/components/admin/billing-rules/rule-form.tsx#L56) — `RULE_TYPE_LABELS`, `RULE_TYPE_DESCRIPTIONS`, `FREQUENCY_LABELS` als String-Maps
- [src/components/admin/feature-flags-tab.tsx:94-133](src/components/admin/feature-flags-tab.tsx#L94-L133) — `FLAG_LABELS`, `MODULE_LABELS`, `ACCOUNTING_SUB_LABELS`
- → Alle Komponenten nutzen bereits `useTranslations` — nur Keys ergänzen
- → Zod-Helper bauen: `createValidationSchema(t)` für wiederverwendbare Messages

**B-3 · Bank-Update-Requests Page**
- [src/app/(dashboard)/admin/bank-update-requests/page.tsx:43,60,64,77](src/app/(dashboard)/admin/bank-update-requests/page.tsx#L43) — `confirm("...freigeben?")`, `toast.success("Freigegeben")`, Headline
- → Komponente nutzt schon `useTranslations` → Keys hinzufügen

### MEDIUM

**B-4 · `MaintenanceModeTab` Default-Message**
- [src/components/admin/maintenance-mode-tab.tsx:26](src/components/admin/maintenance-mode-tab.tsx#L26)
- → `t("defaultMessage")` (Component hat schon `useTranslations`)

**B-5 · `AnalyticsDashboard` ohne i18n**
- [src/components/admin/analytics-dashboard.tsx:70,81](src/components/admin/analytics-dashboard.tsx#L70) — "Lade Analytics-Daten…", "Erneut versuchen"
- → `useTranslations()` einführen

**B-6 · `ResourceAccessDialog` Error-Strings**
- [src/components/admin/ResourceAccessDialog.tsx:309,360](src/components/admin/ResourceAccessDialog.tsx#L309) — `throw new Error("Fehler beim Speichern")`
- → i18n + apiError-Codes

---

## C. Config-Konstanten (Pagination / Limits / Locale / Timeouts)

### KRITISCH

**C-1 · Pagination-Fragmentierung — `PAGE_SIZE_*` ignoriert in 8 Stellen**
| Datei | Aktuell | Sollte |
|---|---|---|
| [src/lib/crm/person-dedup.ts:86](src/lib/crm/person-dedup.ts#L86) | `take: 20` | `PAGE_SIZE_DEFAULT` |
| [src/hooks/useDocumentExplorer.ts:25,80](src/hooks/useDocumentExplorer.ts#L25) | `limit: 20` | `PAGE_SIZE_DEFAULT` |
| [src/app/(dashboard)/news/page.tsx:98-100](src/app/(dashboard)/news/page.tsx#L98-L100) | `limit: 20` | `PAGE_SIZE_DEFAULT` |
| [src/lib/crm/contact-360.ts:311,331](src/lib/crm/contact-360.ts#L311) | `take: 50` | `PAGE_SIZE_LARGE` |
| [src/lib/crm/contact-360.ts:358](src/lib/crm/contact-360.ts#L358) | `take: 100` | `PAGE_SIZE_DROPDOWN` |
| [src/lib/crm/expiring-items.ts:298,129](src/lib/crm/expiring-items.ts#L129) | `take: 100` | `PAGE_SIZE_DROPDOWN` |
| [src/app/api/buchhaltung/sepa/route.ts:30](src/app/api/buchhaltung/sepa/route.ts#L30) | `take: 50` | `PAGE_SIZE_LARGE` |

### HOCH

**C-2 · File-Upload-Limits in 7 verschiedenen Dateien hardcoded**
| Datei | Limit | Zweck |
|---|---|---|
| [src/components/settings/LetterheadSettings.tsx:202,229](src/components/settings/LetterheadSettings.tsx#L202) | 2 MB / 5 MB | Header / PDF-Hintergrund |
| [src/app/api/admin/marketing-video/route.ts:20](src/app/api/admin/marketing-video/route.ts#L20) | 100 MB | Marketing-Video |
| [src/components/gis/GISToolbar.tsx:99](src/components/gis/GISToolbar.tsx#L99) | 20 MB | GIS-Import |
| [src/app/api/energy/scada/upload/route.ts:21,23](src/app/api/energy/scada/upload/route.ts#L21) | 500 MB / 100 MB | SCADA-Upload |
| [src/app/api/inbox/route.ts:93](src/app/api/inbox/route.ts#L93) | 50 MB | Inbox-Attachment |
| [src/app/api/journal-entries/[id]/attachments/route.ts:26](src/app/api/journal-entries/[id]/attachments/route.ts#L26) | 25 MB | Journal-Attachment |

→ `src/lib/config/upload-limits.ts` erweitern um genannte Keys, alle Stellen migrieren (env-überschreibbar)

**C-3 · `"de-DE"` Locale 8× hardcoded statt zentrale `LOCALE`-Konstante**
- [src/components/invoices/WriteOffDialog.tsx:42](src/components/invoices/WriteOffDialog.tsx#L42), [settlement-details-card.tsx:101,108](src/components/invoices/settlement-details-card.tsx#L101)
- [src/components/crm/activity-timeline.tsx:238,243,254](src/components/crm/activity-timeline.tsx#L238)
- → `formatCurrency()` / `formatDate()` aus `src/lib/format.ts` nutzen (existiert!)

**C-4 · HTTP-Timeouts ungeordnet (5s / 30s / 2s)**
- [src/lib/queue/workers/webhook.worker.ts:39](src/lib/queue/workers/webhook.worker.ts#L39) — `5000` (Webhook-Fetch-Abort)
- [src/lib/paperless/client.ts:168](src/lib/paperless/client.ts#L168) — `30000` (Paperless-Upload)
- [src/app/api/admin/system/status/route.ts:27](src/app/api/admin/system/status/route.ts#L27) — `2000` (Health-Check)
- → In `api-limits.ts` zentralisieren

**C-5 · BullMQ Retry-Counts inkonsistent (`2` vs `3`)**
- [src/lib/queue/workers/reminder.worker.ts:141](src/lib/queue/workers/reminder.worker.ts#L141) — `attempts: 2`
- Andere Worker: `3` (queue-config.ts)
- → Entweder explizit dokumentieren warum Reminder nur 2, oder vereinheitlichen

### MEDIUM

**C-6 · API-Default-Limits stark unterschiedlich pro Route** — kategorisieren als `PAGE_SIZE_API_LIST`, `PAGE_SIZE_LANDING`, `PAGE_SIZE_LARGE_DATASET`
**C-7 · MIME-Type-Listen in 3 Komponenten dupliziert** — `mime-types.ts` neu
**C-8 · Paperless-Page hardcoded `pageSize = 25`** — sollte `PAGE_SIZE_DEFAULT`

---

## Priorisierter Fix-Plan

| Welle | Aufwand | Files | Mehrwert |
|---|---|---|---|
| **6A** Business-Critical | ½ Tag | 4 | A-1, A-2, A-3, A-4 — direkter Tenant-Bug-Risk |
| **6B** Error-Pages-Unification | ½ Tag | 196 → Codemod | B-1 — größter UI-Impact bei kleinstem Code |
| **6C** Admin-Forms i18n | 1 Tag | 5 | B-2, B-3, B-4 — Admin-UX |
| **6D** Pagination-Codemod | ½ Tag | 8 | C-1 — Konsistenz |
| **6E** Upload-Limits zentralisieren | ½ Tag | 7 | C-2 — Env-Override-Support |
| **6F** Locale/Format Cleanup | ½ Tag | 4 | C-3 — i18n-Korrektheit |
| **6G** Timeouts/Retry Konsolidierung | ½ Tag | 5 | C-4, C-5 — Observability |

**Empfehlung Reihenfolge:** 6A (Bug-Risk) → 6B (UI-Impact) → 6D (Quick-Win) → 6C → 6E → 6F → 6G
