# Audit: Tote und kaputte Funktionalität

> Stand 2026-07-29 · **Nur Befund, nichts gefixt**

**Methodik:** Nav-Graph vs. 219 Dashboard-Pages · 549 API-Routes vs. Client-Fetches ·
169 Permissions vs. tatsächliche Checks · 8.988 i18n-Keys vs. `t()`-Aufrufe (mit
Scope-Auflösung pro `useTranslations`) · 156 Prisma-Modelle · 51 SystemConfig-Keys ·
84 Env-Vars. Jeder Treffer einzeln gegengeprüft.

---

## P0 — User sieht falsche Daten oder klickt ins Leere

### 1 · Audit-Log-Links zeigen auf ~14 nicht existierende Routen
`src/lib/audit-entity-urls.ts:20-78`

`getAuditEntityHref()` liefert **deutsche** Pfade, die es im App-Router nicht gibt. Die API
hängt sie an jeden Audit-Eintrag (`admin/audit-logs/route.ts:146,180`), die UI rendert sie
als klickbare `<Link>` (`admin/audit-logs/page.tsx:878-880, 992-994`).

**Verifiziert nicht existent:** `/abstimmungen/` `/anlagen/` `/anlagen/produktion/`
`/archiv/` `/dokumente/` `/energie/abrechnungen/` `/flurstuecke/` `/gesellschaften/`
`/gesellschafter/` `/pacht/abrechnungen/` `/pachtvertraege/` `/personen/` `/rechnungen/`
`/vertraege/` `/wka-betreiber/` `/parks/kostenaufteilung/`
`/buchhaltung/banktransaktionen/` `/buchhaltung/eingangsrechnungen/`
`/buchhaltung/journal/`

Real wären u. a. `/votes` `/documents` `/energy/settlements` `/invoices` `/contracts`
`/leases` `/funds` `/journal-entries` `/inbox` `/leases/cost-allocation`.

**Sichtbar:** ja (404 auf Klick) · **Bug**, kein Platzhalter

### 2 · Fünf Dashboard-Widgets zeigen erfundene Daten bei API-Fehler

Gleiches Muster wie beim bereits gefixten weather-widget (das setzt jetzt korrekt `[]`).
Diese fünf nicht:

| Datei | Erfundener Inhalt |
|---|---|
| `deadlines-widget.tsx:43-92` | „Pachtvertrag Flurstueck 12/3 – Kuendigung in 30 Tagen", „Wartungsvertrag Vestas" |
| `expiring-contracts-widget.tsx:49-100` | dieselben drei Verträge mit Status `critical`/`warning` |
| `activities-widget.tsx:61-100` | „Neue Abstimmung erstellt – Jahresabschluss 2025 – Gesellschaft Alpha" |
| `admin-widgets.tsx:114-134` | **`status: "healthy", database: "connected"` — genau dann, wenn `/api/admin/system/status` nicht erreichbar ist** |
| `admin-widgets.tsx:230-247` | `totalUsers: 45, activeToday: 12` |

Alle setzen vorher `setError(null)` — **es gibt keinen Fehlerhinweis.** Alle betroffenen
APIs existieren, es ist also kein „API fehlt noch"-Platzhalter.

`admin-system-status`, `list-deadlines`, `list-expiring-contracts` und `list-activities`
stehen in `default-layouts.ts` → **ab Werk auf dem Dashboard.**

> Das Health-Widget ist das gefährlichste: **es meldet Gesundheit, weil es nichts
> erreicht.** Es arbeitet aktiv gegen seinen eigenen Zweck.

*(`admin-user-stats` ist als einzige ID nicht in der Registry und in keinem Default-Layout
→ praktisch unerreichbar, daher nur P2.)*

### 3 · Portal zeigt gefälschten „Letzter Login"
`src/app/(portal)/portal/settings/page.tsx:161`

```ts
const lastLogin = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
```

Gerendert in `:359-361` unter `t("security.lastLogin")`. Es steht also **immer**
„vor 2 Tagen".

Der echte Wert existiert: `User.lastLoginAt` (`schema.prisma:210`) wird bei jedem Login
geschrieben (`auth/index.ts:131,213`) und im Admin-Bereich korrekt gelesen.

**Sicherheitsrelevant** — Gesellschafter prüfen genau dort auf Fremdzugriff.

### 4 · Dokumenten-Explorer zeigt 31 rohe Übersetzungsschlüssel

Der Namespace `documents.explorer` hat in allen drei Message-Files nur 8 Keys. Die
Komponenten rufen **31 weitere** ab. Ohne `getMessageFallback` rendert next-intl den vollen
Key-Pfad.

Betroffen (Auszug, in `de`, `en` **und** `de-personal` fehlend):
- `explorer/file-list.tsx:100-104` → Tabellenkopf zeigt `documents.explorer.name`,
  `.type`, `.size`, `.date`, `.amount`
- `explorer/tax-export-dialog.tsx:87,94,100,103,108,116,129,139,143` — **kompletter
  Steuerexport-Dialog**
- `explorer/upload-dropzone.tsx:80,86,89` · `breadcrumb-path.tsx:24,29` ·
  `folder-tree.tsx:169`

Die Seite ist erreichbar (`documents/page.tsx:448`).

Ein weiterer Einzelfall: `admin.billingRuleDetail.loadRuleError`
(`admin/billing-rules/[id]/page.tsx:182`) — Fehlermeldung als Rohschlüssel.

*Geprüfte False Positives:* `contracts.calendar.weekdays.0-6` ist ein Array (next-intl löst
Index-Zugriffe auf); `inbox.detail.*` liegt korrekt unter `inbox.payDialog`.

---

## P1 — Feature existiert vollständig, ist aber nicht erreichbar

### 5 · 16 substantielle Buchhaltungs-/Admin-Seiten ohne jeden eingehenden Link

Kein Nav-Eintrag, kein `<Link>`, kein `router.push` irgendwo im Repo. Verifiziert per
Volltext-Grep unter Ausschluss des eigenen Verzeichnisses.

| Route | Zeilen | Inhalt |
|---|---:|---|
| `/energy/turbine-import` | 1567 | Produktionsdaten importieren |
| `/energy/import` | 1192 | Netzbetreiber-Daten (nur von turbine-import verlinkt → transitiv tot) |
| `/buchhaltung/periodensperre` | 460 | GoBD-Periodensperren-Verwaltung |
| `/admin/tax-category-templates` | 376 | Steuerkategorie-Vorlagen |
| `/buchhaltung/konten-markierung` | 374 | HGB-Compliance-Felder pro Konto |
| `/admin/hgb-system-settings` | 333 | Superadmin-HGB-Settings |
| `/buchhaltung/multi-park-soll-ist` | 331 | Multi-Park Soll-Ist |
| `/buchhaltung/year-end-close` | 325 | **Jahresabschluss-Durchführung** |
| `/admin/fund-access` | 293 | Fonds-Zugriffsverwaltung |
| `/buchhaltung/gewerbesteuer` | 293 | GewSt-Report §8 GewStG |
| `/admin/bank-update-requests` | 236 | Freigabe von Bankdaten-Änderungen |
| `/buchhaltung/storno-audit` | 235 | Storno-Audit-Trail „für Betriebsprüfung" |
| `/buchhaltung/cashflow` | 227 | Kapitalflussrechnung |
| `/buchhaltung/anlagenspiegel` | 197 | Anlagenspiegel |
| `/buchhaltung/gobd-export` | 183 | GoBD Z3-Datenträgerüberlassung |
| `/buchhaltung/datev-export` | 171 | DATEV-Export |
| `/buchhaltung/bilanz` | — | nur von year-end-close verlinkt → transitiv tot |

**Ursache belegbar:** Die Buchhaltung wurde auf Hub-Seiten mit Tabs konsolidiert.
`/buchhaltung/berichte` hat nur `susa | bwa | euer | guv`, `/buchhaltung/abschluss` nur
`datev | jahresabschluss`. Die Jahresabschluss-Checkliste
(`abschluss/tabs/jahresabschluss.tsx:30-57`) verlinkt SuSa, Bank, Kasse, Anlagen, UStVA,
DATEV, BWA — aber **nicht** den eigentlichen Abschluss, die Bilanz, GewSt, GoBD-Export
oder die Periodensperre. **Die Konsolidierung hat die Hälfte der Endstationen abgehängt.**

**Sichtbar: nein** — das ist das Problem. Rund **5.500 Zeilen fertige, größtenteils
compliance-relevante Funktionalität**, die nur ein paar Nav-Einträge von der Nutzbarkeit
entfernt ist.

*Harmlos:* Die Redirect-Stubs `/admin/invoices`, `/admin/templates`,
`/buchhaltung/jahresabschluss`, `/buchhaltung/bank/konten`, `/crm/templates`, `/parks/pl`,
`/energy/productions/comparison`, `/kommunikation/masse` — alle mit erklärendem Kommentar.
Nur `/energy/import` + `/energy/turbine-import` sind echte Alt-Duplikate ohne Redirect
(2759 Zeilen) → **Wartungsfalle**, ein Fix landet leicht in der toten Kopie.

### 6 · Mahnstufen-Konfiguration nicht erreichbar
`admin/mahn-stufen/page.tsx` ist die **einzige** Stelle, die `DunningStagesSettings`
rendert. Die Seite hat keinen Link. Damit lassen sich die 3 Mahnstufen (Tage + Gebühren)
über die UI **gar nicht** einstellen — kollidiert direkt mit der Projektregel
„Mahngebühren IMMER aus `getTenantSettings()`".

### 7 · Storno (Generalumkehr) hat keinen UI-Auslöser
`api/journal-entries/[id]/reverse/route.ts` — „Storno für POSTED JournalEntries, GoBD
§146 AO", vollständig implementiert, Permission `accounting:reverse`. **Kein einziger
Frontend-Aufruf.**

`DELETE` ist korrekt auf `DRAFT` beschränkt. **Eine gebuchte Fehlbuchung ist über die UI
also nicht korrigierbar.** Die einzige Seite, die Stornos anzeigt
(`/buchhaltung/storno-audit`), ist selbst unerreichbar (Finding 5). **GoBD-relevant.**

### 8 · Meilisearch: Schreibpfad lebt, Lesepfad existiert nicht
- `/api/search` (Volltext über 5 Indices) — **kein UI-Konsument**
- `/api/admin/search/reindex` — kein UI-Trigger
- Dokumente werden bei jedem Upload indexiert (`documents/route.ts:517,623`) → der Index
  füllt sich, **wird aber nie gelesen**
- Der Admin-Toggle „Meilisearch Volltextsuche" schreibt `meilisearch.enabled` —
  **kein `getConfigBoolean("meilisearch.enabled")` im ganzen Code.** Das Flag schaltet
  nichts, `/api/features` führt es nicht

### 9 · Command Palette sucht keine Entitäten
`api/quick-search/route.ts` sagt im Header explizit „Fast multi-entity search for the
Command Palette (Cmd+K)". `components/global/command-palette.tsx` (390 Zeilen) enthält
**kein einziges `fetch`** — es filtert nur die statische Navigationsliste.

**Sichtbar: ja** — Cmd+K, Parkname tippen, „Keine Ergebnisse".

### 10 · MassCommunication: Modell + API + Audit-Typ, kein UI
`schema.prisma:2010` `model MassCommunication`, volle CRUD-Route mit Audit-Log,
Audit-Entity-Typ, Permission `admin:mass-communication`, dynamischer Prisma-Accessor.

Kein UI: `/kommunikation/masse` leitet auf den unified Mailing-Wizard um, der
`/api/mailings` nutzt. Auch `/api/admin/mass-communication/preview` und `/api/batch/email`
haben keinen Aufrufer. **Kompletter vertikaler Stack tot.**

### 11 · Weitere API-Routen ohne UI-Aufrufer

Aus 549 Routes gefiltert, dynamische URL-Konstruktion gegengeprüft. Infra-Endpoints
(`/api/health/*`, `/api/metrics`, `/api/cron/*`, `/api/email/inbound`, n8n) ausgenommen.

| Route | Was fehlt |
|---|---|
| `/api/buchhaltung/ebilanz` | **E-Bilanz §5b EStG XBRL für ELSTER** — voll implementiert |
| `/api/buchhaltung/bundesanzeiger` | **§325 HGB Offenlegung XBRL** — voll implementiert |
| `/api/admin/persons/[id]/data-export` | **DSGVO Art. 15 Auskunft** — Compliance-Pflicht ohne Oberfläche |
| `/api/admin/verfahrensdokumentation` | **GoBD §145 Verfahrensdokumentation-Generator** |
| `/api/buchhaltung/bwa/multi-year` + `/export/excel` | Mehrjahres-BWA |
| `/api/buchhaltung/value-adjustments` | EWB/PWB — Header sagt „wird vom Anlagenspiegel und der Bilanz konsumiert"; **beide Seiten sind unerreichbar** |
| `/api/energy/analytics/degradation` | Degradationsanalyse + Wartungsempfehlungen |
| `/api/inbox/export/datev` | DATEV EXTF 510 Eingangsrechnungen |
| `/api/plots/[id]/split` · `/geometry` | Flurstücksteilung |
| `/api/documents/[id]/versions` | Versionshistorie |
| `/api/management-billing/stakeholders/[id]/fee-history` | Honorarhistorie |
| `/api/admin/{cache,storage,metrics,audit-logs/export,email/test,marketing-video}` | Admin-Tools ohne Button |
| `/api/batch/{documents,email,settlements}` | Batch-Operationen |
| `/api/admin/contracts/auto-renew` | passt zum offenen `TODO(auto-renewal)` in `contracts/route.ts:228` |

**P1** für die vier Compliance-Endpunkte, **P2** für den Rest.

### 12 · 42 Permissions werden nirgends geprüft

Ausgewertet inkl. Auflösung der `PERMISSIONS.*`-Konstanten — keine False Positives.

Der Accounting-Block ist der kritische: 15 fein granulierte Rechte, u. a.
`accounting:year-end-close:execute` (im Katalog sogar mit `requiresApproval: true`),
`accounting:gobd-export:create`, `accounting:datev-export:create`,
`accounting:period-lock:create/delete`, `accounting:journal:reverse`,
`accounting:report:{bilanz,susa,euer,gewst,kontoblatt,anlagenspiegel}`.

**Die Routen sind nicht ungeschützt** — sie nutzen die grobe Alternative:
`year-end-close:37` → `requireAdmin()` · `gobd-export:44` → `requireAdmin()` ·
`bilanz`/`susa`/`gewerbesteuer`/`ebilanz` → `requirePermission("accounting:read")` ·
`journal-entries/[id]/reverse:45` → `accounting:reverse` (nicht `accounting:journal:reverse`)

**Effekt:** Ein Admin vergibt im Rollen-Editor „GoBD Z3-Export erstellen" oder entzieht
„Jahresabschluss ausführen" — **es ändert nichts.** Sichtbare, aber wirkungslose
Stellschrauben. Kein Sicherheitsloch, aber der Katalog täuscht Granularität vor.

Weitere: `admin:impersonate`, `users:impersonate`, `admin:tenants`, `admin:billing-rules`,
`system:backup`, `system:audit`, `documents:download/export`, `mailings:send`,
`news:create/update/delete`, `service-events:*`, `portal:access/profile/energyReports`.

### 13 · `INBOUND_EMAIL_API_KEY` nirgends dokumentiert
`api/email/inbound/route.ts:56-58` — ohne den Key lehnt der Endpoint jede Mail ab
(fail-closed, korrekt). Der Key steht **weder in `.env.example` noch in einem der vier
Compose-Files.** Damit ist der E-Mail-Eingang out-of-the-box tot, obwohl `/inbox` und
`/admin/email-routes` beide in der Navigation stehen.

Gleiches für `CRON_BEARER_TOKEN` — ohne ihn wird der Basiszins nie geholt.

*Weitere undokumentierte, aber unkritische Vars (Defaults im Code):*
`BACKUP_PURGE_AFTER_DAYS`, `BACKUP_S3_SSE`, `DEMO_REQUEST_NOTIFY_EMAIL`, `DIGEST_DRY_RUN`,
`RETENTION_DRY_RUN`, `DWD_BASE_URL`, `OPENMETEO_*`, `SMARD_BASE_URL`, `MINIO_ENDPOINT`,
`TUS_*`, `FORCE_INSECURE_COOKIES`.

---

## P2 — Ballast, nicht user-sichtbar

**14 · `marketData.enabled` schaltet nichts** — sauber durchgereicht, aber **keine
Komponente wertet es aus**. `market-comparison.tsx:224` prüft `data.meta.marketDataAvailable`
aus der API-Antwort, nicht das Flag.

**15 · `weather.api.key`** — einziger von 51 Config-Keys, den niemand liest.

**16 · `report-live-preview.tsx:34-176`** zeigt Fantasiezahlen mit **echtem Parknamen**.
Bewusst so (dokumentiert: Struktur-Vorschau ohne teure Aggregation), aber die Kennzeichnung
besteht nur aus `tenantName="Vorschau"` — ein „Beispieldaten"-Wasserzeichen wäre die
10-Minuten-Absicherung.

**17 · Prisma-Enum-Werte ohne Erzeuger** — `ParkType.SOLAR`/`HYBRID` (kein UI erzeugt sie,
kein Label existiert → würde `SOLAR` roh anzeigen), `UStAdjustmentReason.PARTIAL_PAYMENT`.
Alle anderen Enum-Werte aller Schema-Enums sind belegt.

**18 · Widget-Titel-Fallback zeigt die Roh-ID** — `widget-renderer.tsx:172-180`,
`WIDGET_TITLE_KEYS` fehlen `admin-audit-log`, `admin-billing-jobs`,
`chart-park-comparison`. Alle drei sind real platzierbar.

---

## Geprüft und für lebendig/korrekt befunden

- **Leere Handler:** kein einziges `onClick={() => {}}`, kein `onClick` mit reinem
  `console.log`, **kein `console.log` überhaupt** im Produktionscode ✅
- **`href="#"`:** kommt nirgends vor. Die vier `href="/"` sind Logo- und Breadcrumb-Root ✅
- **Formulare:** alle drei `<form>` ohne `onSubmit` in derselben Zeile haben ihn in der
  Folgezeile (mehrzeilige Props). Kein Formular ohne Handler ✅
- **Deaktivierte Elemente:** alle 6 Fundstellen mit erkennbarem Grund ✅
- **Prisma-Modelle:** von 156 haben nur 6 keinen direkten Client-Zugriff; 5 davon sind
  nested-write-Relationen bzw. NextAuth-intern. Nur `MassCommunication` ist echt verwaist ✅
- **Config-Keys:** 50 von 51 werden gelesen ✅
- **Feature-Flags:** `crm`, `gis`, `inbox`, `paperless`, `accounting.*`,
  `document-routing`, `scada-uploader-v2`, `wirtschaftsplan`, `management-billing`,
  `communication` — alle mit verifizierten Konsumenten ✅
- **SCADA-Import-Kette:** `/energy/scada` mit vier Tabs voll erreichbar und aktiv. Der
  Produktionsdaten-Import läuft live über `production-import-sheet.tsx`. Nur die beiden
  alten Vollseiten sind tot ✅
- **`lastLoginAt`:** wird korrekt geschrieben und in `/settings` sowie `UserManagement`
  korrekt gelesen — der Bug ist ausschließlich das Portal ✅
- **Journal-DELETE:** korrekt auf `DRAFT` beschränkt mit Periodensperren-Gate ✅
- **`/api/email/inbound` und `/api/cron/*`:** fail-closed bei fehlendem Token — die
  Absicherung selbst ist richtig gebaut ✅
- **i18n-Gesamtbild:** von 8.988 Keys × 3 Sprachen sind exakt **32 Aufrufe ohne Ziel**,
  davon 31 im Dokumenten-Explorer. Alle drei Message-Files haben identische Key-Zahl —
  **es gibt keine Sprache mit Lücken gegenüber einer anderen.** Für ein Projekt dieser
  Größe außergewöhnlich gepflegt ✅

---

## Wenn eines zuerst

Findings **1–4** sind die einzigen, bei denen der User heute falsche Informationen bekommt
oder ins Leere klickt. Davon ist **Nr. 2** das gefährlichste — das Health-Widget meldet
„healthy", weil es die Status-API nicht erreicht, und arbeitet damit aktiv gegen seinen
eigenen Zweck.

**Finding 5** ist der größte reine Wertverlust: ~5.500 Zeilen fertige, größtenteils
compliance-relevante Buchhaltungs-Funktionalität, die nur ein paar Nav-Einträge von der
Nutzbarkeit entfernt ist.
