# Audit: Hardcodierte Werte in den HGB/GoBD-Modulen (P9-P19)

> **Status:** Audit · **Erstellt:** 2026-06-01 · **Scope:** alle in den Phasen 9-19 angelegten Buchhaltungs-Module

Drei Klassifikations-Stufen:
- 🔴 **Super-Admin (system-weit)** — gesetzlich vorgegeben, ändert sich durch Gesetzesänderung. Muss zentral pflegbar sein, weil alle Tenants gleichzeitig betroffen sind (z.B. Pakt der Bundesregierung).
- 🟡 **Admin (pro Mandant)** — Praxis-/Konventions-Werte die zwischen Mandanten variieren können (z.B. Toleranzen, Mandanten-spezifische Konten, Kontenrahmen).
- 🟢 **Hardcode OK** — ISO-/Format-/Mathematik-Konstanten, weltweit identisch.

---

## 🔴 Super-Admin (system-weit)

### 1. GWG-Schwellen §6 EStG ([afa.ts](src/lib/accounting/afa.ts))

| Konstante | Wert | Gesetz | Historie |
|---|---|---|---|
| `GWG_SOFORT_THRESHOLD_NET_EUR` | 800 | §6 Abs. 2 EStG | Wert seit 01.01.2018 — vorher 410 € |
| `GWG_POOL_LOWER_NET_EUR` | 250 | §6 Abs. 2a EStG | seit 2018 |
| `GWG_POOL_UPPER_NET_EUR` | 1.000 | §6 Abs. 2a EStG | seit 2018 |
| `GWG_POOL_YEARS` | 5 | §6 Abs. 2a EStG | Wachstumschancengesetz 2024 hatte Diskussion über 3 J |
| `DEGRESSIVE_CUTOFF` | 2023-01-01 | §52 Abs. 14a EStG | Corona-Übergangsregeln 2020-2022; weitere temporäre Erlaubnisse möglich |

**Risiko:** Hoch. Bei nächster Gesetzesänderung (z.B. Inflations-Anpassung der Schwellen) müssen alle Tenants gleichzeitig die neuen Werte sehen.

### 2. GewSt-Hinzurechnung §8 GewStG ([gewerbesteuer.ts](src/lib/accounting/reports/gewerbesteuer.ts))

| Konstante | Wert | Gesetz | Historie |
|---|---|---|---|
| `GEWST_QUOTES.INTEREST` | 1,0 (100%) | §8 Nr 1a | seit Einführung |
| `GEWST_QUOTES.RENT_MOVABLE` | 0,2 (1/5) | §8 Nr 1d | seit 2008 |
| `GEWST_QUOTES.RENT_IMMOVABLE` | 0,5 (1/2) | §8 Nr 1e | seit 2008; war zwischenzeitlich 13/20 |
| `GEWST_QUOTES.LICENSE` | 0,25 (1/4) | §8 Nr 1f | seit 2008 |
| `GEWST_FREIBETRAG_EUR` | 200.000 | §8 Nr 1 letzter Satz | **seit 2020 erhöht** (war 100.000 €) |
| `GEWST_HINZURECHNUNG_QUOTE` | 0,25 (1/4) | §8 Nr 1 letzter Satz | seit 2008 |

**Risiko:** Hoch. Der Freibetrag wurde 2020 verdoppelt — ähnliche Anpassungen können jederzeit kommen.

### 3. Verzugszinsen §288 BGB ([interest.ts](src/lib/accounting/interest.ts))

| Konstante | Wert | Gesetz |
|---|---|---|
| `B2B_LUMP_SUM_EUR` | 40 | §288 Abs. 5 BGB (seit 2014) |
| `B2B_SURCHARGE_POINTS` | 9 | §288 Abs. 2 BGB |
| `B2C_SURCHARGE_POINTS` | 5 | §288 Abs. 1 BGB |

**Risiko:** Mittel. Die 40 €-Pauschale war früher umstritten (EU-Richtlinie 2011/7/EU) — bei einer Anpassung müssen alle Tenants synchron sein.

### 4. Kleinbetragsrechnung §33 UStDV ([incoming-invoice-validator.ts](src/lib/accounting/incoming-invoice-validator.ts))

| Konstante | Wert | Gesetz | Historie |
|---|---|---|---|
| `KLEINBETRAG_THRESHOLD_EUR` | 250 | §33 UStDV | **seit 2017 angehoben** (war 150 €) |

**Risiko:** Mittel.

### 5. Default DATEV-Steuerschlüssel pro Kategorie ([tax-codes.ts](src/lib/accounting/tax-codes.ts))

```ts
DEFAULT_DATEV_CODE_PER_CATEGORY = {
  STANDARD_19: "9", REDUCED_7: "8", EXEMPT: "0",
  REVERSE_CHARGE_13B: "94", IGE_INTRA_EU: "95",
  IGL_INTRA_EU: "96", EXPORT: "97",
  KLEINUNTERNEHMER_19: "98", NOT_TAXABLE: "99",
}
```

**Problem:** Hardcoded SKR04-Konvention. SKR03 nutzt teilweise andere Schlüssel. Tenants können Codes pro TaxCode ändern, aber der **Erst-Materialize** beim Tenant-Onboarding verwendet diese Defaults — falscher Initial-Stand.

**Empfehlung:** Super-Admin sollte die Defaults pro Kontenrahmen pflegen können (SKR03 / SKR04 / IKR / SKR07).

### 6. SKR04-Range-Mapping ([skr04-mapping.ts](src/lib/accounting/skr04-mapping.ts))

Komplettes Range-Mapping `0xxx → ASSET_FIXED`, `1xxx → ASSET_CURRENT`, …, `3xxx → LIABILITY_*`. Funktioniert nur für SKR04.

**Risiko:** Hoch wenn ein Tenant **SKR03** verwendet. Dort liegen z.B. Erlöse bei 8xxx-Konten anders, und Bankkonten sind im Range 1000-1289 statt 1700-1999.

**Empfehlung:** Super-Admin pflegt mehrere Kontenrahmen-Mappings. Pro Tenant ein Setting `chartOfAccountsVersion: "SKR03" | "SKR04" | "IKR"`. Range-Resolver wählt dynamisch.

### 7. Bundesbank-Basiszinssätze ([base-interest-rate.ts](src/lib/accounting/base-interest-rate.ts))

Liste mit 13 hardcoded Werten 2020-2026. Wird beim ersten DB-Auto-Seed eingespielt.

**Status:** Schon halb-zentral via `BaseInterestRate`-Tabelle (Super-Admin-API existiert), aber die **Seed-Daten** sind im Code.

**Empfehlung:** Halbjährliche Aktualisierung über Super-Admin-UI (`POST /api/buchhaltung/base-interest-rates`) — ✅ bereits machbar. Hardcoded Seed kann bleiben, ist nur Bootstrap.

---

## 🟡 Admin (pro Mandant)

### 8. Bank-Match-Rundungstoleranz ([skonto-matcher.ts](src/lib/banking/skonto-matcher.ts))

| Konstante | Wert | Bedeutung |
|---|---|---|
| `DEFAULT_ROUNDING_TOLERANCE_EUR` | 0,02 | Cent-Differenz im Bank-Match die noch als "passend" gilt |

**Warum konfigurierbar:** Manche Mandanten arbeiten mit größeren Toleranzen (z.B. 0,10 € bei manueller Datenerfassung); andere wollen exakt-cent (Bank-Mandanten).

**Empfehlung:** `TenantSettings.bankMatchToleranceEur` (Default 0,02).

### 9. Bilanz-Identitäts-Toleranz ([bilanz.ts](src/lib/accounting/reports/bilanz.ts) + [year-end-close.ts](src/lib/accounting/year-end-close.ts))

| Konstante | Wert | Bedeutung |
|---|---|---|
| Toleranz für Aktiva=Passiva | 0,01 € | Differenz unter der die Bilanz als "ausgeglichen" gilt |

**Warum konfigurierbar:** Bei großen Tenants (Mio-€-Bilanzen) können Cent-Rundungen bei vielen Buchungen schnell auf 0,05 € summieren. Streng-Strict-Tenants wollen 0,00 € verlangen.

**Empfehlung:** `TenantSettings.bilanzToleranceEur` (Default 0,01). Konsistent zwischen Bilanz-Generator und Year-End-Close.

### 10. Jahresergebnis-Vortragskonto ([year-end-close.ts](src/lib/accounting/year-end-close.ts))

```ts
if (line.accountNumber === "9999") continue;
```

Hardcoded `"9999"` als synthetisches Konto für Jahresüberschuss/Jahresfehlbetrag.

**Warum konfigurierbar:** Tenants haben ein echtes Eigenkapital-Konto in das das Jahresergebnis fließt (z.B. "2010 Gezeichnetes Kapital" SKR04, "2880 Gewinnvortrag" SKR03).

**Empfehlung:** `TenantSettings.datevAccountAnnualResult` (Default "9999"). Beim Year-End-Close wird das Jahresergebnis tatsächlich auf dieses Konto vorgetragen statt synthetisch übersprungen.

### 11. Voll-Bezahlt-Toleranz ([invoice-payment.ts](src/lib/accounting/invoice-payment.ts))

```ts
const isFullyPaid = newPaid >= grossAmount - 0.005;
```

Halber-Cent-Toleranz für PARTIALLY_PAID → PAID Übergang.

**Empfehlung:** Kann mit `bankMatchToleranceEur` (Punkt 8) geteilt werden — wer 0,10 € im Bank-Match toleriert, sollte auch bei "voll bezahlt" 0,10 € tolerieren.

### 12. Auto-Posting USt-Konto-Heuristik ([auto-posting.ts](src/lib/accounting/auto-posting.ts))

```ts
const isStandard = Math.abs(taxRate - 19) < 0.01;
const isReduced = Math.abs(taxRate - 7) < 0.01;
```

Hardcoded 19% und 7% als "Standard"-Sätze. Bei Corona-Zeit (2020) waren die Sätze temporär auf 16% bzw. 5%.

**Empfehlung:** Mittelfristig: USt-Konto pro TaxCode-Template direkt referenzieren (P10 hat das Feld `taxAccountId`), dann ist dieser Match-Code obsolet. Kurzfristig: OK.

### 13. UStVA-Kennzahl-Mapping ([ustva.ts](src/lib/accounting/reports/ustva.ts))

```ts
function kennzahlForCategory(category) {
  STANDARD_19 → "81", REDUCED_7 → "86", EXEMPT → "89", ...
}
```

Hardcoded Fallback-Mapping wenn `taxCode.template.defaultVatReportBox` null ist. Kennzahlen können von Sondertenants abweichen (z.B. Bauleistungen § 13b auf KZ 78 statt 46).

**Empfehlung:** Tenants können Kennzahlen pro TaxCode via `vatReportBoxOverride` schon override-n (✅ P10). Der Fallback bleibt sinnvoll als Default.

---

## 🟢 Hardcode OK (kein Konfig-Bedarf)

### 14. IBAN-Längen pro Land ([iban.ts](src/lib/iban.ts))

`IBAN_LENGTHS` für 76 Länder — laut ISO 13616. Nur SWIFT-Standardisierung kann das ändern (kommt 1-2× pro Dekade bei neuen Ländern).

**Status:** OK. Bei neuen Ländern (z.B. Vatikan-IBAN-Änderung) muss die Liste aktualisiert werden, aber ohne Tenant-Anpassung möglich.

### 15. IDEA-DTD-Name ([gobd-export.ts](src/lib/accounting/gobd-export.ts))

`IDEA_DTD_NAME = "gdpdu-01-08-2002.dtd"` — vom BMF festgelegt, ändert sich seit 22 Jahren nicht.

### 16. 365-Tage-Bankjahr ([interest.ts](src/lib/accounting/interest.ts))

Verzugszinsen werden kalendergenau berechnet (§§247/288 BGB unspezifisch). 365 ist die gängige Praxis. Eine 360-Tage-Variante würde nur bei Bank-Mandanten relevant.

**Status:** OK. Bei Bedarf später als Tenant-Setting nachrüstbar.

### 17. ELSTER-Kennzahl-Labels ([ustva.ts](src/lib/accounting/reports/ustva.ts))

`KENNZAHL_LABELS` für die UStVA-Formularfelder. Wird vom Finanzamt vorgegeben — Tenants müssen das nicht ändern.

---

## Konkrete Umsetzungs-Empfehlungen (priorisiert)

### 🚨 Phase A (sollte zeitnah) — Super-Admin-Settings-Modul

Anlage einer `SystemSetting`-Tabelle (global, kein tenantId) für gesetzliche Werte:

```prisma
model SystemSetting {
  key         String   @id @db.VarChar(100)
  value       Json
  category    String   @db.VarChar(50)  // "GWG", "GEWST", "VERZUGSZINS", "KLEINBETRAG", "DATEV_DEFAULT"
  description String?
  validFrom   DateTime
  validTo     DateTime?
  updatedById String
  updatedAt   DateTime @updatedAt
}
```

Initial gepflegte Keys:
- `GWG_SOFORT_THRESHOLD_NET_EUR` = 800
- `GWG_POOL_LOWER_NET_EUR` = 250
- `GWG_POOL_UPPER_NET_EUR` = 1000
- `GWG_POOL_YEARS` = 5
- `DEGRESSIVE_AFA_CUTOFF` = "2023-01-01"
- `GEWST_QUOTES` = { INTEREST: 1.0, RENT_MOVABLE: 0.2, ... }
- `GEWST_FREIBETRAG_EUR` = 200000
- `GEWST_HINZURECHNUNG_QUOTE` = 0.25
- `VERZUGSZINS_B2B_LUMP_SUM_EUR` = 40
- `VERZUGSZINS_B2B_SURCHARGE_POINTS` = 9
- `VERZUGSZINS_B2C_SURCHARGE_POINTS` = 5
- `KLEINBETRAG_THRESHOLD_EUR` = 250

API: `GET/PATCH /api/superadmin/system-settings`

Lib-Module rufen `getSystemSetting("KEY")` mit Cache (10 min).

**Aufwand:** ~1 PT (Schema + API + Cache-Layer + Refactor der 4 Lib-Module). Pflicht-Migration für historische Werte.

### 🟡 Phase B (mittelfristig) — TenantSettings erweitern

In `src/lib/tenant-settings.ts` ergänzen:

```ts
bilanzToleranceEur: number;        // Default 0.01
bankMatchToleranceEur: number;     // Default 0.02
datevAccountAnnualResult: string;  // Default "9999"
chartOfAccountsVersion: "SKR03" | "SKR04" | "IKR";  // Default "SKR04"
```

Refactors:
- `bilanz.ts` + `year-end-close.ts` → nutzen `bilanzToleranceEur`
- `skonto-matcher.ts` → nutzt `bankMatchToleranceEur` als Default
- `invoice-payment.ts` → nutzt `bankMatchToleranceEur` für isFullyPaid
- `year-end-close.ts` → trägt Jahresergebnis tatsächlich auf `datevAccountAnnualResult` vor
- `skr04-mapping.ts` → wird zu `chart-of-accounts-mapping.ts` mit Switch nach `chartOfAccountsVersion`

**Aufwand:** ~2 PT.

### 🟢 Phase C (nice-to-have) — SKR03-Range-Mapping

Wenn Tenants mit SKR03 onboarden: zusätzliches `skr03-mapping.ts` analog zu SKR04. Switch via `chartOfAccountsVersion`. Default-DATEV-Codes pro Kontenrahmen.

**Aufwand:** ~1 PT pro zusätzlichem Kontenrahmen.

---

## Total-Effort Roadmap

| Phase | Effort | Risiko-Reduktion |
|---|---|---|
| A. SystemSetting für gesetzliche Werte | ~1 PT | Hoch — wir können auf Gesetzesänderungen ohne Code-Deploy reagieren |
| B. Mandanten-Toleranzen + Annual-Result-Konto | ~2 PT | Mittel — Multi-Mandanten-Fähigkeit |
| C. SKR03 (oder weitere Kontenrahmen) | ~1 PT pro Rahmen | Niedrig — nur bei konkretem Bedarf |

**Gesamt: 3-5 PT** für vollständige Konfigurierbarkeit. Phase A allein ist die wichtigste — sie nimmt das Deploy-Risiko bei Gesetzesänderungen aus dem Spiel.
