# WPM Buchhaltungspaket — Addon-Spezifikation

> **Feature-Flag:** `accounting.enabled`
> **Zielgruppe:** Geschaeftsfuehrer, Buchhalter, Steuerberater-Zuarbeit
> **Grundprinzip:** Keine Steuerberatung ersetzen, sondern die Zuarbeit automatisieren

---

## Ueberblick

Das Buchhaltungspaket erweitert WPM um eine **doppelte Buchfuehrung** mit
SKR03-Kontenrahmen, automatischer Verbuchung aller Geschaeftsvorfaelle,
Bankanbindung, Mahnwesen und standardisierten Reports (BWA, SuSa, UStVA).

Es baut auf dem bestehenden Rechnungswesen auf (Invoices, Settlements,
JournalEntries) und schliesst die Luecke zwischen "Rechnung erstellt" und
"Steuerberater hat alle Daten".

### Was bereits existiert (wird NICHT neu gebaut)

| Bereich | Status |
|---------|--------|
| Ausgangsrechnungen (Invoice, PDF, XRechnung) | Fertig |
| Eingangsrechnungen (IncomingInvoice, OCR, Splits) | Fertig |
| Energie-/Pachtabrechnungen mit Rechnungserstellung | Fertig |
| Journalbuchungen (manuell Soll/Haben) | Fertig |
| DATEV-Export (Buchungsstapel CSV EXTF 510) | Fertig |
| Kostenstellen & Wirtschaftsplan | Fertig |
| Steuersatz-Verwaltung | Fertig |
| Billing Automation (BillingRule) | Fertig |
| Vendor-Verwaltung | Fertig |

### Was NEU kommt (dieses Addon)

| # | Modul | Prioritaet |
|---|-------|-----------|
| A | **Kontenrahmen (SKR03)** — Master-Kontenstamm | HOCH |
| B | **Auto-Buchung** — Rechnungen automatisch verbuchen | HOCH |
| C | **MT940/CAMT Bankimport** — Kontoauszuege einlesen | HOCH |
| D | **Zahlungsabgleich** — Automatisches Payment-Matching | HOCH |
| E | **Mahnwesen** — 3-Stufen-Mahnung mit PDF & E-Mail | HOCH |
| F | **SEPA-XML** — Pain.001 Ueberweisungen, Pain.008 Lastschriften | MITTEL |
| G | **BWA** — Betriebswirtschaftliche Auswertung | HOCH |
| H | **SuSa** — Summen- und Saldenliste | HOCH |
| I | **UStVA-Daten** — Umsatzsteuer-Voranmeldung Zuarbeit | MITTEL |
| J | **Anlagenbuchhaltung (AfA)** — WEA-Abschreibungen | MITTEL |
| K | **Kassenbuch** — GoBD-konformes Kassenbuch | NIEDRIG |
| L | **Jahresabschluss** — Abschluss-Checkliste & Berichte | NIEDRIG |

---

## A. Kontenrahmen (SKR03) — Kontenstamm

### Problem
Aktuell sind SKR03-Konten als Strings in Invoice-Items und DATEV-Export
hardcodiert (z.B. `"8400"`, `"4210"`). Es gibt keine Validierung, keine
Suche, keine Zuordnungshilfe.

### Loesung

**Neues Prisma-Model: `Account`**

```
Account
  id            String    @id @default(cuid())
  tenantId      String
  accountNumber String    — z.B. "8400" (4-stellig SKR03)
  name          String    — z.B. "Erloese 19% USt"
  category      AccountCategory  — ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
  taxBehavior   TaxBehavior      — TAXABLE_19, TAXABLE_7, EXEMPT, INPUT_TAX, OUTPUT_TAX, NONE
  isActive      Boolean   @default(true)
  isSystem      Boolean   @default(false)  — vom Seed, nicht loeschbar
  parentNumber  String?   — fuer Kontenhierarchie (z.B. "84" -> "8400")
  notes         String?

  @@unique([tenantId, accountNumber])
```

**Enum: AccountCategory**
- ASSET (Aktiva: 0xxx-2xxx)
- LIABILITY (Passiva: 3xxx)
- REVENUE (Ertraege: 8xxx)
- EXPENSE (Aufwendungen: 4xxx-7xxx)
- EQUITY (Eigenkapital: 9xxx)

**Seed-Daten:** ~80 branchenrelevante SKR03-Konten vorbelegt:

| Konto | Name | Kategorie |
|-------|------|-----------|
| 0210 | Technische Anlagen (WEA) | ASSET |
| 0280 | Kumulierte Abschreibungen TA | ASSET |
| 1200 | Bank | ASSET |
| 1400 | Forderungen aus L+L | ASSET |
| 1576 | Abziehbare Vorsteuer 19% | ASSET |
| 1776 | Umsatzsteuer 19% | LIABILITY |
| 1780 | Umsatzsteuer-Vorauszahlungen | LIABILITY |
| 3000 | Verbindlichkeiten aus L+L | LIABILITY |
| 4120 | Gehaelter (Betriebsfuehrung) | EXPENSE |
| 4210 | Pachtaufwand | EXPENSE |
| 4360 | Versicherungen | EXPENSE |
| 4830 | Abschreibungen Sachanlagen | EXPENSE |
| 4950 | Reparatur/Instandhaltung | EXPENSE |
| 4970 | Nebenkosten Geldverkehr | EXPENSE |
| 8400 | Erloese 19% USt (Einspeisung) | REVENUE |
| 8338 | Erloese Direktvermarktung | REVENUE |
| 8200 | Erloese steuerfrei | REVENUE |
| 8736 | Gewaehrte Skonti | REVENUE |
| 9000 | Eigenkapital Kommanditisten | EQUITY |

**UI:** `/admin/kontenrahmen`
- Tabelle aller Konten mit Suche/Filter nach Kategorie
- Inline-Edit fuer Name, Aktiv-Status, Notizen
- System-Konten (isSystem) sind nicht loeschbar
- Konto-Picker-Dropdown fuer Invoice-Items (ersetzt freies Textfeld)

**Migration bestehender Daten:**
- Alle existierenden `datevKonto`/`datevGegenkonto` Strings in InvoiceItem
  werden gegen die neue Account-Tabelle validiert
- InvoiceItem.datevKonto wird zu einer optionalen Relation auf Account

---

## B. Auto-Buchung — Rechnungen automatisch verbuchen

### Problem
Aktuell werden JournalEntries nur manuell erstellt. Rechnungen erzeugen
keine Buchungssaetze. Der Steuerberater bekommt nur den DATEV-Export.

### Loesung

Jede Statusaenderung einer Rechnung erzeugt automatisch JournalEntry-Zeilen:

**Ausgangsrechnung (Invoice) wird SENT:**
```
Soll 1400 Forderungen         1.190,00 EUR
  Haben 8400 Erloese 19%      1.000,00 EUR
  Haben 1776 USt 19%            190,00 EUR
```

**Ausgangsrechnung wird PAID:**
```
Soll 1200 Bank               1.190,00 EUR
  Haben 1400 Forderungen     1.190,00 EUR
```

**Ausgangsrechnung wird CANCELLED (Storno):**
```
Soll 8400 Erloese 19%        1.000,00 EUR
Soll 1776 USt 19%              190,00 EUR
  Haben 1400 Forderungen     1.190,00 EUR
```

**Eingangsrechnung (IncomingInvoice) wird APPROVED:**
```
Soll 4210 Pachtaufwand        1.000,00 EUR
Soll 1576 Vorsteuer 19%        190,00 EUR
  Haben 3000 Verbindlichkeiten 1.190,00 EUR
```

**Eingangsrechnung wird PAID:**
```
Soll 3000 Verbindlichkeiten  1.190,00 EUR
  Haben 1200 Bank            1.190,00 EUR
```

**Implementierung:**
- `src/lib/accounting/auto-posting.ts` — Buchungslogik
- Wird als Event-Handler nach Statuswechsel aufgerufen
- Jeder auto-generierte JournalEntry bekommt `source: "AUTO"` und
  `referenceType: "INVOICE" | "INCOMING_INVOICE"`, `referenceId: invoiceId`
- Konfigurierbar: Tenant kann Auto-Buchung an/aus schalten
- Bestehende manuelle JournalEntries bleiben unberuehrt

**Neues Feld auf JournalEntry:**
```
source        PostingSource  @default(MANUAL)  — MANUAL, AUTO, IMPORT
referenceType String?        — "INVOICE", "INCOMING_INVOICE", "BANK_TRANSACTION"
referenceId   String?
```

---

## C. MT940/CAMT Bankimport

### Problem
Bankbewegungen werden manuell abgeglichen. Es gibt zwar eine
`/invoices/bank-import`-Seite, aber keinen Parser fuer Standard-Formate.

### Loesung

**Unterstuetzte Formate:**
- **MT940** (SWIFT) — noch gaengigstes Format bei deutschen Banken
  npm: `mt940js` (MIT, ~20 kB)
- **CAMT.053** (ISO 20022 XML) — modernes Format, loest MT940 ab
  Parsing: Standard XML-Parser (keine Extra-Dependency)

**Neues Prisma-Model: `BankTransaction`**

```
BankTransaction
  id              String   @id @default(cuid())
  tenantId        String
  fundId          String   — Zuordnung zur Gesellschaft
  bankAccountIban String   — Quell-IBAN
  bookingDate     DateTime
  valueDate       DateTime
  amount          Decimal  — positiv = Eingang, negativ = Ausgang
  currency        String   @default("EUR")
  counterpartName String?
  counterpartIban String?
  reference       String?  — Verwendungszweck
  endToEndId      String?  — SEPA End-to-End-ID

  // Matching
  matchStatus     MatchStatus @default(UNMATCHED)
  matchedInvoiceId      String?  — -> Invoice
  matchedIncomingId     String?  — -> IncomingInvoice
  matchConfidence       Float?   — 0.0 - 1.0
  matchedAt             DateTime?
  matchedById           String?  — User der Match bestaetigt hat

  // Import-Metadaten
  importBatchId   String   — alle Transaktionen eines Imports zusammen
  importFileName  String
  importedAt      DateTime @default(now())
  rawData         String?  — Original-Zeile fuer Audit

  @@unique([tenantId, bankAccountIban, bookingDate, amount, reference])
```

**Enum: MatchStatus**
- UNMATCHED — Noch nicht zugeordnet
- SUGGESTED — System-Vorschlag (Confidence > 0.7)
- MATCHED — Bestaetigt (manuell oder auto)
- IGNORED — Bewusst ignoriert (z.B. Bankgebuehren)

**Matching-Algorithmus (Scoring):**
1. **Rechnungsnummer im Verwendungszweck** -> +50 Punkte
2. **Betrag stimmt exakt** -> +30 Punkte
3. **IBAN des Debitors/Kreditors stimmt** -> +10 Punkte
4. **End-to-End-ID stimmt** -> +10 Punkte (bei SEPA)
5. Confidence = Punkte / 100, auto-match bei >= 0.9

**UI:** `/buchhaltung/bank`
- Upload-Bereich: Drag & Drop fuer MT940/CAMT-Dateien
- Transaktionsliste mit Spalten: Datum, Betrag, Gegenpartei, Verwendungszweck, Status
- Pro Zeile: Match-Vorschlag mit Confidence-Badge, Buttons [Bestaetigen] [Andere Rechnung] [Ignorieren]
- Filter: Nur ungematchte, Zeitraum, Gesellschaft (Fund)
- Zusammenfassung oben: X von Y zugeordnet, Summe Eingaenge/Ausgaenge

**API-Endpunkte:**
```
POST   /api/buchhaltung/bank/import          — MT940/CAMT hochladen + parsen
GET    /api/buchhaltung/bank/transactions     — Liste mit Filter
POST   /api/buchhaltung/bank/transactions/[id]/match    — Zuordnung bestaetigen
POST   /api/buchhaltung/bank/transactions/[id]/ignore   — Ignorieren
POST   /api/buchhaltung/bank/transactions/auto-match    — Batch Auto-Match
```

**Auto-Buchung bei Match:**
Wenn eine BankTransaction einem Invoice zugeordnet wird:
1. Invoice.status -> PAID, paidAt = valueDate
2. Auto-JournalEntry: Bank an Forderungen (siehe Modul B)

---

## D. Zahlungsabgleich (erweitert bestehende Reconciliation)

Baut auf Modul C auf. Die bestehende `/invoices/reconciliation`-Seite wird
zum neuen `/buchhaltung/bank` migriert und erweitert:

**Neue Features:**
- Split-Matching: Eine Bankbewegung auf mehrere Rechnungen aufteilen
  (Sammelueberweisungen)
- Skonto-Erkennung: Wenn Betrag = Brutto - Skonto -> Auto-Skonto-Buchung
  ```
  Soll 1200 Bank                1.154,26 EUR
  Soll 8736 Gewaehrte Skonti      35,74 EUR
    Haben 1400 Forderungen      1.190,00 EUR
  ```
- Teilzahlungen: Offener Restbetrag auf Rechnung bleibt stehen
- Gebuehren-Erkennung: Bankgebuehren auto-buchen auf 4970

---

## E. Mahnwesen — 3-Stufen-Mahnung

### Problem
Invoice hat `reminderLevel`/`reminderSentAt`-Felder, aber kein
automatisiertes Mahnsystem mit PDF-Briefen und Gebuehrenberechnung.

### Loesung

**Neues Prisma-Model: `DunningRun`**

```
DunningRun
  id          String    @id @default(cuid())
  tenantId    String
  runDate     DateTime  @default(now())
  createdById String
  status      DunningRunStatus  — DRAFT, EXECUTED, CANCELLED

DunningItem
  id            String  @id @default(cuid())
  dunningRunId  String
  invoiceId     String
  level         Int     — 1, 2, 3
  dueDate       DateTime — Faelligkeitsdatum der Rechnung
  overdueDays   Int
  amount        Decimal  — Offener Betrag
  feeAmount     Decimal  — Mahngebuehr
  interestAmount Decimal — Verzugszinsen
  letterPdfUrl  String?
  emailSentAt   DateTime?
  status        DunningItemStatus — PENDING, SENT, PAID, WITHDRAWN
```

**Konfiguration (Tenant-Settings):**
```
dunning.level1.afterDays: 14       — Tage nach Faelligkeit
dunning.level1.fee: 0              — Keine Gebuehr bei 1. Mahnung
dunning.level1.template: "freundlich"

dunning.level2.afterDays: 28
dunning.level2.fee: 5.00           — 5 EUR Mahngebuehr
dunning.level2.template: "bestimmt"

dunning.level3.afterDays: 42
dunning.level3.fee: 10.00
dunning.level3.interestRate: 5.0   — 5% p.a. Verzugszinsen
dunning.level3.template: "letzte_mahnung"
```

**Mahnstufen-Logik:**
1. **Zahlungserinnerung** (Stufe 1): Freundlicher Hinweis, keine Gebuehr
2. **1. Mahnung** (Stufe 2): Gebuehr 5 EUR, Fristsetzung 14 Tage
3. **Letzte Mahnung** (Stufe 3): Gebuehr 10 EUR + Verzugszinsen,
   Androhung rechtlicher Schritte

**Verzugszinsen-Berechnung:**
```
Zinsen = Offener Betrag * (Zinssatz / 100) * (UeberfaelligeTage / 365)
```

**PDF-Brief:** Generiert mit bestehendem PDF-System (Letterhead des Funds)
- DIN 5008 Briefformat
- Anrede, Betreff, Rechnungsliste, Summe, Frist
- Bankverbindung fuer Zahlung

**UI:** `/buchhaltung/mahnwesen`
- Dashboard: Offene Posten nach Mahnstufe (Balkendiagramm)
- "Mahnlauf starten"-Button -> Erstellt DunningRun (DRAFT)
- Preview: Alle Mahnungen im Entwurf mit Brief-Vorschau
- "Ausfuehren" -> PDFs generieren, E-Mails senden, Levels erhoehen
- Einzelrechnung: Mahnung zuruecknehmen, als bezahlt markieren

**API-Endpunkte:**
```
POST   /api/buchhaltung/dunning/run           — Neuen Mahnlauf erstellen
GET    /api/buchhaltung/dunning/runs           — Liste aller Laeufe
GET    /api/buchhaltung/dunning/run/[id]       — Details mit Items
POST   /api/buchhaltung/dunning/run/[id]/execute — Ausfuehren
POST   /api/buchhaltung/dunning/run/[id]/cancel  — Abbrechen
GET    /api/buchhaltung/dunning/overdue        — Alle ueberfaelligen Rechnungen
POST   /api/buchhaltung/dunning/items/[id]/withdraw — Mahnung zuruecknehmen
```

---

## F. SEPA-XML Export

### Problem
Ausgehende Zahlungen (Pachten, Vendor-Rechnungen) muessen manuell im
Online-Banking eingegeben werden.

### Loesung

**Pain.001 (Ueberweisungen):**
- Generiert SEPA Credit Transfer XML
- Fuer: Genehmigte Eingangsrechnungen, Pachtauszahlungen
- Sammelt alle offenen Zahlungen pro Fund/Bankkonto
- Output: XML-Datei zum Upload ins Online-Banking

**Pain.008 (Lastschriften):** (optional, spaeter)
- Fuer: Jahresbeitraege Gesellschafter
- Benoetigt SEPA-Mandat-Verwaltung

**Neues Prisma-Model: `SepaPaymentBatch`**

```
SepaPaymentBatch
  id              String    @id @default(cuid())
  tenantId        String
  fundId          String
  batchType       SepaBatchType  — CREDIT_TRANSFER, DIRECT_DEBIT
  createdAt       DateTime  @default(now())
  createdById     String
  totalAmount     Decimal
  transactionCount Int
  status          SepaBatchStatus — DRAFT, EXPORTED, SUBMITTED, PROCESSED
  xmlFileUrl      String?
  executionDate   DateTime  — Gewuenschter Ausfuehrungstag

SepaPaymentItem
  id              String    @id @default(cuid())
  batchId         String
  creditorName    String
  creditorIban    String
  creditorBic     String?
  amount          Decimal
  reference       String    — Verwendungszweck (max 140 Zeichen)
  endToEndId      String    — Eindeutige Referenz
  incomingInvoiceId String? — Bezug zur Eingangsrechnung
  invoiceId       String?   — Bezug zur Ausgangsrechnung (Gutschrift)
```

**UI:** `/buchhaltung/sepa`
- Offene Zahlungen anzeigen (genehmigte IncomingInvoices, faellige Pachten)
- Checkboxen zum Auswaehlen
- "SEPA-Datei erstellen" -> XML generieren und herunterladen
- Historie der exportierten Batches

**XML-Generierung:**
- Kein npm-Package noetig — SEPA Pain.001.003.03 ist simples XML
- Template-basiert mit Escaping (Umlaute etc.)
- Validierung: IBAN-Pruefziffer, BIC-Format, Zeichensatz (SEPA Latin)

---

## G. BWA — Betriebswirtschaftliche Auswertung

### Problem
Es gibt P&L per Kostenstelle (/wirtschaftsplan/pl), aber keine
standardisierte BWA wie sie jeder Steuerberater/Banker erwartet.

### Loesung

Die BWA aggregiert JournalEntry-Daten nach SKR03-Kontengruppen in das
DATEV-Standard-BWA-Schema (BWA-Form 01):

```
BWA Form 01 — Kurzfristige Erfolgsrechnung
============================================

1. Umsatzerloese (8xxx)
   - Einspeisung (8400)
   - Direktvermarktung (8338)
   - Sonstige Erloese (8200, 8xxx)

2. Bestandsveraenderungen (0)

3. Gesamtleistung (1+2)

4. Materialaufwand
   - Pachtaufwand (4210)
   - Reparatur/Wartung (4950)

5. Rohertrag (3-4)

6. Personalkosten
   - Betriebsfuehrung (4120)

7. Sonstige betriebl. Aufwendungen
   - Versicherungen (4360)
   - Nebenkosten Geldverkehr (4970)
   - Uebrige (4xxx)

8. EBITDA (5-6-7)

9. Abschreibungen (4830)

10. EBIT (8-9)

11. Zinsergebnis
    - Zinsaufwand (2100)
    - Zinsertrag (2650)

12. Ergebnis vor Steuern (10+11)

13. Steuern vom Einkommen (7xxx)

14. Vorlaeufiges Ergebnis (12-13)
```

**Features:**
- Zeitraum waehlbar: Monat, Quartal, Jahr, frei
- Vergleich: Vorjahr, Vormonat, Budget (aus Wirtschaftsplan)
- Pro Fund oder konsolidiert (alle Funds)
- Abweichung absolut und prozentual
- Export: PDF, XLSX, CSV

**UI:** `/buchhaltung/bwa`
- Zeitraum-Picker + Fund-Selector + Vergleichsmodus
- Tabelle im BWA-Standard-Layout
- Farbliche Hervorhebung bei Abweichung > 10%
- Drill-Down: Klick auf Zeile zeigt Einzelbuchungen

**API:**
```
GET /api/buchhaltung/bwa?fundId=X&from=2026-01&to=2026-12&compare=PRIOR_YEAR
```

---

## H. SuSa — Summen- und Saldenliste

### Problem
Kein Ueberblick ueber alle Kontensalden. Der Steuerberater braucht die
SuSa fuer den Jahresabschluss.

### Loesung

Aggregiert alle JournalEntry-Zeilen pro SKR03-Konto:

```
Konto | Name                    | Anfangsbestand | Soll    | Haben   | Saldo
------|-------------------------|----------------|---------|---------|--------
0210  | Technische Anlagen      |   2.500.000,00 |    0,00 |    0,00 | 2.500.000,00
0280  | Kum. Abschreibungen     |    -750.000,00 |    0,00 | 125.000 |  -875.000,00
1200  | Bank                    |     234.567,89 | 89.000  | 45.000  |   278.567,89
1400  | Forderungen L+L         |      12.340,00 | 95.000  | 87.000  |    20.340,00
1576  | Vorsteuer               |       1.234,56 |  5.700  |  5.700  |     1.234,56
...
```

**Features:**
- Stichtag oder Zeitraum
- Per Fund oder konsolidiert
- Nur aktive Konten oder alle
- Anfangsbestand = Summe aller Buchungen vor Zeitraum
- Export: XLSX, CSV, PDF
- Summenzeilen pro AccountCategory (Aktiva, Passiva, Aufwand, Ertrag)
- Bilanz-Check: Aktiva == Passiva (Warnhinweis bei Abweichung)

**UI:** `/buchhaltung/susa`
**API:** `GET /api/buchhaltung/susa?fundId=X&date=2026-12-31`

---

## I. UStVA-Daten — Umsatzsteuer-Voranmeldung

### Problem
UStVA-Werte muessen manuell zusammengetragen werden.

### Loesung

Aggregiert Umsatzsteuer-relevante Buchungen nach ELSTER-Kennzahlen:

```
UStVA Zeitraum: Januar 2026
============================

Steuerpflichtige Umsaetze:
  Kz 81: Umsaetze 19%           85.000,00 EUR
  Kz 86: Umsaetze 7%                 0,00 EUR

Steuerbetraege:
  Kz 66: USt auf Kz 81          16.150,00 EUR
  Kz 67: USt auf Kz 86               0,00 EUR

Abziehbare Vorsteuer:
  Kz 66: Vorsteuer                3.420,00 EUR

Verbleibende USt:
  Kz 83: Zahllast/Erstattung    12.730,00 EUR
```

**Kein ELSTER-Filing!** Nur die Zahlen aufbereiten — der Steuerberater
oder das ELSTER-Portal uebernimmt die eigentliche Meldung.

**UI:** `/buchhaltung/ustva`
- Monat/Quartal-Picker + Fund-Selector
- Kennzahlen-Tabelle mit Drill-Down auf Einzelbuchungen
- Export: PDF (zum Ausdrucken), CSV

**API:** `GET /api/buchhaltung/ustva?fundId=X&period=2026-01`

---

## J. Anlagenbuchhaltung (AfA)

### Problem
WEA sind die groessten Vermoegensgegenstaende einer Betreibergesellschaft.
AfA-Buchungen muessen monatlich/jaehrlich erstellt werden.

### Loesung

**Neues Prisma-Model: `FixedAsset`**

```
FixedAsset
  id                String    @id @default(cuid())
  tenantId          String
  fundId            String
  turbineId         String?   — Optionale Verknuepfung zur Turbine
  assetNumber       String    — Inventarnummer
  name              String    — z.B. "WEA 1 - Enercon E-82"
  acquisitionDate   DateTime
  acquisitionCost   Decimal   — Anschaffungskosten
  usefulLifeMonths  Int       — Nutzungsdauer (WEA typisch: 240 = 20 Jahre)
  depreciationMethod DepreciationMethod — LINEAR, DECLINING_BALANCE
  residualValue     Decimal   @default(0) — Restwert
  accountAsset      String    — SKR03 Anlagekonto (z.B. "0210")
  accountDepr       String    — SKR03 AfA-Konto (z.B. "4830")
  accountAccumDepr  String    — SKR03 kum. AfA (z.B. "0280")
  status            AssetStatus — ACTIVE, DISPOSED, FULLY_DEPRECIATED
  disposedAt        DateTime?
  disposalProceeds  Decimal?

FixedAssetDepreciation
  id          String    @id @default(cuid())
  assetId     String
  periodYear  Int
  periodMonth Int
  amount      Decimal   — Monatlicher AfA-Betrag
  cumulative  Decimal   — Kumulierte AfA bis inkl. dieses Monats
  bookValue   Decimal   — Restbuchwert nach AfA
  journalEntryId String? — Verweis auf auto-generierte Buchung
  posted      Boolean   @default(false)

  @@unique([assetId, periodYear, periodMonth])
```

**Lineare AfA-Berechnung:**
```
Monatliche AfA = (Anschaffungskosten - Restwert) / Nutzungsdauer in Monaten
```

Beispiel WEA (3,5 Mio EUR, 20 Jahre):
```
3.500.000 / 240 = 14.583,33 EUR / Monat = 175.000 EUR / Jahr
```

**AfA-Lauf:**
- Monatlich oder jaehrlich ausfuehrbar
- Erstellt FixedAssetDepreciation-Eintraege
- Auto-Buchung:
  ```
  Soll 4830 Abschreibungen     14.583,33 EUR
    Haben 0280 Kum. Abschr.    14.583,33 EUR
  ```

**UI:** `/buchhaltung/anlagen`
- Anlagenverzeichnis (Tabelle)
- Pro Anlage: Stammdaten, AfA-Verlauf, Restbuchwert-Chart
- "AfA-Lauf starten" fuer gewaehlten Monat
- Anlagen-Spiegel (Zugaenge, Abgaenge, AfA, Restbuchwert)

**API:**
```
GET    /api/buchhaltung/assets              — Anlagenverzeichnis
POST   /api/buchhaltung/assets              — Anlage erfassen
GET    /api/buchhaltung/assets/[id]         — Details + AfA-Verlauf
PUT    /api/buchhaltung/assets/[id]         — Bearbeiten
POST   /api/buchhaltung/assets/[id]/dispose — Abgang buchen
POST   /api/buchhaltung/assets/depreciation-run — AfA-Lauf starten
GET    /api/buchhaltung/assets/mirror       — Anlagenspiegel
```

---

## K. Kassenbuch (GoBD-konform)

Einfaches Kassenbuch fuer Bargeschaefte (selten bei Windparks, aber
GoBD-Pflicht wenn Bargeld fliesst).

**Model: `CashBookEntry`**
- Datum, Belegnummer, Beschreibung, Einnahme/Ausgabe, Saldo
- Unveraenderbar nach Buchung (GoBD: keine nachtraegliche Aenderung)
- Storno nur durch Gegenbuchung

**UI:** `/buchhaltung/kassenbuch`
- Chronologische Liste mit laufendem Saldo
- Neuer Eintrag: Formular mit Beleg-Upload
- Monatsabschluss mit Zaehlergebnis

---

## L. Jahresabschluss-Vorbereitung

Interaktive Checkliste + Reports fuer den Jahresabschluss:

**Checkliste:**
- [ ] Alle Bankkonten abgestimmt (letzter Import = 31.12.)
- [ ] Alle Rechnungen des Jahres verbucht
- [ ] Offene Posten geprueft (Forderungen + Verbindlichkeiten)
- [ ] AfA-Lauf Dezember ausgefuehrt
- [ ] Rueckstellungen gebucht
- [ ] Rechnungsabgrenzung geprueft
- [ ] SuSa kontrolliert (Aktiva = Passiva)
- [ ] UStVA Dezember / Q4 geprueft
- [ ] DATEV-Export erstellt

**Reports:**
- Offene-Posten-Liste (Forderungen + Verbindlichkeiten per Stichtag)
- Anlagenspiegel
- SuSa zum 31.12.
- BWA Gesamtjahr
- DATEV Jahres-Buchungsstapel

**UI:** `/buchhaltung/jahresabschluss`

---

## Technische Architektur

### Feature-Flag
```
accounting.enabled = true/false (per Tenant)
```

Wenn deaktiviert:
- Sidebar-Eintraege unter "Buchhaltung" versteckt
- API-Routes geben 404 zurueck
- Bestehende Rechnungs-/DATEV-Funktionen bleiben verfuegbar

### Routing-Struktur
```
/buchhaltung                    — Dashboard (Kontostand, OP, Faelligkeiten)
/buchhaltung/bank               — Bankimport + Zahlungsabgleich
/buchhaltung/mahnwesen          — Mahnlaeufe
/buchhaltung/sepa               — SEPA-Export
/buchhaltung/bwa                — BWA-Report
/buchhaltung/susa               — Summen-/Saldenliste
/buchhaltung/ustva              — UStVA-Daten
/buchhaltung/anlagen            — Anlagenbuchhaltung
/buchhaltung/kassenbuch         — Kassenbuch
/buchhaltung/jahresabschluss    — Jahresabschluss-Checkliste
/admin/kontenrahmen             — SKR03-Kontenverwaltung
```

### Sidebar-Gruppe
```
Buchhaltung (featureFlag: "accounting.enabled")
  +-- Uebersicht          /buchhaltung
  +-- Bankimport          /buchhaltung/bank
  +-- Mahnwesen           /buchhaltung/mahnwesen
  +-- SEPA-Export         /buchhaltung/sepa
  +-- BWA                 /buchhaltung/bwa
  +-- Summen & Salden     /buchhaltung/susa
  +-- UStVA               /buchhaltung/ustva
  +-- Anlagenbuchhaltung  /buchhaltung/anlagen
  +-- Kassenbuch          /buchhaltung/kassenbuch
  +-- Jahresabschluss     /buchhaltung/jahresabschluss
```

### Neue Prisma-Models (Zusammenfassung)

| Model | Zweck |
|-------|-------|
| Account | SKR03-Kontenrahmen |
| BankTransaction | Importierte Bankbewegungen |
| DunningRun | Mahnlauf |
| DunningItem | Einzelne Mahnung |
| SepaPaymentBatch | SEPA-Export-Batch |
| SepaPaymentItem | Einzelne SEPA-Zahlung |
| FixedAsset | Anlagegut (WEA etc.) |
| FixedAssetDepreciation | AfA-Buchung pro Monat |
| CashBookEntry | Kassenbuch-Eintrag |

### Erweiterte bestehende Models

| Model | Aenderung |
|-------|-----------|
| JournalEntry | + source, referenceType, referenceId |
| InvoiceItem | datevKonto wird optionale Account-Relation |

### NPM Dependencies
```
mt940js    — MT940 Parser (~20 kB)
```
Kein weiteres Package noetig. CAMT = XML, SEPA = XML, BWA = Aggregation.

---

## Implementierungs-Reihenfolge

### Phase 1 — Fundament (Prio HOCH)
1. **A: Kontenrahmen** — Ohne Konten keine Buchungen
2. **B: Auto-Buchung** — Kern der doppelten Buchfuehrung
3. **H: SuSa** — Erster Report, validiert dass Buchungen stimmen

### Phase 2 — Cashflow (Prio HOCH)
4. **C: MT940/CAMT Import** — Bankdaten rein
5. **D: Zahlungsabgleich** — Automatisches Matching
6. **E: Mahnwesen** — Offene Posten eintreiben

### Phase 3 — Reports & Compliance (Prio MITTEL)
7. **G: BWA** — Standard-Management-Report
8. **I: UStVA** — Steuer-Zuarbeit
9. **F: SEPA-XML** — Zahlungen raus

### Phase 4 — Spezial (Prio NIEDRIG)
10. **J: AfA** — Anlagenbuchhaltung
11. **K: Kassenbuch** — GoBD-Pflicht
12. **L: Jahresabschluss** — Checkliste + Reports

### Geschaetzter Umfang
- ~9 neue Prisma-Models + 2 Model-Erweiterungen
- ~25 neue API-Endpunkte
- ~12 neue Seiten
- ~1 neue npm Dependency (mt940js)
- Seed: ~80 SKR03-Konten
