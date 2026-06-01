# Feature-Complete-Plan — Phasen 20-26

> **Status:** Geplant · **Effort:** 43-56 PT Pflicht + 15-25 PT Optional · **Erstellt:** 2026-06-01
> **Basis:** Nach Abschluss P9-P19 + Audit A/B/C ist der HGB/GoBD-Backend-Kern produktiv. Dieser Plan schließt verbleibende UI- und Backend-Lücken.
>
> **Wichtig:** Diese Schätzung wurde nach einem unabhängigen Solution-Architect-Review nach oben korrigiert. Die ursprüngliche Schätzung (22-29 PT) hat **SuSa, Kontoblatt, DATEV-Export, Belegablage, Berechtigungs-Matrix** übersehen und UI-Aufwand um Faktor 1.5-2 unterschätzt.

---

## Executive Summary

Nach 16 Commits HGB-Compliance hat WPM einen **betriebsprüfungsfesten Backend-Kern**. Was zur "feature-complete"-Vollständigkeit fehlt:

| Block | Phasen | Effort | Funktional? |
|---|---|---|---|
| **Foundation** | P20 Deployment + Permissions + Runbook | 3-4 PT | Pflicht |
| **Tenant-Config-UI** | P21 | 6-8 PT | Pflicht |
| **Reports + neue Reports** | P22 | 10-13 PT | Pflicht |
| **Workflows-UI** | P23 | 8-10 PT | Pflicht |
| **Super-Admin + DATEV-Export + Belegablage** | P24 | 6-8 PT | Pflicht |
| **Backend-Lücken** | P25 | 10-13 PT | Pflicht (Stop-Punkt) |
| **Optional / Erweiterungen** | P26 | 15-25 PT | Bei Bedarf |

**Pflicht-Gesamt:** 43-56 PT (~8-12 Wochen Vollzeit). **Mit Parallelisierung 6-8 Wochen.**

---

## Kritische Lücken (aus Review nachgezogen)

Vor dem Review NICHT auf dem Schirm — jetzt eingeplant:

| Lücke | Wo eingeplant |
|---|---|
| **SuSa** (Summen- und Saldenliste) | P22 |
| **Kontoblatt** / Kontoausdruck mit OPOS | P22 |
| **EÜR §4(3) EStG** (für nicht-bilanzierungspflichtige Tenants) | P22 |
| **DATEV-EXTF-CSV-Export** (95% der StB) | P24 |
| **Anlagenspiegel** als Mehrjahres-Report (nicht nur 1-PT-Stub) | P22 |
| **Mahn-Eskalationsstufen** Konfiguration im UI | P23 |
| **Sachkonten-Anlagewizard** für neuen Tenant | P21 |
| **Stornierungs-Audit-Trail-UI** | P23 |
| **GoBD-Belegablage mit SHA-256** an Buchung | P24 (Backend + UI) |
| **Berechtigungs-Matrix** für 15 neue UI-Bereiche | P20 (Foundation) |
| **Migrations-Runbook** für Live-Tenants (P11-Rollout) | P20 (Foundation) |

---

## Phase 20 — Foundation (3-4 PT)

### Goal
Saubere Deployment-Pipeline + RBAC-Matrix + Live-Migration-Runbook.

### Konkrete Tasks
- **Setup-Skript** `scripts/post-deploy-setup.ts` — Auto-Seeds + Backfills idempotent
- **Duplikat-Check-Skript** mit Dry-Run-Modus
- **Berechtigungs-Matrix** für die neuen Bereiche:
  - `accounting:period-lock:create` / `:delete` (Period-Lock)
  - `accounting:tax-code:read` / `:write` (TaxCodes)
  - `accounting:value-adjustment:create` (EWB/PWB/WriteOff)
  - `accounting:report:bilanz` / `:gewst` / `:susa` / `:kontoblatt`
  - `accounting:year-end-close:execute`
  - `superadmin:system-settings:write`
  - `superadmin:tax-templates:write`
  - Permission-Definitionen in seed.ts + Default-Role-Mapping
- **Migrations-Runbook** `docs/devops/MIGRATION-RUNBOOK.md`:
  - P11 Aktivierung Schritt-für-Schritt (Shadow → Switch)
  - Period-Lock-Erstaktivierung (alle Vorjahres-Monate sperren)
  - SKR-Wechsel (nicht trivial — Konten-Mapping prüfen)

### Tests
- Setup-Skript zweimal aufrufen → keine Doppelaktionen
- Permission-Tests: jede Route mit/ohne Permission

---

## Phase 21 — Tenant-Admin-UI (6-8 PT)

### Goal
Tenant-Admin konfiguriert seinen Mandanten komplett im Browser.

### Konkrete Tasks
- **Sachkonten-Anlagewizard** (NEU — für neuen Tenant)
  - Kontenrahmen-Wahl SKR03/SKR04
  - Seed der Standard-Konten (Auto-Materialisierung)
  - Pflicht-Konten-Check (Bank, Forderungen, USt-Konten, EK)
- **TenantSettings-Erweiterung** (4 neue Audit-B-Felder + bestehende)
- **TaxCodes-Verwaltung** `/admin/master-data/tax-codes`
  - Liste materialisierter Codes
  - Override-Editor (DATEV-Code, Name, USt-Konto, vatReportBox)
  - Read-only Template-Daten daneben
- **Period-Lock-Manager** `/buchhaltung/period-locks`
  - Liste mit Lock/Unlock-Buttons
  - Pflicht-Begründung für Unlock
  - Audit-Anzeige (wer/wann/warum)
- **LedgerAccount-Erweiterung** im Konten-Stamm:
  - `gewStAddBackKey`-Dropdown (für GewSt-Report)
  - `balanceSheetSection`-Override
  - `taxKey` für Auto-Posting
  - `taxAccountId` (USt-Konto-Verknüpfung)

### Tests
- Playwright: neuer Tenant → Wizard → kann SKR03 wählen → Bilanz funktioniert
- Tenant-Admin setzt 4-Augen-Threshold auf 500 € → kleinere IncomingInvoice ohne 4-Augen
- Period-Lock: gesperrt + JournalEntry-Create → 409 angezeigt

---

## Phase 22 — Reports + Pflicht-Reports neu (10-13 PT)

### Goal
Alle Buchhaltungs-Standard-Reports verfügbar — Steuerberater-erwartete Pflicht-Liste.

### Konkrete Tasks

**Bestehende Backend-Reports als UI:**
- **Bilanz** (`/buchhaltung/bilanz`) — Aktiva/Passiva, Identitäts-Anzeige, Fund-Filter, Konsolidierung
- **GewSt-Report** (`/buchhaltung/gewerbesteuer`) — §8-Nr-Positionen + Freibetrag + Hinzurechnung
- **UStVA-Formular-View** — alle 13 Kennzahlen + Kleinunternehmer-Banner
- **GoBD-Z3-Export-UI** — Period-Picker + Vorschau + Download + Historie

**NEU implementieren (Backend + UI):**
- **SuSa (Summen- und Saldenliste)** — monatlich pro Konto, Soll/Haben/Saldo
  - Backend: `src/lib/accounting/reports/susa.ts` (~1 PT)
  - UI: Tabelle + Drucken (~1 PT)
- **Kontoblatt / Kontoausdruck** — pro Konto chronologisch Buchungen + OPOS
  - Backend: `src/lib/accounting/reports/kontoblatt.ts` (~1,5 PT)
  - UI: Kontoauswahl + Drucken (~1 PT)
- **EÜR §4(3) EStG** (Einnahmen-Überschuss-Rechnung für Nicht-Bilanzierer)
  - Backend: `src/lib/accounting/reports/euer.ts` (~1,5 PT)
  - UI: Einnahmen/Ausgaben + ESt-Formular-Anlage (~1 PT)
- **Anlagenspiegel** (Mehrjahres-Report — NICHT 1-PT-Stub)
  - Backend: AHK-Fortschreibung, Zugänge, Abgänge, Umbuchungen, kum. AfA (~2 PT)
  - UI: Tabelle pro Asset mit Spalten (Jahr) (~1 PT)

### Tests
- Snapshot-Tests pro Report mit Mock-Daten
- Print-CSS-Test: alle Reports A4-druckbar
- Goldmaster: SuSa vs. DATEV-Referenz für ein Beispiel-Quartal

---

## Phase 23 — Workflows-UI (8-10 PT)

### Goal
Buchhalter kann alle Workflows browser-bedienen.

### Konkrete Tasks
- **4-Augen-Approve-Inbox** (Erweiterung Inbox-Panel)
  - Filter "Wartet auf Freigabe"
  - Approve-Button (disabled bei Self-Approval über Threshold)
  - §14-Validator-Fehler als konkrete Mängel-Liste
- **Year-End-Close-Wizard** (`/buchhaltung/jahresabschluss`)
  - Schritt 1-4: Bilanz-Vorschau → Check → Vortrag-Vorschau → Bestätigung
- **Teilzahlung-Eingabe** in Invoice-Detail
  - Payments-Liste mit Restbetrag
  - Erfassen-Dialog (Betrag, Datum, Methode, BankTx-Link)
- **Forderungsausfall / EWB / PWB-Dialog**
  - Type-Auswahl + Betrag + Begründung
  - §17-Korrektur-Checkbox bei DIRECT_WRITEOFF
- **Mahnwesen mit Verzugszinsen + Stufen-Konfiguration**
  - Stufen-Editor (1/2/3 mit Tagen/Gebühren/Eskalation)
  - PDF-Vorschau mit Zinsberechnung
- **Stornierungs-Audit-Trail-UI**
  - Liste aller Stornos pro Periode
  - Drill-Down zu Original + Reversal
  - Begründungs-Anzeige

### Tests
- Playwright pro Workflow: happy-path + Fehler
- PDF-Goldmaster: Mahnung mit Zinsen vs. Referenz

---

## Phase 24 — Super-Admin + DATEV-Export + Belegablage (6-8 PT)

### Goal
Globale Konfiguration UI-bedienbar + DATEV-Standard-Export + GoBD-Belegablage komplett.

### Konkrete Tasks
- **Super-Admin Pages** (kommen hinten — selten genutzt):
  - `/admin/system-settings` — Pflege der 15 gesetzlichen Werte
  - `/admin/tax-category-templates` — CRUD der Steuer-Templates
- **DATEV-EXTF-CSV-Export** (war nicht im Original-Plan!)
  - Backend: `src/lib/accounting/datev-export.ts`
  - EXTF-Header (Mandanten-Nr, Wirtschaftsjahr, Kontenlänge)
  - 116-Felder-Spec pro Buchung
  - BU-Schlüssel-Mapping aus TaxCode
  - UI: Period-Picker + Mandant-Header-Config + Download
  - **~5-8 PT** (siehe Risiko)
- **GoBD-Belegablage**
  - Backend: SHA-256 an JournalEntry + Datei-Anhang in S3
  - Pro Buchung: ein PDF-Beleg verlinkbar
  - UI: Belegablage-Upload + Anhang-Anzeige in Invoice/IncomingInvoice/JournalEntry

### Risiken
- **DATEV-EXTF** ist nicht trivial — ~5-8 PT (Header 116 Felder, BU-Schlüssel-Mapping, Cent-Konventionen)

### Tests
- DATEV-Export gegen DATEV-Demo-Mandant in DATEV-Software importieren

---

## Phase 25 — Backend-Komplettierung (10-13 PT)

### Goal
Halbe Implementierungen aus P9-P19 fertigstellen, realistisch geschätzt.

### Konkrete Tasks
- **P11 Shadow-Mode** (~3 PT — Review-korrigiert)
  - Lib `tax-split-shadow.ts`: läuft beide Engines parallel
  - `AutoPostingDiff`-Tabelle für Persistenz
  - Admin-UI: Diff-Report über Zeitraum
  - Auto-Switch nach N=100 Diffs = 0
- **P15 IC-Eliminierung** (~3 PT — Review-korrigiert)
  - IC-Markierung an JournalEntry (`isIntercompany` Flag)
  - Eliminierungs-Buchungssätze in Konsolidierung
  - Zwischenergebnis-Eliminierung bei Lieferungen
- **P16 Dunning-Refactor** (~1 PT)
  - `dunning.ts` ruft `computeDefaultInterest` für jeden DunningItem
- **P16 Bundesbank-Auto-Fetch** (~2 PT — Review-korrigiert)
  - BullMQ-Repeatable halbjährlich
  - BBK01.SU0316 XML-Parsing
  - Retry-Logik + Fallback wenn API down
- **P18 SEPA-Idempotenz-Filter** (~0,5 PT)
- **P19 GoBD-Z3-Streaming** (~1 PT)
- **P19 BMF-DTD einbinden** (~0,5 PT)

### Risiken
- **Shadow-Mode** muss tatsächlich N Tage beobachtet werden (kein Code-Risiko, aber Rollout-Verzögerung)
- **IC-Eliminierung** komplexer als gedacht — Mutter/Tochter-Schwellen, Zwischenerg-Eliminierung

---

## Phase 26 — Optional / Erweiterungen (15-25 PT)

Nur bei konkretem Bedarf.

| Was | Aufwand | Wann sinnvoll |
|---|---|---|
| **ELSTER UStVA-Übermittlung** (ERiC) | **10-15 PT** (NICHT 3!) | Wenn monatliche UStVA automatisiert werden soll. ERiC ist C-Library mit JNI, Zertifikate, Sandbox/Produktiv-Endpoints. **Lizenzklärung Vorlauf!** |
| **E-Bilanz §5b EStG XBRL** | 5-8 PT | Wenn Steuerberater es verlangt |
| **SEPA-Lastschrift** (FRST/RCUR/FNAL) | 2 PT | Wenn Pacht-/Versicherung-Lastschriften gefordert |
| **Kassenbuch §146 AO** | 3-4 PT | Falls Bargeld-Geschäft (Pacht-Auszahlung bar?) |
| **IKR / SKR07** | 1-2 PT pro Rahmen | Wenn neuer Tenant onboarded |
| **Mandanten-Konsolidierung** (echte Tochter-Tenants) | 5 PT | Wenn Tenant-Hierarchien aufgebaut werden |
| **Belegerkennung KI/OCR** | je nach Lib | Wenn Eingangsrechnungen automatisiert |

---

## Korrigierte Sequenz (aus Review)

**Begründung:** Ohne Tenant-Config sind Reports nicht sinnvoll. Super-Admin selten → nach hinten.

```
                ┌──────────────────────┐
                │ P20: Foundation      │
                │ (Deploy + Perm +     │
                │  Migrations-Runbook) │
                └──────────┬───────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │ P21: Tenant-Admin-UI │
                │ (Settings, TaxCodes, │
                │  Period-Lock,        │
                │  Konten-Wizard,      │
                │  GewSt-Markierung)   │
                └──────────┬───────────┘
                           │
              ┌────────────┼─────────────┐
              ▼            ▼             ▼
        ┌─────────┐  ┌──────────┐  ┌──────────┐
        │P22:     │  │P23:      │  │P25:      │
        │Reports  │  │Workflows │  │Backend-  │
        │+ neue   │  │+ Stufen  │  │Lücken    │
        │(SuSa,   │  │+ Storno- │  │(läuft    │
        │ Konto-  │  │ Audit-UI │  │ parallel)│
        │ blatt,  │  └──────────┘  └──────────┘
        │ EÜR,    │
        │ Anlage- │
        │ spiegel)│
        └────┬────┘
             │
             ▼
        ┌──────────────────────┐
        │P24: Super-Admin +    │
        │DATEV-Export +        │
        │Belegablage           │
        └──────────────────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │P26: Optional         │
                │(ELSTER, E-Bilanz,    │
                │ Kassenbuch, ...)     │
                └──────────────────────┘
```

---

## Stop-Punkte

### Nach P21 (9-12 PT kumuliert)
**Status:** Tenant-Admin-Konfiguration komplett UI-bedienbar. Reports/Workflows noch über API.
**Sinnvoll als:** Tech-Stack-Validierung mit IT-affinem Buchhalter.

### Nach P22 (19-25 PT kumuliert)
**Status:** Alle Standard-Reports vorhanden. Buchhalter kann Reports konsumieren, Workflows aber noch nicht im Browser.
**Sinnvoll als:** Pilot mit Steuerberater (Reports sind das wichtigste für StB).

### Nach P24 (33-43 PT kumuliert)
**Status:** Volle UI-Bedienung + DATEV-Export für Steuerberater. Backend-Halbleichen bleiben (Shadow-Mode etc.).
**Sinnvoll als:** Produktiver Pilot mit mehreren Tenants.

### Nach P25 (43-56 PT kumuliert)
**Status:** Echtes "feature-complete" gegen HGB-Compliance-Scope.
**Sinnvoll als:** Full-Production-Stand.

### Phase 26
**Über feature-complete hinaus.** E-Bilanz / ELSTER / SEPA-Lastschrift bei konkretem Bedarf.

---

## Parallelisierung

| Stream | Was | Kalender-Zeit |
|---|---|---|
| **A — Backend-Dev** | P25 (Shadow-Mode, IC-Elim, Bundesbank-Cron, Streaming, Sub-Reports SuSa/Kontoblatt/Anlagenspiegel-Lib) | parallel zu allem |
| **B — Frontend-Dev #1** | P21 → P22 (Tenant-Config + Reports) | 4-5 Wochen |
| **C — Frontend-Dev #2** | P23 (Workflows + Mahn-Stufen + Storno-Audit) | 3-4 Wochen, startet nach P21 fertig |
| **D — Backend + Frontend gemischt** | P24 (DATEV + Belegablage + Super-Admin) | 2-3 Wochen, startet nach P21 |
| **E — DevOps/User** | P20 + ELSTER-Lizenz-Klärung parallel | Hintergrund |

**Mit dieser Aufteilung:** ~6-8 Wochen Kalender-Zeit für Pflicht-Phasen.

---

## Realistische Zeitplanung

| Variante | Kalender-Zeit | Personalbedarf |
|---|---|---|
| Solo, Vollzeit | 10-14 Wochen | 1 Senior-Dev |
| **Empfohlen: 1 BE + 2 FE** | 6-8 Wochen | wie oben |
| Solo, Teilzeit (50%) | 5-7 Monate | 1 Senior-Dev |

---

## Test-Strategie

**Pro Phase:**
- Vitest für reine Lib-Funktionen
- Component-Tests für UI (React Testing Library)
- Playwright-Smoke für je einen happy-path

**Goldmaster-Pflicht:**
- Year-End-Close gegen Steuerberater-Referenz
- Bilanz: Identität A=P bei 50+ Test-Buchungen
- Mahnwesen-PDF: Pixel-Diff gegen Referenz
- SuSa vs. DATEV-Vergleich für ein Beispiel-Quartal
- DATEV-Export in DATEV-Software importieren

**Coverage-Ziel:** ≥ 70% für neue Lib-Module, ≥ 50% für UI-Komponenten.

---

## Risiken-Reservebudget

Empfehlung: zusätzlich **20-30% Reserve** auf den Pflicht-Effort einplanen.

**Begründung:** Unbekannte Edge-Cases bei:
- DATEV-Export (Kunden-spezifische BU-Schlüssel)
- IC-Eliminierung (mehrstufige Mutter/Tochter-Konstellationen)
- Anlagenspiegel-Historisierung (Bestandsdaten-Migration)
- Permission-Konflikte bei den 15 neuen UI-Bereichen

**Realistisches Budget für Pflicht inkl. Reserve:** **55-75 PT** (statt 43-56).

---

## Ergebnis nach Pflicht-Phasen (P20-P25)

Nach Pflicht-Abschluss ist WPM:
- ✅ Betriebsprüfungsfest (Backend P9-P19)
- ✅ Gesetzesänderungs-fest (Audit A)
- ✅ Mandanten-flexibel (Audit B)
- ✅ Kontenrahmen-flexibel (Audit C)
- ✅ Komplett Buchhalter-bedienbar (UI Pflicht)
- ✅ Steuerberater-kompatibel (DATEV-Export, alle Standard-Reports)
- ✅ Test-abgedeckt (Goldmaster-Reihen)
- ✅ Live-Migration-fähig (P11-Rollout-Runbook)

**Nicht enthalten (Phase 26 bei Bedarf):** ELSTER-Automatisierung, E-Bilanz, SEPA-Lastschrift, Kassenbuch, Mandanten-Konsolidierung mit echten Tochter-Tenants.
