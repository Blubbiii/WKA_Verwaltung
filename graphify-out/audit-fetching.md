# Data-Fetching Audit — Leere Listen / Falsche Zahlen

Scan-Fokus: `src/app/(dashboard)/**/page.tsx` (admin/leases/buchhaltung/energy) + `src/components/**`.
Gesucht: Race-Conditions, hardcoded Limits, Envelope-Mismatch, Timezone-Bugs, stale closures.

Priorisierung: rote Findings zuerst (echter Datenverlust / falsche Zahlen), gelbe Findings (schlechte UX, aber Daten stimmen technisch).

---

## Rote Findings (Daten sind LEER oder FALSCH)

### 1. `data.billings` statt `data.data` — Envelope-Mismatch
- Datei: [management-billing/billings/page.tsx:216](src/app/(dashboard)/management-billing/billings/page.tsx#L216)
- `setBillings(data.billings || [])` — die restliche App nutzt `data.data`; falls die API auf das Standard-Envelope migriert wurde, ist die Tabelle **immer leer**.
- Symptom: Abrechnungs-Liste zeigt "Keine Daten", obwohl DB gefüllt.
- Fix: `setBillings(data.data || data.billings || [])` oder API-Envelope prüfen.

### 2. `data.ppas` statt `data.data` — Envelope-Mismatch
- Datei: [invoices/ppa/page.tsx:189](src/app/(dashboard)/invoices/ppa/page.tsx#L189)
- Symptom: PPA-Liste komplett leer bei Envelope-Migration.

### 3. `data.anomalies` + `data.parks` — Envelope-Mismatch
- Datei: [energy/scada/anomalies/page.tsx:241,257](src/app/(dashboard)/energy/scada/anomalies/page.tsx#L241)
- `setAnomalies(data.anomalies)` — kein Fallback, kein null-Guard.
- Symptom: SCADA-Anomalies-Liste leer + Park-Filter leer, wenn API Standard-Envelope liefert.

### 4. Race-Condition bei CRM-Suche (kein AbortController)
- Datei: [crm/contacts/page.tsx:200-217, 224-226](src/app/(dashboard)/crm/contacts/page.tsx#L200)
- `load()` wird bei jedem Tastendruck über `useEffect([search, activeLabels, flags.crm])` ohne AbortController + ohne useCallback getriggert.
- Symptom: Bei schneller Suche überschreibt eine ältere Response die neuere → falsche Contact-Liste, falscher `total`. `debounce` fehlt komplett.
- Fix: `useCallback` + AbortController + `useDebounce(search, 300)`.

### 5. `limit: "100"` hardcoded — Cutoff bei >100 Verträgen/Rechnungen/Leases
- Dateien: [invoices/page.tsx:180](src/app/(dashboard)/invoices/page.tsx#L180), [leases/page.tsx:126](src/app/(dashboard)/leases/page.tsx#L126), [contracts/page.tsx:125](src/app/(dashboard)/contracts/page.tsx#L125)
- Keine Pagination-UI — ab dem 101. Datensatz **unsichtbar**.
- Symptom: "Meine Rechnung von letzter Woche ist weg" — sie ist in der DB, aber nicht in den ersten 100.
- Fix: `PAGE_SIZE_DEFAULT` aus `@/lib/config/pagination` + Pagination-UI.

### 6. `limit: "200"` hardcoded — Vendor-/Contact-Cutoff
- Dateien: [vendors/page.tsx:264](src/app/(dashboard)/vendors/page.tsx#L264), [crm/contacts/page.tsx:203](src/app/(dashboard)/crm/contacts/page.tsx#L203)
- Symptom: Ab dem 201. Kontakt fehlen Datensätze; Batch-Aktionen greifen zu wenig.

### 7. Timezone-Bug: `dateTo + "T23:59:59"` (local time)
- Datei: [energy/scada/data/page.tsx:170](src/app/(dashboard)/energy/scada/data/page.tsx#L170)
- Ohne Timezone-Suffix → als lokale Zeit interpretiert. Am 31.12. lokal wird auf Server evtl. schon 01.01. UTC → SCADA-Messwerte des Silvestertages **fehlen** oder werden dem Folgejahr zugerechnet.
- Fix: explizit `T23:59:59.999Z` bzw. Timezone-safe date range util.

### 8. Race-Condition + `limit=50` hardcoded in SCADA-Data
- Datei: [energy/scada/data/page.tsx:154-185](src/app/(dashboard)/energy/scada/data/page.tsx#L154)
- Drei `useEffect`s ohne AbortController, Filter `[turbineId, dateFrom, dateTo, page]` triggert bei jedem Klick einen neuen Fetch — bei langsamer API überschreibt der ältere Response den neueren.
- Symptom: Nach Anlage-Wechsel zeigt die Tabelle die Messwerte der VORHERIGEN Anlage.

### 9. `currentYear` als Modul-Konstante — falsches Jahr in KPIs
- Dateien: [energy/page.tsx:107](src/app/(dashboard)/energy/page.tsx#L107), [energy/productions/page.tsx:104](src/app/(dashboard)/energy/productions/page.tsx#L104), [management-billing/billings/page.tsx:127](src/app/(dashboard)/management-billing/billings/page.tsx#L127)
- Wird bei Modul-Load (SSR-Warmup oder erster Client-Render) evaluiert; im Container läuft der Prozess Wochen/Monate. Zum Jahreswechsel zeigt die Energy-Overview weiter alte Zahlen.
- Fix: `const currentYear = new Date().getFullYear()` in die Komponente ziehen.

### 10. Energy-Overview: `useEffect(() => load(), [])` — nie refetch
- Datei: [energy/page.tsx:216-242](src/app/(dashboard)/energy/page.tsx#L216)
- Kein Refetch bei Fokuswechsel / kein Poll / kein Refresh-Button. In Kombination mit Finding #9: falsches Jahr **UND** stale Daten.
- Symptom: Nach Import neuer Produktionsdaten ändert sich die Übersicht nicht ohne Hard-Reload.

### 11. `data.pagination.total` ohne Optional-Chain
- Datei: [admin/billing/tabs/rules.tsx:174-177](src/app/(dashboard)/admin/billing/tabs/rules.tsx#L174)
- Wenn API im Fehlerfall Zod-Envelope liefert oder `pagination` fehlt → `TypeError`, komplette Tabelle crasht via ErrorBoundary → **leer**.
- Fix: `data.pagination?.total ?? 0`.

### 12. `limit: 20` hardcoded in Billing-Rules
- Datei: [admin/billing/tabs/rules.tsx:136](src/app/(dashboard)/admin/billing/tabs/rules.tsx#L136)
- Regel-Liste zeigt max. 20 pro Seite, ohne dass User es einstellen kann — bei >20 Regeln wirkt es wie "manche fehlen".

### 13. Deadlines-Tab lädt nur einmal
- Datei: [notifications/page.tsx:135-139](src/app/(dashboard)/notifications/page.tsx#L135)
- `if (tab === "fristen" && deadlines.length === 0)` — nach dem ersten Load nie wieder refetch. Neue Fristen erscheinen erst nach Reload.

### 14. Vendors doppelt getriggert + debounce-race
- Datei: [vendors/page.tsx:279-287](src/app/(dashboard)/vendors/page.tsx#L279)
- Deps `[flags.inbox, flagsLoading, load, search]` — `load` ist bereits `useCallback([search])`, `search` steht doppelt drin → doppelte Requests + Timeout-Debounce ohne Cleanup bei jedem Tastendruck kann trotzdem 2 Requests gleichzeitig auslösen.

---

## Gelbe Findings (Pattern-Verstoß / UX-Delle, keine Datenlage)

### 15. Empty-State-Text fehlt bei mehreren Tables
- z.B. [energy/scada/data/page.tsx](src/app/(dashboard)/energy/scada/data/page.tsx), [management-billing/billings/page.tsx](src/app/(dashboard)/management-billing/billings/page.tsx#L216) (renderpart, nicht gezeigt) — wenn `measurements.length===0` **kein** "Keine Daten für gewählte Filter"-Text.
- Symptom: User denkt "kaputt".

### 16. Kontoblatt: `useEffect([])` + Auto-Load nur wenn schon `?account=…`
- Datei: [buchhaltung/kontoblatt/page.tsx:98-103](src/app/(dashboard)/buchhaltung/kontoblatt/page.tsx#L98)
- Wenn User `from`/`to` per URL setzt ohne `account`, passiert nix — aber Deep-Links aus SuSa dürften vollständig sein. Kein AbortController.

### 17. `fund-access/page.tsx` — Initial-Load ohne AbortController
- Datei: [admin/fund-access/page.tsx:72-80](src/app/(dashboard)/admin/fund-access/page.tsx#L72)
- Bei extrem schnellem Wegnavigieren `setUsers` nach unmount → React 19 warnt, keine Daten-Bug.

### 18. GewSt: kein AbortController, useEffect([]) → year-Input löst kein Auto-Load aus
- Datei: [buchhaltung/gewerbesteuer/page.tsx:86-89](src/app/(dashboard)/buchhaltung/gewerbesteuer/page.tsx#L86)
- Nutzer erwartet Auto-Refresh bei Jahr-Wechsel; muss aber "Aktualisieren" klicken. Nicht kritisch, aber verwirrend.

### 19. Bank-Update-Requests ohne AbortController
- Datei: [admin/bank-update-requests/page.tsx:42-58](src/app/(dashboard)/admin/bank-update-requests/page.tsx#L42)
- Filter-Toggle PENDING/ALL — bei sehr schnellem Umschalten Race möglich.

### 20. Envelope-Fallback `data.parks || data.data || []`
- Datei: [energy/scada/anomalies/page.tsx:257](src/app/(dashboard)/energy/scada/anomalies/page.tsx#L257)
- Signalisiert dass sich niemand sicher ist welchen Envelope die API liefert — sollte auf ein einheitliches Format normalisiert werden.

---

## Zusammenfassung

- **Envelope-Chaos:** `data.data` (Standard) vs `data.billings`/`data.ppas`/`data.anomalies`/`data.parks` — pro Feature andere Konvention → tickende Zeitbombe bei jeder API-Refactor.
- **Pagination fehlt bei Kern-Listen:** Invoices/Leases/Contracts capped bei 100, Vendors/Contacts bei 200 — kein UI-Feedback.
- **Race-Conditions:** CRM Contacts und SCADA Data betroffen (kein AbortController + rapides Filter-Wechseln).
- **Timezone-Bug** in SCADA-Data ist ein echter Silvester-Datenverlust.
- **`currentYear`-Modulkonstante** in 3 Energy/Billing-Pages — Jahreswechsel-Bug.

Nächste Schritte (Reihenfolge):
1. Envelope-Kontrakt fixieren (auf `data.data`) und die 4 Ausreißer angleichen.
2. `PAGE_SIZE_DEFAULT` + Pagination-UI in Invoices/Leases/Contracts/Vendors/Contacts einbauen.
3. `crm/contacts/page.tsx` auf `useCallback` + AbortController + Debounce migrieren.
4. SCADA-Data: AbortController + `dateTo` UTC-safe.
5. `currentYear` in die Komponente ziehen; Refresh-Button in Energy-Overview.
