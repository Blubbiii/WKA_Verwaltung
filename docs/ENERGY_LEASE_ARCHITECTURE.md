# Architekturplan: Stromabrechnung & Erweiterte Pachtabrechnung

> **Status:** Design-Phase
> **Erstellt:** 2026-02-05
> **Autor:** Solution Architect

---

## Inhaltsverzeichnis

1. [Executive Summary](#1-executive-summary)
2. [Ist-Analyse: Was existiert bereits?](#2-ist-analyse-was-existiert-bereits)
3. [Gap-Analyse: Was fehlt?](#3-gap-analyse-was-fehlt)
4. [Datenmodell-Erweiterungen](#4-datenmodell-erweiterungen)
5. [Gesellschaftsstruktur-Konzept](#5-gesellschaftsstruktur-konzept)
6. [Stromabrechnung-Workflow](#6-stromabrechnung-workflow)
7. [Pachtabrechnung-Erweiterungen](#7-pachtabrechnung-erweiterungen)
8. [UI-Konzept](#8-ui-konzept)
9. [Implementierungsphasen](#9-implementierungsphasen)
10. [Tech-Entscheidungen](#10-tech-entscheidungen)
11. [Risiken und Abhaengigkeiten](#11-risiken-und-abhaengigkeiten)

---

## 1. Executive Summary

### Zielsetzung

Der WindparkManager soll um zwei Kernfunktionen erweitert werden:

1. **Stromabrechnung/Ertragsverteilung**: Komplexe Gesellschaftsstrukturen mit verschiedenen Betreibern pro WKA, Aufteilung nach EEG/Direktvermarktung/Redispatch

2. **Erweiterte Pachtabrechnung**: Monatliche/quartalsweise Intervalle, Verbindung zu Ertragsdaten, Jahresendabrechnung mit Verrechnung

### Kernherausforderungen

```
KOMPLEXITAET DER ANFORDERUNGEN
==============================

Gesellschaftsstruktur:
  Netzgesellschaft (UW GmbH & Co. KG)
       |
       +-- WKA 1 --> GmbH & Co. KG (Betreiber A)
       +-- WKA 2 --> UG (Betreiber B)
       +-- WKA 3 --> GmbH (Betreiber C)
       +-- WKA 4 --> Privatperson (Betreiber D)
       |
  Netz GbR (Umspannwerk)

Geldfluss:
  Netzbetreiber/Direktvermarkter
       |
       v
  Netzgesellschaft (UW)
       |
       +-- Gutschrift --> WKA-Betreiber
       +-- Gutschrift --> Netz GbR
```

### Design-Prinzipien

1. **Flexible Hierarchien**: Gesellschaften koennen andere Gesellschaften als Gesellschafter haben
2. **WKA-zentrierte Ertraege**: Produktionsdaten werden pro WKA und Monat erfasst
3. **Regelbasierte Verteilung**: Verteilungsregeln sind konfigurierbar (proportional, Glaettung, Duldung)
4. **Rueckwaertskompatibilitaet**: Bestehende Pachtlogik bleibt erhalten

---

## 2. Ist-Analyse: Was existiert bereits?

### 2.1 Gesellschaften (Fund-Model)

```
WAS EXISTIERT                           WAS FEHLT
==================                      ==================
Fund                                    x Hierarchien (Fund als Gesellschafter)
- name, legalForm (Freitext)            x Gesellschaftstypen (Netz GbR, UW, Betreiber)
- registrationNumber                    x Selbstreferenz fuer Beteiligungen
- shareholders[]
- fundParks[] (Park-Zuordnung)

Shareholder                             x Fund als shareholderType
- person -> Person                      x Gesellschaft als Gesellschafter
- ownershipPercentage
- capitalContribution

Person
- natural/legal personType
- bankDetails
```

### 2.2 Pacht (Lease-Model)

```
WAS EXISTIERT                           WAS FEHLT
==================                      ==================
Lease                                   x Abrechnungsintervall (monthly/quarterly)
- lessor -> Person                      x Verbindung zu Ertragsdaten
- plots[] (n:m)                         x Mindestpacht pro WKA (individuell)
- status, startDate, endDate

Plot / PlotArea
- WEA_STANDORT, POOL, WEG...
- compensationType (ANNUAL/ONE_TIME)    x MONTHLY, QUARTERLY als Intervall
- compensationFixedAmount/Percentage

LeaseSettlementPeriod                   x Monatliche Perioden
- year (nur jaehrlich!)                 x Ertragsdaten-Verknuepfung
- totalRevenue (manuell)
- MIN/MAX Logik implementiert
```

### 2.3 WKA/Turbine-Model

```
WAS EXISTIERT                           WAS FEHLT
==================                      ==================
Turbine                                 x KEIN Betreiber pro WKA!
- park -> Park                          x Stromertraege (kWh/Monat)
- technicalData (JSON)                  x EEG-Vergütung vs. Direktvermarktung
- ratedPowerKw                          x Redispatch-Mengen
- commissioningDate                     x Betreiberwechsel-Historie
```

### 2.4 Vorhandene Business-Logik

| Komponente | Status | Beschreibung |
|------------|--------|--------------|
| Settlement Calculator | Vorhanden | MIN/MAX Logik, Erlösphasen |
| Invoice Generator | Vorhanden | PDF, Nummernkreise, Storno |
| Distribution System | Vorhanden | Ausschüttungen an Gesellschafter |
| BillingRules | Vorhanden | Automatische Abrechnungen (BullMQ) |

---

## 3. Gap-Analyse: Was fehlt?

### 3.1 Kritische Luecken (Blocker)

| # | Luecke | Auswirkung | Prioritaet |
|---|--------|------------|------------|
| G1 | **Stromertraege pro WKA** | Keine Produktionsdaten verfuegbar | KRITISCH |
| G2 | **Betreiber pro WKA** | WKA gehoert Park, nicht Betreiber | KRITISCH |
| G3 | **Gesellschaftshierarchien** | Fund kann nicht Gesellschafter sein | KRITISCH |
| G4 | **Abrechnungsintervalle** | Nur jaehrlich moeglich | HOCH |

### 3.2 Wichtige Luecken

| # | Luecke | Auswirkung | Prioritaet |
|---|--------|------------|------------|
| G5 | EEG/DV/Redispatch Trennung | Keine Differenzierung moeglich | HOCH |
| G6 | Netzgesellschaft/Umspannwerk | Keine separaten Entitaeten | HOCH |
| G7 | Glaettung/Duldung | Keine Verteilungsmechanismen | MITTEL |
| G8 | Mindestpacht pro WKA | Nur pro Park moeglich | MITTEL |

### 3.3 Optionale Luecken

| # | Luecke | Auswirkung | Prioritaet |
|---|--------|------------|------------|
| G9 | Betreiberwechsel-Historie | Keine Zeitreihendaten | NIEDRIG |
| G10 | Gesellschafts-Visualisierung | Keine Diagramme | NIEDRIG |

---

## 4. Datenmodell-Erweiterungen

### 4.1 Uebersicht der neuen Modelle

```
NEUE MODELLE (7)
================
1. TurbineProduction    - Stromertraege pro WKA/Monat
2. TurbineOperator      - WKA-Betreiber-Zuordnung (mit Historie)
3. FundHierarchy        - Gesellschaft als Gesellschafter einer anderen
4. EnergyRevenueType    - EEG, Direktvermarktung, Redispatch
5. EnergySettlement     - Stromabrechnung pro Periode
6. EnergySettlementItem - Einzelposten der Stromabrechnung
7. GridEntity           - Netzgesellschaft, Umspannwerk (neuer Entity-Typ)

ERWEITERTE MODELLE (4)
======================
1. Turbine              - + operatorHistory, + gridEntityId
2. Lease                - + billingInterval (MONTHLY/QUARTERLY/ANNUAL)
3. LeaseSettlementPeriod - + month (optional fuer monatlich)
4. Fund                 - + fundType (BETREIBER/NETZ/UMSPANNWERK)
```

### 4.2 Entity-Relationship-Diagramm (vereinfacht)

```
                                    ┌─────────────────────┐
                                    │    GridEntity       │
                                    │  (Netz GbR, UW)     │
                                    └──────────┬──────────┘
                                               │ 1:n
                                               ▼
┌─────────────┐    n:m     ┌─────────────┐    ┌─────────────────────┐
│    Fund     │◄──────────►│ FundHierarchy│    │      Turbine        │
│ (Betreiber) │            │ (Selbstref.) │    │                     │
└──────┬──────┘            └─────────────┘    └──────────┬──────────┘
       │                                                  │
       │ 1:n                                              │ 1:n
       ▼                                                  ▼
┌─────────────────────┐                      ┌─────────────────────┐
│  TurbineOperator    │◄─────────────────────│  TurbineProduction  │
│  (WKA <-> Betreiber)│                      │  (kWh pro Monat)    │
└─────────────────────┘                      └──────────┬──────────┘
                                                        │
                                                        │ n:1
                                                        ▼
                                             ┌─────────────────────┐
                                             │  EnergyRevenueType  │
                                             │ (EEG/DV/Redispatch) │
                                             └─────────────────────┘
```

### 4.3 Detaillierte Modell-Beschreibungen

#### 4.3.1 TurbineProduction (NEU)

**Zweck:** Erfasst Stromertraege pro WKA und Monat, aufgeteilt nach Verguetungsart

```
TurbineProduction speichert:
- Welche WKA (turbineId)
- Welcher Monat/Jahr (year, month)
- Produzierte Menge in kWh (productionKwh)
- Verguetungsart: EEG, Direktvermarktung, Redispatch (revenueTypeId)
- Erloese in Euro (revenueEur) - optional, kann berechnet werden
- Datenquelle (source): Manuell, Import, SCADA
- Status: DRAFT, CONFIRMED, INVOICED
```

**Anwendungsfaelle:**
- Monatlicher Import von Produktionsdaten (CSV/Excel)
- Manuelle Erfassung pro WKA
- Automatische Berechnung von Erloesen
- Grundlage fuer Stromabrechnung

#### 4.3.2 TurbineOperator (NEU)

**Zweck:** Ordnet WKAs einem Betreiber (Fund/Gesellschaft) zu, mit zeitlicher Gültigkeit

```
TurbineOperator speichert:
- Welche WKA (turbineId)
- Welcher Betreiber/Fund (operatorFundId)
- Gueltig von/bis (validFrom, validTo)
- Beteiligungsanteil (ownershipPercentage) - fuer Miteigentum
- Status (ACTIVE, HISTORICAL)
```

**Warum benoetigt?**
- WKA 1 gehoert GmbH & Co. KG (100%)
- WKA 2 gehoert UG (100%)
- WKA 3 wird von 2 Gesellschaften betrieben (je 50%)
- Betreiberwechsel: WKA 4 gehoerte bis 2024 Person A, ab 2025 Fund B

#### 4.3.3 FundHierarchy (NEU)

**Zweck:** Ermoeglicht Gesellschaftshierarchien (Fund kann Gesellschafter eines anderen Funds sein)

```
FundHierarchy speichert:
- Eltern-Gesellschaft (parentFundId)
- Kind-Gesellschaft (childFundId)
- Beteiligungsanteil (ownershipPercentage)
- Gueltig von/bis (validFrom, validTo)

FLEXIBILITÄT: Unterstützt beliebige Tiefe (2, 3 oder mehr Ebenen)
```

**Standard-Hierarchie (2 Ebenen):**
```
Netzgesellschaft (Barenburg Netz GbR)
├── 1/3 --> Zweite Barenburg GmbH (Betreiber)
├── 1/3 --> [Betreiber B]
└── 1/3 --> [Betreiber C]
```

**Erweiterte Hierarchie (3 Ebenen, falls benötigt):**
```
Holding (Dach-GmbH)
│
└── 100% --> Netzgesellschaft (Barenburg Netz GbR)
             ├── 1/3 --> Zweite Barenburg GmbH
             ├── 1/3 --> [Betreiber B]
             └── 1/3 --> [Betreiber C]
```

**Hinweis:** Die Selbstreferenz im FundHierarchy-Model ermöglicht
unbegrenzte Verschachtelung ohne Schema-Änderung.

#### 4.3.4 EnergyRevenueType (NEU)

**Zweck:** Definiert Verguetungsarten mit ihren Besonderheiten

```
EnergyRevenueType speichert:
- Name (z.B. "EEG-Verguetung", "Direktvermarktung", "Redispatch")
- Code (EEG, DIRECT_MARKETING, REDISPATCH)
- Verguetungssatz (ratePerKwh) - Cent/kWh, kann null sein
- Berechnungslogik (calculationType): FIXED_RATE, MARKET_PRICE, MANUAL
- Prioritaet fuer Verteilung (distributionPriority)
- Ist aktiv (isActive)
```

**Vordefinierte Typen:**
| Code | Name | Berechnung |
|------|------|------------|
| EEG | EEG-Verguetung | Fester Satz (z.B. 8,2 ct/kWh) |
| DIRECT | Direktvermarktung | Marktpreis + Managementpraemie |
| REDISPATCH | Redispatch 2.0 | Entschaedigung nach Anleitung |

#### 4.3.5 EnergySettlement (NEU)

**Zweck:** Stromabrechnung fuer eine Periode (Monat/Quartal)

```
EnergySettlement speichert:
- Park (parkId)
- Jahr/Monat (year, month) - month = null fuer Jahresabrechnung
- Gesamtproduktion (totalProductionKwh) - nur Verteilschlüssel!
- Netzbetreiber-Erlös (netOperatorRevenueEur) - DIESER BETRAG WIRD VERTEILT
- Verteilungsmodus (distributionMode): PROPORTIONAL, SMOOTHED, TOLERATED
- Status: DRAFT, CALCULATED, INVOICED, CLOSED
- Berechnungsergebnis als JSON (calculationDetails)

WICHTIG: Die Abrechnungslogik ist:
  1. Netzbetreiber meldet Gesamterlös (z.B. 150.000 EUR)
  2. WKA-Produktionsdaten bestimmen den Verteilschlüssel
  3. Erlös wird nach Produktionsanteil verteilt
  4. NICHT: Produktion × Preis = Erlös (das wäre falsch!)
```

#### 4.3.6 EnergySettlementItem (NEU)

**Zweck:** Einzelposten einer Stromabrechnung (pro Betreiber/Fund)

```
EnergySettlementItem speichert:
- Stromabrechnung (energySettlementId)
- Empfaenger/Betreiber (recipientFundId)
- Anteil Produktion (productionShareKwh)
- Anteil Erloes (revenueShareEur)
- Verteilungsschluessel (distributionKey) - wie berechnet
- Generierte Gutschrift (invoiceId) - optional
```

#### 4.3.7 GridEntity (NEU)

**Zweck:** Netzgesellschaft oder Umspannwerk als eigenstaendige Entitaet

```
GridEntity speichert:
- Name (z.B. "Netz GbR Windpark Nord")
- Typ (GRID_OPERATOR, SUBSTATION, TRANSFORMER)
- Zugeordneter Park (parkId)
- Kontaktdaten, Bankverbindung
- Verwaltende Gesellschaft (managingFundId)
```

**Warum ein eigenes Model?**
- Netz GbR ist keine "normale" Beteiligungsgesellschaft
- Hat eigene Abrechnungslogik (Netzentgelte, Wartung)
- Kann mehreren Parks zugeordnet sein

### 4.4 Erweiterungen bestehender Modelle

#### 4.4.1 Turbine (erweitert)

```
NEUE FELDER:
- gridEntityId (optional): Zuordnung zu Netzgesellschaft/UW
- operatorHistory: Relation zu TurbineOperator[] (1:n)
- productions: Relation zu TurbineProduction[] (1:n)
```

#### 4.4.2 Fund (erweitert)

```
NEUE FELDER:
- fundType: BETREIBER, NETZGESELLSCHAFT, UMSPANNWERK, VERMARKTUNG
- parentHierarchies: FundHierarchy[] (Kind-Seite)
- childHierarchies: FundHierarchy[] (Eltern-Seite)
- operatedTurbines: TurbineOperator[] (welche WKAs betreibt dieser Fund)
```

#### 4.4.3 Lease (erweitert)

```
NEUE FELDER:
- billingInterval: MONTHLY, QUARTERLY, ANNUAL (Default: ANNUAL)
- linkedTurbineId (optional): Mindestpacht an spezifische WKA gebunden
```

#### 4.4.4 LeaseSettlementPeriod (erweitert)

```
NEUE FELDER:
- month (optional): 1-12 fuer monatliche Abrechnungen
- periodType: ADVANCE (Vorschuss), FINAL (Endabrechnung)
- linkedEnergySettlementId (optional): Verknuepfung zu Stromabrechnung
```

---

## 5. Gesellschaftsstruktur-Konzept

### 5.1 Hierarchie-Modell

```
EBENE 1: Dach-/Netzgesellschaft
===============================
      ┌──────────────────────────────────┐
      │  UW GmbH & Co. KG                │
      │  (Netzgesellschaft)              │
      │  fundType: NETZGESELLSCHAFT      │
      └──────────────┬───────────────────┘
                     │
         ┌───────────┼───────────┬───────────┐
         │           │           │           │
         ▼           ▼           ▼           ▼

EBENE 2: Betreiber / Infrastruktur
==================================
   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
   │ Netz    │  │Betreiber│  │Betreiber│  │  Priv.  │
   │ GbR     │  │GmbH&CoKG│  │   UG    │  │ Person  │
   │ (UW)    │  │         │  │         │  │         │
   └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘
        │            │            │            │
        │            │            │            │
EBENE 3: WKA-Zuordnung
==================================
        │       ┌────┴────┐       │            │
        │       ▼         ▼       ▼            ▼
        │    [WKA 1]   [WKA 2] [WKA 3]     [WKA 4]
        │
   [Umspannwerk/Netz]
```

### 5.2 Geldfluss-Modell

```
SCHRITT 1: Strom-Einnahmen
==========================
Netzbetreiber / Direktvermarkter
        │
        │ Zahlung: 150.000 EUR (gesamt)
        ▼
┌─────────────────────────────────┐
│  UW GmbH & Co. KG               │
│  (Netzgesellschaft)             │
│  Eingang: 150.000 EUR           │
└───────────────┬─────────────────┘
                │
SCHRITT 2: Verteilung nach WKA-Ertrag
=====================================
                │
    ┌───────────┼───────────┬───────────┐
    │           │           │           │
    ▼           ▼           ▼           ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│WKA 1   │ │WKA 2   │ │WKA 3   │ │WKA 4   │
│35.000€ │ │42.000€ │ │38.000€ │ │35.000€ │
│(23.3%) │ │(28.0%) │ │(25.3%) │ │(23.3%) │
└───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘
    │          │          │          │
SCHRITT 3: Gutschrift an Betreiber
==================================
    │          │          │          │
    ▼          ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│GmbH&Co.│ │   UG   │ │  GmbH  │ │Privat- │
│   KG   │ │        │ │        │ │person  │
│35.000€ │ │42.000€ │ │38.000€ │ │35.000€ │
└────────┘ └────────┘ └────────┘ └────────┘
```

### 5.3 Sonderfall: Miteigentum an WKA

```
WKA 5: Geteiltes Eigentum
=========================

┌────────────────────────┐
│        WKA 5           │
│   Produktion: 1000 MWh │
│   Erloes: 80.000 EUR   │
└───────────┬────────────┘
            │
    ┌───────┴───────┐
    │               │
    ▼               ▼
┌─────────┐   ┌─────────┐
│Fund A   │   │Fund B   │
│  60%    │   │  40%    │
│48.000€  │   │32.000€  │
└─────────┘   └─────────┘
```

### 5.4 Abbildung der Rechtsformen

| Rechtsform | Abbildung in WPM |
|------------|------------------|
| GmbH & Co. KG | Fund mit legalForm="GmbH & Co. KG" |
| GmbH | Fund mit legalForm="GmbH" |
| UG (haftungsbeschraenkt) | Fund mit legalForm="UG" |
| GbR | Fund mit legalForm="GbR" |
| Privatperson | Person mit personType="natural" |
| KG | Fund mit legalForm="KG" |

---

## 6. Stromabrechnung-Workflow

### 6.1 Prozess-Uebersicht

```
┌─────────────────────────────────────────────────────────────────┐
│                    MONATLICHER WORKFLOW                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐         │
│  │ IMPORT │───►│VALIDIE-│───►│BERECH- │───►│GUT-    │         │
│  │        │    │RUNG    │    │NUNG    │    │SCHRIFT │         │
│  └────────┘    └────────┘    └────────┘    └────────┘         │
│       │             │             │             │               │
│       ▼             ▼             ▼             ▼               │
│  CSV/Excel     Pruefung      Verteilung    Invoice             │
│  SCADA-API     Duplikate     nach WKA      generieren          │
│  Manuell       Plausibil.    Betreiber     PDF erstellen       │
│                                             versenden          │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Schritt 1: Daten-Import

```
IMPORT-QUELLEN
==============

1. CSV/Excel-Upload
   - Format: WKA-ID, Monat, Jahr, kWh, Verguetungsart, [Erloes]
   - Validierung: Summencheck, Plausibilitaet
   - Duplikat-Erkennung

2. Manueller Import (Formular)
   - Pro WKA einzeln erfassen
   - Mit Aufschluesselung EEG/DV/Redispatch

3. SCADA-Anbindung (Zukunft)
   - Automatischer Abruf von Produktionsdaten
   - Taeglich/Stuendlich
```

**Import-Datenformat (CSV):**
```csv
turbine_id,year,month,revenue_type,production_kwh,revenue_eur
WKA-001,2026,01,EEG,125000,10250.00
WKA-001,2026,01,DIRECT,75000,7125.00
WKA-002,2026,01,EEG,130000,10660.00
```

### 6.3 Schritt 2: Validierung

```
VALIDIERUNGSREGELN
==================

1. Technische Validierung
   - WKA existiert und ist aktiv
   - Monat/Jahr ist gueltig
   - Verguetungsart existiert
   - kWh > 0

2. Business-Validierung
   - Keine Duplikate (WKA + Monat + Verguetungsart)
   - Plausibilitaetspruefung: kWh < (Nennleistung * Stunden * Faktor)
   - Warnung bei starken Abweichungen zum Vormonat

3. Summen-Validierung (optional)
   - Summe aller WKAs = Erwarteter Parkertrag
```

### 6.4 Schritt 3: Verteilungsberechnung

#### 6.4.1 Modus: Proportional

```
PROPORTIONALE VERTEILUNG
========================

SCHRITT 1: Netzbetreiber meldet Gesamterlös
─────────────────────────────────────────────
Netzbetreiber-Zahlung:  150.000 EUR
(Das ist der Betrag, der verteilt wird!)

SCHRITT 2: WKA-Produktion = Verteilschlüssel
─────────────────────────────────────────────
WKA 1: 100.000 kWh  -->  25,0%
WKA 2: 120.000 kWh  -->  30,0%
WKA 3: 100.000 kWh  -->  25,0%
WKA 4:  80.000 kWh  -->  20,0%
─────────────────────────────────────────────
Summe: 400.000 kWh  --> 100,0%

SCHRITT 3: Verteilung nach Schlüssel
─────────────────────────────────────────────
WKA 1 (Betreiber A): 25% × 150.000 = 37.500 EUR
WKA 2 (Betreiber B): 30% × 150.000 = 45.000 EUR
WKA 3 (Betreiber C): 25% × 150.000 = 37.500 EUR
WKA 4 (Betreiber D): 20% × 150.000 = 30.000 EUR
─────────────────────────────────────────────
Summe:                              150.000 EUR ✓
```

#### 6.4.2 Modus: Mit Duldung (TOLERATED) - Verifiziert aus Praxis-PDFs

```
DULDUNG - FORMEL AUS ECHTEN ABRECHNUNGEN
========================================

Prinzip: Produktion wird auf Durchschnitt "geglättet"
         Überschüsse werden abgezogen, Defizite ausgeglichen

REAL-BEISPIEL (WP Barenburg, Dezember 2025):
────────────────────────────────────────────
Anlagen im Park:
  E-821116:  510.552,6 kWh  (unter Durchschnitt)
  E-821117:  521.154,7 kWh  (unter Durchschnitt)
  E-821118:  551.286,3 kWh  (über Durchschnitt)
  ─────────────────────────────────────────────
  Summe:   1.582.993,6 kWh
  Durchschnitt: 527.664,53 kWh

BERECHNUNG FÜR E-821118:
  Ist-Produktion:     551.286,3 kWh
  Durchschnitt:       527.664,53 kWh
  Abweichung:         +23.621,77 kWh (überdurchschnittlich)

  Vergütungssatz:     8,18 ct/kWh

  DULDUNGS-ABZUG:     23.621,77 × 0,0818 = 1.932,26 EUR
                                           ^^^^^^^^^^^^
                                           Exakt aus PDF!

GUTSCHRIFT-POSITIONEN:
  Pos 1: "Ergebnis aus Kooperationsvertrag (DULDUNG)"  -1.932,26 EUR
  Pos 2: "Erlöse tatsächliche Einspeisung (E-821118)" +45.095,22 EUR
  ─────────────────────────────────────────────────────────────────
  Netto:                                               43.162,96 EUR
  + 19% MwSt:                                           8.200,96 EUR
  Brutto:                                              51.363,92 EUR

FORMEL:
  Duldungs-Ausgleich = (Ist-Produktion - Durchschnitt) × Vergütungssatz

  Wenn positiv → Abzug (WKA hat mehr als Durchschnitt)
  Wenn negativ → Zuschlag (WKA hat weniger als Durchschnitt)
```

#### 6.4.3 Modus: Mit Duldung

```
DULDUNG (TOLERANCE)
===================

Ziel: Kleine Abweichungen ignorieren,
      nur signifikante Unterschiede ausgleichen

Parameter:
  - Toleranzgrenze: 5% vom Durchschnitt

Beispiel:
  Durchschnitt: 100.000 kWh
  Toleranz: +/- 5.000 kWh

  WKA 1: 98.000 kWh  --> Innerhalb Toleranz, keine Anpassung
  WKA 2: 120.000 kWh --> Ausserhalb, Ausgleich erforderlich
```

### 6.5 Schritt 4: Gutschrift-Erstellung

```
GUTSCHRIFT-WORKFLOW
===================

1. Pro Betreiber eine Gutschrift erstellen
   - Summe aller WKA-Ertraege des Betreibers
   - Aufschluesselung nach EEG/DV/Redispatch

2. Gutschrift-Positionen:
   - Position 1: EEG-Verguetung (X kWh a Y ct)
   - Position 2: Direktvermarktung (X kWh a Y ct)
   - Position 3: Redispatch-Entschaedigung

3. PDF generieren
   - Mit Mandanten-Branding
   - Detailaufstellung pro WKA

4. Versand
   - Per E-Mail an Betreiber
   - Archivierung im System
```

### 6.6 EEG vs. Direktvermarktung vs. Redispatch

```
VERGUETUNGSARTEN IM DETAIL
==========================

EEG-VERGUETUNG
- Fester Einspeisetarif (z.B. 8,18 ct/kWh)
- Zahlung durch Netzbetreiber
- Langfristig planbar
- MIT 19% MwSt

DIREKTVERMARKTUNG
- Verkauf an Stromboerse (EPEX)
- Preis schwankt taeglich/stuendlich
- Zusaetzliche Managementpraemie
- Hoehere Erloese, aber volatiler
- MIT 19% MwSt

MARKTPRÄMIE (separat!)
- Wird separat abgerechnet (eigene Gutschrift)
- OHNE MwSt
- Fester Beteiligungsanteil (z.B. 1/3)

REDISPATCH 2.0
- Entschaedigung bei Abregelung
- Wenn Netz ueberlastet
- Erstattung des entgangenen Ertrags
- Gesonderte Abrechnung
```

### 6.7 Steuerliche Behandlung (aus Praxis-PDFs)

```
UMSATZSTEUER-TABELLE
====================

| Kostenart                    | MwSt        | Grund                    |
|------------------------------|-------------|--------------------------|
| Stromerlöse (EEG/DV)         | +19%        | Lieferung                |
| Marktprämie                  | ohne        | Durchlaufposten          |
| Pacht - windhöfige Fläche    | +19%        | Sonstige Leistung        |
| Pacht - A+E Maßnahmen        | +19%        | Sonstige Leistung        |
| Pacht - WKA-Standort         | ohne        | §4 Nr.12 UStG (Grundst.) |
| Pacht - versiegelte Fläche   | ohne        | §4 Nr.12 UStG (Grundst.) |
| Wegenutzung                  | ohne        | §4 Nr.12 UStG (Grundst.) |


AUSWIRKUNG AUF RECHNUNGSSTELLUNG:
─────────────────────────────────
Pro Betreiber werden ZWEI Rechnungen erstellt:

1. Rechnung MIT MwSt (19%):
   - Anteil windhöfige Fläche
   - Anteil A+E Maßnahmen (Ausgleichs- und Ersatzmaßnahmen)

2. Rechnung OHNE MwSt:
   - Anteil WKA-Standort
   - Anteil versiegelte Fläche
   - Hinweis: "Umsatzsteuerfrei nach §4 Nr.12 UStG"
```

---

## 7. Pachtabrechnung-Erweiterungen

### 7.1 Neue Abrechnungsintervalle

```
ABRECHNUNGSINTERVALLE
=====================

AKTUELL (nur jährlich):
  Jan──────────────────────────────────Dec
  │                                      │
  └──────────► Jahresabrechnung ◄────────┘

NEU (flexibel):

MONATLICH:
  Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  Oct  Nov  Dec
  │    │    │    │    │    │    │    │    │    │    │    │
  ▼    ▼    ▼    ▼    ▼    ▼    ▼    ▼    ▼    ▼    ▼    ▼
  [12 Mindestpacht-Zahlungen]
                                                          │
                                                          ▼
                                           Jahresendabrechnung
                                           (Verrechnung gegen Ertrag)

QUARTALSWEISE:
  Q1          Q2          Q3          Q4
  │           │           │           │
  ▼           ▼           ▼           ▼
  [4 Mindestpacht-Zahlungen]
                                      │
                                      ▼
                         Jahresendabrechnung
```

### 7.2 Mindestpacht pro WKA

```
KONFIGURATIONSMOEGLICHKEITEN
============================

1. Park-global (wie bisher):
   Park "Windpark Nord"
   - minimumRentPerTurbine: 15.000 EUR
   - Gilt fuer alle 5 WKAs

2. WKA-individuell (NEU):
   WKA 1: 18.000 EUR (groessere Anlage)
   WKA 2: 15.000 EUR (Standard)
   WKA 3: 15.000 EUR (Standard)
   WKA 4: 12.000 EUR (aeltere Anlage)

3. Lease-spezifisch (NEU):
   Pachtvertrag A: 20.000 EUR pauschal
   Pachtvertrag B: 15% vom Ertrag, mind. 10.000 EUR
```

### 7.3 Verbindung zu Ertragsdaten

```
VERKNUEPFUNG PACHT <-> STROM
============================

Option A: Automatische Verknuepfung
  LeaseSettlementPeriod
       │
       │ linkedEnergySettlementId
       ▼
  EnergySettlement
       │
       │ Summe WKA-Ertraege
       ▼
  totalRevenue fuer Pacht-Berechnung

Option B: Manuelle Eingabe
  LeaseSettlementPeriod
       │
       │ totalRevenue (manuell)
       ▼
  Pacht-Berechnung wie bisher
```

### 7.4 Jahresendabrechnung - Verifiziert aus Praxis-PDFs

```
REAL-BEISPIEL: WP Barenburg / WEA 4 / 2025
==========================================

MINDESTPACHT (Februar, Vorauszahlung):
──────────────────────────────────────
Minimum gemäß Vertrag:                        16.500,00 EUR

Verteilungsschlüssel:
  10% für WKA-Standorte auf Eigentumsfläche:   1.650,00 EUR/WKA
  90% Umlage auf Gesamtfläche (12,14 ha):      1.223,34 EUR/ha

Positionen auf Gutschrift 26-0001:
  Pos 1: Mindestnutzungsentgelt Flurstück (2,12 ha)   2.591,39 EUR
  Pos 2: Mindestnutzungsentgelt WEA(s):1              1.650,00 EUR
  Pos 3: Versiegelte Fläche 3482 m² × 0,25 €            870,50 EUR
  ──────────────────────────────────────────────────────────────────
  Summe Mindestpacht:                                 5.111,89 EUR


JAHRESEND-RESTPACHT (Dezember):
───────────────────────────────
Jahres-Ertrag:                               464.522,96 EUR
Rechnerisches Jahresnutzungsentgelt (5,0%):   23.226,15 EUR
Minimum gemäß Vertrag:                        16.500,00 EUR

→ Tatsächliches Entgelt: MAX(23.226,15; 16.500,00) = 23.226,15 EUR

Neu-Verteilung:
  10% für WKA-Standorte:                       2.322,61 EUR/WKA
  90% Umlage auf Fläche:                       1.722,03 EUR/ha

Positionen auf Gutschrift 25-0002:
  Pos 1: + Jahresnutzungsentgelt Flurstück             3.647,76 EUR
  Pos 2: + Jahresnutzungsentgelt WEA(s):1              2.322,61 EUR
  Pos 3: - Verrechnung Mindestentgelt Flurstück       -2.591,39 EUR
  Pos 4: - Verrechnung Mindestentgelt WEA              -1.650,00 EUR
  Pos 5: - Verrechnung versiegelte Fläche               -870,50 EUR
  Pos 6: + Versiegelte Fläche                            870,50 EUR
  ──────────────────────────────────────────────────────────────────
  Restpacht (Nachzahlung):                             1.728,98 EUR


VERTEILUNGSSCHLÜSSEL-KOMPONENTEN:
─────────────────────────────────
1. WKA-Standort (10% der Summe)
   - Pro WKA auf der Eigentumsfläche
   - Fester Anteil

2. Flächenanteil (90% der Summe)
   - Anteilig nach Hektar
   - Gesamtfläche des Parks als Basis

3. Versiegelte Fläche (extra)
   - m² × Satz (z.B. 0,25 EUR/m²)
   - Für Fundamente, Kranstellflächen etc.
```

### 7.5 Workflow: Monatliche Abrechnung

```
MONATLICHER PACHT-WORKFLOW
==========================

Tag 1-5 des Monats:
  ┌────────────────────────────────────┐
  │ 1. Produktionsdaten importieren    │
  │    (Vormonat)                      │
  └─────────────────┬──────────────────┘
                    │
                    ▼
  ┌────────────────────────────────────┐
  │ 2. Stromabrechnung erstellen       │
  │    (automatisch oder manuell)      │
  └─────────────────┬──────────────────┘
                    │
                    ▼
  ┌────────────────────────────────────┐
  │ 3. Mindestpacht-Rechnungen         │
  │    generieren (pro Lease)          │
  │    - 1/12 der Jahresmindestpacht   │
  └─────────────────┬──────────────────┘
                    │
                    ▼
  ┌────────────────────────────────────┐
  │ 4. Versand an Verpächter           │
  └────────────────────────────────────┘

Januar des Folgejahres:
  ┌────────────────────────────────────┐
  │ 5. Jahresendabrechnung             │
  │    - Summe Ertraege                │
  │    - Abzgl. gezahlte Mindestpacht  │
  │    - Nachzahlung oder 0            │
  └────────────────────────────────────┘
```

---

## 8. UI-Konzept

### 8.1 Neue Seiten-Uebersicht

```
NAVIGATION (erweitert)
======================

Dashboard
├── [bestehend]

Windparks
├── [bestehend]
├── /parks/[id]/energy          (NEU) Stromabrechnung pro Park
└── /parks/[id]/operators       (NEU) Betreiber-Zuordnung

Gesellschaften (umbenannt von "Fonds")
├── /funds                      (erweitert) + Gesellschaftstyp-Filter
├── /funds/[id]                 (erweitert) + Hierarchie-Tab
├── /funds/[id]/hierarchy       (NEU) Gesellschaftsstruktur-Diagramm
└── /funds/new                  (erweitert) + Typ-Auswahl

Stromabrechnung (NEU)
├── /energy                     (NEU) Uebersicht alle Parks
├── /energy/import              (NEU) Daten-Import
├── /energy/settlements         (NEU) Abrechnungs-Perioden
└── /energy/revenue-types       (NEU) Verguetungsarten verwalten

Pacht & Flächen
├── [bestehend]
├── /leases/[id]                (erweitert) + Intervall-Einstellung
└── /leases/settlements         (erweitert) + Monatliche Ansicht

Admin
├── [bestehend]
└── /admin/grid-entities        (NEU) Netzgesellschaften verwalten
```

### 8.2 Komponenten-Struktur

#### 8.2.1 Stromabrechnung-Dashboard

```
/energy
├── Header
│   ├── Titel: "Stromabrechnung"
│   └── Actions: [Import] [Neue Periode]
│
├── Filter-Leiste
│   ├── Park-Auswahl (Dropdown)
│   ├── Jahr (Dropdown)
│   └── Status (Tabs: Alle | Offen | Abgeschlossen)
│
├── KPI-Karten
│   ├── Gesamtproduktion (MWh)
│   ├── Gesamterloes (EUR)
│   ├── Offene Abrechnungen (Anzahl)
│   └── Ausstehende Gutschriften (EUR)
│
├── Monats-Uebersicht (Tabelle)
│   ├── Monat | Produktion | Erloes | Status | Aktionen
│   └── [Details] [Gutschriften] [Abschliessen]
│
└── Quick-Actions
    ├── Produktionsdaten importieren
    ├── Alle Gutschriften erstellen
    └── Periode abschliessen
```

#### 8.2.2 Produktionsdaten-Import

```
/energy/import
├── Header
│   └── Titel: "Produktionsdaten importieren"
│
├── Import-Optionen (Tabs)
│   ├── CSV-Upload
│   │   ├── Datei-Dropzone
│   │   ├── Format-Hilfe
│   │   └── Vorschau-Tabelle
│   │
│   ├── Excel-Upload
│   │   ├── Datei-Dropzone
│   │   ├── Blatt-Auswahl
│   │   └── Spalten-Mapping
│   │
│   └── Manuelle Eingabe
│       ├── WKA-Auswahl
│       ├── Monat/Jahr
│       └── kWh + Verguetungsart
│
├── Validierungs-Ergebnis
│   ├── Erfolgreiche Zeilen (gruen)
│   ├── Warnungen (gelb)
│   └── Fehler (rot)
│
└── Actions
    └── [Importieren] [Abbrechen]
```

#### 8.2.3 Gesellschaftsstruktur-Diagramm

```
/funds/[id]/hierarchy
├── Header
│   ├── Titel: "[Gesellschaftsname] - Struktur"
│   └── Actions: [Bearbeiten] [Export]
│
├── Diagramm-Ansicht
│   └── Interaktives Hierarchie-Diagramm
│       ├── Knoten: Gesellschaften (klickbar)
│       ├── Kanten: Beteiligungsprozent
│       ├── Zoom/Pan
│       └── Ebenen-Collapsing
│
├── Tabellen-Ansicht (Toggle)
│   └── Flache Liste aller Beteiligungen
│
└── Legende
    ├── Farben nach Gesellschaftstyp
    └── Linienstaerke nach Beteiligungshoehe
```

#### 8.2.4 WKA-Betreiber-Zuordnung

```
/parks/[id]/operators
├── Header
│   ├── Titel: "WKA-Betreiber"
│   └── Actions: [Zuordnung aendern]
│
├── WKA-Liste
│   └── Pro WKA:
│       ├── WKA-Bezeichnung
│       ├── Aktueller Betreiber (Fund/Person)
│       ├── Beteiligungsanteil (%)
│       ├── Gueltig seit
│       └── [Bearbeiten] [Historie]
│
├── Zuordnungs-Dialog
│   ├── WKA-Auswahl
│   ├── Betreiber-Suche (Funds + Personen)
│   ├── Anteil (%) - bei Miteigentum
│   └── Gueltig ab Datum
│
└── Historie-Dialog
    └── Timeline aller Betreiberwechsel
```

### 8.3 Gesellschaftsstruktur-Visualisierung

**Technologie:** React Flow (empfohlen) oder D3.js

```
DIAGRAMM-LAYOUT
===============

          ┌─────────────────────────┐
          │  UW GmbH & Co. KG       │
          │  [Netzgesellschaft]     │
          │  ────────────────────   │
          │  Gesamtkapital: 500k    │
          └───────────┬─────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
       60%           25%           15%
        │             │             │
        ▼             ▼             ▼
   ┌─────────┐   ┌─────────┐   ┌─────────┐
   │Netz GbR │   │Betreiber│   │  Hans   │
   │ [UW]    │   │GmbH&CoKG│   │ Mueller │
   │ ─────── │   │ ─────── │   │ ─────── │
   │ 300k    │   │ 125k    │   │  75k    │
   └────┬────┘   └────┬────┘   └─────────┘
        │             │
        │        ┌────┴────┐
        │        │         │
        │       100%      100%
        │        │         │
        ▼        ▼         ▼
   [Umspann-  [WKA 1]   [WKA 2]
    werk]

LEGENDE:
[Netzgesellschaft] = Blau
[Betreiber]        = Gruen
[Person]           = Grau
[WKA]              = Orange
```

---

## 9. Implementierungsphasen

### 9.1 Phasen-Uebersicht

```
PHASE 6: Stromabrechnung & Erweiterte Pacht
===========================================

Phase 6.1 (2 Wochen)     Phase 6.2 (2 Wochen)     Phase 6.3 (2 Wochen)
─────────────────────    ─────────────────────    ─────────────────────
DATENMODELL              STROMABRECHNUNG          PACHT-ERWEITERUNG
─────────────────────    ─────────────────────    ─────────────────────
• Neue Prisma-Models     • Import-Funktion        • Abrechnungsintervalle
• Migration erstellen    • Validierung            • Monatliche Perioden
• Seed-Daten             • Verteilungslogik       • Jahresendabrechnung
• API-Endpoints          • Gutschriften           • Ertragsdaten-Link
• Basis-Tests            • Admin-UI               • Settlement-Update

Phase 6.4 (1 Woche)      Phase 6.5 (1 Woche)
─────────────────────    ─────────────────────
GESELLSCHAFTS-           INTEGRATION &
HIERARCHIEN              FEINSCHLIFF
─────────────────────    ─────────────────────
• FundHierarchy Model    • E2E Tests
• Fund-als-Shareholder   • Performance
• Visualisierung         • Dokumentation
• Betreiber-Zuordnung    • Bug Fixes

GESAMT: 8 Wochen
```

### 9.2 Phase 6.1: Datenmodell (2 Wochen)

#### Woche 1: Neue Models

| Tag | Task | Output |
|-----|------|--------|
| 1-2 | TurbineProduction Model | Prisma Schema, Migration |
| 3-4 | EnergyRevenueType Model | Prisma Schema, Seed-Daten |
| 5 | TurbineOperator Model | Prisma Schema |

#### Woche 2: APIs & Tests

| Tag | Task | Output |
|-----|------|--------|
| 1-2 | CRUD APIs fuer neue Models | /api/energy/* Endpoints |
| 3 | Turbine-Erweiterung | gridEntityId, Relations |
| 4-5 | Unit Tests | Jest Tests |

**Deliverables:**
- Alle neuen Models in Prisma Schema
- Erfolgreiche Migration
- Basis-APIs funktional
- Test-Coverage > 70%

### 9.3 Phase 6.2: Stromabrechnung (2 Wochen)

#### Woche 3: Import & Berechnung

| Tag | Task | Output |
|-----|------|--------|
| 1-2 | CSV-Import Komponente | Upload, Parser, Validierung |
| 3 | Excel-Import | xlsx Library Integration |
| 4-5 | Verteilungsberechnung | Calculator Service |

#### Woche 4: Gutschriften & UI

| Tag | Task | Output |
|-----|------|--------|
| 1-2 | Gutschrift-Generator | Invoice Integration |
| 3-4 | /energy Seite | Dashboard, Tabelle |
| 5 | /energy/import Seite | Import-Wizard |

**Deliverables:**
- Funktionierender Daten-Import
- Automatische Verteilung nach WKA
- Gutschrift-Erstellung
- Admin-UI komplett

### 9.4 Phase 6.3: Pacht-Erweiterung (2 Wochen)

#### Woche 5: Datenmodell-Erweiterung

| Tag | Task | Output |
|-----|------|--------|
| 1 | Lease.billingInterval | Schema, Migration |
| 2 | LeaseSettlementPeriod.month | Schema, Migration |
| 3-4 | Settlement Calculator Update | Monatliche Logik |
| 5 | API-Anpassungen | Endpoints erweitert |

#### Woche 6: UI & Verknuepfung

| Tag | Task | Output |
|-----|------|--------|
| 1-2 | Lease-Formular Update | Intervall-Auswahl |
| 3-4 | Settlement UI Update | Monatsansicht |
| 5 | Ertragsdaten-Verknuepfung | Link zu EnergySettlement |

**Deliverables:**
- Monatliche/Quartalsweise Abrechnung moeglich
- Jahresendabrechnung mit Verrechnung
- Verknuepfung Pacht <-> Stromertrag

### 9.5 Phase 6.4: Gesellschaftshierarchien (1 Woche)

| Tag | Task | Output |
|-----|------|--------|
| 1 | FundHierarchy Model | Schema, Migration |
| 2 | Fund.fundType | Schema, UI-Update |
| 3-4 | Hierarchie-Visualisierung | React Flow Komponente |
| 5 | Betreiber-Zuordnung UI | /parks/[id]/operators |

**Deliverables:**
- Fund kann Gesellschafter sein
- Visuelle Darstellung der Struktur
- WKA-Betreiber-Zuordnung funktional

### 9.6 Phase 6.5: Integration (1 Woche)

| Tag | Task | Output |
|-----|------|--------|
| 1-2 | E2E Tests | Playwright Tests |
| 3 | Performance-Optimierung | Queries, Caching |
| 4 | Dokumentation | API-Docs, User-Guide |
| 5 | Bug Fixes & Polish | Stabilisierung |

**Deliverables:**
- Alle Features stabil
- Dokumentation komplett
- Production-ready

### 9.7 Abhaengigkeits-Diagramm

```
ABHAENGIGKEITEN
===============

TurbineProduction ──────┬──► EnergySettlement ──► EnergySettlementItem
                        │                               │
EnergyRevenueType ──────┘                               │
                                                        │
TurbineOperator ────────────────────────────────────────┘
        │
        ▼
FundHierarchy ◄───── Fund.fundType

LeaseSettlementPeriod.month ◄───── EnergySettlement (optional Link)
        │
        ▼
Lease.billingInterval
```

---

## 10. Tech-Entscheidungen

### 10.1 Neue Dependencies

| Package | Zweck | Begruendung |
|---------|-------|-------------|
| **xlsx** | Excel-Import | Robuste Library, bereits im Projekt fuer Export |
| **papaparse** | CSV-Parsing | Schnell, streaming-faehig |
| **@xyflow/react** (React Flow) | Hierarchie-Diagramm | Interaktiv, gut dokumentiert, React-nativ |
| **decimal.js** | Praezise Berechnungen | Bereits via Prisma vorhanden |

### 10.2 Architektur-Entscheidungen

#### ADR-001: Getrennte Models fuer Strom und Pacht

**Kontext:** Stromabrechnung und Pachtabrechnung haben unterschiedliche Lebenszyklen und Anforderungen.

**Entscheidung:** Separate Models (EnergySettlement vs. LeaseSettlementPeriod) mit optionaler Verknuepfung.

**Begruendung:**
- Unabhaengige Entwicklung und Aenderung
- Klarere Verantwortlichkeiten
- Einfachere Migration

#### ADR-002: Fund als universelles Gesellschafts-Model

**Kontext:** Verschiedene Gesellschaftstypen (Betreiber, Netz, UW) haben aehnliche Grundeigenschaften.

**Entscheidung:** Erweiterung des Fund-Models mit fundType statt separate Models.

**Begruendung:**
- Weniger Komplexitaet
- Einheitliche Beziehungen
- Flexibilitaet fuer zukuenftige Typen

#### ADR-003: TurbineOperator mit Zeitreihe

**Kontext:** Betreiberwechsel muessen historisch nachvollziehbar sein.

**Entscheidung:** Separates TurbineOperator-Model mit validFrom/validTo statt direkter Turbine-Fund-Relation.

**Begruendung:**
- Vollstaendige Historie
- Rueckwirkende Korrekturen moeglich
- Unterstuetzt Miteigentum

### 10.3 Performance-Ueberlegungen

```
KRITISCHE QUERIES
=================

1. Monatliche Produktionsdaten (haeufig):
   - Index auf: (turbineId, year, month)
   - Cache: 5 Minuten (nach Import invalide)

2. Gesellschafts-Hierarchie (komplex):
   - Rekursive CTE oder Application-Level
   - Cache: 30 Minuten (selten geaendert)

3. Verteilungsberechnung (rechenintensiv):
   - Background Job (BullMQ)
   - Ergebnis in JSON-Feld speichern
```

---

## 11. Risiken und Abhaengigkeiten

### 11.1 Technische Risiken

| Risiko | Wahrscheinlichkeit | Auswirkung | Mitigation |
|--------|-------------------|------------|------------|
| Komplexe Hierarchie-Berechnungen | Mittel | Hoch | Caching, Background Jobs |
| Dateninkonsistenzen bei Import | Hoch | Mittel | Strikte Validierung, Rollback |
| Performance bei vielen WKAs | Niedrig | Mittel | Pagination, Lazy Loading |

### 11.2 Fachliche Risiken

| Risiko | Wahrscheinlichkeit | Auswirkung | Mitigation |
|--------|-------------------|------------|------------|
| Unklare Verteilungsregeln | Mittel | Hoch | Fruehe Kundenklaerung |
| Aenderung Gesetzeslage (EEG) | Mittel | Mittel | Flexible Verguetungstypen |
| Komplexe Sonderfaelle | Hoch | Mittel | Manuelle Ueberschreibung |

### 11.3 Geklärte Fragen (Stand: 2026-02-05)

```
ANTWORTEN VOM KUNDEN:
=====================

1. Bevorzugter Verteilungsmodus?
   → GEGLÄTTET (SMOOTHED) als Standard

2. Wie werden Redispatch-Mengen kommuniziert?
   → Offenes Modell schaffen (flexibler Import)

3. Sollen Betreiberwechsel rueckwirkend moeglich sein?
   → JA, rückwirkende Änderungen müssen möglich sein

4. Gibt es Parks mit mehr als 2 Hierarchie-Ebenen?
   → OFFEN - Frage nach Dachgesellschaft/Holding über Netzgesellschaft

5. Monatliche Mindestpacht bei Jahresvertraegen?
   → 1/12 der Jahressumme

6. Gesellschaftsstruktur-Visualisierung exportierbar (PDF)?
   → JA, PDF-Export gewünscht

WICHTIGE ZUSATZINFORMATION:
===========================

7. Flexibilität der Zuordnung:
   → Eine Gesellschaft kann 1, 2, 3 oder mehr WKAs betreiben
   → Muss maximal flexibel gestaltet werden

8. KRITISCH - Abrechnungslogik:
   → Bei der Abrechnung zählen NUR die Werte des Netzbetreibers
   → Die Produktionsdaten der WKA sind NUR der Verteilschlüssel
   → D.h.: Netzbetreiber-Erlös wird nach WKA-Produktion aufgeteilt
   → NICHT: WKA-Produktion × Preis = Erlös

9. DULDUNG-Formel (aus echten PDFs verifiziert):
   → Duldungs-Ausgleich = (Ist-Produktion - Durchschnitt) × Vergütungssatz
   → Positiv = Abzug (WKA produzierte mehr als Schnitt)
   → Negativ = Zuschlag (WKA produzierte weniger als Schnitt)

10. Betreiber-Kostenaufteilung (2 Rechnungen pro Betreiber!):
    → Rechnung 1: MIT 19% MwSt (windhöfige Fläche + A+E Maßnahmen)
    → Rechnung 2: OHNE MwSt (WKA-Standort + versiegelte Fläche, §4 Nr.12 UStG)

11. Pachtverteilungsschlüssel:
    → 10% der Summe: Anteilig für WKA-Standorte auf Eigentumsfläche
    → 90% der Summe: Umlage auf Gesamtfläche des Windparks (EUR/ha)
    → Extra: Versiegelte Fläche (m² × Satz, z.B. 0,25 EUR/m²)

12. Gesellschaftsstruktur WP Barenburg (Beispiel):
    → Netzgesellschaft: Barenburg Netz GbR
    → Betreiber: Zweite Barenburg GmbH (1/3 Anteil)
    → Weitere Betreiber mit je 1/3 Anteil
    → 4 WKAs im Park (WEA 1-4)

13. Pachtverteilungsschlüssel KONFIGURIERBAR:
    → Die 10%/90%-Aufteilung ist pro Park einstellbar
    → Bereits im Park-Model: weaSharePercentage, poolSharePercentage
    → Versiegelungssatz (EUR/m²) ebenfalls konfigurierbar

14. Hierarchie-Ebenen:
    → Standard: 2 Ebenen (Netzgesellschaft → Betreiber)
    → System unterstützt beliebige Tiefe (FundHierarchy-Model)
    → Falls zukünftig 3 Ebenen nötig: Holding → Netzgesellschaft → Betreiber

15. WICHTIG - Vergütungssätze schwanken monatlich!
    → EEG/DV-Sätze ändern sich jeden Monat
    → Müssen pro Abrechnungsperiode erfasst werden
    → Marktwert (MW) und Managementfee (MF) variabel
    → Beispiel Dezember 2025: MW=8,349 ct/kWh, MF=0,4 ct/kWh
```

---

## Anhang A: Prisma Schema Entwurf (Auszug)

```prisma
// NEUE ENUMS
enum FundType {
  BETREIBER
  NETZGESELLSCHAFT
  UMSPANNWERK
  VERMARKTUNG
  SONSTIGE
}

enum BillingInterval {
  MONTHLY
  QUARTERLY
  ANNUAL
}

enum ProductionDataSource {
  MANUAL
  CSV_IMPORT
  EXCEL_IMPORT
  SCADA
}

enum EnergyCalculationType {
  FIXED_RATE
  MARKET_PRICE
  MANUAL
}

enum DistributionMode {
  PROPORTIONAL  // Direkte Aufteilung nach kWh-Anteil
  SMOOTHED      // Geglättet (Standard) - Ausgleich von Standortunterschieden
  TOLERATED     // Mit Duldung - kleine Abweichungen werden ignoriert
}

// NEUE MODELS

model TurbineProduction {
  id              String   @id @default(uuid())
  year            Int
  month           Int      // 1-12
  productionKwh   Decimal  @db.Decimal(15, 3)
  revenueEur      Decimal? @db.Decimal(15, 2)
  source          ProductionDataSource @default(MANUAL)
  status          String   @default("DRAFT") // DRAFT, CONFIRMED, INVOICED
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  turbineId       String
  turbine         Turbine  @relation(fields: [turbineId], references: [id])

  revenueTypeId   String
  revenueType     EnergyRevenueType @relation(fields: [revenueTypeId], references: [id])

  tenantId        String
  // ... tenant relation

  @@unique([turbineId, year, month, revenueTypeId])
  @@index([turbineId])
  @@index([year, month])
}

model TurbineOperator {
  id                  String   @id @default(uuid())
  ownershipPercentage Decimal  @db.Decimal(5, 2) @default(100)
  validFrom           DateTime
  validTo             DateTime?
  status              String   @default("ACTIVE")
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  turbineId           String
  turbine             Turbine  @relation(fields: [turbineId], references: [id])

  operatorFundId      String
  operatorFund        Fund     @relation(fields: [operatorFundId], references: [id])

  @@index([turbineId])
  @@index([operatorFundId])
}

model FundHierarchy {
  id                  String   @id @default(uuid())
  ownershipPercentage Decimal  @db.Decimal(8, 5)
  validFrom           DateTime
  validTo             DateTime?
  createdAt           DateTime @default(now())

  parentFundId        String
  parentFund          Fund     @relation("ParentHierarchy", fields: [parentFundId], references: [id])

  childFundId         String
  childFund           Fund     @relation("ChildHierarchy", fields: [childFundId], references: [id])

  @@unique([parentFundId, childFundId, validFrom])
}

model EnergyRevenueType {
  id              String   @id @default(uuid())
  name            String   // "EEG-Verguetung"
  code            String   @unique // "EEG", "DIRECT", "REDISPATCH", "MARKTPRAEMIE"
  description     String?
  calculationType EnergyCalculationType @default(FIXED_RATE)
  hasTax          Boolean  @default(true)  // Mit oder ohne MwSt
  taxRate         Decimal? @db.Decimal(5, 2) @default(19.0)
  isActive        Boolean  @default(true)
  sortOrder       Int      @default(0)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  productions     TurbineProduction[]
  monthlyRates    EnergyMonthlyRate[]  // Monatliche Vergütungssätze

  tenantId        String
  // ... tenant relation
}

// NEU: Monatliche Vergütungssätze (schwanken jeden Monat!)
model EnergyMonthlyRate {
  id              String   @id @default(uuid())
  year            Int
  month           Int      // 1-12

  // Vergütungssätze in ct/kWh
  ratePerKwh      Decimal  @db.Decimal(10, 4)  // Hauptsatz (z.B. 8,18 ct/kWh)
  marketValue     Decimal? @db.Decimal(10, 4)  // Marktwert MW (z.B. 8,349 ct/kWh)
  managementFee   Decimal? @db.Decimal(10, 4)  // Managementfee MF (z.B. 0,4 ct/kWh)

  notes           String?  // Bemerkungen
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  revenueTypeId   String
  revenueType     EnergyRevenueType @relation(fields: [revenueTypeId], references: [id])

  tenantId        String
  // ... tenant relation

  @@unique([revenueTypeId, year, month, tenantId])
  @@index([year, month])
}

model EnergySettlement {
  id                      String   @id @default(uuid())
  year                    Int
  month                   Int?     // null = Jahresabrechnung

  // Netzbetreiber-Daten (Quelle der Wahrheit für Erlöse)
  netOperatorRevenueEur   Decimal  @db.Decimal(15, 2)  // Betrag vom Netzbetreiber
  netOperatorReference    String?  // Referenz/Belegnummer vom Netzbetreiber

  // WKA-Produktionsdaten (nur Verteilschlüssel!)
  totalProductionKwh      Decimal  @db.Decimal(15, 3)  // Summe aller WKA-Produktionen

  // Verteilungslogik
  distributionMode        DistributionMode @default(SMOOTHED)  // Geglättet als Standard
  smoothingFactor         Decimal? @db.Decimal(5, 4)  // Optional: Glättungsfaktor
  tolerancePercentage     Decimal? @db.Decimal(5, 2)  // Optional: Toleranzgrenze %

  status                  String   @default("DRAFT")
  calculationDetails      Json?    // Detaillierte Berechnungsschritte
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt

  parkId                  String
  park                    Park     @relation(fields: [parkId], references: [id])

  items                   EnergySettlementItem[]

  tenantId                String
  // ... tenant relation

  @@unique([parkId, year, month])
}

model EnergySettlementItem {
  id                  String   @id @default(uuid())
  productionShareKwh  Decimal  @db.Decimal(15, 3)
  revenueShareEur     Decimal  @db.Decimal(15, 2)
  distributionKey     String?  // Wie berechnet
  createdAt           DateTime @default(now())

  energySettlementId  String
  energySettlement    EnergySettlement @relation(fields: [energySettlementId], references: [id])

  recipientFundId     String
  recipientFund       Fund     @relation(fields: [recipientFundId], references: [id])

  invoiceId           String?
  invoice             Invoice? @relation(fields: [invoiceId], references: [id])

  @@index([energySettlementId])
  @@index([recipientFundId])
}

// ERWEITERUNGEN

model Fund {
  // ... bestehende Felder ...

  fundType            FundType @default(BETREIBER)

  // Hierarchie-Relationen
  parentHierarchies   FundHierarchy[] @relation("ChildHierarchy")
  childHierarchies    FundHierarchy[] @relation("ParentHierarchy")

  // Betriebene WKAs
  operatedTurbines    TurbineOperator[]

  // Empfangene Strom-Gutschriften
  energySettlementItems EnergySettlementItem[]
}

model Turbine {
  // ... bestehende Felder ...

  operatorHistory     TurbineOperator[]
  productions         TurbineProduction[]
}

model Lease {
  // ... bestehende Felder ...

  billingInterval     BillingInterval @default(ANNUAL)
  linkedTurbineId     String?  // Mindestpacht an spezifische WKA gebunden
}

model LeaseSettlementPeriod {
  // ... bestehende Felder ...

  month               Int?     // 1-12 fuer monatliche Abrechnungen
  periodType          String   @default("FINAL") // ADVANCE, FINAL
  linkedEnergySettlementId String?
}
```

---

## Anhang B: Glossar

| Begriff | Erklaerung |
|---------|------------|
| **EEG** | Erneuerbare-Energien-Gesetz, fester Einspeisetarif |
| **Direktvermarktung** | Verkauf an Stromboerse statt fester Verguetung |
| **Redispatch** | Abregelung zur Netzstabilisierung, mit Entschaedigung |
| **Glaettung** | Ausgleich von Ertragsunterschieden zwischen WKAs |
| **Duldung** | Toleranzbereich fuer kleine Abweichungen |
| **Mindestpacht** | Garantierte Mindestzahlung an Verpachter |
| **Umsatzbeteiligung** | Prozentuale Beteiligung am Ertrag |
| **Netzgesellschaft** | Betreibergesellschaft fuer Netz-Infrastruktur |
| **UW** | Umspannwerk |

---

## Anhang C: Checkliste vor Implementierung

- [ ] Klaerung offener Fragen mit Kunde (Abschnitt 11.3)
- [ ] Review des Datenmodells durch Senior Developer
- [ ] Abstimmung UI-Design mit UX-Designer
- [ ] Test-Strategie definiert
- [ ] Performance-Anforderungen geklaert (max. WKAs, max. Monate)
- [ ] Migration-Strategie fuer bestehende Daten
- [ ] Dokumentation der Verteilungslogik finalisiert

---

**Dokument-Version:** 1.0
**Naechste Review:** Nach Kunden-Feedback
