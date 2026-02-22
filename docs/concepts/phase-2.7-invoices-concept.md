# Konzept: Phase 2.7 - Abrechnungen / Invoices

## Zusammenfassung

Dieses Dokument beschreibt das erweiterte Abrechnungssystem fuer den WindparkManager, das folgende Kernfunktionen umfasst:

1. **Nummernkreis-Verwaltung** - Konfigurierbare Rechnungs-/Gutschriftsnummern
2. **Erweiterte Rechnungspositionen** - Separate Tabelle statt JSON, mit unterschiedlicher Steuerbehandlung
3. **Pachtabrechnungs-Workflow** - Mindestpacht-Vorschuss und Jahresendabrechnung
4. **PDF-Generierung** - Mit Mandanten-Branding

---

## 1. Bestandsaufnahme

### Was existiert bereits

**Invoice Model (Prisma):**
- Basis-Felder: invoiceNumber, invoiceType, netAmount, taxRate, grossAmount
- Status-Workflow: DRAFT, SENT, PAID, CANCELLED
- Verknuepfung zu: Tenant, Fund, Shareholder, CreatedBy
- lineItems als JSON (nicht normalisiert)

**Invoice API (`/api/invoices`):**
- GET: Liste mit Filter (type, status, fundId)
- POST: Erstellen mit automatischer Nummern-Generierung (RE-{JAHR}-{0001})

**Invoice UI (`/invoices`):**
- Tabellen-Ansicht mit Filter
- Stats-Karten (Anzahl Rechnungen, Gutschriften, Offene)
- Basis-Dropdown-Aktionen (Anzeigen, Bearbeiten, PDF, Als bezahlt markieren)

**Lease/Pacht-Infrastruktur:**
- Park mit Pacht-Konfiguration (minimumRentPerTurbine, weaSharePercentage, poolSharePercentage)
- PlotArea mit Teilflaechen-Typen (WEA_STANDORT, POOL, WEG, AUSGLEICH, KABEL)
- Lease verknuepft mit Lessor (Person mit Bankdaten)
- ParkRevenuePhase fuer Erlosphasen

---

## 2. Datenmodell-Erweiterungen

### 2.1 Nummernkreis-Verwaltung

```
InvoiceNumberSequence
├── id (UUID)
├── tenantId (FK)
├── type: INVOICE | CREDIT_NOTE
├── format: String (z.B. "RG-{YEAR}-{NUMBER}")
├── currentYear: Int (2026)
├── nextNumber: Int (1)
├── digitCount: Int (4) // Fuer fuehrende Nullen
├── createdAt, updatedAt
└── Unique: [tenantId, type]
```

**Format-Platzhalter:**
- `{YEAR}` = Volles Jahr (2026)
- `{YY}` = Kurzes Jahr (26)
- `{NUMBER}` = Fortlaufende Nummer mit fuehrenden Nullen
- `{MONTH}` = Monat (01-12)

**Beispiele:**
- `RG-{YEAR}-{NUMBER}` ergibt "RG-2026-0001"
- `{YY}-{NUMBER}` ergibt "26-0179" (wie im PDF-Beispiel)
- `GS-{YEAR}/{NUMBER}` ergibt "GS-2026/0001"

### 2.2 Erweiterte Rechnungspositionen

```
InvoiceItem
├── id (UUID)
├── invoiceId (FK)
├── position: Int (1, 2, 3...)
├── description: String
├── quantity: Decimal
├── unit: String (optional, z.B. "Stueck", "m2", "pauschal")
├── unitPrice: Decimal
├── netAmount: Decimal
├── taxType: STANDARD | EXEMPT | REDUCED
├── taxRate: Decimal (19.00, 0.00, 7.00)
├── taxAmount: Decimal
├── grossAmount: Decimal
├── referenceType: String? (z.B. "LEASE", "PLOT_AREA", "PLOT")
├── referenceId: String? (UUID der Referenz)
│
│   // Flaechentyp-Zuordnung (fuer Pachtabrechnungen)
├── plotAreaType: String? (WEA_STANDORT, POOL, WEG, AUSGLEICH, KABEL)
├── plotId: String? (FK) // Optional: Direkter Bezug zum Flurstueck
│
│   // DATEV-Vorbereitung
├── datevKonto: String? // Erloes-/Aufwandskonto (z.B. "8400")
├── datevGegenkonto: String? // Gegenkonto (z.B. Kreditor)
├── datevKostenstelle: String? // Kostenstelle (z.B. Park-ID)
│
├── createdAt
└── Index: [invoiceId]
```

**Hinweis zur Darstellung auf Gutschrift:**
Positionen werden nach `plotAreaType` gruppiert dargestellt:
- Zuerst alle WEA-Standort-Positionen (steuerfrei)
- Dann Pool-Flaechen (mit MwSt)
- Dann sonstige (Weg, Ausgleich, Kabel)

**Steuerbehandlung (TaxType):**
| Typ | Beschreibung | Steuersatz |
|-----|-------------|------------|
| STANDARD | Standard-MwSt | 19% |
| REDUCED | Ermaessigte MwSt | 7% |
| EXEMPT | Steuerfrei (§4 Nr.12 UStG) | 0% |

**Steuerbefreiungsgruende (bei EXEMPT):**
- WEA-Standort, versiegelte Flaeche = Grundstuecksvermietung
- Steuerbefreiter Umsatz gemaess §4 Nr.12 UStG

### 2.3 Invoice Model Erweiterung

```
Invoice (erweitert)
├── ... bestehende Felder ...
├── internalReference: String? (Beleg-ID)
├── serviceStartDate: DateTime? (Leistungszeitraum von)
├── serviceEndDate: DateTime? (Leistungszeitraum bis)
├── paymentReference: String? (Verwendungszweck)
├── sentAt: DateTime?
├── paidAt: DateTime?
├── cancelledAt: DateTime?
├── cancelReason: String?
├── cancelledInvoiceId: String? (FK) // Bei Storno: Referenz auf Originalrechnung
├── leaseId: String? (FK) // Verknuepfung zu Pachtvertrag
├── settlementPeriodId: String? (FK) // Verknuepfung zu Abrechnungsperiode
├── parkId: String? (FK) // Verknuepfung zu Park (fuer Pachtabrechnungen)
│
│   // DATEV-Vorbereitung (optional, fuer spaeteren Export)
├── datevExportedAt: DateTime? // Wann exportiert
├── datevBuchungsschluessel: String? // z.B. "1" fuer Umsatzsteuer
└── items: InvoiceItem[] // Relation zu Positionen
```

### 2.3.1 Storno-Workflow

Bei Stornierung einer Rechnung:
1. Originalrechnung Status → CANCELLED
2. Neue Stornorechnung erstellen:
   - `cancelledInvoiceId` zeigt auf Original
   - Alle Positionen mit **negativen Betraegen**
   - Eigene Rechnungsnummer (z.B. "ST-2026-0001")
3. Beide Belege bleiben im System (Revisionssicherheit)

### 2.4 Pachtabrechnungs-Perioden

```
LeaseSettlementPeriod
├── id (UUID)
├── tenantId (FK)
├── parkId (FK)
├── year: Int (2026)
├── status: OPEN | IN_PROGRESS | CLOSED
├── advanceInvoiceDate: DateTime? (Mindestpacht-Vorschuss Datum)
├── settlementDate: DateTime? (Jahresendabrechnung Datum)
├── totalRevenue: Decimal? (Gesamtertrag des Parks im Jahr)
├── totalMinimumRent: Decimal? (Summe Mindestpacht aller Verpaechter)
├── totalActualRent: Decimal? (Tatsaechliche Pacht basierend auf Ertrag)
├── notes: String?
├── createdAt, updatedAt
├── createdById (FK)
└── Unique: [tenantId, parkId, year]
```

### 2.5 Ertrags-Erfassung (optional fuer automatische Berechnung)

```
ParkRevenue
├── id (UUID)
├── tenantId (FK)
├── parkId (FK)
├── year: Int
├── month: Int (1-12)
├── grossRevenue: Decimal (Brutto-Ertrag)
├── netRevenue: Decimal (Netto-Ertrag nach Abzuegen)
├── productionMwh: Decimal? (Produktion in MWh)
├── source: String (MANUAL, SCADA_IMPORT, EEG_ABRECHNUNG)
├── notes: String?
├── createdAt, updatedAt
└── Unique: [tenantId, parkId, year, month]
```

---

## 3. Pachtabrechnungs-Workflow

### 3.1 Uebersicht

```
                    ┌─────────────────┐
                    │   Jahresbeginn  │
                    └────────┬────────┘
                             │
              ┌──────────────▼──────────────┐
              │   Mindestpacht-Vorschuss    │
              │   (Gutschrift an Verpaechter)│
              └──────────────┬──────────────┘
                             │
                    ┌────────▼────────┐
                    │   Laufendes Jahr │
                    │   (Ertrag wird   │
                    │    erfasst)      │
                    └────────┬────────┘
                             │
              ┌──────────────▼──────────────┐
              │    Jahresendabrechnung      │
              │   (Nach Jahresabschluss)    │
              └──────────────┬──────────────┘
                             │
         ┌───────────────────┴───────────────────┐
         │                                       │
┌────────▼────────┐                   ┌─────────▼─────────┐
│  Ertrag > Min.  │                   │  Ertrag <= Min.   │
│  → Restpacht    │                   │  → Keine weitere  │
│    (Gutschrift) │                   │    Zahlung        │
└─────────────────┘                   └───────────────────┘
```

### 3.2 Schritt 1: Mindestpacht-Vorschuss (Jahresbeginn)

**Trigger:** Manuell oder automatisch zum Jahresbeginn

**Berechnung pro Verpaechter:**
1. Ermittle alle Pachtvertraege des Verpaechters im Park
2. Fuer jeden Pachtvertrag:
   - Ermittle Flaechen-Typen (PlotAreas)
   - Berechne Mindestpacht-Anteil basierend auf:
     - WEA-Standort: Anteil an minimumRentPerTurbine * weaSharePercentage
     - Pool-Flaeche: Anteil an Gesamtpool * poolSharePercentage
     - Weg/Ausgleich/Kabel: Fixer Betrag oder Prozent

**Gutschrift erstellen:**
- Typ: CREDIT_NOTE
- Empfaenger: Verpaechter (Person)
- Positionen mit unterschiedlicher Steuer:
  - "Mindestpacht WEA-Standort Flurstueck X" (steuerfrei)
  - "Mindestpacht Poolflaeche" (mit MwSt)

### 3.3 Schritt 2: Ertragserfassung (laufendes Jahr)

**Optionen:**
- Manuell: Admin traegt Monats-/Jahresertrag ein
- Import: CSV/Excel-Import von Abrechnungsdaten
- API: SCADA-Integration (Zukunft)

**Erfasste Daten:**
- Brutto-Ertrag (Verkaufserloes)
- Netto-Ertrag (nach Direktvermarktung, Netzentgelte)
- Produktion in MWh (optional)

### 3.4 Schritt 3: Jahresendabrechnung

**Trigger:** Manuell nach Jahresabschluss (typisch Januar-Maerz des Folgejahres)

**Berechnung:**
1. Ermittle Gesamt-Netto-Ertrag des Parks
2. Ermittle aktuelle Erloesphase (ParkRevenuePhase):
   - z.B. Jahre 1-10: 9% vom Ertrag
   - Jahre 11-20: 10% vom Ertrag
3. Berechne Gesamtpacht = Ertrag * Prozentsatz
4. Verteile auf Verpaechter nach Flaechen-Anteilen
5. Vergleiche mit bereits gezahlter Mindestpacht
6. Differenz > 0: Erstelle Restpacht-Gutschrift

**Restpacht-Berechnung:**
```
Restpacht = (Tatsaechliche Pacht basierend auf Ertrag) - (Bereits gezahlte Mindestpacht)

Wenn Restpacht > 0:
  → Gutschrift an Verpaechter
Wenn Restpacht <= 0:
  → Keine weitere Zahlung (Mindestpacht war ausreichend)
```

---

## 4. API-Endpoints

### 4.1 Nummernkreis-Verwaltung

```
GET    /api/admin/invoice-sequences
       → Liste aller Nummernkreise des Mandanten

GET    /api/admin/invoice-sequences/{type}
       → Einzelner Nummernkreis (INVOICE oder CREDIT_NOTE)

PATCH  /api/admin/invoice-sequences/{type}
       → Aktualisiere Format, naechste Nummer
       Body: { format: "RG-{YEAR}-{NUMBER}", nextNumber: 100, digitCount: 4 }

POST   /api/admin/invoice-sequences/preview
       → Vorschau der naechsten Nummer
       Body: { type: "INVOICE" }
       Response: { preview: "RG-2026-0001" }
```

### 4.2 Erweiterte Invoice-Endpoints

```
GET    /api/invoices/{id}
       → Rechnung mit Items und Referenzen

POST   /api/invoices
       → Erstelle Rechnung mit Items
       Body: {
         invoiceType: "INVOICE",
         recipientType: "lessor",
         recipientId: "uuid",
         serviceStartDate: "2026-01-01",
         serviceEndDate: "2026-12-31",
         items: [
           {
             description: "Mindestpacht WEA-Standort",
             quantity: 1,
             unitPrice: 5000,
             taxType: "EXEMPT"
           }
         ]
       }

PATCH  /api/invoices/{id}
       → Aktualisiere Rechnung (nur DRAFT)

POST   /api/invoices/{id}/send
       → Status auf SENT setzen, sentAt aktualisieren

POST   /api/invoices/{id}/mark-paid
       → Status auf PAID setzen, paidAt aktualisieren

POST   /api/invoices/{id}/cancel
       → Status auf CANCELLED setzen
       Body: { reason: "Fehlbuchung" }

GET    /api/invoices/{id}/pdf
       → PDF-Download mit Branding
```

### 4.3 Invoice-Items

```
GET    /api/invoices/{id}/items
       → Alle Positionen einer Rechnung

POST   /api/invoices/{id}/items
       → Position hinzufuegen (nur DRAFT)

PATCH  /api/invoices/{id}/items/{itemId}
       → Position aktualisieren (nur DRAFT)

DELETE /api/invoices/{id}/items/{itemId}
       → Position loeschen (nur DRAFT)
```

### 4.4 Pachtabrechnungen

```
GET    /api/settlements
       → Liste aller Abrechnungsperioden
       Query: ?parkId=uuid&year=2026

GET    /api/settlements/{id}
       → Details einer Abrechnungsperiode

POST   /api/settlements
       → Neue Abrechnungsperiode erstellen
       Body: { parkId: "uuid", year: 2026 }

POST   /api/settlements/{id}/generate-advances
       → Mindestpacht-Vorschuesse generieren
       Response: { invoicesCreated: 12, totalAmount: 240000 }

POST   /api/settlements/{id}/calculate-final
       → Jahresendabrechnung berechnen (Vorschau)
       Body: { totalRevenue: 1500000 }
       Response: {
         totalActualRent: 150000,
         totalMinimumRentPaid: 120000,
         totalRestRent: 30000,
         lessors: [
           { lessorId, name, minimumRentPaid, actualRent, restRent }
         ]
       }

POST   /api/settlements/{id}/generate-final
       → Restpacht-Gutschriften erstellen
       Body: { totalRevenue: 1500000 }

PATCH  /api/settlements/{id}/close
       → Periode abschliessen (Status: CLOSED)
```

### 4.5 Park-Ertraege

```
GET    /api/parks/{parkId}/revenues
       → Ertraege eines Parks
       Query: ?year=2026

POST   /api/parks/{parkId}/revenues
       → Ertrag erfassen
       Body: { year: 2026, month: 1, grossRevenue: 125000, netRevenue: 118000 }

DELETE /api/parks/{parkId}/revenues/{id}
       → Ertrag loeschen
```

---

## 5. UI-Komponenten

### 5.1 Component-Struktur

```
/invoices
├── Uebersichtsseite (erweitert)
│   ├── Stats-Karten (bestehend)
│   ├── Filter & Suche (erweitert: Zeitraum, Park, Verpaechter)
│   └── Tabelle mit erweiterten Spalten
│
├── /invoices/new
│   ├── Empfaenger-Auswahl
│   │   ├── Typ: Verpaechter / Gesellschafter / Frei
│   │   └── Autocomplete-Suche
│   ├── Leistungszeitraum
│   ├── Positionen-Editor
│   │   ├── Position hinzufuegen
│   │   ├── Inline-Bearbeitung
│   │   ├── Steuertyp pro Position
│   │   └── Automatische Summen
│   └── Vorschau-Panel (rechts)
│
├── /invoices/{id}
│   ├── Detail-Ansicht
│   │   ├── Header mit Status-Badge
│   │   ├── Empfaenger-Info
│   │   ├── Positionen-Tabelle
│   │   └── Summen (Netto pro Steuerart, MwSt, Brutto)
│   ├── Aktionen
│   │   ├── Als Entwurf speichern
│   │   ├── Versenden
│   │   ├── Als bezahlt markieren
│   │   ├── Stornieren
│   │   └── PDF herunterladen
│   └── Aktivitaets-Log
│
├── /invoices/{id}/edit
│   └── Formular (wie /new, aber mit Daten)
│
└── /invoices/{id}/pdf
    └── PDF-Vorschau im Browser
```

### 5.2 Pachtabrechnungs-Bereich

```
/settlements
├── Uebersichtsseite
│   ├── Park-Auswahl
│   ├── Jahr-Auswahl
│   └── Perioden-Karten
│       ├── Status (Offen, In Bearbeitung, Abgeschlossen)
│       ├── Mindestpacht-Status
│       └── Jahresendabrechnung-Status
│
├── /settlements/new
│   ├── Park auswaehlen
│   ├── Jahr auswaehlen
│   └── Erstellen
│
└── /settlements/{id}
    ├── Uebersicht
    │   ├── Park-Info
    │   ├── Ertrags-Erfassung
    │   │   ├── Monatliche Eingabe
    │   │   └── Import-Button
    │   └── Zusammenfassung
    │
    ├── Tab: Mindestpacht-Vorschuesse
    │   ├── Liste aller Verpaechter
    │   ├── Berechnete Mindestpacht
    │   ├── Status (Gutschrift erstellt/versendet)
    │   └── Button: Alle generieren
    │
    ├── Tab: Jahresendabrechnung
    │   ├── Gesamt-Ertrag Eingabe
    │   ├── Berechnungsvorschau
    │   │   ├── Tabelle mit allen Verpaechtern
    │   │   ├── Gezahlte Mindestpacht
    │   │   ├── Tatsaechliche Pacht
    │   │   └── Restpacht
    │   └── Button: Restpacht-Gutschriften erstellen
    │
    └── Tab: Alle Belege
        └── Liste aller Rechnungen/Gutschriften dieser Periode
```

### 5.3 Admin-Einstellungen

```
/admin/settings
└── Tab: Nummernkreise
    ├── Rechnungsnummer
    │   ├── Format-Eingabe mit Platzhaltern
    │   ├── Vorschau der naechsten Nummer
    │   └── Naechste Nummer anpassen
    │
    └── Gutschriftsnummer
        ├── Format-Eingabe
        ├── Vorschau
        └── Naechste Nummer
```

---

## 6. Steuerliche Behandlung (Detail)

### 6.1 Uebersicht der Flaechen-Typen

| Flaechen-Typ | Steuerbehandlung | Begruendung |
|--------------|------------------|-------------|
| WEA_STANDORT | Steuerfrei (0%) | Grundstuecksvermietung §4 Nr.12 UStG |
| Versiegelte Flaeche | Steuerfrei (0%) | Grundstuecksvermietung §4 Nr.12 UStG |
| POOL (windhoefig) | Standard (19%) | Keine reine Grundstuecksvermietung |
| WEG | Standard (19%) | Nutzungsueberlassung |
| AUSGLEICH | Standard (19%) | A+E Massnahmen |
| KABEL | Standard (19%) | Leitungsrecht |

### 6.2 Rechnungs-Beispiel (gemischte Steuer)

```
Gutschrift GS-2026-0042
An: Hans Mueller, Musterstrasse 1, 12345 Musterstadt

Leistungszeitraum: 01.01.2026 - 31.12.2026

Pos | Bezeichnung                              | Menge | EP      | Gesamt
----|------------------------------------------|-------|---------|--------
1   | Mindestpacht WEA-Standort Flst. 123/4   | 1     | 5.000,00| 5.000,00 *
2   | Mindestpacht Poolflaeche                 | 1     | 3.000,00| 3.000,00
3   | Nutzungsentschaedigung Wegflaeche        | 500m2 | 0,50/m2 | 250,00

* Steuerfreier Umsatz gemaess §4 Nr.12 UStG (Grundstuecksvermietung)

Netto (steuerfrei):     5.000,00 EUR
Netto (19% MwSt):       3.250,00 EUR
MwSt 19%:                 617,50 EUR
---------------------------------------
Bruttobetrag:           8.867,50 EUR

Zahlbar auf: IBAN DE89 3704 0044 0532 0130 00
Verwendungszweck: GS-2026-0042
```

---

## 7. Tech-Entscheidungen

### 7.1 Warum separate InvoiceItem-Tabelle statt JSON?

**Vorteile:**
- Bessere Abfragemoeglichkeiten (z.B. "alle Positionen vom Typ WEA_STANDORT")
- Referenz-Integritaet (verknuepfen mit Lease, PlotArea)
- Einfachere Validierung
- Unterstuetzung fuer unterschiedliche Steuersaetze

**Nachteil:**
- Migration bestehender JSON-Daten notwendig

### 7.2 PDF-Generierung

**Empfehlung:** `@react-pdf/renderer` oder `puppeteer`

**@react-pdf/renderer:**
- React-Komponenten fuer PDF
- Kein Browser noetig
- Schnelle Generierung

**puppeteer:**
- HTML zu PDF
- Volle CSS-Unterstuetzung
- Langsamer, aber flexibler

**Entscheidung:** `@react-pdf/renderer` fuer bessere Performance und einfachere Wartung.

### 7.3 Nummernkreis-Locking

Bei gleichzeitigen Rechnungen muss die Nummernvergabe atomar sein:
- Optimistic Locking mit Version-Counter
- Oder: Prisma $transaction mit `READ COMMITTED`

---

## 8. Dependencies

Benoetigte neue Packages:

| Package | Zweck |
|---------|-------|
| `@react-pdf/renderer` | PDF-Generierung |
| `date-fns` | (bereits vorhanden) Datumsformatierung |

---

## 9. Implementierungsreihenfolge

### Phase 2.7.1 - Basis-Erweiterungen (Prio 1)

1. **Prisma Schema erweitern:**
   - InvoiceNumberSequence Model
   - InvoiceItem Model
   - Invoice um neue Felder erweitern
   - Migration erstellen

2. **Nummernkreis-API:**
   - GET/PATCH Endpoints
   - Nummern-Generierung mit Locking

3. **Invoice-API erweitern:**
   - Items CRUD
   - Berechnung mit unterschiedlichen Steuersaetzen

4. **Admin-UI Nummernkreise:**
   - Einstellungs-Seite
   - Format-Editor mit Vorschau

### Phase 2.7.2 - Manuelle Rechnungserstellung (Prio 1)

1. **Neues Rechnungs-Formular:**
   - Empfaenger-Auswahl (Person/Shareholder)
   - Positionen-Editor
   - Steuertyp-Auswahl pro Position
   - Summen-Berechnung

2. **Rechnungs-Detailseite:**
   - Positionen-Anzeige
   - Status-Aktionen

3. **PDF-Template:**
   - Mandanten-Branding (Logo, Farben, Adresse)
   - Positionen-Tabelle
   - Steuer-Aufschluesselung

### Phase 2.7.3 - Pachtabrechnungen (Prio 2)

1. **Prisma Schema:**
   - LeaseSettlementPeriod Model
   - ParkRevenue Model (optional)

2. **Settlement-API:**
   - CRUD fuer Perioden
   - Mindestpacht-Berechnung
   - Jahresendabrechnung-Berechnung

3. **Settlement-UI:**
   - Perioden-Uebersicht
   - Mindestpacht-Workflow
   - Jahresendabrechnung-Workflow

### Phase 2.7.4 - Automation (Prio 3)

1. **Automatische Vorschlaege:**
   - Jaehrliche Mindestpacht zum 01.01.
   - Erinnerung fuer Jahresendabrechnung

2. **E-Mail-Versand:**
   - PDF als Anhang
   - Template mit Mandanten-Branding

---

## 10. Geklaerte Anforderungen

1. **Gutschrift-Struktur:**
   - **1 Park = 1 Gutschrift** pro Verpaechter
   - Mehrere Flurstuecke desselben Verpaechters im selben Park → Sammelgutschrift
   - Verschiedene Flaechentypen (Pool, WEA-Standort, Weg, etc.) in EINER Gutschrift
   - **Klare Trennung** der Positionen nach Flaechentyp auf der Gutschrift

2. **Rueckwirkende Abrechnungen:**
   - **Ja, moeglich** - Perioden fuer vergangene Jahre koennen erstellt werden
   - Nuetzlich fuer nachtraegliche Korrekturen oder verspaetete Ertragserfassung

3. **Storno-Workflow:**
   - **Stornorechnung wird erstellt** (eigener Beleg mit negativen Betraegen)
   - Referenz auf Originalrechnung
   - Beide Belege bleiben im System (Revisionssicherheit)

4. **Bankdaten auf Rechnung:**
   - Mandanten-Bankverbindung fuer eingehende Zahlungen (Rechnungen)
   - Verpaechter-IBAN fuer ausgehende Gutschriften

5. **DATEV-Export:**
   - **Datenstruktur DATEV-kompatibel vorbereiten** (optionale Felder fuer Buchungsschluessel, Kontonummern)
   - **Export-Funktion spaeter implementieren** (Phase 4 oder 5)
   - Ermoeglicht spaetere Integration ohne Schema-Aenderungen

---

## 11. Risiken

| Risiko | Auswirkung | Mitigation |
|--------|------------|------------|
| Komplexe Steuerberechnung | Fehlerhafte Betraege | Umfangreiche Unit-Tests, Steuerberater-Review |
| Concurrent Nummernvergabe | Doppelte Nummern | Database-Level Locking |
| Migration bestehender Daten | Datenverlust | Backup, schrittweise Migration |
| PDF-Performance | Langsame Generierung | Caching, Background Jobs |

---

## 12. Abhaengigkeiten zu anderen Modulen

- **Pacht & Flaechen (2.6):** Lease, PlotArea fuer Pachtabrechnungen
- **Parks (2.1):** ParkRevenuePhase, Pacht-Konfiguration
- **Personen:** Verpaechter mit Bankdaten
- **Admin/Tenant:** Branding fuer PDFs
- **Dokumente (3.3):** PDF-Archivierung

---

## Anhang: Beispiel PDF-Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ [MANDANTEN-LOGO]                                                 │
│                                                                  │
│ WindparkManager GmbH                                             │
│ Musterstrasse 1, 12345 Musterstadt                              │
│ Tel: 0123/456789, E-Mail: info@example.com                      │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Hans Mueller                           Gutschrift               │
│ Bauernweg 5                            Nummer: GS-2026-0042     │
│ 54321 Bauernhausen                     Datum: 15.01.2026        │
│                                        Beleg-ID: INT-2026-00123 │
│                                                                  │
│ Leistungszeitraum: 01.01.2026 - 31.12.2026                      │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Pos │ Bezeichnung                     │ Menge │ EP      │ Gesamt│
│ ────┼─────────────────────────────────┼───────┼─────────┼───────│
│ 1   │ Mindestpacht WEA-Standort *     │ 1     │ 5.000,00│5.000,0│
│ 2   │ Mindestpacht Poolflaeche        │ 1     │ 3.000,00│3.000,0│
│ 3   │ Nutzungsentsch. Wegflaeche      │ 500m2 │ 0,50/m2 │  250,0│
│                                                                  │
│ * Steuerfreier Umsatz gem. §4 Nr.12 UStG                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│                              Netto (steuerfrei):    5.000,00 EUR│
│                              Netto (19% MwSt):      3.250,00 EUR│
│                              MwSt 19%:                617,50 EUR│
│                              ────────────────────────────────────│
│                              Bruttobetrag:          8.867,50 EUR│
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Auszahlung erfolgt auf:                                         │
│ IBAN: DE89 3704 0044 0532 0130 00                               │
│ BIC: COBADEFFXXX                                                │
│ Verwendungszweck: GS-2026-0042                                  │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│ Geschaeftsfuehrer: Max Mustermann | HRB 12345 AG Musterstadt    │
│ Steuer-Nr: 123/456/78901 | USt-IdNr: DE123456789                │
└──────────────────────────────────────────────────────────────────┘
```
