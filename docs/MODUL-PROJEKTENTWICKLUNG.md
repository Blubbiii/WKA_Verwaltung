# Modul „Projektentwicklung" — Zielbild

> Status: **Entwurf zur Freigabe** · Stand 2026-07-14
> Entscheidungen: chronologischer Aufbau · produktreif (mandantenfähig) · PostGIS ja ·
> `Dev*`-Präfix ja · Behörden über bestehende `ContactLink`-Rolle `BEHOERDE`

Von der Standortidee bis zur Übergabe in den Betrieb. Dieses Dokument beschreibt das
**Zieldatenmodell über den gesamten Lifecycle** und die Reihenfolge des Aufbaus.

---

## 1. Zielsetzung und Abgrenzung

### Was das Modul leistet

WPM verwaltet heute **Windparks im Betrieb**. Das Modul schaltet die 4–8 Jahre davor vor:
Flächenakquise → Sicherung → Gutachten → Genehmigung → Vermarktung → Bau → Übergabe.

Der strategische Wert liegt nicht in einer weiteren Projektmanagement-Oberfläche, sondern
darin, dass **Entwicklung und Betrieb auf einem Datenmodell laufen**. Genehmigungsauflagen,
Gutachten, Ausgleichsverpflichtungen, Ertragsprognosen und kommunale Beteiligungszusagen
entstehen in der Entwicklung und werden 20 Jahre im Betrieb gebraucht. Heute ist das ein
Datenbruch.

### Was das Modul bewusst *nicht* leistet

**Keine Fachberechnung.** Schall-, Schatten- und Ertragsprognosen werden nicht nachgebaut.
windPRO (EMD) ist behördlich akzeptiert und gutachterlich abgesichert; ein Nachbau wäre
teuer und rechtlich wertlos. Das Modul verwaltet **Beauftragung, Status, Gültigkeit,
Ergebniswerte und Nachweiskette** der Gutachten — nicht deren Berechnung.

### Marktposition

```
Flächenscreening → Ertragsberechnung →  [ 4–8 Jahre Projektentwicklung ]  → Betriebsführung
   (Nefino)          (windPRO)             Excel + Outlook + Netzlaufwerk     (Power Factors)
                                                     ▲
                                              hier setzt WPM an
```

Große Entwickler (ENERTRAG, VSB, wpd, juwi) haben Eigenentwicklungen, die nicht am Markt
sind. Adressierbar sind **mittelgroße Entwickler, Stadtwerke und Bürgerenergieprojekte**.

---

## 2. Zieldatenmodell

21 neue Models. Alle mandantenfähig (`tenantId`), alle mit `deletedAt` sofern fachlich
sinnvoll.

### Namenskonvention

> **`Dev*`-Präfix = existiert nur während der Entwicklung.**
> **Ohne Präfix = wird nach dem Handover im Betrieb weitergenutzt.**

`DevLandRight` verschwindet nach dem Handover (wird zu `Lease`). Aber `PermitCondition`,
`MunicipalBenefit` und `WindReport`/`WindYield` laufen 20 Jahre im Betrieb weiter — die
tragen deshalb bewusst kein Präfix. Beim Windgutachten ist das besonders relevant: § 36h
EEG verlangt eine **Überprüfung des Standortertrags nach dem 5., 10. und 15. Betriebsjahr**
gegen genau diese Prognosewerte.

---

### 2.1 Projekt-Klammer

#### `DevProject`

Existiert **bevor** ein `Park` existiert.

| Feld | Typ | Anmerkung |
|---|---|---|
| `id`, `tenantId`, `deletedAt` | | Standard |
| `code` | String | Projektkürzel, `@@unique([tenantId, code])` |
| `name`, `description` | String | |
| `stage` | `DevProjectStage` | siehe Enum |
| `status` | ACTIVE / ON_HOLD / CANCELLED / REALIZED | |
| `targetCapacityKw`, `targetTurbineCount` | Decimal / Int | |
| `municipality`, `county`, `federalState` | String | steuert Landesrecht (kommunale Beteiligung, Mindestabstände) |
| `isAccelerationArea` | Boolean | Beschleunigungsgebiet §249c BauGB — **steuert den Verfahrenspfad** |
| `parkId` | String? | wird beim Handover gesetzt |
| `fundId` | String? | Projektgesellschaft |
| `responsibleUserId`, `costCenterId` | String? | nutzt bestehendes `CostCenter` |

```prisma
enum DevProjectStage {
  SCREENING · LAND_SECURING · ASSESSMENT · PERMITTING
  TENDERING · FINANCING · CONSTRUCTION · COMMISSIONING · HANDOVER
}
```

`DevProjectStageHistory` protokolliert Stage-Wechsel (wer, wann, von→nach, Notiz).

**Behörden und Gutachter** werden über das bestehende `ContactLink` mit den bereits
vorhandenen Rollen `BEHOERDE` und `GUTACHTER` an `DevProject` gehängt — kein neues
`Authority`-Model.

---

### 2.2 Stufe 1 — Flächen

#### `DevSiteArea` — Geometrien ohne Park-Bindung

Löst den Blocker, dass `MapAnnotation.parkId` non-nullable ist.

| Feld | Typ | Anmerkung |
|---|---|---|
| `devProjectId` | String | |
| `areaType` | POTENTIAL, EXCLUSION, ACCESS_ROAD, CABLE_ROUTE, CRANE_PAD, COMPENSATION, BUFFER, SUBSTATION | |
| `geometry` | Json | GeoJSON WGS84 — **App-facing Source of Truth** |
| `geom` | `Unsupported("geometry(Geometry, 25832)")` | per Trigger gepflegt |
| `areaSqm`, `lengthM` | Decimal? | aus PostGIS abgeleitet |

#### `DevLandRight` — Flächensicherung je Flurstück

Ein Windpark braucht Kranstellfläche, Zuwegung **und** Kabeltrasse durchgängig gesichert —
über oft 20–60 Flurstücke.

| Feld | Typ | Anmerkung |
|---|---|---|
| `devProjectId`, `plotId` | String | `plotId` → bestehendes `Plot` |
| `rightType` | OPTION, NUTZUNGSVERTRAG, DIENSTBARKEIT, WEGERECHT, GESTATTUNG, KAUF | |
| `purpose` | `DevLandRightPurpose[]` | WEA_STANDORT, KRANSTELLFLAECHE, ZUWEGUNG, KABELTRASSE, AUSGLEICH, ABSTANDSFLAECHE |
| `status` | IDENTIFIED → CONTACTED → NEGOTIATING → PRECONTRACT → SECURED / REJECTED / EXPIRED | |
| `priority` | Int | |
| `contactedAt`, `signedAt` | DateTime? | |
| `optionDeadline` | DateTime? | **Verfallsfrist** — treibt Reminder |
| `validFrom`, `validUntil` | DateTime? | typ. 25–30 Jahre |
| `isNotarized` | Boolean | |
| `landRegisterSheet`, `landRegisterRank` | String? | Grundbuchblatt, Rangstelle |
| `annualFeeEur`, `oneTimeFeeEur` | Decimal? | |
| `documentId`, `leaseId` | String? | `leaseId` beim Handover gesetzt |

#### `DevLandOwner` — Eigentümeranteile

Erbengemeinschaften und Miteigentum sind der Normalfall. Der vorhandene Shapefile-Parser
erkennt `Erbengemeinschaft|GbR|" und "` bereits.

| Feld | Typ |
|---|---|
| `plotId`, `personId` | String |
| `sharePercent` | Decimal? |
| `role` | OWNER, CO_OWNER, HEIR, TENANT_FARMER, USUFRUCT |
| `signatureRequired` | Boolean |
| `signedAt` | DateTime? |

> Ein `DevLandRight` gilt erst als `SECURED`, wenn **alle** `DevLandOwner` mit
> `signatureRequired = true` unterschrieben haben — abgeleitet, kein manuelles Flag.

---

### 2.3 Stufe 2 — Projektsteuerung und Fristen

#### `DevMilestone`

| Feld | Typ | Anmerkung |
|---|---|---|
| `devProjectId`, `name`, `milestoneType` | | |
| `plannedDate`, `actualDate` | DateTime? | |
| `isCriticalPath`, `isHardDeadline` | Boolean | gesetzliche Frist vs. interne Planung |
| `status` | PLANNED, IN_PROGRESS, DONE, MISSED, OBSOLETE | |
| `responsibleUserId` | String? | |
| `reminderDays` | Int[] | `@default([90, 30, 7])` — Muster aus `Contract` |

#### `DevMilestoneDependency` — die Kausalkette

| Feld | Typ |
|---|---|
| `predecessorId`, `successorId` | String |
| `lagDays` | Int |
| `dependencyType` | FINISH_TO_START, START_TO_START, … |

Verschiebt sich ein Meilenstein, werden Nachfolger neu gerechnet und Verletzungen harter
Fristen gemeldet: *Kartiersaison verpasst → Antrag 12 Monate später → Ausschreibungstermin
verpasst → Zuschlag später → 30-Monats-Realisierungsfrist reißt → Pönale 30 €/kW.*

---

### 2.4 Stufe 3a — Windmessung und Ertragsprognose

Die P-Werte kommen aus den Windgutachten. Typisch sind **zwei unabhängige Gutachten**
(Bankenanforderung), und die Werte liegen **je Anlage und je Park** vor. Das erzwingt
drei getrennte Models.

#### `DevWindMeasurement` — Messkampagne

Zwei Gutachten nutzen häufig **dieselbe** Messkampagne mit unterschiedlichen Modellen.

| Feld | Typ | Anmerkung |
|---|---|---|
| `devProjectId` | String | |
| `method` | LIDAR, MET_MAST, SODAR, REANALYSIS | LiDAR braucht keine Baugenehmigung, >200 m möglich |
| `lat`, `lng`, `geom` | | Messstandort |
| `measurementHeightsM` | Decimal[] | mehrere Höhen |
| `startedAt`, `endedAt` | DateTime? | **mind. 12 Monate für TR6-Konformität** |
| `dataAvailabilityPercent` | Decimal? | |
| `meanWindSpeedMs` | Decimal? | |
| `longTermReference` | String? | ERA5, MERRA-2, Nachbar-SCADA (MCP) |

#### `WindReport` — Windgutachten *(ohne `Dev`-Präfix — wird im Betrieb gebraucht)*

| Feld | Typ | Anmerkung |
|---|---|---|
| `devProjectId`, `parkId` | String? | `parkId` beim Handover gesetzt |
| `devLayoutVariantId` | String? | **Ertrag hängt am Layout** |
| `devWindMeasurementId` | String? | |
| `name` | String | z. B. „Gutachten A — Büro X" |
| `expertPersonId` / `vendorId` | String? | |
| `reportNumber`, `reportDate` | | |
| `validUntil` | DateTime? | |
| `methodology` | String? | **FGW TR 6 Rev. 12** (verbindlich seit 01.07.2024) |
| `isAccredited` | Boolean | EEG Anlage 2 Nr. 6 verlangt **DAkkS nach ISO/IEC 17025** |
| `isPrimary` | Boolean | für die Finanzierung maßgeblich |
| `uncertaintySigmaPercent` | Decimal? | Gesamtunsicherheit, typisch **8–12 %** |
| `documentId` | String? | |

#### `WindYield` — P-Werte je Scope *(ohne `Dev`-Präfix)*

| Feld | Typ | Anmerkung |
|---|---|---|
| `windReportId` | String | |
| `scope` | PARK / TURBINE | |
| `devPlannedTurbineId` | String? | null bei `scope = PARK` |
| `periodYears` | Int `@default(20)` | 1 / 10 / 20 — Banken unterscheiden |
| `grossYieldMwh`, `netYieldMwh` | Decimal? | vor / nach Verlusten |
| `p50Mwh`, `p75Mwh`, `p90Mwh`, `p95Mwh` | Decimal? | |
| `fullLoadHours` | Int? | |
| `meanWindSpeedMs` | Decimal? | auf Nabenhöhe |
| `siteQualityFactor` | Decimal? | **Gütefaktor** § 36h EEG = Standortertrag / Referenzertrag |
| | | `@@unique([windReportId, scope, devPlannedTurbineId, periodYears])` |

**Abgeleitete Fähigkeiten:**

- **Gutachtenvergleich** — Spread zwischen den beiden Gutachten je Anlage und für den Park.
  Genau das prüfen Banken zuerst. Plausibilitätscheck über P75 ≈ P50 − 0,675 σ und
  P90 ≈ P50 − 1,282 σ.
- **Gütefaktor → anzulegender Wert** — § 36h EEG i. V. m. Anlage 2: Referenzstandort
  6,45 m/s in 100 m, Rayleigh, Hellmann 0,25. Korrekturfaktor von 1,55 (Gütefaktor 50 %)
  bis 0,79 (150 %).
- **Betriebsphase:** § 36h EEG verlangt die **Überprüfung des Standortertrags nach dem
  5., 10. und 15. Betriebsjahr**, Anpassung ab dem 6./11./16. Jahr, Rückabwicklung bei
  Abweichung > 2 Prozentpunkte. Das sind drei harte Fristen, die aus der Entwicklung in
  den Betrieb übergehen — WPM hat mit den SCADA-Daten beide Seiten.

---

### 2.5 Stufe 3b — Layout und Gutachten

#### `DevLayoutVariant`

| Feld | Typ | Anmerkung |
|---|---|---|
| `devProjectId`, `name`, `version` | | |
| `isActive` | Boolean | genau eine aktive Variante je Projekt |
| `totalCapacityKw` | Decimal | |
| `notes` | String? | Begründung |

#### `DevPlannedTurbine`

Bewusst **nicht** das bestehende `Turbine` — dessen `parkId` ist required und es hängen
25 SCADA-Relations dran.

| Feld | Typ |
|---|---|
| `devLayoutVariantId`, `designation` | String |
| `lat`, `lng` | Decimal |
| `geom` | `Unsupported("geometry(Point, 25832)")` |
| `manufacturer`, `model` | String? |
| `ratedPowerKw`, `hubHeightM`, `rotorDiameterM`, `totalHeightM` | Decimal? |
| `turbineId` | String? | beim Handover gesetzt |

> **Abgeleitet, nicht manuell:** `totalHeightM > 50` → BImSchG-Pflicht (4. BImSchV Anh. 1
> Nr. 1.6). `totalHeightM > 100` → Kennzeichnungspflicht (AVV) und § 14 LuftVG.
> Anzahl `DevPlannedTurbine` → UVP-Stufe und Verfahrensart.

#### `DevAssessment` — Gutachten

| Feld | Typ | Anmerkung |
|---|---|---|
| `devProjectId` | String | |
| `assessmentType` | siehe Katalog | |
| `status` | PLANNED, COMMISSIONED, IN_PROGRESS, DELIVERED, ACCEPTED, INVALIDATED | |
| `vendorId` / `expertPersonId` | String? | |
| `basedOnLayoutVariantId` | String? | **Invalidierungs-Anker** |
| `commissionedAt`, `dueAt`, `deliveredAt` | DateTime? | |
| `validUntil` | DateTime? | **ökologische Gutachten i. d. R. max. 5 Jahre** — § 6b WindBG akzeptiert nur Daten „i. d. R. nicht älter als 5 Jahre" |
| `seasonWindowStart`, `seasonWindowEnd` | DateTime? | Kartiersaison |
| `costPlannedEur`, `costActualEur` | Decimal? | |
| `documentId` | String? | |

**Gutachten-Katalog** (`DevAssessmentType`):

| Gruppe | Typen |
|---|---|
| Wind | `WIND_YIELD` |
| Immissionsschutz | `NOISE` (TA Lärm, LAI-Interimsverfahren) · `SHADOW` (30 h/a, 30 min/d) |
| Artenschutz | `SPECIES_PROTECTION` (saP) · `AVIFAUNA` · `BATS` · `BAT_MONITORING` (Auflage) |
| Naturschutz | `LBP` · `LANDSCAPE` · `FFH` · `UVP_REPORT` · `FOREST_CONVERSION` |
| Technik | `TURBULENCE` (DIBt) · `SOIL` · `ICE_THROW` · `FIRE_SAFETY` |
| Externe Belange | `AVIATION` · `MILITARY` · `WEATHER_RADAR` · `RADIO_LINK` · `SEISMIC` |
| Standort | `MONUMENT` · `ORDNANCE` · `WATER_LAW` · `SOIL_PROTECTION` · `TRAFFIC` · `VISIBILITY` |

**Nicht aufnehmen** (Rechtslage hat sich erledigt):
- *Optisch bedrängende Wirkung* — seit **§ 249 Abs. 10 BauGB** (01.02.2023) gilt bei
  Abstand ≥ **2 × Anlagenhöhe** die gesetzliche Regelvermutung; Behörden sollen kein
  Gutachten mehr fordern (OVG NRW, Urt. v. 23.08.2024 – 8 D 15/23.AK). Nur bei
  Unterschreitung von 2H relevant → als optionaler Typ, nicht als Standard.
- *Infraschall* — **keine Rechtsgrundlage**. Die BGR-Studie 2005 enthielt einen
  Rechenfehler von 36 dB, von der BGR im April 2021 eingeräumt. Reines
  Einwendungsthema im Beteiligungsverfahren, kein Gutachten.

#### Kartiersaison-Kalender

Der harte Taktgeber. Gehört als Konfiguration in `SystemConfig`, nicht in den Code:

| Erfassung | Fenster | Umfang |
|---|---|---|
| Horstsuche (vor Laubaustrieb) | **Feb – März** | — |
| Brutvögel (Revierkartierung, Südbeck et al.) | **März – Juli/Aug** | 6–12 Begehungen |
| Raumnutzungsanalyse | **April – Juli/Aug** | 50–130 h Beobachtung |
| Fledermäuse bodennah | **April – Okt** | 6–12 Begehungen |
| Rast-/Zugvögel | Herbst/Winter + Frühjahr | volle Rastsaison |
| Gondelmonitoring (Auflage) | 2 Jahre, Geräte 15.03.–15.11. | nach IBN |

> **Beauftragung spätestens Januar/Februar.** Verpasstes Fenster = **12 Monate
> Projektverzug ohne Ausweichmöglichkeit.** Das ist der teuerste Fehler der Branche
> und der stärkste Einzelgrund für dieses Modul.

---

### 2.6 Stufe 4 — Genehmigung

#### `DevPermitProcedure` — Genehmigungsverfahren

**Fünf Verfahrenspfade** mit sehr unterschiedlichen Fristen:

```prisma
enum DevPermitProcedureType {
  BIMSCHG_FORMAL_10       // §10 BImSchG — 7 Monate, mit Öffentlichkeitsbeteiligung
  BIMSCHG_SIMPLIFIED_19   // §19 BImSchG — 3 Monate, ohne Öffentlichkeit
  WINDBG_SCREENING_6B     // §6b WindBG — 45 Tage (30 bei Repowering)
  REPOWERING_16B          // §16b BImSchG — teils Genehmigungsfiktion
  PRELIMINARY_9           // §9 BImSchG Vorbescheid
}
```

| Feld | Typ | Anmerkung |
|---|---|---|
| `devProjectId`, `procedureType` | | |
| `authorityPersonId` | String? | über `ContactLink`-Rolle `BEHOERDE` |
| `fileNumber` | String? | Aktenzeichen |
| `devLayoutVariantId` | String? | beantragtes Layout |
| `submittedAt` | DateTime? | Antragseingang |
| `completenessConfirmedAt` | DateTime? | **Fristbeginn** (§7 der 9. BImSchV) |
| `statutoryDeadline` | DateTime? | abgeleitet aus Typ + Vollständigkeit |
| `extendedUntil`, `extensionCount` | | seit Novelle 2024 **nur einmalig +3 Monate** |
| `uvpRequired`, `uvpScreeningResult` | Boolean? / String? | |
| `hearingHeldAt` | DateTime? | Erörterungstermin (seit 2024 fakultativ) |
| `decidedAt`, `decisionType` | | GRANTED / REJECTED / WITHDRAWN |
| `legalForceAt` | DateTime? | Bestandskraft |
| `constructionStartDeadline` | DateTime? | **§18 BImSchG — Genehmigung erlischt!** |
| `commissioningDeadline` | DateTime? | |
| `decisionDocumentId` | String? | Bescheid-PDF |

**Abgeleitete Verfahrenswahl:**

| Bedingung | Ergebnis |
|---|---|
| Beschleunigungsgebiet | → `WINDBG_SCREENING_6B` (45/30 Tage) |
| ≥ 20 WEA **oder** UVP-Pflicht | → `BIMSCHG_FORMAL_10` (7 Mon.) |
| < 20 WEA, keine UVP | → `BIMSCHG_SIMPLIFIED_19` (3 Mon.) |
| Ersatz von Bestandsanlagen | → `REPOWERING_16B` |

UVP-Stufe nach UVPG Anlage 1 Nr. 1.6: **≥20 WEA** = UVP-Pflicht · **6–19** = allgemeine
Vorprüfung · **3–5** = standortbezogene Vorprüfung · **1–2** = keine.

> **§6b WindBG ist der Gamechanger** (seit 15.08.2025): In Beschleunigungsgebieten
> entfallen **UVP, FFH-Verträglichkeitsprüfung, artenschutzrechtliche Prüfung und die
> wasserrechtliche Bewirtschaftungsziel-Prüfung** komplett — ersetzt durch ein Screening
> auf Basis vorhandener Daten (max. 5 Jahre alt). Eigene Kartierungen sind ausdrücklich
> nicht erforderlich. Das spart nicht primär Gutachtenkosten, sondern **12–24 Monate
> Vorlaufzeit**. Fledermaus-Abregelung ist dort aber zwingend anzuordnen (Abs. 5).

#### `PermitCondition` — Nebenbestimmung *(ohne `Dev`-Präfix)*

Der Kern des Moduls. Ein Bescheid für 6 WEA enthält realistisch **40–80
Nebenbestimmungen**, davon 15–30 mit datierten Nachweispflichten über 20 Jahre.

| Feld | Typ | Anmerkung |
|---|---|---|
| `devPermitProcedureId` | String? | |
| `parkId` | String? | **überlebt in den Betrieb** — auch für Bestandsparks nachtragbar |
| `number` | String | Bescheid-Ziffer, z. B. „IV.3.2" |
| `conditionType` | AUFLAGE / BEDINGUNG / BEFRISTUNG / WIDERRUFSVORBEHALT / HINWEIS | |
| `category` | siehe Enum | |
| `text` | String @db.Text | Volltext |
| `dueDate` | DateTime? | absolute Frist |
| `relativeToEvent` | PERMIT_DATE / CONSTRUCTION_START / COMMISSIONING | relative Frist … |
| `offsetMonths` | Int? | … z. B. „6 Monate nach IBN" |
| `recurrence` | String? | z. B. jährlich |
| `status` | OPEN / IN_PROGRESS / FULFILLED / OVERDUE / WAIVED | |
| `responsibleUserId`, `proofDocumentId` | String? | |
| `energyLossPercent` | Decimal? | für die §45b-Kumulation |

```prisma
enum PermitConditionCategory {
  NOISE           // Schallreduzierte Modi + Abnahmemessung nach FGW TR1
  SHADOW          // Abschaltmodul + Kalibriernachweis
  SPECIES_BATS    // Abschaltalgorithmus + Gondelmonitoring (2 Jahre)
  SPECIES_BIRDS   // Abschaltung bei Mahd/Ernte, Antikollisionssystem
  DECONSTRUCTION  // Rückbau-Sicherheitsleistung (§35 Abs. 5 S. 3 BauGB)
  LIGHTING_BNK    // Bedarfsgesteuerte Nachtkennzeichnung (§9 Abs. 8 EEG)
  MONITORING      // Berichts- und Nachweispflichten
  COMPENSATION    // Ausgleichs-/Ersatzmaßnahmen, Ersatzgeld
  STRUCTURAL      // Standsicherheit, Blitzschutz, Brandschutz
  SOIL_PROTECTION // Bodenkundliche Baubegleitung (§4 Abs. 5 BBodSchV, >3.000 m²)
  ORDNANCE        // Kampfmittelfreiheit vor Baubeginn
  OTHER
}
```

#### `DevSideProcedure` — Parallelverfahren

Die Konzentrationswirkung des §13 BImSchG hat Löcher. **Nicht** eingeschlossen:

| Verfahren | Rechtsgrundlage |
|---|---|
| Wasserrechtliche Erlaubnis / Bewilligung | §§ 8, 9 WHG — ausdrücklich von §13 ausgenommen |
| Gewässerausbau (offene Querung Kabeltrasse) | § 68 WHG — **Planfeststellung** |
| Luftverkehrsrechtliche Zustimmung | § 14 LuftVG |
| Flugsicherungsanlagen | § 18a LuftVG (BAF-Entscheidung auf DFS-Gutachten) |
| Großraum-/Schwertransport | §§ 29 Abs. 3, 46 StVO, § 70 StVZO — über **VEMAGS** |
| Straßensondernutzung | Straßenrecht |

| Feld | Typ |
|---|---|
| `devProjectId`, `procedureType` | |
| `authorityPersonId`, `fileNumber` | String? |
| `submittedAt`, `decidedAt`, `status` | |

---

### 2.7 Stufe 5 — Vermarktung, Netz, Kommune

#### `DevTenderBid` — EEG-Ausschreibung

| Feld | Typ | Anmerkung |
|---|---|---|
| `devProjectId`, `tenderDate` | | Gebotstermin BNetzA |
| `mastrRegisteredAt` | DateTime? | Genehmigung muss ≥3 Wochen vorher im MaStR sein |
| `bidVolumeKw`, `bidValueCtKwh` | Decimal | |
| `securityAmountEur` | Decimal? | Erstsicherheit |
| `result` | PENDING / AWARDED / REJECTED / WITHDRAWN | |
| `awardedAt`, `awardedValueCtKwh`, `awardedVolumeKw` | | |
| `realizationDeadline` | DateTime? | **Zuschlag + 30 Monate** |

Pönalen-Warnung: 30–32 Mon. → **10 €/kW** · 33–34 Mon. → **20 €/kW** · >34 Mon. →
**30 €/kW** der Gebotsmenge.

#### `DevGridConnection`

| Feld | Typ |
|---|---|
| `devProjectId`, `gridOperatorVendorId` | String |
| `applicationDate`, `feasibilityStudyAt` | DateTime? |
| `connectionPointAssignedAt`, `connectionPoint` | |
| `contractSignedAt`, `capacityKw` | |
| `connectionCostEur`, `constructionCostSubsidyEur` | Decimal? |
| `certificateTypeB`, `certificateTypeC` | Boolean | VDE-AR-N 4110/4120, NELEV |

#### `MunicipalBenefit` — kommunale Beteiligung *(ohne `Dev`-Präfix)*

Läuft 20 Jahre als wiederkehrende Zahlung weiter. Bei Verstoß **Bußgelder bis 500.000 €**
(Niedersachsen). Die Landespflichten gelten nur für Anlagen, die bei Inkrafttreten **noch
nicht genehmigt** waren — der Genehmigungszeitpunkt ist rechtlich scharf.

| Feld | Typ | Anmerkung |
|---|---|---|
| `devProjectId`, `parkId` | String? | |
| `municipalityName`, `distanceM` | | Umkreis 2.500 m um Turmmittelpunkt (§6 EEG) |
| `legalBasis` | EEG_6_VOLUNTARY / STATE_LAW_MANDATORY | |
| `rateCtKwh` | Decimal | 0,2 (Bund) bis 0,8 (NRW/SL Ersatzabgabe) |
| `agreementSignedAt`, `annualAmountEur` | | |

> Landesrecht-Matrix gehört in `SystemConfig`: verpflichtend in ST 0,3 · SN 0,3 ·
> BB 5.000 €/MW · TH 0,5 · MV 0,3 · NW 0,8 · NI §6+Überschuss · SL 0,8 · BY 0,2–0,3.
> Freiwillig (§6 EEG, 0,2 ct): BW, BE, HB, HH, HE, RP, SH.

---

### 2.8 Stufe 6 — Bau und Übergabe

#### `DevProcurementPackage` — Vergabepaket

| Feld | Typ | Anmerkung |
|---|---|---|
| `devProjectId`, `packageType` | WEA_SUPPLY, BOP, CIVIL, ELECTRICAL, CRANE, GRID, SERVICE | |
| `vendorId`, `contractId` | String? | |
| `tenderedAt`, `awardedAt` | DateTime? | |
| `contractValueEur` | Decimal? | |
| `deliveryLeadTimeMonths` | Int? | WEA typ. **12–24 Monate** — kollidiert mit der 30-Monats-Frist |

Bau-Meilensteine (Baubeginn, Fundament, Errichtung, Kalt-/Warm-IBN, Netzsynchronisation)
laufen über `DevMilestone` — kein eigenes Model.

---

## 3. PostGIS-Fundament

### 3.1 Ansatz: jsonb bleibt Source of Truth, `geom` ist abgeleitet

Prisma kann PostGIS-Spalten nur als `Unsupported()` abbilden und nicht selektieren. Statt
Dual-Write (fehleranfällig) wird `geom` per **BEFORE INSERT/UPDATE Trigger** aus dem
vorhandenen `geometry`-jsonb erzeugt:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE "Plot"        ADD COLUMN geom geometry(Geometry, 25832);
ALTER TABLE "DevSiteArea" ADD COLUMN geom geometry(Geometry, 25832);

CREATE OR REPLACE FUNCTION sync_geom_from_geojson() RETURNS trigger AS $$
BEGIN
  IF NEW.geometry IS NOT NULL THEN
    NEW.geom := ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(NEW.geometry::text), 4326), 25832);
  ELSE
    NEW.geom := NULL;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER plot_geom_sync BEFORE INSERT OR UPDATE OF geometry ON "Plot"
  FOR EACH ROW EXECUTE FUNCTION sync_geom_from_geojson();

CREATE INDEX plot_geom_gist ON "Plot" USING GIST (geom);
```

Vorteile: keine Prisma-Reibung, kein Dual-Write, bestehender Code bleibt unverändert,
Spatial-Queries laufen über `$queryRaw`.

### 3.2 Koordinatensystem — entschieden

**Nicht konfigurierbar machen.** Der Spaltentyp steht per DDL fest; ein per-Tenant
umschaltbares SRID würde Indizes und Queries verkomplizieren, ohne ein echtes Problem zu
lösen. Stattdessen die Frage technisch auflösen:

| Zweck | Verfahren | Genauigkeit |
|---|---|---|
| **Flächen, Verschnitt, Overlay** | `geom` in **EPSG:25832** (ETRS89/UTM32N) | ausreichend; deutscher Geodaten-Standard, vom vorhandenen Shapefile-Parser unterstützt |
| **Rechtlich relevante Abstände** | Cast auf `geography`: `ST_DWithin(ST_Transform(geom,4326)::geography, …, meter)` | **exakt geodätisch, kein Projektionsfehler** |

Damit ist die Ostdeutschland-Frage (ALKIS dort in 25833) entschärft: Der maximale
UTM-Maßstabsfehler am östlichen Rand liegt bei rund 0,18 % (≈ 1,8 m pro km) und betrifft
nur Flächen- und Overlay-Operationen, wo er irrelevant ist. Alle abstandsbasierten
Prüfungen — Mindestabstand zur Wohnbebauung, Artenschutz-Prüfradien, Schutzbereiche —
laufen über `geography` und sind damit metergenau.

> Sollte sich später herausstellen, dass flächentreue Germany-weite Auswertungen gebraucht
> werden (Statistik über alle Projekte), lässt sich eine zweite Spalte in **EPSG:3035**
> (ETRS89-LAEA) ergänzen. Kein Grund, jetzt zu warten.

### 3.3 Aufräumen vorher nötig

- **Fünf widersprüchliche Flächenberechnungen** und drei Centroid-Implementierungen
  (`GISMap.tsx`, `GISPlotCreatePanel.tsx`, `PlotDrawDialog.tsx`, `shp-parser.ts`,
  `multi-layer-parser.ts`). Keine berechnet einen echten Centroid — alle nur den
  Vertex-Mittelwert, was Pufferkreise verschiebt. Vor Stufe 1 in `src/lib/geo/`
  konsolidieren, danach `ST_Area`/`ST_Centroid` als Autorität.
- **`proj4` fehlt in `package.json`** — wird direkt importiert, aber nur transitiv über
  `shpjs` gehoistet. Als direkte Dependency aufnehmen.

### 3.4 Die abgeleiteten Fähigkeiten

Hier liegt der Produktwert — nicht in den Formularen.

| # | Fähigkeit | Umsetzung |
|---|---|---|
| 1 | **Flächenlücken-Erkennung** | `ST_Difference` zwischen benötigter Infrastruktur (`DevSiteArea` mit ACCESS_ROAD/CABLE_ROUTE/CRANE_PAD) und den Flächen mit `DevLandRight.status = SECURED`. Ergebnis: Lückengrundstücke mit Eigentümern. |
| 2 | **Abstandsprüfung Wohnbebauung** | `ST_DWithin` auf `geography` gegen ALKIS `AX_Gebaeude` (per vorhandenem Parser importierbar). Länderabstände aus `SystemConfig` — nur Bayern nutzt 10H (§249 Abs. 3 BauGB). |
| 3 | **Artenschutz-Prüfradien** | Anlage 1 BNatSchG definiert je Art drei Radien ab Mastfußmittelpunkt. Horst-Standorte gegen `DevPlannedTurbine` prüfen → automatische Einordnung in Nahbereich / zentraler / erweiterter Prüfbereich. Siehe Tabelle unten. |
| 4 | **Schutzbereiche externer Belange** | DVOR **7 km** · CVOR **15 km** · DME/VOR-Bauverbot 3 km · Flugsicherungsradar bis 15 km · **DWD-Wetterradar 5 km** · Bundeswehr-Luftverteidigungsradar bis 50 km · Seismologie-Empfehlung 5 km. |
| 5 | **Gutachten-Invalidierung** | Layout wechselt → alle `DevAssessment` mit `basedOnLayoutVariantId ≠ aktiv` auf `INVALIDATED`. Zeigt sofort: *„diese 7 Gutachten müssen neu"*. |
| 6 | **Kartiersaison-Warner** | `seasonWindowStart` + Vorlauf → wenn nicht bis Januar/Februar beauftragt: **12 Monate Verzug**. |
| 7 | **Gutachten-Ablauf** | `validUntil` — ökologische Gutachten altern nach ~5 Jahren. Bei langen Verfahren droht Nachkartierung und erneute Jahresbindung. Vorhandene Kartierungen sind ein **zeitlich befristetes Asset**. |
| 8 | **Fristen-Kausalkette** | `DevMilestoneDependency` — Verschiebung propagiert, Verletzung harter Fristen (§18 BImSchG, 30-Monats-Realisierung) wird gemeldet. |
| 9 | **Auflagen-Übergabe** | `PermitCondition.parkId` — überlebt Handover und Betreiberwechsel. |
| 10 | **§45b-Zumutbarkeitsprüfung** | Kumulierter `energyLossPercent` aus Schall-, Schatten- und Fledermausauflagen gegen die Grenze. |
| 11 | **Gutachtenvergleich Wind** | Spread zwischen den beiden `WindReport` je Anlage und Park; Plausibilitätscheck der P-Werte gegen σ. |

#### Artenschutz-Prüfbereiche (Anlage 1 Abschnitt 1 BNatSchG, Meter ab Mastfußmittelpunkt)

| Art | Nahbereich | zentraler PB | erweiterter PB |
|---|---|---|---|
| Seeadler | 500 | 2.000 | 5.000 |
| Schreiadler | 1.500 | 3.000 | 5.000 |
| Steinadler | 1.000 | 3.000 | 5.000 |
| Fischadler | 500 | 1.000 | 3.000 |
| **Rotmilan** | **500** | **1.200** | **3.500** |
| Schwarzmilan | 500 | 1.000 | 2.500 |
| Wanderfalke | 500 | 1.000 | 2.500 |
| Baumfalke | 350 | 450 | 2.000 |
| Wespenbussard | 500 | 1.000 | 2.000 |
| Weißstorch | 500 | 1.000 | 2.000 |
| Uhu | 500 | 1.000 | 2.500 |
| Sumpfohreule | 500 | 1.000 | 2.500 |
| Wiesen-/Korn-/Rohrweihe | 400 | 500 | 2.500 |

Gehört als Stammdaten in `SystemConfig` — die Anlage wird fortgeschrieben.

> **Zwei häufige Praxisfehler, die das System vermeiden sollte:**
> Der **Schwarzstorch steht nicht in Anlage 1** (nicht als kollisionsgefährdet gelistet,
> läuft über das Störungsverbot § 44 Abs. 1 Nr. 2). **Rohrweihe, Wiesenweihe und Uhu**
> sind nur kollisionsgefährdet, wenn die Rotorunterkante küstennah < 30 m, im Flachland
> < 50 m, im hügeligen Gelände < 80 m liegt — bei modernen Anlagen praktisch nie erfüllt.

---

## 4. Der Handover — Entwicklung → Betrieb

Der USP. Beim Übergang `DevProjectStage.HANDOVER` läuft eine Transaktion:

| Aus der Entwicklung | Wird im Betrieb |
|---|---|
| `DevProject` | → `Park` (angelegt oder verknüpft), `parkId` gesetzt |
| `DevPlannedTurbine` (aktives Layout) | → `Turbine` mit `parkId`, `turbineId` gesetzt |
| `DevLandRight` (SECURED) | → `Lease` + `LeasePlot`, `leaseId` gesetzt |
| `PermitCondition` | → bekommt `parkId`, läuft im Betrieb weiter |
| `WindReport` / `WindYield` | → bekommt `parkId` — Basis für die §36h-Ertragsprüfung nach dem 5./10./15. Jahr |
| `DevAssessment` (Dokumente) | → `Document` mit `parkId` |
| `MunicipalBenefit` | → wiederkehrende Zahlung im Abrechnungsmodul |
| `DevProcurementPackage` | → `Contract` (Wartungsvertrag etc.) |

Danach ist die Due Diligence eine **Abfrage statt eines Projekts**.

---

## 5. Ausbaustufen

Chronologisch. Jede Stufe ist für sich nutzbar.

| Stufe | Inhalt | Neue Models | Voraussetzung |
|---|---|---|---|
| **1** | **Flächen** — PostGIS-Fundament, Potenzialflächen, Sicherungs-Graph mit Lückenerkennung, Eigentümeranteile, minimale `DevProject`-Hülle | `DevProject`, `DevProjectStageHistory`, `DevSiteArea`, `DevLandRight`, `DevLandOwner` | Geo-Konsolidierung, `proj4`, PostGIS-Extension |
| **2** | **Steuerung & Fristen** — Stages, Meilensteine, Kausalketten, Reminder | `DevMilestone`, `DevMilestoneDependency` | **Reminder-Cron-Fix** |
| **3** | **Wind, Layout, Gutachten** — Messkampagne, zwei Gutachten mit P-Werten je Anlage und Park, Layout-Varianten, Gutachtensteuerung mit Invalidierung und Kartiersaison | `DevWindMeasurement`, `WindReport`, `WindYield`, `DevLayoutVariant`, `DevPlannedTurbine`, `DevAssessment` | Stufe 1+2 |
| **4** | **Genehmigung** — fünf Verfahrenspfade, Nebenbestimmungen, Parallelverfahren | `DevPermitProcedure`, `PermitCondition`, `DevSideProcedure` | Stufe 3 (Layout bestimmt Verfahrensart) |
| **5** | **Vermarktung, Netz, Kommune** | `DevTenderBid`, `DevGridConnection`, `MunicipalBenefit` | Stufe 4 |
| **6** | **Bau & Übergabe** | `DevProcurementPackage` + Handover-Transaktion | alle |

### Aufwandseinschätzung

Ehrlich: **ein großes Modul.** 21 Models, ~30 API-Route-Files, ~25 UI-Seiten,
PostGIS-Migration. Realistisch mehrere Wochen über alle Stufen. Stufe 1 allein ist
überschaubar und liefert eigenständigen Wert.

---

## 6. Voraussetzungen und Blocker

| | Thema | Wirkung | Wo |
|---|---|---|---|
| 🔴 | **Reminder-Cron nicht registriert** | `scheduleDailyReminderCheck()` hat keinen Aufrufer — der Worker läuft leer. **Alle Fristen-Erinnerungen würden still nie feuern.** | [workers/index.ts](../src/workers/index.ts) — Fix vor Stufe 2 |
| 🟡 | **Geo-Berechnungen widersprüchlich** | 5 Flächen-, 3 Centroid-Implementierungen, keine mit echtem Centroid | `src/lib/geo/` vor Stufe 1 |
| 🟡 | **`proj4` fehlt in package.json** | nur transitiv gehoistet — bricht bei Dependency-Update | vor Stufe 1 |
| 🟢 | **`MapAnnotation.parkId` non-nullable** | umgangen durch `DevSiteArea` | — |
| 🟢 | **Namenskonflikt „Genehmigung"** | UI-Begriff durch den 4-Augen-Workflow (`/approvals`) belegt | Entität heißt **Bescheid** / **Auflage**, Namespace `projektentwicklung.*` |
| 🟢 | **`Document`-DELETE ist Hard-Delete** | für Genehmigungsnachweise falsch (Retention 6 Jahre) | vor Stufe 4 auf Soft-Delete |

---

## 7. Produktisierung

- **Feature-Flag** `projektentwicklung` — Key in [features/route.ts](../src/app/api/features/route.ts),
  [useFeatureFlags.ts](../src/hooks/useFeatureFlags.ts), `MODULE_FLAG_KEYS` und der
  `featureFlag`-Union in [nav-config.ts](../src/config/nav-config.ts) (dort **zweimal**).
- **Permissions** `projektentwicklung:{read,create,update,delete,export}` plus fachliche
  (`:permit:submit`, `:condition:fulfill`, `:handover:execute`). Registrierung an **drei**
  Stellen: [permissions.catalog.ts](../src/lib/auth/permissions.catalog.ts) (SSOT,
  sortOrder-Band **330+**), [seed.ts](../prisma/seed.ts) `permissionsData` + Rollenlisten,
  `PERMISSIONS` in [permissions.ts](../src/lib/auth/permissions.ts). Danach
  `npm run check-permissions` und `npm run db:seed`.
  > ⚠ In `NODE_ENV=development` läuft `syncPermissionsCatalog()` **nicht** —
  > `register()` kehrt vorher zurück. Lokal immer `npm run db:seed`.
- **AuditEntityType** ist ein geschlossenes Union — alle neuen Entitäten in
  [audit-types.ts](../src/lib/audit-types.ts) **und** `getEntityDisplayName` ergänzen.
- **i18n** — Namespace `projektentwicklung` plus `nav.*` und `statusLabels.*` in allen
  drei Message-Files. Aktuell exakt **8994 Leaf-Keys je Sprache**; Parität wird nur durch
  Disziplin gesichert, es gibt kein Validierungsskript.
- **Konfigurierbare Stammdaten** gehören in `SystemConfig`, nicht in den Code:
  Landesrecht-Matrix (kommunale Beteiligung, Mindestabstände), Artenschutz-Prüfradien
  (Anlage 1 BNatSchG), Kartiersaison-Kalender, Schutzbereichsradien. Alle vier ändern
  sich regelmäßig.
- **Status-Workflows** über route-lokale `VALID_TRANSITIONS`-Tabellen (Muster aus
  [settlement-periods/[id]/route.ts](../src/app/api/admin/settlement-periods/[id]/route.ts)),
  plus `StatusMeta`-Maps in [status-labels.ts](../src/lib/status-labels.ts).

---

## 8. Belastbarkeit der Grundlagen

**✅ Belegt** (Normtext, FA Wind, Rechtsprechung): Verfahrensarten und Fristen ·
UVP-Schwellen · §18 BImSchG Erlöschen · §16b Repowering · EEG-Pönalen ·
Beschleunigungsgebiete (§249c BauGB, §6b WindBG) · kommunale Beteiligung je Land ·
Konzentrationswirkung §13 und ihre Ausnahmen · Artenschutz-Prüfradien Anlage 1 BNatSchG ·
LAI-Richtwerte Schall und Schatten · FGW TR 6 Rev. 12 · §36h EEG Gütefaktor ·
Schutzbereiche DVOR/CVOR/DWD · §249 Abs. 10 BauGB (optisch bedrängend).

**⚠️ Erfahrungswissen, nicht gegengeprüft**: Gutachtenkosten (es existiert **keine**
amtliche Kostenstatistik; kein akkreditierter Gutachter veröffentlicht Preise — die
verfügbaren Quellen widersprechen sich um Faktor 3–5 zwischen „je Park" und „je WEA") ·
Netzanschluss-Details · Wettbewerber-Funktionsumfang.

**❓ Vor Produktentscheidung zu klären**:
- §45b Abs. 6 BNatSchG — Zumutbarkeitsgrenze. Zwei Recherchen kommen auf **8 % / 6 %**
  (Gütefaktor ≥90 % / übrige); ob im Ausnahmefall nach Abs. 8 zusätzlich **6 % / 4 %**
  gilt, ist zwischen den Quellen strittig. Am Normtext verifizieren, bevor Feature 10
  gebaut wird.
- §6b Abs. 7 WindBG — Ausgleichszahlungen 7.800–52.000 €/MW: ob **jährlich** oder
  einmalig, lesen zwei Kanzleikommentare unterschiedlich.
- §6 EEG — freiwillig (Bundesrecht, 0,2 ct) vs. verpflichtend 0,3 ct ab 2026;
  widersprüchliche Quellenlage.
- §10a Abs. 6 BImSchG — ob die 6-Monats-Frist nur für Repowering / <150 kW / Speicher
  gilt (so der Normtext) oder generell im Beschleunigungsgebiet (so mehrere
  Kanzleibeiträge).
- **BwPBBG** (Bundestag 15.01.2026) bringt militärische Luftverteidigungsradare in
  §18a LuftVG — faktisches Vetorecht der Bundeswehr, über §73 Abs. 5 LuftVG aber
  übergangsweise suspendiert. Hoher Änderungsdruck, vor Nutzung Stand prüfen.
- Ob sich seit 2025 ein deutscher Genehmigungsmanagement-Anbieter am Markt etabliert hat.
