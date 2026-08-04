# WPM Komplett-Audit 2026-06-26

Vier parallele Audit-Spuren mit den neu installierten Skills (refactoring-ui, ux-heuristics, stop-slop, humanizer, anthropics/skills). Aktueller Code-Stand: alles bis `0fce6ec` (Welle 6 + R-6 + R-10 + Welle A+B + C6 + i18n-Sync + Cleanups) gepusht.

**Gesamtergebnis:** ~80 Findings. Davon **3 KRITISCH (echte Bugs)**, **~20 HOCH (Quality + Konsistenz)**, Rest Polish.

---

## ⚠ KRITISCH (echte Bugs / Bug-Risiko)

### K-1 · `paymentTermDays ?? 14` Fallback ignoriert TenantSettings
- **Datei:** [src/lib/management-billing/invoice-creator.ts:158](src/lib/management-billing/invoice-creator.ts#L158)
- **Was:** `?? 14` als Hartz-Fallback wenn `paymentTermDays` aus Param nicht gesetzt — sollte aus `getTenantSettings(tenantId).paymentTermDays` kommen (Default ist 30)
- **Risiko:** Tenants mit 30-Tage-Frist bekommen 14-Tage-Rechnungen, wenn der Caller den Param vergisst
- **Fix:** ~10 min

### K-2 · useEffect ohne Memoization → potenzielle Infinite-Loop
- **Datei:** [src/app/(dashboard)/admin/sidebar-links/page.tsx:121](src/app/(dashboard)/admin/sidebar-links/page.tsx#L121)
- **Was:** `useEffect(() => { load(); }, []);` — `load` wird in jedem Render neu erzeugt, kein cleanup
- **Risiko:** Wenn `load()` State setzt, der erneut `load()` triggert → infinite loop oder Memory-Leak
- **Fix:** `useCallback` für `load` + cleanup mit `cancelled`-Flag (Pattern aus R-10 Roles-Page); ~20 min

### K-3 · Silent Error-Swallowing in useAnalytics
- **Datei:** [src/hooks/useAnalytics.ts:58-60](src/hooks/useAnalytics.ts#L58)
- **Was:** `catch { /* nothing */ }` ohne Logging
- **Risiko:** Cache-Fehler bleiben unsichtbar, schwer zu debuggen wenn Analytics stumm bleibt
- **Fix:** `logger.warn` ergänzen; ~5 min

---

## HOCH (Quality + Tech-Debt)

### Hardcoded Werte (Welle 3 nach Welle 6)

| # | Kategorie | Stellen | Wo | Lösung |
|---|---|---|---|---|
| H-1 | HTTP-Status-Codes Magic-Numbers | ~25 Stellen | Pages + Components | Neue Datei `src/lib/config/http-status.ts` mit `HTTP_STATUS = { OK: 200, NOT_FOUND: 404, ... }` + Codemod |
| H-2 | Cron-Expressions hardcoded | 3 Files | retention-cron, report, reminder queues | `src/lib/config/cron-schedules.ts` |
| H-3 | MIME-Type-Listen inline | 3 Komponenten | step-documents, JournalAttachmentsList, proxy-document-upload | `src/lib/config/mime-types.ts` mit `MIME_TYPES.PDF`, `IMAGES`, `DOCUMENTS` |
| H-4 | External-API-URLs hardcoded | 6 Files | openmeteo, smard-client, dwd-client, sendgrid | env-vars `OPENMETEO_FORECAST_URL`, `SMARD_BASE_URL`, etc. |
| H-5 | Cache-TTLs in Widgets hardcoded | 5+ Stellen | query-provider, scada-kpi-cards, weather-widget | `src/lib/config/cache-ttl.ts` |
| H-6 | Cookie max-age 31536000 inline | language-switcher | `LANGUAGE_COOKIE_MAX_AGE_SECONDS` Konstante |

### Code-Quality

| # | Was | Wo | Fix |
|---|---|---|---|
| Q-1 | 16+ `any`-Typen in API-Routes | fund-categories, settlement/calculate, mailings/send, settlement/review | Prisma-Type-Guards / Zod-Validation |
| Q-2 | `any[]` für SSO-Providers | [src/lib/auth/index.ts:62](src/lib/auth/index.ts#L62) | Eigener Typ |
| Q-3 | `let awsSes: any` | [src/lib/email/provider.ts:300](src/lib/email/provider.ts#L300) | `SESClient \| null` |
| Q-4 | Doppelte Email-Transport-Init | [src/app/api/admin/system-config/test/route.ts:99,148](src/app/api/admin/system-config/test/route.ts#L99) | Helper `createEmailTransport()` |
| Q-5 | Inkonsistente Auth/Error-Patterns | ~250 Routes | nicht alle nutzen `apiError()` + `requirePermission()` einheitlich |

### UX-Copy (Humanizer-Pass)

| # | Datei | Aktuell | Vorschlag |
|---|---|---|---|
| C-1 | [EditTurbineDialog.tsx:240](src/app/(dashboard)/parks/turbine-dialogs/EditTurbineDialog.tsx#L240) | `"Gesellschaft waehlen"` | `"Gesellschaft wählen"` (Umlaut!) |
| C-2 | [EditTurbineDialog.tsx:290](src/app/(dashboard)/parks/turbine-dialogs/EditTurbineDialog.tsx#L290) | `"Status waehlen"` | `"Status wählen"` |
| C-3 | [TenantEmailServerSettings.tsx:128](src/components/settings/TenantEmailServerSettings.tsx#L128) | `"Failed to load"` | `"Konfiguration konnte nicht geladen werden"` |
| C-4 | [notification-bell.tsx:138](src/components/layout/notification-bell.tsx#L138) | `throw new Error("Failed")` | deutsch + Kontext |
| C-5 | [data-comparison-tab.tsx:122](src/components/energy/analytics/data-comparison-tab.tsx#L122) | `"Failed to load"` | `"Daten konnten nicht geladen werden"` |
| C-6 | [data-explorer-tab.tsx:175](src/components/energy/analytics/data-explorer-tab.tsx#L175) | `"Failed to load"` | dito |
| C-7 | [node-detail-panel.tsx:108](src/components/energy/topology/node-detail-panel.tsx#L108) | Fallback zu Status-Code-String | `NODE_STATUS_LABELS[status] ?? "Unbekannt"` |
| C-8 | [HgbComplianceSettings.tsx:145](src/components/settings/HgbComplianceSettings.tsx#L145) | `"Speichern fehlgeschlagen"` | `"HGB-Einstellungen konnten nicht gespeichert werden"` |

### UX/Visual

| # | Was | Wo | Fix |
|---|---|---|---|
| U-1 | Hardcoded Farben in Inbox-KPIs | [src/app/(dashboard)/inbox/page.tsx:259-274](src/app/(dashboard)/inbox/page.tsx#L259) | `text-warning` / `text-success` Tokens statt `text-orange-500` |
| U-2 | Sortable Headers unsichtbar wenn nicht aktiv | invoices-Liste | `<ArrowUpDown opacity-20 />` permanent zeigen |
| U-3 | Tabular-Numerals inkonsistent | viele Tabellen | Globale `<TabularCell>` oder konsequent `tabular-currency`-Class auf alle Currency-Spalten |
| U-4 | EmptyState Icon-Größen inkonsistent | mehrere | 32px vs 48px — vereinheitlichen auf 48px |
| U-5 | Eyebrow-Sättigung im Dashboard | DashboardHero + alle Widgets mit "Heute" | Hero ist single Zeitstempel-Source |
| U-6 | SEPA-Batch-Tabelle: Status nur Badge ohne Icon | SEPA-Page | Doppel-Kodierung: Icon + Badge |

---

## MEDIUM (Polish)

- Approvals: Bei `expiresAt < 24h` ein roter Dot/Urgency-Indikator auf der Card
- Permissions 2-Pane Sticky-Footer: prüfen ob unten am Screen sichtbar bei niedrigerer Viewport-Höhe
- Contract-Liste: bei `differenceInDays(endDate, today) < 30` farbiger Border-Left
- Skeleton-Rows in SEPA-Tabelle haben falsche Spaltenzahl
- Inline-Edit in CRM-Tabellen: Multi-Cell-Edit-Race verhindern (nur EINE Cell gleichzeitig editierbar)
- `// FIXED BY LAW`-Kommentar bei `AWV_THRESHOLD_EUR = 12500`, `GWG_SOFORT_THRESHOLD = 800` ergänzen
- 90%-Fallback in [settlement/calculator.ts:671](src/lib/settlement/calculator.ts#L671) als Branchenpraxis kommentieren
- Audit-Kommentare im Code (`// Audit-B: ...`) — gehören in PR-Beschreibung statt Repo

---

## Neue Ideen (Mehrwert / nicht direkt aus Findings)

### A. Status-Label-Konsistenz-Lib
Ein zentrales Mapping `src/lib/status-labels.ts` für ALLE Enum-Werte (Invoice-Status, Contract-Status, Turbine-Status, etc.). Heute haben Komponenten verstreut `STATUS_VARIANTS` / `STATUS_LABELS` / Fallback-zu-Code. Zentral: ein Lookup mit i18n + Icon + Tone.

### B. Health-Indicator im Header
Kleiner farbiger Dot rechts neben dem User-Avatar: grün = alle Systeme grün (DB ok, Queue-Workers laufen, letztes Backup OK), gelb = Warning, rot = was kaputt. Click öffnet das `/admin/system/status`-Modal. Reuse-Pattern existiert.

### C. Permission-Why-Tooltip
Wenn ein Button/Action für den User `disabled` ist, hover-Tooltip mit dem Grund: "Du brauchst `invoices:update` für diese Aktion". Hilft beim Onboarding neuer Mitarbeiter. Verbindbar mit der existierenden `tooltipDisabled`-Prop aus C6.

### D. Conflict-Warnung bei Multi-User-Edit
Wenn zwei User dieselbe Rechnung/Vertrag öffnen, ein dezenter Badge "Lisa M. schaut sich das gerade auch an" via WebSocket oder Last-Edit-Polling. Schwerer Aufwand, aber großer Anti-Race-Wert.

### E. "Was hat sich heute geändert" als E-Mail-Digest
Pro User abonnierbar — täglich um 8 Uhr eine kurze E-Mail mit den 5 wichtigsten Vorgängen aus seinem Permission-Scope. Reusebar mit der existierenden `since-last-visit`-API.

---

## Priorisierter Fix-Plan

### Welle 7a — Sofort-Fixes (1-2 Tage)
1. **K-1** paymentTermDays-Fallback fixen (10 min)
2. **K-2** sidebar-links useEffect-Memoization (20 min)
3. **K-3** useAnalytics catch-Logging (5 min)
4. **C-1 bis C-8** alle UX-Copy-Quick-Replacements (1h, suchen+ersetzen)
5. **U-1** Inbox hardcoded Farben → Tokens (15 min)

### Welle 7b — Konsistenz-Refactor (2-3 Tage)
6. **H-1** HTTP_STATUS Konstanten + Codemod über 25 Stellen
7. **H-2** CRON_SCHEDULES Konstanten
8. **H-3** MIME_TYPES Konstanten
9. **H-4** External-API URLs in env-vars
10. **Q-1 bis Q-3** Top `any`-Typen entfernen (Stichprobe, nicht alle 70)

### Welle 7c — Polish (1 Sprint)
11. **U-2 bis U-6** UX-Visual-Polish
12. **A** Status-Label-Konsistenz-Lib
13. **B** Health-Indicator im Header
14. Restliche Q-Findings nach Sicht
