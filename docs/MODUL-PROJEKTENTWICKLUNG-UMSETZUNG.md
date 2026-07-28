# Modul „Projektentwicklung" — Umsetzungsplan

> Ausführungsplan zum Zielbild in [MODUL-PROJEKTENTWICKLUNG.md](MODUL-PROJEKTENTWICKLUNG.md).
> Stand 2026-07-14 · Status: **freigegeben zur Umsetzung, noch nicht begonnen**

Dieses Dokument ist so geschrieben, dass damit in einer **frischen Session** weitergearbeitet
werden kann. Es setzt das Zielbild voraus, wiederholt es aber nicht.

---

## Reihenfolge auf einen Blick

```
Phase 0  Vorarbeiten          ← MUSS zuerst, sonst bricht Stufe 1/2
Phase 1  Modul-Grundgerüst    ← einmalig, danach je Stufe nur noch Inhalt
Stufe 1  Flächen
Stufe 2  Steuerung & Fristen
Stufe 3  Wind, Layout, Gutachten
Stufe 4  Genehmigung
Stufe 5  Vermarktung, Netz, Kommune
Stufe 6  Bau & Übergabe
```

Jede Stufe endet mit dem **Verifikations-Gate** (siehe Abschnitt „Definition of Done").
Erst danach die nächste beginnen.

---

## Phase 0 — Vorarbeiten

Vier Punkte, die unabhängig vom Modul Wert haben und ohne die das Modul nicht trägt.
Können als eigener PR laufen.

### V1 — Reminder-Cron registrieren 🔴 Blocker

**Problem:** `scheduleDailyReminderCheck()` in
[src/lib/reminders/reminder-service.ts](../src/lib/reminders/reminder-service.ts) hat
**keinen Aufrufer**. Der Worker läuft leer, sämtliche Fristen-Erinnerungen feuern nie.

**Zu tun:**
1. In [src/workers/index.ts](../src/workers/index.ts) den Repeatable-Job registrieren —
   Muster von den bereits registrierten Jobs (approvals-expiry, retention, tus-gc,
   daily-digest) übernehmen.
2. Prüfen, ob der zweite, parallele Pfad
   [src/lib/notifications/deadline-checker.ts](../src/lib/notifications/deadline-checker.ts)
   + [api/cron/check-deadlines](../src/app/api/cron/check-deadlines/route.ts) redundant
   ist. Der hat das bessere 7-Tage-Dedupe, aber sein Tenant-Scoping über `fund:{tenantId}`
   verliert fund-lose Verträge. **Entscheidung nötig:** einen Pfad zum Standard machen,
   den anderen entfernen — nicht beide parallel laufen lassen.
3. Manuell verifizieren, dass ein Reminder wirklich rausgeht (Testfrist anlegen).

**Größe:** S · **Nutzen auch ohne Modul:** hoch (bestehende Vertragsfristen funktionieren heute nicht)

### V2 — `proj4` als direkte Dependency

`proj4` wird in [src/lib/shapefile/shp-parser.ts](../src/lib/shapefile/shp-parser.ts)
direkt importiert, steht aber nicht in `package.json` — nur transitiv über `shpjs`
gehoistet. Bricht beim nächsten Dependency-Update.

```
npm install proj4
npm install --save-dev @types/proj4
```

**Größe:** XS

### V3 — Geo-Konsolidierung nach `src/lib/geo/`

**Problem:** Fünf widersprüchliche Flächenberechnungen und drei Centroid-Implementierungen:
- [src/components/gis/GISMap.tsx](../src/components/gis/GISMap.tsx) (~Z. 323)
- [src/components/gis/GISPlotCreatePanel.tsx](../src/components/gis/GISPlotCreatePanel.tsx) (~Z. 23)
- [src/components/maps/PlotDrawDialog.tsx](../src/components/maps/PlotDrawDialog.tsx) (~Z. 40)
- [src/lib/shapefile/shp-parser.ts](../src/lib/shapefile/shp-parser.ts)
- [src/lib/shapefile/multi-layer-parser.ts](../src/lib/shapefile/multi-layer-parser.ts) (~Z. 180)

Sie unterscheiden sich in Löcher-Behandlung, Rundung und Außenring-Handhabung. **Keine**
berechnet einen echten Centroid — alle nur den Vertex-Mittelwert, was Pufferkreise
verschiebt.

**Zu tun:** Neues `src/lib/geo/` mit `polygonAreaSqm()`, `polygonCentroid()`,
`lineLengthM()`. Alle fünf Call-Sites migrieren. Nach PostGIS-Einführung sind
`ST_Area`/`ST_Centroid` die Autorität; die JS-Variante bleibt nur für Client-seitige
Vorschau.

⚠ **Achtung:** Bestehende `Plot.areaSqm`-Werte wurden mit den alten Funktionen berechnet.
Vor einem Backfill prüfen, ob sich Werte ändern — das wirkt sich auf Pachtabrechnungen aus.
**Im Zweifel keinen Backfill, nur neue Berechnungen vereinheitlichen.**

**Größe:** M · **Risiko:** mittel (Pachtrelevanz)

### V4 — PostGIS-Fundament

1. Extension aktivieren: `CREATE EXTENSION IF NOT EXISTS postgis;`
   → als eigene Prisma-Migration, **manuell geschrieben** (Prisma generiert das nicht).
2. `geom`-Spalte + Trigger + GiST-Index auf `Plot` (siehe Zielbild §3.1).
3. Backfill: `UPDATE "Plot" SET geometry = geometry;` triggert die Berechnung für
   Bestandsdaten.
4. Smoke-Test über `$queryRaw`: `ST_Area(geom)` gegen `areaSqm` vergleichen — Abweichungen
   dokumentieren, nicht automatisch überschreiben.
5. In `prisma/schema.prisma` das Feld als `geom Unsupported("geometry(Geometry, 25832)")?`
   aufnehmen, damit Prisma es bei Migrationen nicht wegräumt.

⚠ **Deployment:** Das PostGIS-Image muss im Docker-Setup verfügbar sein
(`postgis/postgis` statt `postgres`, bzw. TimescaleDB-Image mit PostGIS). **Vor
Umsetzungsbeginn mit dem Server-Setup abgleichen** — siehe
[topic_docker_runbook](../../.claude/projects/c--VS-Code-Verwaltung/memory/topic_docker_runbook.md).

**Größe:** M · **Risiko:** hoch (Infrastruktur, betrifft Prod-DB)

---

## Phase 1 — Modul-Grundgerüst

Einmalig. Danach kostet jede Stufe nur noch Inhalt.

| # | Schritt | Datei(en) |
|---|---|---|
| 1 | Feature-Flag `projektentwicklung` | [api/features/route.ts](../src/app/api/features/route.ts) · [useFeatureFlags.ts](../src/hooks/useFeatureFlags.ts) (Interface + `DEFAULT_FLAGS`) · [admin/feature-flags/route.ts](../src/app/api/admin/feature-flags/route.ts) `MODULE_FLAG_KEYS` · [nav-config.ts](../src/config/nav-config.ts) `featureFlag`-Union **an zwei Stellen** |
| 2 | Permissions-Block, sortOrder-Band **330+** | [permissions.catalog.ts](../src/lib/auth/permissions.catalog.ts) (SSOT) → [seed.ts](../prisma/seed.ts) `permissionsData` **und** Rollenlisten → `PERMISSIONS` in [permissions.ts](../src/lib/auth/permissions.ts) |
| 3 | `npm run check-permissions` → `npm run db:seed` | ⚠ In `NODE_ENV=development` läuft `syncPermissionsCatalog()` **nicht** (`register()` kehrt vorher zurück) — lokal immer seeden |
| 4 | Nav-Eintrag + Icon-Import **und** Re-Export | [nav-config.ts](../src/config/nav-config.ts) — `sidebar.tsx` liest Icons aus dem Re-Export-Block |
| 5 | i18n-Namespace `projektentwicklung` + `nav.*` | alle drei [messages/*.json](../src/messages/) — Leaf-Key-Parität halten |
| 6 | Route-Gerüst | `src/app/(dashboard)/projektentwicklung/{layout,loading,error,page}.tsx` — `layout.tsx` mit `await requirePagePermission("projektentwicklung:read")`, Muster: [crm/layout.tsx](../src/app/(dashboard)/crm/layout.tsx) |

**Permission-Liste (Vorschlag):**

```
projektentwicklung:read           330
projektentwicklung:create         331
projektentwicklung:update         332
projektentwicklung:delete         333
projektentwicklung:export         334
projektentwicklung:permit:submit  335   // Antrag einreichen
projektentwicklung:condition:fulfill 336 // Auflage als erfüllt markieren
projektentwicklung:handover:execute  337 // Handover in den Betrieb — irreversibel!
```

**Größe:** M

---

## Stufe 1 — Flächen

### S1.1 Prisma-Modelle

`DevProject`, `DevProjectStageHistory`, `DevSiteArea`, `DevLandRight`, `DevLandOwner`
— Felder siehe Zielbild §2.1/§2.2.

**Konventionen:** `tenantId` + `deletedAt` + `@@index([tenantId, deletedAt])` auf allen.
`DevSiteArea.geom` als `Unsupported(...)`.

⚠ **`prisma/schema.prisma` ausschließlich manuell editieren. Niemals `prisma db pull`** —
das überschreibt das Schema komplett (PascalCase → snake_case, Auto-Relation-Namen).
Schema nach der Änderung sofort committen.

### S1.2 Migration

1. Models anlegen → `npx prisma migrate dev --name dev_project_land`
2. Zweite, **manuelle** Migration für Trigger + GiST-Index auf `DevSiteArea`
3. `npx prisma generate`

### S1.3 API-Routen

| Route | Methoden |
|---|---|
| `api/projektentwicklung/projects` | GET (Liste, paginiert), POST |
| `api/projektentwicklung/projects/[id]` | GET, PATCH, DELETE (soft) |
| `api/projektentwicklung/projects/[id]/site-areas` | GET, POST |
| `api/projektentwicklung/site-areas/[id]` | GET, PATCH, DELETE |
| `api/projektentwicklung/projects/[id]/land-rights` | GET, POST |
| `api/projektentwicklung/land-rights/[id]` | GET, PATCH, DELETE |
| `api/projektentwicklung/plots/[plotId]/owners` | GET, POST |
| `api/projektentwicklung/land-owners/[id]` | PATCH, DELETE |
| **`api/projektentwicklung/projects/[id]/coverage`** | GET — **die Lückenanalyse** |

**Referenz-Route für den Aufbau:**
[api/energy/turbine-operators/route.ts](../src/app/api/energy/turbine-operators/route.ts)
— Zod oben im Modul, `requirePermission` → Tenant-Guard → FK-Tenant-Checks →
`parsePaginationParams` → `Promise.all([findMany, count])` → `after(createAuditLog)` →
`handleApiError` im catch.

### S1.4 Die Lückenanalyse (`/coverage`)

Der eigentliche Wert von Stufe 1. Skizze:

```sql
-- Benötigte Infrastruktur (Union aller DevSiteArea des Projekts)
WITH required AS (
  SELECT ST_Union(geom) AS geom
  FROM "DevSiteArea"
  WHERE "devProjectId" = $1
    AND "areaType" IN ('ACCESS_ROAD','CABLE_ROUTE','CRANE_PAD')
),
-- Gesicherte Flächen
secured AS (
  SELECT ST_Union(p.geom) AS geom
  FROM "DevLandRight" lr
  JOIN "Plot" p ON p.id = lr."plotId"
  WHERE lr."devProjectId" = $1 AND lr.status = 'SECURED'
)
-- Was fehlt
SELECT ST_AsGeoJSON(ST_Difference(r.geom, COALESCE(s.geom, ST_GeomFromText('POLYGON EMPTY',25832)))) AS gap
FROM required r LEFT JOIN secured s ON true;
```

Zweiter Schritt: Die Lückengeometrie gegen alle `Plot` verschneiden (`ST_Intersects`), um
die betroffenen Flurstücke **mit ihren Eigentümern** zu liefern. Das ist die eigentlich
nützliche Ausgabe — nicht die Geometrie, sondern *„bei diesen 4 Grundstücken fehlt die
Unterschrift, Eigentümer sind …"*.

**Abgeleitete Regel implementieren:** `DevLandRight.status = SECURED` nur zulassen, wenn
alle `DevLandOwner` mit `signatureRequired = true` ein `signedAt` haben. Als Guard in der
PATCH-Route, nicht nur in der UI.

### S1.5 UI

| Seite | Inhalt |
|---|---|
| `projektentwicklung/page.tsx` | Projektliste, Stats, Filter |
| `projektentwicklung/new/page.tsx` | Anlage-Wizard (`ui/stepper`) |
| `projektentwicklung/[id]/page.tsx` | Projekt-Detail mit Tabs |
| `projektentwicklung/[id]/flaechen/page.tsx` | Karte + Flurstückstabelle + Sicherungsstatus |

**Karte:** vorhandene Leaflet-Bausteine wiederverwenden —
[PlotGeoJsonLayer](../src/components/maps/PlotGeoJsonLayer.tsx) (hat schon
Eigentümer-Farbcodierung + Legende), [DrawControl](../src/components/maps/DrawControl.tsx),
SSR-sicher über `dynamic({ ssr: false })`.

**Farbcodierung Sicherungsstatus:** IDENTIFIED grau → CONTACTED gelb → NEGOTIATING orange
→ PRECONTRACT hellgrün → SECURED grün → REJECTED rot. Lückenflächen schraffiert rot
darüber.

**Neue Fetches: `useQuery`/`useMutation`** (CLAUDE.md-Regel), nicht `useEffect + fetch`.

**Größe Stufe 1:** L

---

## Stufe 2 — Steuerung & Fristen

**Voraussetzung: V1 muss erledigt sein**, sonst feuert nichts.

- `DevMilestone`, `DevMilestoneDependency`
- Kausalketten-Berechnung: bei Änderung von `plannedDate`/`actualDate` alle Nachfolger
  rekursiv neu rechnen. **Zyklusschutz nötig** — Muster: die `WITH RECURSIVE`-CTE aus
  [funds/hierarchy/route.ts](../src/app/api/funds/hierarchy/route.ts) (dort in Round 4
  eingeführt).
- Reminder-Anbindung: `ReminderCategory` erweitern (geschlossenes Enum → Migration),
  Finder-Funktion in [reminder-service.ts](../src/lib/reminders/reminder-service.ts)
  ergänzen, Schwellwerte in `DEFAULT_REMINDER_CONFIG`.
- Gantt-artige Darstellung — bewusst **einfach halten**: Tabelle mit Balken, keine
  Gantt-Library. Erst wenn es sich als zu wenig erweist, nachrüsten.
- ICS-Export nutzt den bestehenden [api/export/calendar](../src/app/api/export/calendar/route.ts)
  (RFC-5545 mit VALARM aus `reminderDays`).

**Größe:** M

---

## Stufe 3 — Wind, Layout, Gutachten

- `DevWindMeasurement`, `WindReport`, `WindYield`, `DevLayoutVariant`,
  `DevPlannedTurbine`, `DevAssessment`
- **Invalidierungslogik:** Wechsel von `DevLayoutVariant.isActive` → alle `DevAssessment`
  mit abweichendem `basedOnLayoutVariantId` auf `INVALIDATED`. In einer Transaktion,
  mit AuditLog, und die betroffene Liste in der Response zurückgeben (die UI muss zeigen,
  *was* invalidiert wurde).
- **Kartiersaison-Warner:** Cron prüft `DevAssessment` mit `seasonWindowStart`, deren
  Beauftragung fehlt. Kalender aus `SystemConfig`, nicht hardcodiert (Zielbild §2.5).
- **P-Wert-Plausibilität:** P75 ≈ P50 − 0,675 σ, P90 ≈ P50 − 1,282 σ. Bei Abweichung
  warnen, nicht blockieren — Gutachten dürfen abweichen, aber es soll auffallen.
- **Gutachtenvergleich:** Spread zwischen den beiden `WindReport` je Anlage und Park.
- **Import:** Prüfen, ob P-Werte aus windPRO/Excel importierbar sind — realistisch kommt
  das als PDF, dann manuelle Erfassung. Erfassungsmaske pro Anlage muss zügig bedienbar
  sein (Tabelle mit Inline-Edit, nicht 30 Einzelformulare).

**Größe:** L

---

## Stufe 4 — Genehmigung

- `DevPermitProcedure`, `PermitCondition`, `DevSideProcedure`
- **Verfahrenswahl ableiten** (Zielbild §2.6) — als Vorschlag mit Override, nicht als
  Zwang. Die Behörde kann anders entscheiden.
- **Fristberechnung:** `statutoryDeadline` aus `completenessConfirmedAt` + Typ.
  Verlängerung: `extensionCount` als Guard, seit Novelle 2024 nur einmalig +3 Monate.
- **Nebenbestimmungs-Erfassung** ist der kritische UX-Punkt: 40–80 Auflagen aus einem PDF.
  Erfassungsmaske muss auf Tempo optimiert sein — Nummer, Kategorie, Text, Frist,
  Verantwortlicher, in einer Zeile. Kein Wizard, keine Modals.
  > Optional später: PDF-Textextraktion mit Vorschlagsliste. **Nicht in Stufe 4** —
  > erst manuell, dann sehen ob es sich lohnt.
- **Relative Fristen auflösen:** `relativeToEvent` + `offsetMonths` → konkretes Datum,
  sobald das Bezugsereignis (IBN, Baubeginn) feststeht.
- **Retrofit-Pfad:** `PermitCondition.parkId` erlaubt das Nachtragen für Bestandsparks
  ohne Projekt. Eigene, schlanke Maske unter dem Park — das ist für Bestandskunden der
  erste sichtbare Nutzen des ganzen Moduls.
- Vorher: `Document`-DELETE auf Soft-Delete umstellen (Blocker aus Zielbild §6).

**Größe:** L

---

## Stufe 5 — Vermarktung, Netz, Kommune

- `DevTenderBid`, `DevGridConnection`, `MunicipalBenefit`
- Pönalen-Rechner: `realizationDeadline` = `awardedAt` + 30 Monate; Staffel 10/20/30 €/kW.
  Als Warnung im Projekt-Dashboard, sobald der prognostizierte IBN-Termin die Frist reißt.
- Landesrecht-Matrix in `SystemConfig` (Zielbild §2.7). Beim Anlegen eines
  `MunicipalBenefit` das Bundesland aus `DevProject.federalState` ziehen und Satz +
  Pflichtcharakter vorschlagen.
- ⚠ Vor Umsetzung die offene Rechtsfrage klären: §6 EEG freiwillig 0,2 ct vs.
  verpflichtend 0,3 ct ab 2026 (Zielbild §8).

**Größe:** M

---

## Stufe 6 — Bau & Übergabe

- `DevProcurementPackage`
- **Handover-Transaktion** (Zielbild §4) — der heikelste Teil des Moduls:
  - Läuft in **einer** `$transaction`
  - **Idempotent**: zweimaliges Ausführen darf keine Duplikate erzeugen. Guard über
    `DevProject.parkId IS NULL`.
  - Eigene Permission `projektentwicklung:handover:execute`
  - Vollständiger AuditLog mit Vorher/Nachher-Snapshot
  - Vorschau-Modus („was würde passieren") **vor** der Ausführung — bei einer
    irreversiblen Operation über 6 Entitätstypen Pflicht.
  - Nicht rückabwickelbar → Bestätigungsdialog mit Auflistung, nicht nur „Sind Sie sicher?"

**Größe:** M

---

## Definition of Done — je Stufe

Vor dem Weitergehen zur nächsten Stufe:

- [ ] `npx tsc --noEmit` — 0 Errors
- [ ] `npm run lint` — 0 Errors
- [ ] `npm run build` — exit 0
- [ ] Alle drei Message-Files haben identische Leaf-Key-Anzahl
- [ ] `npm run check-permissions` grün
- [ ] Neue Entitäten in `AuditEntityType` **und** `getEntityDisplayName` ergänzt
      ([audit-types.ts](../src/lib/audit-types.ts) — geschlossenes Union, TS bricht sonst)
- [ ] Alle Read-Queries filtern `deletedAt: null`
- [ ] Alle FK-Referenzen gegen `check.tenantId` validiert (Cross-Tenant-Guard)
- [ ] Statuswechsel über `VALID_TRANSITIONS`-Tabelle, nicht frei setzbar
- [ ] `apiError()` überall, kein `NextResponse.json({ error })`
- [ ] Manueller Durchlauf des Hauptpfads gegen echte Daten
- [ ] Commit-Message erklärt, *warum* — nicht nur *was*

---

## Fallen aus der Codebase-Analyse

Sammlung der Dinge, die beim Bauen sonst Zeit kosten:

| Falle | Konsequenz |
|---|---|
| `syncPermissionsCatalog()` läuft **nicht in dev** — `register()` kehrt vorher zurück | Neue Permissions fehlen lokal. Immer `npm run db:seed` |
| `AuditEntityType` ist ein **geschlossenes Union** | TS-Fehler, wenn neue Entität fehlt |
| `featureFlag`-Union steht **zweimal** in `nav-config.ts` | Flag wirkt nur halb |
| Icons müssen in `nav-config.ts` importiert **und re-exportiert** werden | Sidebar rendert kein Icon |
| Es gibt **keine** shared `DataTable`-Komponente | shadcn-Primitives komponieren, nicht suchen |
| Es gibt **keinen** shared State-Machine-Helper | `VALID_TRANSITIONS` route-lokal, Muster aus settlement-periods |
| `Document`-DELETE ist **Hard-Delete** trotz `deletedAt` | Vor Stufe 4 fixen |
| Document-Approve ist auf `hierarchy >= ADMIN` hardcodiert, ignoriert die definierten Permissions | ggf. mitfixen |
| GIS hat **keine eigenen** `gis:*`-Permissions, alles über `plots:read` | Standortdaten sind kommerziell sensibel — eigene Permissions setzen |
| Betriebsführungs-Block (Tasks/Inspections/Defects) hat **kein** `deletedAt` | bewusst entscheiden, nicht kopieren |

---

## Offene Punkte vor Umsetzungsbeginn

1. **PostGIS im Docker-Setup** verfügbar? (`postgis/postgis` bzw. TimescaleDB+PostGIS)
   → blockiert V4 und damit Stufe 1.
2. **Reminder-Pfad-Entscheidung**: `reminder-service` oder `deadline-checker` als
   Standard? → blockiert V1.
3. **§45b Abs. 6 BNatSchG** — Zumutbarkeitsgrenze 8/6 vs. zusätzlich 6/4 im Ausnahmefall.
   Quellen widersprüchlich. → blockiert nur Feature 10, nicht den Rest.
4. **§6 EEG** 0,2 freiwillig vs. 0,3 verpflichtend ab 2026. → blockiert Stufe 5.
5. **Wettbewerbsrecherche** nachholen, falls das Modul verkauft werden soll: windPRO-
   Modulumfang, Power-Factors-Grenze, ob sich seit 2025 ein deutscher
   Genehmigungsmanagement-Anbieter etabliert hat.

---

## Was bewusst *nicht* gebaut wird

- Fachberechnung (Schall, Schatten, Ertrag) — windPRO ist behördlich akzeptiert
- Gantt-Library — Tabelle mit Balken reicht, bis das Gegenteil bewiesen ist
- PDF-Textextraktion für Nebenbestimmungen — erst manuell, dann messen
- Eigenes `Authority`-Model — `ContactLink` mit Rolle `BEHOERDE` reicht
- Per-Tenant konfigurierbares SRID — technisch über `geography` aufgelöst
