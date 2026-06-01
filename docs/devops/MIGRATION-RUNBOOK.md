# Live-Migrations-Runbook für HGB-Compliance-Phasen

> **Zielgruppe:** DevOps / Tech-Lead für Tenant-Live-Migrationen.
> **Geltungsbereich:** Tenants mit produktiven Buchungen vor Aktivierung der
> Phasen P9-P19 + Audit A/B/C. Für leere Tenants reicht das Post-Deploy-Setup.

---

## 0. Vorbereitung (einmalig)

```bash
# 1. Schema-Sync
prisma db push

# 2. Post-Deploy-Setup mit Dry-Run
npx tsx scripts/post-deploy-setup.ts --dry-run

# 3. Wenn ok: tatsächlich ausführen
npx tsx scripts/post-deploy-setup.ts

# 4. Duplikat-Check VOR Partial-Unique-Migration
npx tsx scripts/check-incoming-invoice-duplicates.ts
# Bei Exit-Code 1: Duplikate manuell bereinigen, erneut prüfen

# 5. Partial-Unique-Index anwenden
psql $DATABASE_URL -f prisma/migrations/manual/incoming_invoice_unique_partial.sql
```

---

## 1. P9 Periodensperre-Aktivierung

**Risiko:** mittel — bestehende Buchungen in Altmonaten sollten nicht
mehr ergänzt werden.

**Schritte:**
1. Buchhalter informiert über bevorstehende Periodensperren
2. Pro Tenant alle abgeschlossenen Vorjahres-Monate sperren (UI oder API)
3. Lock-Reason: "Initialsperre nach HGB-Compliance-Migration"

**Rollback:** Unlock-Endpoint mit Pflicht-Begründung — Audit bleibt erhalten.

---

## 2. P11 USt-Split-Aktivierung (HOCHRISIKO)

**Risiko:** **HOCH** — falsche Splits zerstören GuV.

**Strategie:** Shadow-Mode (siehe P25 wenn implementiert) ODER direkter
Switch pro Tenant mit kleinem Pilot-Volumen.

**Vorbedingungen:**
- ✓ TaxCodes pro Tenant materialisiert (siehe Setup-Skript)
- ✓ USt-Konten (1576/1576/1771/1776) in TenantSettings korrekt
- ✓ Erste Test-Buchung gegen Goldmaster geprüft

**Schritte (manueller Switch):**
1. Tenant-Settings: `useTaxSplit = false` lassen (bestehende Buchungen)
2. UStVA für letzten geschlossenen Monat berechnen (alte Engine = Baseline)
3. `useTaxSplit = true` aktivieren für DIESEN Tenant
4. Test-Rechnung anlegen + Auto-Posting prüfen (3 Lines statt 2)
5. UStVA für neuen Monat berechnen + mit Baseline-Differenz vergleichen
6. Bei Diff > 1%: zurück auf false, Logs analysieren

**Rollback:** `useTaxSplit = false`. Alte Lines bleiben, neue werden mit
alter Engine geschrieben. Keine Datenrettung nötig.

---

## 3. P13 Duplikatsschutz-Migration

**Vorbedingung:** Duplikat-Check 0 Treffer.

**Schritte:**
1. `scripts/check-incoming-invoice-duplicates.ts` zeigt 0
2. SQL-Migration ausführen
3. Test: Eingang gleiches Vendor + InvoiceNumber → 409

---

## 4. P15 Bilanz-Aktivierung + Konten-Stamm-Pflege

**Risiko:** mittel — wenn Konten nicht klassifiziert, ist die Bilanz
nicht ausgeglichen.

**Vorbedingungen:**
- ✓ `chartOfAccountsVersion` in TenantSettings korrekt (Default SKR04)
- ✓ balanceSheetSection-Backfill gelaufen (Setup-Skript)
- ✓ EK-Konto in `datevAccountAnnualResult` gesetzt (Default "9999")

**Schritte:**
1. Bilanz-API für aktuelles Jahr aufrufen
2. `warnings`-Array prüfen — Liste der unklassifizierten Konten
3. Pro Warning: LedgerAccount → balanceSheetSection manuell setzen
4. Wiederholen bis warnings = [] UND differenz ≤ bilanzToleranceEur
5. Year-End-Close erst nach 0-Differenz aktivieren

---

## 5. P17 GewSt-Konten-Markierung

**Vorbedingung:** Tenant hat Pacht-/Zins-/Lizenz-Konten.

**Schritte:**
1. LedgerAccount-Übersicht öffnen
2. Für jedes relevante Konto `gewStAddBackKey` setzen:
   - Pacht-Konten → `RENT_IMMOVABLE` (1/2-Quote)
   - Maschinen-Miete → `RENT_MOVABLE` (1/5-Quote)
   - Schuldzinsen → `INTEREST` (100%-Quote)
   - Lizenzen → `LICENSE` (1/4-Quote)
3. GewSt-Report aufrufen — Plausibilitäts-Check gegen Steuerberater-Berechnung

---

## 6. Audit A: SystemSettings-Aktivierung

**Risiko:** niedrig — Defaults entsprechen Rechtsstand 01.06.2026.

**Schritte:**
1. Super-Admin ruft `GET /api/superadmin/system-settings` einmal auf
2. Auto-Seed legt 15 Defaults an
3. Bei Bedarf einzelne Werte über PATCH ändern

---

## 7. Audit B: TenantSettings-Bewertung pro Tenant

**Empfehlung pro Tenant prüfen:**
- `bankMatchToleranceEur` (Default 0,02) — passt für Tenant?
- `bilanzToleranceEur` (Default 0,01) — bei Mio-€-Bilanzen evtl. höher
- `datevAccountAnnualResult` (Default "9999") — **ECHTES EK-Konto setzen!**
  - SKR04: z.B. "2010" oder "2120" (Gewinnvortrag)
  - SKR03: z.B. "0860" (Gewinnvortrag) oder "0900" (Verlustvortrag)
- `chartOfAccountsVersion` — bei SKR03-Tenants explizit setzen

---

## 8. Audit C: SKR03-Tenant-Migration

**Wenn Tenant heute SKR03 nutzt:**

1. `chartOfAccountsVersion = "SKR03"` in TenantSettings setzen
2. Bestehende balanceSheetSection-Felder LÖSCHEN (sie wurden mit SKR04-Logik gesetzt):
   ```sql
   UPDATE ledger_accounts SET "balanceSheetSection" = NULL
   WHERE "tenantId" = '<tenant-uuid>';
   ```
3. Setup-Skript erneut ausführen — nutzt jetzt SKR03-Mapper
4. Bilanz prüfen — warnings checken

---

## Notfall-Procedure

**Bei katastrophalem Daten-Korruptions-Verdacht:**

1. Tenant-Operationen SOFORT pausieren (Feature-Flag `inbox.enabled = false`)
2. Letztes Backup identifizieren
3. Audit-Log-Tabelle prüfen (welche Operationen liefen?)
4. Bei Verdacht auf P11-USt-Split-Bug: `useTaxSplit = false` setzen,
   betroffene JournalEntries identifizieren (`source: 'AUTO'` + Zeitraum)
5. Rollback-Strategie mit Senior-Dev + Steuerberater abstimmen

---

## Checkliste vor Go-Live pro Tenant

- [ ] Post-Deploy-Setup gelaufen (dry-run + real)
- [ ] Duplikat-Check 0 Treffer
- [ ] Partial-Unique-Migration angewendet
- [ ] TenantSettings.datevAccountAnnualResult auf echtes EK-Konto gesetzt
- [ ] chartOfAccountsVersion korrekt (SKR03 oder SKR04)
- [ ] 4-Augen-Schwelle (fourEyesThresholdEur) festgelegt
- [ ] GewSt-Konten markiert (gewStAddBackKey)
- [ ] Bilanz für laufendes Jahr → warnings = [] UND differenz ≤ Toleranz
- [ ] Erste Test-Rechnung (Outgoing) → Auto-Posting läuft
- [ ] Erste Test-IncomingInvoice → 4-Augen + §14-Validator greifen
- [ ] Periodensperre für abgeschlossene Vorjahres-Monate aktiv
- [ ] Buchhalter hat UI-Schulung erhalten (sobald UI fertig)
- [ ] Steuerberater hat einen Probe-Export (UStVA / SuSa / Bilanz) erhalten
- [ ] GoBD Z3-Export-Probelauf erfolgreich (Format vom StB validiert)
