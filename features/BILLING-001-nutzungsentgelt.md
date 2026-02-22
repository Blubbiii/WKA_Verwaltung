# BILLING-001: Nutzungsentgelt-Abrechnung & Kostenaufteilung

> **Status:** Entwurf
> **Erstellt:** 11. Februar 2026
> **Basiert auf:** Muster-Nutzungsvertrag Wind-Serie, Rechnungen WP Barenburg (Netz GbR / Zweite Barenburg GmbH)

---

## 1. Ueberblick

Zwei neue Module fuer die komplexe Pachtabrechnung von Windparks:

1. **Modul A: Nutzungsentgelt-Abrechnung** - Berechnet die jaehrliche Pacht pro Grundeigentuemer und erzeugt Gutschriften (Vorschuss + Jahresendabrechnung)
2. **Modul B: Kostenaufteilung** - Verteilt die Gesamtkosten auf die Betreibergesellschaften und erzeugt Rechnungen (mit/ohne MwSt getrennt)

---

## 2. Geschaeftlicher Kontext (Beispiel WP Barenburg)

### 2.1 Beteiligte

| Rolle | Beispiel | Funktion |
|-------|----------|----------|
| Netzgesellschaft (billingEntityFund) | Barenburg Netz GbR | Empfaengt Einspeiseerloese, verteilt an Betreiber, zahlt Pacht an Eigentuemer |
| Betreibergesellschaft (operatorFund) | Zweite Barenburg GmbH | Betreibt Anlagen, erhaelt Erloesanteil, zahlt ggf. Eigentuemer direkt |
| Grundeigentuemer (Lessor/Person) | Irmgard Baade | Erhaelt Nutzungsentgelt fuer Flaechen |

### 2.2 Geldfluss

```
Netzbetreiber
    │ Einspeiseverguetung
    ▼
Barenburg Netz GbR (Netzgesellschaft)
    │
    ├──► EnergySettlement: Erloesverteilung an Betreiber (EXISTIERT)
    │    └── Gutschrift 25-0136: Strom + DULDUNG → Zweite Barenburg GmbH
    │    └── Gutschrift 25-0137: Marktpraemie 1/3 → Zweite Barenburg GmbH
    │
    ├──► Modul A: Nutzungsentgelt an Eigentuemer (NEU)
    │    └── Gutschrift 26-0001 (Feb): Mindest-Vorschuss → Irmgard Baade
    │    └── Gutschrift 25-0002 (Dez): Rest-Abrechnung → Irmgard Baade
    │
    └──► Modul B: Kostenaufteilung an Betreiber (NEU)
         └── Rechnung 26-0033 (MIT MwSt): Flaechenanteil → Zweite Barenburg GmbH
         └── Rechnung 26-0035 (OHNE MwSt): Standortanteil → Zweite Barenburg GmbH
         └── Rechnung 26-0040 (OHNE MwSt): Wegenutzung → Zweite Barenburg GmbH
```

### 2.3 Zwei Abrechnungsmodi (konfigurierbar pro Park)

**Modus 1: Netzgesellschaft rechnet ab (Standard)**
- Netz GbR zahlt ALLE Eigentuemer und stellt dann den Betreibern ihren Anteil in Rechnung
- Betreiber erhalten eine Aufteilungsrechnung

**Modus 2: Betreiber rechnet selbst ab**
- Betreiber zahlt seine "eigenen" Eigentuemer direkt (Direktabrechnung)
- Netz GbR zahlt die restlichen Eigentuemer
- Netz GbR stellt Betreiber nur den Restanteil in Rechnung (abzueglich Direktabrechnung)

---

## 3. Berechnungslogik

### 3.1 Jahres-Nutzungsentgelt pro WEA

```
Schritt 1: Jahreserloese summieren
  totalRevenueEur = Summe aller EnergySettlements des Parks fuer das Jahr

Schritt 2: Erloesabhaengiges Entgelt berechnen
  revenuePercent   = ParkRevenuePhase (z.B. 5% in Jahren 1-10, 9% in 11-20)
  calculatedFeeEur = totalRevenueEur × revenuePercent / 100

Schritt 3: Minimum anwenden
  minimumFeeEur    = Park.minimumRentPerTurbine × Anzahl WEA
  actualFeeEur     = MAX(calculatedFeeEur, minimumFeeEur)
```

### 3.2 Verteilung auf Eigentuemer

```
Schritt 4: Standort-Anteil (z.B. 10%)
  weaStandortTotal = actualFeeEur × Park.weaSharePercentage / 100
  Pro Eigentuemer:  weaStandortTotal × (eigene WEA / gesamt WEA)

Schritt 5: Flaechen-Anteil (z.B. 90%)
  poolAreaTotal    = actualFeeEur × Park.poolSharePercentage / 100
  Pro Eigentuemer:  poolAreaTotal × (eigene Poolflaeche / gesamt Poolflaeche)

Schritt 6: Zusatzgebuehren
  Versiegelte Flaeche: sealedAreaSqm × Park.wegCompensationPerSqm (oder eigener Satz)
  Wegenutzung:         wegeAreaSqm × Satz (z.B. kommunale Wege)
  Kabel:               kabelLengthM × Park.kabelCompensationPerM
```

### 3.3 Vorschuss-Verrechnung

```
Schritt 7: Vorschuss (konfigurierbar, z.B. Februar)
  Vorschuss = Mindestgarantie-Anteil pro Eigentuemer
  + Versiegelte Flaeche
  + Wegenutzung (falls jaehrlich)

Schritt 8: Jahresendabrechnung (konfigurierbar, z.B. Dezember)
  Rest = Tatsaechliches Nutzungsentgelt - bereits gezahlter Vorschuss
  Falls Rest > 0: Nachzahlung (Gutschrift)
  Falls Rest < 0: Theoretisch nicht moeglich (Minimum wurde als Vorschuss gezahlt)
```

### 3.4 Steuer-Aufteilung

Aus den realen Rechnungen rekonstruiert:

| Kostenart | MwSt-Behandlung | Begruendung |
|-----------|-----------------|-------------|
| Pool/Flaechenanteil (windhuefigeFlaeche + A&E) | 19% MwSt | Normale Dienstleistung |
| WEA-Standort | §4 Nr. 12 UStG steuerfrei | Grundstuecksverpachtung |
| Versiegelte Flaeche | §4 Nr. 12 UStG steuerfrei | Grundstuecksverpachtung |
| Wegenutzung | §4 Nr. 12 UStG steuerfrei | Grundstuecksverpachtung |
| Kabel | §4 Nr. 12 UStG steuerfrei | Grundstuecksverpachtung |

---

## 4. Kostenaufteilung an Betreiber

### 4.1 Verteilschluessel

Der Schluessel wird pro Kostenart berechnet:

**Einspeiseerloese (EnergySettlement):** Nach Anlagenanzahl mit DULDUNG
- 3 von 4 Anlagen nutzen DULDUNG → Anteil 1/3

**Wegenutzung:** Nach Gesamtanlagenanzahl im Park
- 4 Anlagen im Park → Anteil 1/4

**Nutzungsentgelt:** Nach Anlagenanzahl des Betreibers
- Zweite Barenburg hat 1 von 3 DULDUNG-Anlagen → Anteil 1/3

### 4.2 Aufteilungsrechnung

Pro Betreiber werden **zwei getrennte Rechnungen** erzeugt:

**Rechnung A (MIT MwSt 19%):**
- Anteil windhuefigeFlaeche + A&E Massnahmen
- Minus: Direktabrechnung mit Eigentuemern (was der Betreiber selbst gezahlt hat)

**Rechnung B (OHNE MwSt, §4 Nr. 12 UStG):**
- Anteil WEA-Standort + versiegelte Flaeche
- Minus: Direktabrechnung mit Eigentuemern

---

## 5. Datenmodell (Prisma)

### 5.1 Neue Models

```prisma
// ============================================================
// MODUL A: Nutzungsentgelt-Abrechnung
// ============================================================

model LeaseRevenueSettlement {
  id                    String   @id @default(uuid())
  tenantId              String
  parkId                String
  year                  Int
  status                LeaseRevenueSettlementStatus @default(OPEN)

  // Erloesbasis (aus EnergySettlements summiert)
  totalParkRevenueEur   Decimal  @db.Decimal(12, 2)
  revenueSharePercent   Decimal  @db.Decimal(5, 2)

  // Berechnung
  calculatedFeeEur      Decimal  @db.Decimal(12, 2)   // revenue × percent
  minimumGuaranteeEur   Decimal  @db.Decimal(12, 2)   // minimum × WEA count
  actualFeeEur          Decimal  @db.Decimal(12, 2)   // MAX(calculated, minimum)
  usedMinimum           Boolean  @default(false)       // true wenn Minimum greift

  // Verteilung
  weaStandortTotalEur   Decimal  @db.Decimal(12, 2)   // actual × weaShare%
  poolAreaTotalEur      Decimal  @db.Decimal(12, 2)   // actual × poolShare%
  totalWEACount         Int                            // Gesamtanzahl WEA im Park
  totalPoolAreaSqm      Decimal  @db.Decimal(12, 2)   // Gesamte Poolflaeche

  // Konfiguration (Zeitpunkte)
  advanceDueDate        DateTime?                      // Faelligkeit Vorschuss
  settlementDueDate     DateTime?                      // Faelligkeit Jahresendabrechnung
  advanceCreatedAt      DateTime?
  settlementCreatedAt   DateTime?

  // Berechnungsdetails (JSON fuer Audit-Trail)
  calculationDetails    Json?

  // Zeitstempel
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  createdById           String?

  // Relationen
  tenant                Tenant   @relation(fields: [tenantId], references: [id])
  park                  Park     @relation(fields: [parkId], references: [id])
  createdBy             User?    @relation(fields: [createdById], references: [id])
  items                 LeaseRevenueSettlementItem[]
  costAllocations       ParkCostAllocation[]

  @@unique([tenantId, parkId, year])
  @@index([parkId, year])
  @@map("lease_revenue_settlements")
}

enum LeaseRevenueSettlementStatus {
  OPEN              // Erstellt, noch nicht berechnet
  ADVANCE_CREATED   // Vorschuss-Gutschriften erzeugt
  CALCULATED        // Jahresendabrechnung berechnet
  SETTLED           // Rest-Gutschriften erzeugt
  CLOSED            // Abgeschlossen
}

model LeaseRevenueSettlementItem {
  id                    String   @id @default(uuid())
  settlementId          String
  leaseId               String
  lessorPersonId        String                         // Grundeigentuemer (Person)

  // Fluerstueck-Daten (Snapshot bei Berechnung)
  plotSummary           Json                           // [{plotId, plotNumber, areaSqm, turbineCount, sealedSqm}]

  // Flaechen-Anteil (Pool)
  poolAreaSqm           Decimal  @db.Decimal(12, 2)
  poolAreaSharePercent   Decimal  @db.Decimal(8, 4)
  poolFeeEur            Decimal  @db.Decimal(12, 2)

  // Standort-Anteil (WEA)
  turbineCount          Int      @default(0)
  standortFeeEur        Decimal  @db.Decimal(12, 2)

  // Zusatzgebuehren
  sealedAreaSqm         Decimal  @db.Decimal(12, 2)   @default(0)
  sealedAreaRate         Decimal  @db.Decimal(8, 2)    @default(0)
  sealedAreaFeeEur      Decimal  @db.Decimal(12, 2)   @default(0)
  roadUsageFeeEur       Decimal  @db.Decimal(12, 2)   @default(0)
  cableFeeEur           Decimal  @db.Decimal(12, 2)   @default(0)

  // Summen
  subtotalEur           Decimal  @db.Decimal(12, 2)    // Pool + Standort + Zusatz

  // Steuer-Aufteilung
  taxableAmountEur      Decimal  @db.Decimal(12, 2)    // Pool-Flaechenanteil → MIT MwSt
  exemptAmountEur       Decimal  @db.Decimal(12, 2)    // Standort + Versiegelt → OHNE MwSt

  // Vorschuss-Verrechnung
  advancePaidEur        Decimal  @db.Decimal(12, 2)   @default(0)
  remainderEur          Decimal  @db.Decimal(12, 2)   @default(0) // subtotal - advance

  // Direktabrechnung: Welcher Betreiber zahlt diesen Eigentuemer direkt?
  directBillingFundId   String?                        // null = Netzgesellschaft zahlt

  // Erzeugte Rechnungen/Gutschriften
  advanceInvoiceId      String?  @unique
  settlementInvoiceId   String?  @unique

  // Relationen
  settlement            LeaseRevenueSettlement @relation(fields: [settlementId], references: [id], onDelete: Cascade)
  lease                 Lease    @relation(fields: [leaseId], references: [id])
  lessorPerson          Person   @relation(fields: [lessorPersonId], references: [id])
  directBillingFund     Fund?    @relation("DirectBillingFund", fields: [directBillingFundId], references: [id])
  advanceInvoice        Invoice? @relation("AdvanceInvoice", fields: [advanceInvoiceId], references: [id])
  settlementInvoice     Invoice? @relation("SettlementInvoice", fields: [settlementInvoiceId], references: [id])

  @@index([settlementId])
  @@index([leaseId])
  @@map("lease_revenue_settlement_items")
}


// ============================================================
// MODUL B: Kostenaufteilung an Betreiber
// ============================================================

model ParkCostAllocation {
  id                       String   @id @default(uuid())
  tenantId                 String
  leaseRevenueSettlementId String
  status                   ParkCostAllocationStatus @default(DRAFT)

  // Gesamtkosten des Parks (aus LeaseRevenueSettlement)
  totalUsageFeeEur         Decimal  @db.Decimal(12, 2)
  totalTaxableEur          Decimal  @db.Decimal(12, 2)  // Gesamt steuerpflichtig
  totalExemptEur           Decimal  @db.Decimal(12, 2)  // Gesamt steuerfrei

  // Metadaten
  periodLabel              String?                       // z.B. "Mindestnutzungsentgelt 2026"
  notes                    String?

  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt

  // Relationen
  tenant                   Tenant   @relation(fields: [tenantId], references: [id])
  leaseRevenueSettlement   LeaseRevenueSettlement @relation(fields: [leaseRevenueSettlementId], references: [id])
  items                    ParkCostAllocationItem[]

  @@index([leaseRevenueSettlementId])
  @@map("park_cost_allocations")
}

enum ParkCostAllocationStatus {
  DRAFT
  INVOICED
  CLOSED
}

model ParkCostAllocationItem {
  id                       String   @id @default(uuid())
  allocationId             String
  operatorFundId           String                        // Betreibergesellschaft

  // Verteilschluessel
  allocationBasis          String                        // z.B. "1/3 (3 WEA DULDUNG)" oder "1/4 (4 WEA gesamt)"
  allocationSharePercent   Decimal  @db.Decimal(8, 4)    // z.B. 33.3333 oder 25.0000

  // Berechnete Betraege
  totalAllocatedEur        Decimal  @db.Decimal(12, 2)   // Gesamtanteil
  directSettlementEur      Decimal  @db.Decimal(12, 2)   @default(0) // Abzug Direktabrechnung

  // Steuer-Split (ZWEI getrennte Rechnungen!)
  taxableAmountEur         Decimal  @db.Decimal(12, 2)   // MIT MwSt (windhuefigeFlaeche + A&E)
  taxableVatEur            Decimal  @db.Decimal(12, 2)   // 19% MwSt Betrag
  exemptAmountEur          Decimal  @db.Decimal(12, 2)   // OHNE MwSt (Standort + Versiegelt, §4/12)

  // Netto zahlbar
  netPayableEur            Decimal  @db.Decimal(12, 2)   // taxable + exempt - directSettlement

  // Erzeugte Rechnungen (immer ZWEI pro Betreiber)
  vatInvoiceId             String?  @unique              // Rechnung MIT MwSt
  exemptInvoiceId          String?  @unique              // Rechnung OHNE MwSt

  // Relationen
  allocation               ParkCostAllocation @relation(fields: [allocationId], references: [id], onDelete: Cascade)
  operatorFund             Fund     @relation("CostAllocationOperator", fields: [operatorFundId], references: [id])
  vatInvoice               Invoice? @relation("VatAllocationInvoice", fields: [vatInvoiceId], references: [id])
  exemptInvoice            Invoice? @relation("ExemptAllocationInvoice", fields: [exemptInvoiceId], references: [id])

  @@index([allocationId])
  @@index([operatorFundId])
  @@map("park_cost_allocation_items")
}
```

### 5.2 Erweiterungen bestehender Models

```prisma
// Park: Neues Feld fuer Abrechnungsmodus
model Park {
  // ... bestehende Felder ...

  // NEU: Abrechnungsmodus
  leaseSettlementMode    LeaseSettlementMode @default(NETWORK_COMPANY)

  // NEU: Relationen
  leaseRevenueSettlements LeaseRevenueSettlement[]
}

enum LeaseSettlementMode {
  NETWORK_COMPANY    // Netzgesellschaft rechnet alle Eigentuemer ab
  OPERATOR_DIRECT    // Betreiber rechnet eigene Eigentuemer selbst ab
}

// Lease: Neues Feld fuer Direktabrechnung
model Lease {
  // ... bestehende Felder ...

  // NEU: Welcher Betreiber zahlt diesen Eigentuemer direkt? (nur bei OPERATOR_DIRECT)
  directBillingFundId    String?

  // NEU: Relationen
  leaseRevenueItems      LeaseRevenueSettlementItem[]
}
```

---

## 6. UI-Konzept

### 6.1 Navigation

```
Finanzen (Sidebar-Gruppe)
  ├── Rechnungen          (bestehend)
  ├── Pacht-Abrechnungen  (bestehend: LeaseSettlementPeriod)
  ├── Nutzungsentgelt     (NEU → /leases/usage-fees)
  └── Kostenaufteilung    (NEU → /leases/cost-allocation)
```

### 6.2 Einrichtungs-Assistent (Setup Wizard)

Beim ersten Oeffnen von "Nutzungsentgelt" fuer einen Park:

**Schritt 1: Abrechnungsmodus waehlen**
```
┌─────────────────────────────────────────────────┐
│ Wer rechnet die Grundeigentuemer ab?            │
│                                                 │
│ ○ Netzgesellschaft (Barenburg Netz GbR)         │
│   → Alle Eigentuemer werden zentral abgerechnet │
│   → Betreiber erhalten Aufteilungsrechnungen    │
│                                                 │
│ ○ Betreiber rechnen selbst ab                   │
│   → Jeder Betreiber zahlt seine Eigentuemer     │
│   → Im naechsten Schritt zuordnen               │
└─────────────────────────────────────────────────┘
```

**Schritt 2 (nur bei OPERATOR_DIRECT): Eigentuemer zuordnen**
```
┌─────────────────────────────────────────────────┐
│ Welcher Betreiber zahlt welchen Eigentuemer?    │
│                                                 │
│ Eigentuemer          Abrechnung durch           │
│ ────────────────────────────────────────────    │
│ Irmgard Baade        [Zweite Barenburg GmbH ▼]  │
│   Flur 17, FS 26    2,11829 ha · 1 WEA         │
│                                                 │
│ Heinrich Mueller     [Netzgesellschaft      ▼]  │
│   Flur 17, FS 31    1,85000 ha · 0 WEA         │
│                                                 │
│ Stadt Sulingen       [Netzgesellschaft      ▼]  │
│   Flur 18, FS 12    0,42000 ha · 0 WEA         │
└─────────────────────────────────────────────────┘
```

**Schritt 3: Fluerstuecke und Groessen pruefen**
```
┌─────────────────────────────────────────────────┐
│ Fluerstueck-Uebersicht (aus Pachtvertraegen)    │
│                                                 │
│ Eigentuemer    Flurst.    Flaeche    WEA  Vers. │
│ ──────────────────────────────────────────────  │
│ I. Baade       17/26      2,12 ha    1    3482m²│
│ H. Mueller     17/31      1,85 ha    0    0     │
│ Stadt Sulingen 18/12      0,42 ha    0    0     │
│ ...                                             │
│ ──────────────────────────────────────────────  │
│ GESAMT                   12,14 ha    4    5200m²│
│                                                 │
│ ⚠ Weg-Fluerstueck 17/40 wird von WEA 2+3       │
│   gemeinsam genutzt (2x zugeordnet)            │
│                                                 │
│ [Flaechen bearbeiten]  [Weiter →]               │
└─────────────────────────────────────────────────┘
```

### 6.3 Abrechnung erstellen

**Hauptseite: /leases/usage-fees**
```
┌─────────────────────────────────────────────────┐
│ Nutzungsentgelt-Abrechnungen                    │
│                                                 │
│ [Park waehlen ▼] [Jahr waehlen ▼] [+ Erstellen] │
│                                                 │
│ WP Barenburg · 2025                             │
│ Status: SETTLED                                 │
│ Jahreserloese:   464.523 EUR                    │
│ Berechnet (5%):   23.226 EUR                    │
│ Minimum:          16.500 EUR                    │
│ Tatsaechlich:     23.226 EUR (erloesabhaengig)  │
│                                                 │
│ WP Barenburg · 2026                             │
│ Status: ADVANCE_CREATED                         │
│ Vorschuss (Minimum): 69.093 EUR                 │
│ Erloese: noch nicht verfuegbar                  │
└─────────────────────────────────────────────────┘
```

**Detail-Ansicht mit Eigentuemer-Aufschluesselung:**
```
┌─────────────────────────────────────────────────────────────┐
│ Nutzungsentgelt WP Barenburg 2025                           │
│ Status: SETTLED · Erloesabhaengig (5% > Minimum)            │
│                                                             │
│ Eigentuemer     Pool-Anteil  Standort  Versieg.  Gesamt     │
│ ─────────────────────────────────────────────────────────   │
│ I. Baade        3.648 EUR   2.323 EUR  871 EUR   6.842 EUR  │
│   Vorschuss:   -5.112 EUR                                   │
│   Rest:         1.730 EUR   [Gutschrift →]                  │
│                                                             │
│ H. Mueller      2.814 EUR   0 EUR      0 EUR     2.814 EUR  │
│   Vorschuss:   -2.295 EUR                                   │
│   Rest:           519 EUR   [Gutschrift →]                  │
│                                                             │
│ GESAMT         20.904 EUR   2.323 EUR  871 EUR  24.098 EUR  │
│                                                             │
│ [Vorschuss-Gutschriften erzeugen]                           │
│ [Jahresendabrechnung berechnen]                             │
│ [→ Kostenaufteilung erstellen]                              │
└─────────────────────────────────────────────────────────────┘
```

### 6.4 Kostenaufteilung

**Seite: /leases/cost-allocation**
```
┌─────────────────────────────────────────────────────────────┐
│ Kostenaufteilung WP Barenburg 2025 - Restnutzungsentgelt    │
│                                                             │
│ Gesamtkosten:  18.196 EUR                                   │
│   Steuerpflichtig (Pool + A&E):  17.463 EUR                 │
│   Steuerfrei (Standort + Vers.):    733 EUR                 │
│                                                             │
│ Betreiber        Anteil   MIT MwSt    OHNE MwSt   Direkt    │
│ ───────────────────────────────────────────────────────     │
│ Zweite Barenburg 1/3      5.821 EUR   244 EUR    -1.729 EUR │
│   Netto zahlbar:          4.765 EUR   -428 EUR              │
│   [RE 25-0177 →]          [RE 25-0179 →]                    │
│                                                             │
│ Dritte Barenburg 1/3      5.821 EUR   244 EUR    -1.200 EUR │
│   ...                                                       │
│                                                             │
│ [Rechnungen erzeugen]                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. API-Endpunkte

### Modul A: Nutzungsentgelt

```
GET    /api/leases/usage-fees                    Liste aller Abrechnungen
POST   /api/leases/usage-fees                    Neue Abrechnung erstellen
GET    /api/leases/usage-fees/[id]               Detail mit Items
PUT    /api/leases/usage-fees/[id]               Aktualisieren (Zeitpunkte, etc.)
DELETE /api/leases/usage-fees/[id]               Loeschen (nur OPEN)

POST   /api/leases/usage-fees/[id]/calculate     Berechnung ausfuehren
POST   /api/leases/usage-fees/[id]/advance       Vorschuss-Gutschriften erzeugen
POST   /api/leases/usage-fees/[id]/settle        Jahresendabrechnung + Gutschriften

GET    /api/leases/usage-fees/setup/[parkId]     Setup-Daten laden (Eigentuemer, Flaechen)
PUT    /api/leases/usage-fees/setup/[parkId]     Setup speichern (Modus, Zuordnungen)
```

### Modul B: Kostenaufteilung

```
GET    /api/leases/cost-allocation               Liste aller Aufteilungen
POST   /api/leases/cost-allocation               Neue Aufteilung erstellen
GET    /api/leases/cost-allocation/[id]           Detail mit Items
POST   /api/leases/cost-allocation/[id]/invoice   Rechnungen erzeugen
```

---

## 8. Implementierungs-Phasen

### Phase 1: Datenbank + Grundlagen
- [ ] Prisma Schema erweitern (neue Models + Enums + Park-Erweiterung)
- [ ] Migration erstellen und ausfuehren
- [ ] TypeScript Types und Zod Schemas

### Phase 2: Berechnungslogik
- [ ] `src/lib/lease-revenue/calculator.ts` - Nutzungsentgelt berechnen
- [ ] `src/lib/lease-revenue/allocator.ts` - Kostenaufteilung berechnen
- [ ] `src/lib/lease-revenue/invoice-generator.ts` - Gutschriften/Rechnungen erzeugen

### Phase 3: API-Endpunkte
- [ ] CRUD fuer LeaseRevenueSettlement
- [ ] Calculate / Advance / Settle Aktionen
- [ ] Setup-Endpunkte (Modus, Zuordnungen)
- [ ] Kostenaufteilung CRUD + Invoice-Generierung

### Phase 4: UI
- [ ] Setup-Wizard (Modus, Eigentuemer-Zuordnung, Flaechen-Pruefung)
- [ ] Nutzungsentgelt-Uebersicht + Detail
- [ ] Kostenaufteilung-Uebersicht + Detail
- [ ] Sidebar-Navigation erweitern

### Phase 5: Integration + Historischer Import
- [ ] Verknuepfung mit EnergySettlement (Erloese laden)
- [ ] Verknuepfung mit bestehendem Invoice-System (Gutschriften/Rechnungen)
- [ ] BillingRule-Integration (automatische Vorschuss-Erzeugung)
- [ ] PDF-Generierung (Gutschrift-Template wie Beispiel-PDFs)
- [ ] Import-Assistent fuer historische Abrechnungen (Jahr, Betraege → Status CLOSED)

---

## 9. Design-Entscheidungen (geklaert)

1. **Wegenutzung fuer Kommunen** (z.B. Stadt Sulingen): **Separater Vertrag** - wird NICHT im Nutzungsvertrag abgebildet, sondern als eigener Lease-Typ. Die Kostenaufteilung (Modul B) kann trotzdem Wegenutzungskosten auf Betreiber verteilen, da die Wegenutzungs-Rechnungen als Input dienen.

2. **Mehrere Parks pro Netzgesellschaft**: **Flexibel** - Abrechnung ist pro Park, aber eine Netzgesellschaft (billingEntityFund) kann mehrere Parks haben. Die UI zeigt alle Parks der Netzgesellschaft und ermoeglicht park-uebergreifende Uebersicht.

3. **Historische Daten**: **Import moeglich** - Das System unterstuetzt den Import vergangener Abrechnungen. Phase 5 beinhaltet einen Import-Assistenten fuer historische LeaseRevenueSettlements (Jahr, Betraege, Status=CLOSED).

---

## 10. Referenz-Dokumente

| Dokument | Typ | Inhalt |
|----------|-----|--------|
| 20260113_Muster_Nutzungsvertrag-Wind_Serie_clean.docx | Vertrag | Kompletter Muster-Nutzungsvertrag |
| RE_NBARENB_25-0136.pdf | Gutschrift | Einspeiseverguetung Dez 2025 (MIT MwSt) |
| RE_NBARENB_25-0137.pdf | Gutschrift | Marktpraemie Dez 2025 (OHNE MwSt) |
| 2025-12-RestPacht-ZweiteB-WPBarenburg.pdf | Gutschrift | Restnutzungsentgelt 2025 an Eigentuemer |
| 2025-AufteilungRestPacht-ZweiteB-WPBarenburg.pdf | Rechnung | Aufteilung Restpacht auf Betreiber |
| 2026-02-MiPacht-ZweiteB-WPBarenburg.pdf | Gutschrift | Mindestvorschuss 2026 an Eigentuemer |
| 2026-AufteilungMindestPacht-ZweiteB-WPBarenburg.pdf | Rechnung | Aufteilung Mindestpacht auf Betreiber |
| 2026-AufteilungWegenutzung-ZweiteBarenburg-WPBarenburg.pdf | Rechnung | Wegenutzung-Aufteilung auf Betreiber |
