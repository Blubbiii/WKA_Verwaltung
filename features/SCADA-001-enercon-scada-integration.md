# SCADA-001: Enercon SCADA-Daten Integration

> **Status:** Design-Phase
> **Erstellt:** 2026-02-07
> **Autor:** Solution Architect
> **Abhaengigkeiten:** Bestehende Parks/Turbinen, TurbineProduction-Tabelle, Energy-Modul

---

## 1. Zusammenfassung

Die Enercon SCADA-Daten (ca. 21.000 DBF-Dateien mit 10-Minuten-Messdaten von 4 Windpark-Standorten) sollen in den WindparkManager integriert werden. Ziel ist es, automatisch monatliche Produktionsdaten aus den Rohdaten zu berechnen und diese in die bestehende Stromabrechnung einfliessen zu lassen. Zusaetzlich sollen die hochaufgeloesten Daten (10-Min-Intervalle) fuer Analyse-Dashboards verfuegbar sein.

### Geschaeftlicher Nutzen

- **Automatisierung:** Kein manuelles Abtippen von Produktionsdaten mehr
- **Genauigkeit:** Berechnung direkt aus Anlagendaten statt aus Abrechnungen Dritter
- **Transparenz:** Drill-Down von Monatswerten bis auf 10-Minuten-Ebene
- **Frueh-Erkennung:** Leistungsabfaelle oder Ausfaelle schneller erkennen

---

## 2. Ist-Analyse: Was existiert bereits?

### Bestehende Infrastruktur (geprueft)

```
Datenbank (PostgreSQL + Prisma)
+-- Parks (id, name, shortName, ...)
+-- Turbines (id, designation, serialNumber, parkId, ratedPowerKw, ...)
+-- TurbineProduction (turbineId, year, month, productionKwh, revenueEur, source, status)
+-- EnergySettlement (parkId, year, month, totalProductionKwh, ...)
+-- EnergyRevenueType (EEG, Direktvermarktung, ...)
+-- WeatherData (parkId, windSpeedMs, temperatureC, ...)
```

### Bestehende UI-Seiten

```
/energy                     --> Uebersicht Stromabrechnung (KPI-Cards, Tabelle)
/energy/productions         --> Produktionsdaten-Liste (Filter nach Park/Jahr/Monat)
/energy/productions/new     --> Manuelle Erfassung einzelner Produktionsdaten
/energy/import              --> CSV/Excel-Import (4-Schritte-Wizard)
/energy/settlements         --> Abrechnungsuebersicht
/energy/settlements/new     --> Neue Abrechnung erstellen
```

### Bestehende APIs

```
GET/POST  /api/energy/productions          --> Produktionsdaten lesen/schreiben
GET/PUT   /api/energy/productions/[id]     --> Einzeldatensatz
POST      /api/energy/productions/import   --> CSV/Excel-Import
GET/POST  /api/energy/settlements          --> Abrechnungen
```

### Was wir wiederverwenden

- **TurbineProduction-Tabelle:** Monatliche Aggregate aus SCADA werden hier gespeichert (source = "SCADA")
- **Energy-Uebersichtsseite:** Zeigt bereits SCADA als Datenquelle im Badge an
- **Bestehender Import-Wizard:** Kann als Vorlage fuer den SCADA-Import-Flow dienen
- **WeatherData-Tabelle:** Windgeschwindigkeiten aus SCADA ergaenzen die bestehenden Wetterdaten

---

## 3. Entscheidung: Bestehende Datenbank erweitern (NICHT separate DB)

### Warum in die bestehende PostgreSQL-Datenbank?

| Kriterium | Separate DB (z.B. TimescaleDB) | Bestehende PostgreSQL |
|-----------|-------------------------------|----------------------|
| Datenmenge | 3 Mio Datensaetze (10-Min) | Problemlos mit Indizes |
| Abfrage-Performance | Optimiert fuer Zeitreihen | Gut genug mit Partitionierung |
| Komplexitaet | Zweite DB verwalten, Sync-Logik | Alles an einem Ort |
| Joins mit Parks/Turbinen | Cross-DB problematisch | Native Joins |
| Kosten | Zusaetzliche Infrastruktur | Kein Mehraufwand |
| Team-Wissen | Neues Tool lernen | Prisma + PostgreSQL bekannt |

**Entscheidung: Bestehende PostgreSQL erweitern.**

Begruendung fuer den Produktmanager:
- ~3 Millionen 10-Minuten-Datensaetze sind fuer PostgreSQL kein Problem (das ist weit unter dem, was grosse PostgreSQL-Installationen verarbeiten)
- Alle Daten liegen an einem Ort, keine Synchronisation noetig
- Die bestehenden Verknuepfungen zu Parks, Turbinen und Abrechnungen funktionieren direkt
- Falls in Zukunft >100 Mio Datensaetze anfallen, kann auf TimescaleDB (eine PostgreSQL-Erweiterung) umgestellt werden, ohne die App grundlegend zu aendern

---

## 4. Datenmodell: Neue Tabellen

### A) SCADA-Standort-Mapping (Zuordnungstabelle)

```
Jedes SCADA-Mapping hat:
- Enercon-Standort-Code (z.B. "Loc_5842")
- Zugehoeriger Park (Verweis auf bestehende Parks-Tabelle)
- PlantNo (1-6, Anlagennummer innerhalb des Standorts)
- Zugehoerige Turbine (Verweis auf bestehende Turbines-Tabelle)
- Beschreibung (optional, z.B. "WKA Nord")
- Status (Aktiv/Inaktiv)
- Mandant (tenantId)

Gespeichert in: Neue Tabelle "scada_turbine_mappings"
Eindeutigkeit: Pro Mandant kann jede Loc/PlantNo-Kombination nur einmal zugeordnet werden
```

**Warum diese Tabelle?**
Die Enercon-Daten verwenden eigene Kennungen (Loc_xxxx + PlantNo). Der WPM hat eigene Park- und Turbinen-IDs. Diese Tabelle ist die "Bruecke" zwischen beiden Welten. Ein Admin legt einmal fest: "Loc_5842 + PlantNo 1 = Turbine WKA-Nord im Windpark Musterstadt".

### B) SCADA 10-Minuten-Rohdaten

```
Jeder 10-Minuten-Datensatz hat:
- Turbine (Verweis auf Turbines-Tabelle)
- Zeitstempel (Datum + Uhrzeit des Messintervalls)
- Windgeschwindigkeit (m/s)
- Rotordrehzahl (RPM)
- Wirkleistung (Watt)
- Betriebsstunden (kumulativ)
- Windrichtung (Grad)
- Datenquelle-Datei (Typ: WSD, UID, etc.)
- Mandant (tenantId)

Optional (aus UID-Dateien):
- Spannung (Volt)
- Strom (Ampere)
- Leistungsfaktor (cos phi)
- Netzfrequenz (Hz)
- Kumulativer Zaehlerstand Wirkarbeit (kWh)

Gespeichert in: Neue Tabelle "scada_measurements"
Eindeutigkeit: Pro Turbine + Zeitstempel nur ein Eintrag
Geschaetzte Groesse: ~3 Millionen Datensaetze (wachsend)
```

**Warum diese Detaildaten speichern?**
- Ermoeglicht Drill-Down von Monats- auf Tages- auf 10-Minuten-Ebene
- Windgeschwindigkeit + Leistung = Leistungskurven-Analyse (erkennt Verschleiss)
- Kumulativer Zaehlerstand (aus UID) dient als Gegenprobe zur Leistungsberechnung

### C) SCADA Import-Protokoll

```
Jeder Import-Lauf hat:
- Startzeit
- Endzeit
- Status (Laeuft, Erfolgreich, Fehlgeschlagen, Teilweise)
- Standort-Code (z.B. "Loc_5842")
- Dateityp (WSD, UID, etc.)
- Anzahl verarbeiteter Dateien
- Anzahl importierter Datensaetze
- Anzahl uebersprungener Datensaetze
- Anzahl fehlerhafter Datensaetze
- Fehlerdetails (als strukturiertes Protokoll)
- Letztes verarbeitetes Datum (fuer inkrementellen Import)
- Mandant (tenantId)

Gespeichert in: Neue Tabelle "scada_import_logs"
```

**Warum ein Import-Protokoll?**
- Der Import von 21.000 Dateien kann Stunden dauern
- Der Benutzer muss den Fortschritt sehen koennen
- Bei Fehlern muss nachvollziehbar sein, welche Dateien betroffen waren
- Fuer den inkrementellen Import muss bekannt sein, bis zu welchem Datum bereits importiert wurde

---

## 5. Import-Strategie

### Welche Library fuer DBF-Dateien?

**Empfehlung: `dbffile` (Node.js Library)**

Begruendung fuer den Produktmanager:
- Speziell fuer dBASE III-Dateien entwickelt (genau das Format der Enercon-Daten)
- Asynchron (blockiert die Anwendung nicht waehrend des Imports)
- Leichtgewichtig, keine externen Abhaengigkeiten
- Bewaehrte Library mit guter Wartung

### Import-Ablauf (3 Phasen)

```
PHASE 1: Erstimport (einmalig)
=========================================

Schritt 1: Mandanten-Admin erstellt Zuordnung im WPM
   Loc_2205 --> Windpark "Alpha"
     PlantNo 1 --> Turbine "WKA 1"

   Loc_3196 --> Windpark "Beta"
     PlantNo 1 --> Turbine "WKA 1"

   Loc_3515 --> Windpark "Gamma"
     PlantNo 1 --> Turbine "WKA 1"

   Loc_5842 --> Windpark "Delta"
     PlantNo 1 --> Turbine "WKA 1"
     PlantNo 2 --> Turbine "WKA 2"
     PlantNo 3 --> Turbine "WKA 3"
     PlantNo 4 --> Turbine "WKA 4"

Schritt 2: Mandanten-Admin startet Bulk-Import
   - Admin laedt DBF-Dateien hoch oder gibt Server-Pfad an
   - System liest alle ~21.000 DBF-Dateien
   - Fortschrittsanzeige: "Datei 1.234 von 21.391 (6%)"
   - Geschaetzte Dauer: 30-60 Minuten
   - Laeuft im Hintergrund (Admin kann weiterarbeiten)

Schritt 3: System berechnet monatliche Aggregate
   - Aus 10-Min-Daten: Summe(Leistung * 10min) / 60 / 1000 = kWh/Monat
   - Ergebnis wird in bestehende TurbineProduction-Tabelle geschrieben
   - source = "SCADA"


PHASE 2: Inkrementeller Import (regelmaessig)
=========================================

- Nur neue Dateien seit dem letzten Import werden gelesen
- Kann manuell oder automatisch (z.B. taeglich/woechentlich) ausgeloest werden
- Typische Laufzeit: Sekunden bis wenige Minuten


PHASE 3: Zukuenftig (Optional)
=========================================

- Automatischer Import via Netzlaufwerk/Ordner-Ueberwachung
- Oder: Enercon SCADA API-Anbindung (falls verfuegbar)
```

### Welche Dateitypen zuerst importieren?

```
PRIORITAET 1 (sofort):
  WSD (Wind Speed Daily) - Enthalt Leistungsdaten fuer Produktionsberechnung
  --> Windgeschwindigkeit, Wirkleistung, Betriebsstunden

PRIORITAET 2 (spaeter):
  UID (Electrical Data) - Zaehlerstaende als Gegenprobe
  --> Kumulativer Zaehlerstand Wirkarbeit

PRIORITAET 3 (optional):
  Monatliche Aggregate (PES, PEW) - Direkte Monatsproduktion
  --> Falls vorhanden, koennen diese als schnelle Alternative dienen

NICHT IMPORTIEREN (vorerst):
  UQD, 84D, 85D, WDD - Spezial-Sensordaten ohne direkten Nutzen fuer Abrechnung
```

### Umgang mit fehlenden/ungueltigen Werten

```
Werte 32767, 65535, 6553.5 werden als "kein Messwert" behandelt
--> Diese Intervalle werden bei der Aggregation uebersprungen
--> Im Dashboard als "Datenluecke" markiert
```

---

## 6. Produktionsdaten-Aggregation

### Wie berechnen wir monatliche kWh aus 10-Minuten-Daten?

**Zwei Methoden, die sich gegenseitig pruefen:**

```
METHODE A: Leistungs-Integration (primaer)
============================================
Fuer jeden 10-Min-Intervall:
  Energie = Wirkleistung (W) * 10 Minuten / 60 / 1000

Monats-Produktion = Summe aller 10-Min-Energiewerte
Einheit: kWh

Beispiel:
  Intervall 1: 2.500.000 W * 10/60/1000 = 416,7 kWh
  Intervall 2: 2.300.000 W * 10/60/1000 = 383,3 kWh
  ...
  Monats-Summe: 1.234.567 kWh


METHODE B: Zaehlerstand-Differenz (Gegenprobe)
============================================
Aus UID-Dateien:
  Monats-Produktion = Zaehlerstand Ende Monat - Zaehlerstand Anfang Monat

Wenn Methode A und B mehr als 5% abweichen:
  --> Warnung im System anzeigen
  --> Admin entscheidet, welcher Wert verwendet wird
```

**Begruendung fuer den Produktmanager:**
Die Leistungs-Integration ist die Standardmethode. Der Zaehlerstand dient als "Sicherheitsnetz" - wenn beide Werte stark abweichen, deutet das auf ein Problem hin (defekter Sensor, Datenluecken etc.). Das System warnt den Admin automatisch.

### Anbindung an bestehende TurbineProduction

```
Nach der Aggregation:
  - System erstellt/aktualisiert Eintrag in TurbineProduction
  - turbineId = zugeordnete Turbine (aus Mapping)
  - year/month = aus Dateiname/Messdaten
  - productionKwh = berechneter Monatswert
  - source = "SCADA"
  - status = "DRAFT" (Admin muss bestaetigen)
  - revenueEur = null (wird spaeter ueber Stromabrechnung berechnet)
  - revenueTypeId = muss vom Admin einmalig pro Park festgelegt werden

Bestehende Workflow bleibt gleich:
  DRAFT --> CONFIRMED --> INVOICED (ueber Energy Settlements)
```

---

## 7. Component-Struktur (UI)

### Neue Seiten

**Berechtigung: Mandanten-Admin (ADMIN-Rolle)**
Jeder Mandant verwaltet seine eigenen SCADA-Zuordnungen und Imports.
Die Daten sind mandantenspezifisch (tenantId auf allen Tabellen).
Der Upload/Import wird vom Mandanten-User ausgeloest, nicht vom SuperAdmin.

```
/energy/scada/                       <-- SCADA-Verwaltung (im Energy-Bereich)
|                                        Berechtigung: ADMIN+ (Mandanten-Admin)
|
+-- /energy/scada/mappings           <-- Standort-Zuordnungen verwalten
|   +-- Uebersichtstabelle
|   |   +-- Standort-Code (Loc_xxxx)
|   |   +-- Zugeordneter Park (nur Parks des eigenen Mandanten)
|   |   +-- Anzahl Anlagen
|   |   +-- Letzter Import
|   |   +-- Status
|   +-- "Neue Zuordnung" Dialog
|       +-- Enercon Standort-Code eingeben
|       +-- Park aus Dropdown waehlen (gefiltert nach tenantId)
|       +-- PlantNo-zu-Turbine-Zuordnung (Tabelle)
|
+-- /energy/scada/import             <-- Import ausfuehren
|   +-- Import-Wizard (3 Schritte)
|   |   +-- Schritt 1: Quellordner/Dateien waehlen + Dateityp waehlen
|   |   +-- Schritt 2: Vorschau (gefundene Dateien, Zeitraum, Anlagen)
|   |   +-- Schritt 3: Import starten + Fortschrittsanzeige
|   +-- Import-Historie (letzte 20 Imports des Mandanten)
|       +-- Datum, Dauer, Dateien, Status
|
+-- /energy/scada/logs               <-- Import-Protokolle einsehen
    +-- Detailansicht pro Import-Lauf
    +-- Fehler-Uebersicht
```

### Erweiterung bestehender Seiten

```
/energy/productions
+-- Neuer Badge "SCADA" bei source = "SCADA" (existiert bereits als Enum)
+-- Neuer Filter: "Nur SCADA-Daten"
+-- Vergleichs-Ansicht: SCADA vs. manuell erfasste Daten

/energy (Uebersicht)
+-- KPI-Card: "SCADA-Abdeckung" (Wieviel % der Daten kommen aus SCADA?)
+-- KPI-Card: "Datenaktualitaet" (Letzter SCADA-Import)

Turbine-Detailseite (zukuenftig)
+-- Tab "SCADA-Daten"
    +-- Monats-Chart (Produktion ueber 12 Monate)
    +-- Tages-Chart (Produktion pro Tag im ausgewaehlten Monat)
    +-- 10-Min-Chart (Leistung + Wind ueber den Tag)
    +-- Leistungskurve (Wind vs. Leistung als Streudiagramm)
```

### Drill-Down-Konzept (von grob nach fein)

```
Ebene 1: JAHRESUEBERSICHT
+-- Park: "Windpark Delta" | 2025 | Gesamtproduktion: 45.000 MWh
    +-- WKA 1: 12.000 MWh
    +-- WKA 2: 11.500 MWh
    +-- WKA 3: 11.800 MWh
    +-- WKA 4: 9.700 MWh  <-- Auffaellig niedrig!

[Klick auf WKA 4]

Ebene 2: MONATSUEBERSICHT
+-- WKA 4 | 2025
    +-- Januar:  980 MWh
    +-- Februar: 850 MWh
    +-- Maerz:   750 MWh  <-- Deutlicher Rueckgang
    +-- April:   200 MWh  <-- Fast Stillstand!
    +-- ...

[Klick auf April]

Ebene 3: TAGESUEBERSICHT
+-- WKA 4 | April 2025
    +-- 01.04.: 45 MWh
    +-- 02.04.: 0 MWh   <-- Ausfall!
    +-- 03.04.: 0 MWh   <-- Ausfall!
    +-- ...
    +-- 15.04.: 38 MWh  <-- Wieder in Betrieb

[Klick auf 02.04.]

Ebene 4: 10-MINUTEN-ANSICHT
+-- WKA 4 | 02.04.2025
    +-- Zeitreihen-Chart:
        Linie 1: Windgeschwindigkeit (m/s)
        Linie 2: Wirkleistung (kW)
        Linie 3: Rotordrehzahl (RPM)
    +-- Ergebnis: Wind war da (8-12 m/s), aber Leistung = 0
    +-- Diagnose: Technischer Ausfall
```

---

## 8. Tech-Entscheidungen

### Dependencies (neue Packages)

```
Benoetigte Packages:
- dbffile           --> DBF-Dateien (dBASE III) lesen
- recharts          --> Charts fuer SCADA-Dashboards (bereits im Projekt? Pruefen!)
- date-fns          --> Datums-Berechnungen (bereits vorhanden)
- bull / bullmq     --> Hintergrund-Jobs fuer Import (bereits im Projekt fuer Jobs)
```

### Warum `dbffile` fuer DBF-Lesen?

- Spezialisiert auf das exakte Dateiformat (dBASE III)
- Liest Dateien asynchron als Stream (wichtig bei 21.000 Dateien)
- Kein externer Prozess noetig (kein Python, kein Kommandozeilen-Tool)
- Laeuft direkt in Node.js, keine Installation von Zusatz-Software

### Warum Hintergrund-Jobs fuer den Import?

- 21.000 Dateien lesen dauert 30-60 Minuten
- Ein normaler Web-Request hat ein Timeout von ~30 Sekunden
- Der Import muss im Hintergrund laufen, damit der Benutzer weiterarbeiten kann
- Fortschritt wird ueber die bestehende Job-Queue (Bull) bereitgestellt
- Der Benutzer sieht eine Fortschrittsanzeige und wird bei Abschluss benachrichtigt

### Warum kein separater Microservice?

- Die Datenmenge (~3 Mio Datensaetze) rechtfertigt keinen eigenen Service
- Alles laeuft innerhalb der bestehenden Next.js-App
- Weniger Infrastruktur-Komplexitaet
- Wenn die Datenmenge in Zukunft stark waechst (>50 Mio), kann ein Worker-Service abgespalten werden

### Datenbankoptimierung

- **Partitionierung:** Die scada_measurements-Tabelle wird nach Monat partitioniert (PostgreSQL native Partitioning). Das haelt Abfragen schnell, auch bei Millionen von Datensaetzen.
- **Indizes:** Composite Index auf (turbineId, timestamp) fuer schnelle Zeitreihen-Abfragen
- **Retention Policy:** Daten aelter als z.B. 5 Jahre koennen archiviert werden (optional, spaeter)

---

## 9. Matching: Parks und Anlagen zuordnen

### Zuordnungs-Workflow

```
1. Mandanten-Admin oeffnet "SCADA-Verwaltung" im Energy-Bereich
2. System zeigt bekannte Standorte des Mandanten (aus Ordner-Scan/Upload):
   +-- Loc_2205 (1 Anlage, 465 Dateien, 2020)
   +-- Loc_3196 (1 Anlage, 3.444 Dateien, 2019-2026)
   +-- Loc_3515 (1 Anlage, 2.913 Dateien, 2020-2026)
   +-- Loc_5842 (4 Anlagen, 14.569 Dateien, 2019-2026)

3. Admin klickt "Zuordnen" bei Loc_5842:
   +-- Park waehlen: [Dropdown mit allen Parks] --> "Windpark Delta"
   +-- Anlagen zuordnen:
       | PlantNo | Turbine (Dropdown)    |
       |---------|----------------------|
       | 1       | WKA Delta-1          |
       | 2       | WKA Delta-2          |
       | 3       | WKA Delta-3          |
       | 4       | WKA Delta-4          |

4. System validiert:
   - Ist jede Turbine nur einmal zugeordnet?
   - Stimmt die Anlagenanzahl mit dem Park ueberein?
   - Warnung wenn nicht alle Turbinen eines Parks zugeordnet sind

5. Admin speichert --> Zuordnung ist aktiv
```

### Quellpfad-Konfiguration

```
Der Pfad zu den SCADA-Dateien wird PRO MANDANT gespeichert:

Option A: Datei-Upload (empfohlen fuer Produktion)
  - Mandanten-Admin laedt DBF-Dateien ueber den Import-Wizard hoch
  - Dateien werden temporaer auf dem Server gespeichert
  - Nach Import werden Quelldateien geloescht

Option B: Server-Pfad (fuer lokale Entwicklung / On-Premise)
  - Pfad als Mandanten-Konfiguration gespeichert:
    Tabelle: TenantConfig (oder bestehende Tenant-Settings)
    key: "scada.source.basePath"
    value: "C:\\Enercon"
  - Nur wenn Server direkten Dateizugriff hat

Option C: Automatisch (spaeter, Phase 6.3)
  - Cron-Job liest aus konfiguriertem Pfad/Netzlaufwerk
  - Nur neue Dateien seit letztem Import
```

---

## 10. Implementierungsphasen

```
PHASE 1: Grundlagen (1-2 Wochen)
====================================
- Neue Datenbank-Tabellen anlegen (Prisma Migration)
- SCADA-Mapping Admin-UI (Zuordnungstabelle)
- DBF-Lese-Service (dbffile Library integrieren)
- Basis-Import: WSD-Dateien lesen und in scada_measurements speichern
- Monatliche Aggregation --> TurbineProduction (source = "SCADA")
- Import-Fortschrittsanzeige

PHASE 2: Analyse-Dashboards (1-2 Wochen)
====================================
- Monats-Balkendiagramm pro Turbine
- Tages-Aufloesung (Klick auf Monat)
- 10-Minuten-Zeitreihen (Klick auf Tag)
- Wind-vs-Leistung Streudiagramm (Leistungskurve)

PHASE 3: Erweiterte Features (optional, spaeter)
====================================
- UID-Daten importieren (Zaehlerstaende als Gegenprobe)
- Automatischer Import (Ordner-Ueberwachung / Cron-Job)
- Anomalie-Erkennung (Alarm bei ploetzlichem Leistungseinbruch)
- Vergleich SCADA vs. Netzbetreiber-Abrechnung
- Export der Analyse-Daten (PDF-Reports, Excel)
```

---

## 11. Risiken und Abhaengigkeiten

### Risiken

| Risiko | Wahrscheinlichkeit | Auswirkung | Massnahme |
|--------|-------------------|------------|-----------|
| DBF-Format-Varianten | Mittel | Import schlaegt fehl | Vorab-Test mit allen Dateien aus allen 4 Standorten |
| Datenluecken in SCADA-Dateien | Hoch | Falsche Monats-Aggregate | Fehlende Intervalle kennzeichnen, Abdeckungs-% anzeigen |
| Performance bei 3 Mio Datensaetzen | Niedrig | Langsame Charts | Partitionierung + Indizes von Anfang an |
| Dateizugriff auf C:\Enercon | Mittel | Import nicht moeglich | Upload-Alternative oder Netzlaufwerk-Zugriff |

### Abhaengigkeiten

- **Bestehende Parks und Turbinen muessen angelegt sein** bevor SCADA-Mapping erstellt werden kann
- **Bull/BullMQ Job-Queue** muss funktionsfaehig sein (bereits im Projekt vorhanden unter `/src/lib/queue/`)
- **Dateizugriff:** Der Server braucht Lesezugriff auf den SCADA-Ordner (oder Dateien werden hochgeladen)

---

## 12. Checkliste

- [x] Bestehende Architektur geprueft (Components/APIs/Tables via Git)
- [x] Component-Struktur dokumentiert (Visual Tree, PM-verstaendlich)
- [x] Daten-Model beschrieben (welche Infos werden gespeichert, kein Code)
- [x] Backend-Bedarf geklaert (bestehende PostgreSQL erweitern)
- [x] Tech-Entscheidungen begruendet (warum diese Tools/Libraries)
- [x] Dependencies aufgelistet (dbffile, recharts, bullmq)
- [x] Design in Feature Spec eingetragen
- [ ] User Review: Approval ausstehend
- [ ] Handoff an Frontend/Backend Developer
