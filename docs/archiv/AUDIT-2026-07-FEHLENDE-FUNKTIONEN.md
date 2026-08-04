# Analyse: Fehlende Funktionen

> Stand 2026-07-29 · Produktsicht, keine Bugfixes
> Bugfix-Befunde separat in `AUDIT-2026-07-*.md`

---

## Was schon gut abgedeckt ist

Ehrlich: mehr als erwartet. Das gehört vorweg, damit nichts „verbessert" wird, was fertig ist.

**Rechnungswesen ist der stärkste Teil des Systems.** SKR03/04, Bilanz, GuV (§275 HGB),
EÜR, SuSa, Kontoblatt, UStVA, ZM, GewSt-Hinzurechnung, E-Bilanz/XBRL, Anlagenspiegel + AfA,
Kassenbuch, Periodensperre, Storno-Audit-Trail, Jahresabschluss mit Saldenvortrag,
GoBD-Z3-Export, DATEV-EXTF, Wertberichtigungen, Verzugszinsen nach §288 BGB mit
Basiszinssatz-Historie. **Liquiditätsplanung existiert** (`/buchhaltung/liquiditaet` +
`/planung`), ebenso Budget-Soll/Ist und Multi-Park-Soll/Ist.
→ Das Feld „Kaufmännisch" ist weitgehend erledigt.

**E-Rechnung ist fertig** — XRechnung (UBL 2.1) + ZUGFeRD 2.2 COMFORT inkl. Validator.

**Bank** — MT940- und CAMT.054-Parser, Matching, Skonto-Matcher, SEPA-Batches,
3-stufiges Mahnwesen.

**SCADA-Seite ist tief** — Enercon-DBF-Import (WSD/UID/AVR/SSM + Schatten, Elektrik, Wind),
Auto-Import-Worker, Anomalie-Erkennung mit 4 Algorithmen, 16 Analytics-Endpunkte inkl.
**Degradationsanalyse** und Curtailment-Auswertung.

**Pacht** ist fachlich präzise modelliert — Pool-/Standort-/Versiegelungs-/Kabel-/
Wegeentgelt, Mindestpacht, Vorschüsse, **Wertsicherung/CPI mit Cron**, SHP-Import,
GIS-Karte.

**Gesellschafter** — Distributions, **KapESt-Bescheinigung inkl. PDF**, Abstimmungen mit
Vollmachten, Portal mit Steuerunterlagen-Self-Service.

**Betriebsführung** — `OperationalTask`, `OperationalChecklist`, `InspectionPlan`,
`InspectionReport`, `Defect`, `InsuranceClaim`. Instandhaltungsplanung im Sinne
wiederkehrender Prüfungen ist da.

Ertragsprognose (P50/P75/P90) und §36h-Standortertragsprüfung sind im geplanten
Projektentwicklungs-Modul bereits konzipiert — deshalb hier nicht vorgeschlagen.

> **Nebenbefund:** Die Feature-Flags `predictive-maintenance`, `investor-reports`, `solar`
> und `storage` sind im Typ-Union von `nav-config.ts` deklariert, aber **nirgends im Code
> verwendet** — tote Platzhalter.

---

## A — Fehlt und tut weh

### A1 · Störungsvorgang mit bewertetem Ertragsausfall
**Was fehlt** Die Störungs*daten* sind vollständig da (`ScadaStateEvent`,
`ScadaWarningEvent`, `ScadaStatusCode`, `ScadaAvailability` mit t1–t6), die Aus*wertung*
auch (`/api/energy/analytics/faults`). Es fehlt der **Vorgang**: kein FK von einem
SCADA-Ereignis auf `ServiceEvent`/`OperationalTask`/`Defect`, keine Verursacherkategorie
(Hersteller / Netz / Wetter / Eigenverschulden / Behörde), **kein bewerteter Ertragsausfall**
(entgangene kWh × ct/kWh), keine Wiedervorlage.

**Wer / wie oft** Technische Betriebsführung, täglich
**Heute** Excel-Störungsliste neben WPM; Ertragsausfall wird geschätzt oder gar nicht
beziffert — **Ansprüche gegen den Hersteller verjähren unbemerkt**
**Baut auf** `ScadaStateEvent` + `ScadaStatusCode` (Störcode-Klartext existiert),
`ScadaAvailability`, `OperationalTask`, `Defect`, `EnergyMonthlyRate`, Notifications
**Aufwand M · Nutzen sehr hoch** — und Datenbasis für A2 und A6

### A2 · Verfügbarkeitsgarantie & Bonus/Malus gegen den Wartungsvertrag
**Was fehlt** Null Treffer für `targetAvailability`, `guarantee`, `penalty`.
Wartungsverträge liegen als `Contract(SERVICE)` mit `annualValue`, aber ohne garantierte
Verfügbarkeit, Berechnungsmethode (zeit- vs. energiebasiert), Ausschlusstatbestände
(höhere Gewalt, Netzausfall, Eiswurf) und Bonus/Malus-Staffel. Es fehlt der Jahresabgleich
Ist gegen Soll und die daraus abgeleitete Gutschriftsforderung.

**Wer / wie oft** Kaufmännische BF, jährlich (bei Full-Service teils quartalsweise)
**Heute** Der Hersteller rechnet die Verfügbarkeit selbst ab, der Betreiber hat **keine
unabhängige Gegenrechnung**
**Baut auf** `ScadaAvailability` — t1–t6 sind exakt die benötigten Zeitkategorien;
`Contract`; Gutschrift über den bestehenden `Invoice`-Workflow
**Aufwand M · Nutzen hoch** — geht je Park schnell in den fünfstelligen Bereich pro Jahr

> Zusammenhang mit dem Audit: Finding F21 aus `AUDIT-2026-07-RECHENKORREKTHEIT.md`
> stellt fest, dass die aktuelle Verfügbarkeitsformel `T1/(T1+T5)` **nicht** die Kennzahl
> ist, gegen die Garantien abgerechnet werden. Beides gehört zusammen bearbeitet.

### A3 · Import + Plausibilisierung der Netzbetreiber-/Direktvermarkter-Abrechnung
**Was fehlt** `EnergySettlement` wird ausschließlich **von Hand** erfasst
(`settlement-entry-dialog`, `batch-upsert`); Import gibt es nur für SCADA und
`TurbineProduction`. Es fehlt das Einlesen der monatlichen Abrechnung und der
**Dreiecksabgleich**: abgerechnete Menge ↔ SCADA-Menge ↔ `TurbineProduction`,
abgerechneter Preis ↔ `EnergyMonthlyRate`/`MarketPrice`, mit Toleranz und Abweichungsliste.

Zusätzlich fehlt der Zuordnungsschlüssel überhaupt: **Zählpunkt / Marktlokations-ID kommen
im ganzen Codebase nicht vor.**

**Wer / wie oft** Kaufmännische BF, monatlich je Park
**Heute** Zahlen werden abgetippt und geglaubt
**Baut auf** `EnergySettlement`, `ScadaMeasurement`, `TurbineProduction`, `MarketPrice`
(SMARD-Sync existiert), und die vorhandene **OCR-Pipeline** für PDF-Abrechnungen
**Aufwand M · Nutzen sehr hoch** — Fehlabrechnungen sind häufig und werden ohne
Gegenrechnung nie entdeckt

### A4 · Redispatch / Einspeisemanagement: Ausfallarbeit und Entschädigungsforderung
**Was fehlt** Abregelungsgründe kommen aus dem DBF-Reader und landen in Charts und
PDF-Reports. Es fehlt die **Anspruchsseite**: Ermittlung der Ausfallarbeit je Ereignis,
Zuordnung der Anspruchsgrundlage (§13a EnWG / Redispatch 2.0 vs. §15 EEG),
Forderungsaufstellung an den Netzbetreiber, Abgleich mit der gezahlten Entschädigung,
Nachverfolgung offener Beträge.

**Heute** Man verlässt sich auf die Berechnung des Netzbetreibers
**Baut auf** vorhandene Curtailment-Auswertung, `ScadaMeasurement`, Forderungs-Workflow
**Aufwand M · Nutzen hoch**

### A5 · Mehrere Verpächter je Pachtvertrag (Erbengemeinschaft) + Eigentümerwechsel zum Stichtag
**Was fehlt** `Lease.lessorId` und `LeaseRevenueSettlementItem.lessorPersonId` sind jeweils
**genau eine** Person. Keine Quote, kein Stichtag, keine Historie. Nach 20 Jahren
Vertragslaufzeit ist die Erbengemeinschaft der Normalfall, ebenso der Flurstücksverkauf
mitten in der Abrechnungsperiode.

**Heute** Sammel-Person „Erbengemeinschaft Müller" mit einem Konto und Weiterverteilung
außerhalb des Systems, oder Vertragsdubletten. **Beides bricht SEPA und die
USt-Zuordnung** — jeder Miteigentümer ist ein eigenes Umsatzsteuersubjekt.
**Baut auf** `Lease`, `LeasePlot`, `LeaseRevenueSettlementItem`, `Person`, `ContactLink`
(`ContactRole.VERPAECHTER` existiert bereits — die halbe Struktur ist da)
**Aufwand M — mit Warnung:** greift in die gerade auditierte Settlement-Engine
**Nutzen hoch**, Frequenz steigt mit dem Alter des Portfolios

> Zusammenhang mit dem Audit: Die Findings F1 und F2 aus
> `AUDIT-2026-07-RECHENKORREKTHEIT.md` zeigen, dass **Mehrfachpacht heute schon vorkommt
> und falsch gerechnet wird** — der eine Calculator zählt doppelt, der andere zahlt dem
> zweiten Miteigentümer 0 €. A5 ist damit nicht nur ein fehlendes Feature, sondern die
> saubere Lösung eines bestehenden Fehlers.

### A6 · Versicherungspolicen als eigenes Objekt
**Was fehlt** Policen sind heute nur `Contract(contractType=INSURANCE)`; der
Insurance-Screen zeigt Titel, Typ, Status, Laufzeit — mehr nicht. Es fehlen
Versicherungssumme, Selbstbehalt, Prämie + Zahlweise, Deckungsarten (Maschinenbruch,
Betriebsunterbrechung, Haftpflicht), versicherte Objekte, Kündigungsfrist und die
Verknüpfung Schaden→Police mit SB-Abzug. Die **BU-Entschädigung** (entgangener Ertrag) ist
ohne A1 gar nicht berechenbar.

**Heute** Policenordner plus Excel
**Baut auf** `Contract`, `InsuranceClaim` (hat bereits `estimatedCost`/`actualCost`/
`reimbursedEur`), `Document`
**Aufwand S–M · Nutzen hoch** — Unterversicherung ist selten, aber existenziell

### A7 · Rückbauverpflichtung, Sicherheitsleistung, Rückbaurückstellung
**Was fehlt** **Kein einziger Treffer für „Rückbau"/„dismantl" im gesamten Codebase.**
Jeder Park hat eine behördlich festgesetzte Rückbausicherheit (Bürgschaft mit Laufzeit und
meist jährlicher Anpassung) und eine Rückbaurückstellung, die nach §253 Abs. 2 HGB
jährlich ab-/aufzuzinsen ist. Die Buchhaltung kennt Rückstellungs*konten*, aber es gibt
keine Fachverwaltung: kein Rückbaukostengutachten, kein Ansammlungsplan, keine
automatische Jahresbuchung, keine Bürgschaftsfrist im Kalender.

**Heute** Excel beim Steuerberater, Bürgschaft im Aktenordner
**Baut auf** `Park`, `Contract`, `JournalEntry`/`LedgerAccount`, `BaseInterestRate`
(existiert für Verzugszinsen — Abzinsungssätze sind dieselbe Struktur), Fristen-Kalender
**Aufwand S–M · Nutzen hoch** — Compliance + Bilanzrichtigkeit, billig weil viel Unterbau
vorhanden

### A8 · Anteilsübertragung mit stichtagsgenauer Verteilung
**Was fehlt** `Shareholder` hat `entryDate`/`exitDate` und feste Prozentsätze;
`Distribution`/`DistributionItem` rechnen mit dem *aktuellen* Stand. Es fehlt der
Übertragungsvorgang (Verkauf / Schenkung / Erbfall) mit Zustimmungserfordernis, ein
Anteilsregister mit Historie, die unterjährig quotale Abgrenzung und die fortgeschriebene
Gesellschafterliste.

**Wichtig** Die KapESt-Bescheinigung existiert bereits — sie wird aber **falsch**, wenn die
Zuordnung nicht stichtagsgenau ist.
**Heute** Stammdaten werden überschrieben, die Historie geht verloren
**Baut auf** `Shareholder`, `Distribution`/`DistributionItem`, `kapesta-calculator`,
`Vote`, `Document`
**Aufwand M · Nutzen hoch** (Geld + Nachweispflicht)

> Zusammenhang mit dem Audit: Finding 4.1 aus `AUDIT-2026-07-PROZESSKETTEN.md` — der
> unterjährige Ein-/Austritt wird heute komplett ignoriert **und** die Anteile der
> Ausgetretenen werden auf 100 % hochnormalisiert. Auch hier ist das Feature die saubere
> Lösung eines aktiven Fehlers.

---

## B — Sinnvolle Ergänzung

### B1 · Marktprämie, anzulegender Wert, negative Preise
`EnergyMonthlyRate` hat `marketValue` und `managementFee` als *Eingabefelder*,
`MarketPrice` liefert SMARD-Monatswerte. Es fehlt die Rechenlogik: anzulegender Wert je
Anlage (Zuschlagswert, korrigiert um den Gütefaktor nach §36h), Marktprämie =
AW − Monatsmarktwert Wind onshore, und die Stunden mit negativen Preisen mit dem daraus
entfallenden Vergütungsanspruch (0 Treffer für §51/negativePrice).
Braucht eine **stündliche** Preisreihe — heute nur Monatsaggregat, also neue Infrastruktur.
**Aufwand M–L**, monatlich relevant, überlappt mit A3.

### B2 · Regulatorik-Stammdaten + Meldefristen-Set
`mastrNumber` ist ein ungeprüftes Freitextfeld auf `Turbine`, sonst nichts. Es fehlen
Zählpunkt/Marktlokation, EEG-Anlagenschlüssel, MaStR-Registrierungsstatus, Netzbetreiber,
Zuschlagswert — und ein vorkonfiguriertes Fristenset (EEG-Jahresmeldung an den
Netzbetreiber, MaStR-Änderungsanzeige binnen eines Monats, §36h-Prüfung nach dem
5./10./15. Jahr).

**Fristen-Kalender und Reminder-Queue existieren bereits** → **der billigste hohe Nutzen
im ganzen Report. Aufwand S.**
(Eine echte MaStR-*Synchronisation* per API wäre L und gehört nicht hierher.)

### B3 · Großkomponenten-Register je Anlage
0 Treffer für Ersatzteil/Komponente. Getriebe, Generator, Rotorblätter, Trafo mit
Seriennummer, Einbau-/Tauschdatum, Garantie und Laufleistung — daraus Tauschhistorie und
Restlebensdauer. Heute Freitext in `ServiceEvent` oder im `technicalData`-Json.
**Aufwand S–M.** (Ein echtes Ersatzteil-*Lager* braucht ein kleiner Betreiber nicht.)

### B4 · Gesellschafterversammlung als Vorgang
`Vote`, `VoteProxy` und `Mailing` existieren jeweils einzeln. Es fehlt die Klammer:
Einladung mit Ladungsfrist, Tagesordnung, Anwesenheitsliste mit vertretenem Kapital,
Beschlussfähigkeitsprüfung, Protokoll und Beschlussbuch mit Nachweiskette.
**Aufwand S–M**, fast vollständig aus Vorhandenem zusammensetzbar; jährlich, aber
rechtlich heikel wenn schlecht dokumentiert.

### B5 · Portfolio-Cockpit Park × Jahr
`multi-park-soll-ist`, `park-pl`, `budget-vergleich` und 27 Dashboard-Widgets existieren —
es fehlt die **verdichtete Matrix**, auf die Banken und Beiräte schauen: Produktion vs.
Prognose, technische und kommerzielle Verfügbarkeit, Erlös je MWh, OPEX je MWh,
Schuldendienstdeckung, Ausschüttungsquote, über mehrere Jahre, exportierbar.
Reine Verdichtung vorhandener Daten. **Aufwand S–M.**

### B6 · Zeichnungsprozess + GwG-Legitimation
`shareholders/onboard` deckt die Datenerfassung. Es fehlen Zeichnungsschein mit
Widerrufsfrist, Einzahlungsüberwachung (Soll gegen Bankeingang — das **Matching existiert
bereits**) und Legitimationsprüfung nach GwG mit Wiedervorlage.
**Aufwand M**, nur relevant wenn neue Fonds platziert werden.

### B7 · Bankanbindung live (EBICS/FinTS)
Parser sind da, der Import ist datei-basiert. Täglicher automatischer Kontoabruf würde
Zahlungsabgleich und Mahnlauf vollständig automatisieren.
**Aufwand M.** Ehrlich: der Datei-Import funktioniert — das ist Komfort, kein Schmerz.

---

## C — Denkbar, aber nicht jetzt

1. **Repowering-Analyse** — braucht das Ertragsprognose-Fundament, das erst mit dem
   Projektentwicklungs-Modul entsteht. Einmal in 20 Jahren pro Park. Danach, nicht davor.
2. **Predictive Maintenance** — der Feature-Flag existiert schon ungenutzt. Braucht
   hochauflösende Sensorik (Schwingung, Öl, Getriebetemperatur) und jahrelang gelabelte
   Ausfälle. Die vorhandene Degradationsanalyse plus A1 liefert realistisch den Großteil
   des Nutzens; ohne Datenbasis wird das ein Feature, dem niemand traut.
3. **Herkunftsnachweise (HKNR/UBA)** — nur außerhalb der EEG-Förderung relevant. Solange
   die PPA-Verwaltung dünn genutzt ist, steht der Registeranbindungs-Aufwand in keinem
   Verhältnis.
4. **Eigene Vermarktungssteuerung / Intraday-Optimierung** — macht der Direktvermarkter.
   WPM sollte dessen Abrechnung *kontrollieren* (A3, B1), nicht selbst handeln.
5. **Solar/Speicher-Sektorkopplung** — die Flags sind als Platzhalter angelegt, aber
   nirgends verwendet. `ParkType` ist bereits generisch. Erst bauen, wenn ein realer Kunde
   ein Hybridprojekt hat — sonst modelliert man auf Verdacht.

---

## Wenn nur drei: A1 + A2 + A3

Die drei hängen zusammen und schließen die einzige wirklich große fachliche Lücke:
**WPM kann Energiedaten hervorragend auswerten, aber daraus entsteht kein Vorgang und
keine Forderung.**

Störung → bewerteter Ausfall → Verfügbarkeitsabgleich → Gegenrechnung zur Abrechnung ist
die Kette, die einem Betriebsführer täglich Geld einbringt — und 80 % des Unterbaus
(SCADA-Daten, Availability-Zeitkategorien, OCR, Rechnungs-Workflow) existiert bereits.

**Billigster Einzelgewinn:** B2 — Regulatorik-Stammdaten und Meldefristen, Aufwand S auf
dem vorhandenen Fristen- und Reminder-System, verhindert Förderverluste durch
Fristversäumnis.
