# Save-Correctness-Audit — Energy / SCADA / Settlements / Turbines / Parks

**Datum:** 2026-07-10 · **Domain:** Energy + SCADA + Settlements + Turbines + Anomalies
**Umfang:** 60+ API-Routes, 14 Client-Files, WSD-Reader, Settlement-Wizard.

---

## 🔴 CRITICAL — Data-Correctness / Silent Data-Loss

### 1. Jahres-Settlement → Duplikat-Check greift nicht → Doppel-Einträge möglich
**Datei:** [src/app/api/energy/settlements/route.ts#L186-L202](src/app/api/energy/settlements/route.ts)
POST-Duplicate-Check nutzt `month: validatedData.month ?? 0`, aber der Save an Zeile 222 verwendet `month: validatedData.month ?? null`. Postgres behandelt NULL im UNIQUE-Constraint als distinct → Duplikat-Check findet keine Kollision, zwei Jahres-Settlements für denselben Park/Jahr werden erlaubt.
**Fix:** Duplikat-Query auf `month: null` bei Jahresabrechnungen umbauen — oder in DB migration `NULLS NOT DISTINCT` setzen.

### 2. SCADA-Timestamps als UTC gelabelt — Enercon liefert Lokalzeit (CET/CEST)
**Datei:** [src/lib/scada/dbf-reader.ts#L590-L607](src/lib/scada/dbf-reader.ts) (`buildTimestamp`)
`buildTimestamp` konstruiert `Date.UTC(y,m,d, Hour, Minute, Second)`. Enercon-DBF-Files enthalten aber deutsche Lokalzeit. Alle 10-Min-Records liegen 1-2 h zu spät (DST-abhängig). Tages-/Monats-Aggregationen (production, availability) verschieben sich → Silvester-Werte fallen in falsches Jahr, DST-Wechsel produziert 1-h-Lücken oder Doppelbuchung.
**Fix:** DateTime-Interpretation mit `date-fns-tz` (`fromZonedTime(..., "Europe/Berlin")`).

### 3. `calculate/route.ts` — Rundungsfehler: revenueShareEur-Summe ≠ netOperatorRevenueEur
**Datei:** [src/app/api/energy/settlements/[id]/calculate/route.ts#L219-L330](src/app/api/energy/settlements/[id]/calculate/route.ts)
Jedes Item wird auf 2 Nachkommastellen gerundet; die Summe der `revenueShareEur` kann durch Rundung ±0,01-0,20 vom Netzbetreiber-Erlös abweichen. Es gibt **keine** Rundungskorrektur am letzten Item. Bilanziell nicht neutral → Buchhaltung inkonsistent.
**Fix:** Letztes Item = totalRevenue − Summe der bisherigen.

### 4. Kaputte Nullable-Serialisierung: deviationKwh=0 wird zu NULL
**Datei:** [src/app/api/energy/settlements/[id]/calculate/route.ts#L367-L368](src/app/api/energy/settlements/[id]/calculate/route.ts)
`item.deviationKwh ? new Decimal(item.deviationKwh) : null` verwendet Truthiness — bei exakter Durchschnittsproduktion (deviation=0) wird NULL statt 0 gespeichert. Analog für `toleranceAdjustment`. In Berichten erscheint "keine Abweichung" fälschlich als "keine Daten".
**Fix:** `item.deviationKwh != null ? new Decimal(...) : null`.

### 5. Rundungskorrektur EEG/DV verwendet den bereits überschriebenen Wert
**Datei:** [src/app/api/energy/settlements/[id]/create-invoices/route.ts#L296-L310](src/app/api/energy/settlements/[id]/create-invoices/route.ts)
Nach dem Update `firstItem.taxAmount = new Decimal(...)` liest Zeile 308 `Number(firstItem.taxAmount)` — der neue, korrigierte Wert. Delta wird `0`. `totalTax` bleibt vor der Rundung → Invoice.taxAmount ≠ Σ(items.taxAmount).
**Fix:** Alten Tax-Wert vor Überschreibung in `oldTax` cachen, wie es bei `oldGross` gemacht wird.

### 6. Division durch 0 in Invoice-Erstellung → NaN-Decimal
**Datei:** [src/app/api/energy/settlements/[id]/create-invoices/route.ts#L244,L279,L326](src/app/api/energy/settlements/[id]/create-invoices/route.ts)
`unitPrice: new Decimal((revenueEur / productionKwh).toFixed(6))` — wenn `productionKwh=0` (Turbine 0 kWh produziert, aber Erlös durch andere Turbinen erhalten), entsteht `NaN` bzw. `Infinity`. Prisma-Insert wirft entweder oder speichert Müll. Silent-Failure der gesamten Gutschriftserstellung möglich.
**Fix:** Guard `if (productionKwh > 0)` — sonst `new Decimal(0)` oder Item skippen.

### 7. Turbine-DELETE ohne tenantId-Scope — theoretisch Cross-Tenant-Delete
**Datei:** [src/app/api/turbines/[id]/route.ts#L288-L290](src/app/api/turbines/[id]/route.ts)
`prisma.turbine.delete({ where: { id } })` — wenn zwischen findFirst und delete die ID durch race manipuliert würde, kein Schutz. Park-Delete macht es gescoped (Zeile 341 in parks/[id]).
**Fix:** `where: { id, park: { tenantId: check.tenantId! } }`.

### 8. Park-POST + Turbine-POST: fund-IDs cross-tenant nicht geprüft
**Datei:** [src/app/api/parks/route.ts#L160-L167](src/app/api/parks/route.ts), [src/app/api/parks/[id]/route.ts#L262-L275](src/app/api/parks/[id]/route.ts), [src/app/api/turbines/route.ts#L137-L146](src/app/api/turbines/route.ts)
`operatorFundId`, `billingEntityFundId`, `netzgesellschaftFundId` werden direkt aus dem Body übernommen. Kein Fund-Ownership-Check → user mit gültiger UUID eines Fund eines anderen Tenants kann diesen als Operator/Netzgesellschaft/Billing-Entity setzen. Später crasht die Settlement-Logik.
**Fix:** `findFirst({ id: fundId, tenantId })` bei allen 3 Feldern.

---

## 🔴 CRITICAL — Business-Logic

### 9. SCADA-Mapping PATCH: plantNo max=10 statt max=99 (POST-Wert)
**Datei:** [src/app/api/energy/scada/mappings/[id]/route.ts#L90](src/app/api/energy/scada/mappings/[id]/route.ts) vs [mappings/route.ts#L82](src/app/api/energy/scada/mappings/route.ts)
POST erlaubt `1..99`, PATCH erlaubt nur `1..10`. Alle Windparks >10 Anlagen können angelegt, aber nicht mehr geändert werden → 400-Fehler beim späteren Speichern.
**Fix:** `plantNo > 99` in PATCH.

### 10. Falsche Permission auf Reports-Config PATCH/DELETE
**Datei:** [src/app/api/energy/reports/configs/[id]/route.ts#L115,L213](src/app/api/energy/reports/configs/[id]/route.ts)
Beide nutzen `energy:create`. PATCH sollte `energy:update`, DELETE `energy:delete` sein. User ohne update-Rechte kann Configs ändern; user mit nur `energy:create` kann fremde Configs löschen.

### 11. Anomaly-Config-Save re-evaluiert keine bestehenden Anomalien
**Datei:** [src/app/api/energy/scada/anomalies/config/route.ts#L75-L146](src/app/api/energy/scada/anomalies/config/route.ts)
Threshold-Änderung (z.B. `availabilityThreshold` 90 → 95) speichert nur Config. Bestehende Anomalien werden nicht re-evaluiert, neue nicht generiert. User sieht widersprüchliches Bild (alte Anomalien mit alten Regeln + neuer Threshold in Config).
**Fix:** Nach Config-Save `runAnomalyDetection(tenantId)` re-triggern (async).

### 12. CSV-Import: Partial-Match matcht falsche Turbine (silent-corruption)
**Datei:** [src/app/api/energy/productions/import/route.ts#L145-L153](src/app/api/energy/productions/import/route.ts)
`turbineByAnyIdentifier` fällt auf `substring/includes` zurück. Turbine "WKA 1" matched jede designation die "wka 1" enthält (auch "WKA 10", "WKA 11"…). Silent-Missallokation der Produktion → Settlement rechnet an falschen Betreiber aus.
**Fix:** Substring-Fallback entfernen oder mit unique-count-guard: mehrere Matches → error.

### 13. Turbine-POST erstellt TurbineOperator außerhalb der Transaktion
**Datei:** [src/app/api/turbines/route.ts#L137-L159](src/app/api/turbines/route.ts)
Erst `prisma.turbine.create(...)`, dann `prisma.turbineOperator.create(...)`. Fällt der 2. Call aus (z.B. FK-Fehler bei operatorFundId), bleibt Turbine ohne Operator zurück → Settlement-Berechnung crasht später mit "keinen aktiven Betreiber".
**Fix:** `prisma.$transaction`.

### 14. `create-invoices`: TurbineProduction-updateMany findet NULL-Monat nicht
**Datei:** [src/app/api/energy/settlements/[id]/create-invoices/route.ts#L437-L446](src/app/api/energy/settlements/[id]/create-invoices/route.ts)
`if (settlement.month !== null && settlement.month !== 0)` — bei Jahres-Settlement (month=null) läuft `updateMany` OHNE month-Filter → **alle** DRAFT/CONFIRMED Produktionen des Parks im Jahr werden auf INVOICED gesetzt, auch die noch nicht abgerechneten Monats-Details. Verhindert danach jede monatliche Nachbearbeitung.
**Fix:** Bei Jahres-Settlement bewusst so gewollt? Sonst: month-Filter zwingend, und Warnung im UI.

### 15. `productions/import` mit `skipDuplicates:true` — silent-drop bei CSV-internen Duplikaten
**Datei:** [src/app/api/energy/productions/import/route.ts#L381](src/app/api/energy/productions/import/route.ts)
Zwei Zeilen mit gleicher (turbineId, year, month) in derselben CSV: erste wird geschrieben, zweite von Prisma verworfen, aber `createdCount` wurde bereits im Loop hochgezählt. Report an User zeigt N created, DB hat N-K. User rechnet mit Werten die nie gespeichert wurden.
**Fix:** In-Loop deduplizieren + Duplikate als warning melden.

---

## 🟡 Standard / Kleinere Bugs

### 16. Availability-Sum-Guard fehlt
**Datei:** [src/lib/scada/import-service.ts#L577-L584](src/lib/scada/import-service.ts)
IEC-Formel `T1/(T1+T5)*100` sauber, aber es fehlt Guard gegen Datenqualität-Bugs: wenn DBF `t1+t5 > 24h` (verschmutzte Enercon-Daten), wird >100% gespeichert. Availability-Chart geht ins Absurde.
**Fix:** `.min(100)` beim Speichern.

### 17. n8n-Upload überschreibt bei Größen-Unterschied ohne Backup
**Datei:** [src/app/api/energy/scada/n8n/upload/route.ts#L97-L108](src/app/api/energy/scada/n8n/upload/route.ts)
Existiert File mit gleicher Größe → skip. Andere Größe → **überschreiben** ohne Backup. Bei fehlerhaftem n8n-Retry mit Teildatei wird Original weggeschrieben.
**Fix:** Bei Size-Mismatch: warn + timestamp-suffix `_old_YYYYMMDD`.

### 18. `settlement.month=0`-Legacy-Sonderfall im create-invoices
**Datei:** [src/app/api/energy/settlements/[id]/create-invoices/route.ts#L437](src/app/api/energy/settlements/[id]/create-invoices/route.ts)
Check `month !== null && month !== 0` — deutet auf historisch inkonsistente Daten hin. Wenn Legacy `month=0` als "Jahr" existieren, sollte Migration + Cleanup laufen.

### 19. Settlement-Wizard: Abbruch nach Step 2 lässt DRAFT/CALCULATED-Settlement stehen
**Datei:** [src/components/energy/settlement-wizard.tsx#L369-L450](src/components/energy/settlement-wizard.tsx)
Wenn User in Step 3 den Browser schließt statt "Gutschriften erstellen" zu klicken, bleibt eine "verwaiste" berechnete Abrechnung ohne Invoices. Kein Cleanup-Hint im UI.
**Fix:** Beim erneuten Öffnen des Wizards für denselben parkId/year/month → Draft anbieten zum Fortsetzen oder Verwerfen.

### 20. `smoothingFactor` Default 0.5 im Backend, Frontend ohne Info
**Datei:** [src/app/api/energy/settlements/[id]/calculate/route.ts#L238-L240](src/app/api/energy/settlements/[id]/calculate/route.ts)
Wenn Park default nicht gesetzt und User im Wizard nichts angibt → 0.5 (50%) Smoothing implizit. Business-Wert `50%` sollte aus `tenantSettings` kommen (siehe CLAUDE.md "Business-Werte immer aus getTenantSettings").

---

## Zusammenfassung

- **20 Findings**, davon **15 🔴 kritisch**.
- **Größte Save-Bugs für User-Report:**
  - #1 Jahres-Settlement Duplikat (silent-write-duplicate)
  - #2 Timezone-Verschiebung SCADA (silent-data-corruption)
  - #3 & #5 Rundungsfehler in Erlös-Verteilung + Invoice-Steuer (bilanziell)
  - #6 Division durch 0 → Invoice-Save crasht
  - #12 CSV-Substring-Match → falscher Betreiber
  - #14 Jahres-Settlement setzt alle Monatsdaten auf INVOICED

Empfohlene Reihenfolge: 2 → 1 → 6 → 5/3 → 14 → 12 → Rest.
