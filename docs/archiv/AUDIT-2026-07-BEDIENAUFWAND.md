# Analyse: Bedienaufwand im Tagesgeschäft

> Stand 2026-07-29 · UX-Sicht, keine Bugfixes · 22 Befunde nach Nutzen-pro-Aufwand

---

## Tier 1 — Fertiges Backend, fehlende UI

Die billigsten Gewinne im ganzen Codebase: hier ist die Funktionalität **schon gebaut**
und wird nur nicht angebunden.

### 1 · Cmd+K findet keine Daten, obwohl die API dafür existiert
**Heute** `src/components/global/command-palette.tsx` durchsucht **ausschließlich
`nav-config.ts`** — Seitennamen, keine Datensätze. Gleichzeitig existiert
`src/app/api/quick-search/route.ts`, dessen Kopfkommentar wörtlich lautet:
*„Fast multi-entity search for the Command Palette (Cmd+K) — Searches Parks, Invoices,
Contacts, Contracts, Funds via Prisma ILIKE"*. **Die Route hat null Aufrufer.**
Ebenso `src/app/api/search/route.ts` (Meilisearch) — ebenfalls null Frontend-Aufrufer.

**Vorschlag** Vierte Sektion „Datensätze" mit debounced `fetch('/api/quick-search?q=…')`.
Die Route liefert bereits `{type, id, title, subtitle, href}` — direkt renderbar.
**Aufwand XS** (~40 Zeilen) · **Nutzen sehr hoch** — ersetzt bei fast jeder Suche 4–6
Klicks durch einen Tastendruck. Der mit Abstand beste Deal.

### 2 · Listen sind still bei 100 Zeilen abgeschnitten — und die Suche sucht nur darin
**Heute** `invoices/page.tsx:180` — `// TODO: Pagination UI hinzufügen`, danach
`limit: PAGE_SIZE_BULK_LIST` (=200). Die API klemmt aber auf 100
(`src/lib/api-utils.ts:107`). **Keine Pagination-UI, kein Hinweis** dass abgeschnitten
wurde. Die Suchbox filtert danach nur clientseitig über die geladenen Zeilen
(`:225-235`) — `/api/invoices` kennt **überhaupt keinen `search`-Parameter**.
Gleiches Muster in `contracts/page.tsx:125`, `leases/page.tsx:126`, `vendors/page.tsx:271`.

**Vorschlag** `search`-Param serverseitig (Contracts hat ihn schon,
`api/contracts/route.ts:70`), Suche debounced an die API, simple Prev/Next-Leiste.
Minimalvariante bis dahin: Banner „Zeigt die 100 neuesten von 1.240 — bitte filtern".
**Aufwand M** · **Nutzen sehr hoch** — die Suche ist aktuell *falsch*, nicht nur langsam:
sie meldet „nichts gefunden" für existierende Belege.

### 3 · Rechnungsliste ohne Gesellschafts- und Zeitraumfilter — obwohl die API beides kann
**Heute** `invoices/page.tsx:565-595` bietet zwei Filter: Typ und Status.
`api/invoices/route.ts:75-77` unterstützt bereits `fundId`, `parkId`, `leaseId`. Der
Verwalter exportiert stattdessen CSV und filtert in Excel.
**Aufwand XS** (Frontend) · **Nutzen hoch** — bei mehreren Gesellschaften der
Standardeinstieg.

### 4 · KPI-Karten sehen klickbar aus, sind es aber nirgends
**Heute** `src/components/ui/stats-cards.tsx` hat **kein `onClick`/`href` in den Props** —
in 15 Listenseiten. Nach „3 Verträge laufen aus" muss man das Status-Dropdown selbst
setzen.
**Aufwand XS** · **Nutzen hoch**, weil es 15 Seiten auf einmal betrifft. 3 Klicks → 1.

### 5 · Approval-Karte verlinkt den zu genehmigenden Beleg nicht
**Heute** `approvals/page.tsx` lädt `entityType` und `entityId` (`:54-56`), reicht sie aber
nicht an `ApprovalCard` weiter — `src/components/ui/approval-card.tsx:46-66` hat **keine
href/entity-Prop**. Der Genehmiger sieht nur „Max Schmidt will JOURNAL_POST freigeben ·
50.000 €" und muss **blind zustimmen** oder in einem zweiten Tab suchen. Zusätzlich keine
Sammelfreigabe.
**Aufwand XS** (Link) / **S** (Bulk) · **Nutzen hoch** — ohne Link ist die Freigabe
entweder Blindzustimmung oder ein 6-Klick-Umweg pro Vorgang.

### 6 · Eingangsrechnung: kein PDF neben den OCR-Feldern
**Heute** `inbox/[id]/page.tsx:307` — Kommentar `{/* Left: PDF preview + field editor */}`,
das 2-Spalten-Layout steht schon. Gerendert wird aber nur ein Download-Link (`:320-325`).
Es gibt **kein einziges PDF-Embed in der App**. Prüfen heißt: neuer Tab, Alt-Tab hin,
Alt-Tab her, pro Feld.
**Vorschlag** `<object data={fileUrl} type="application/pdf" className="h-[70vh] w-full">`
in die reservierte Spalte.
**Aufwand XS** · **Nutzen hoch** — halbiert die Prüfzeit pro Beleg.

---

## Tier 2 — Wiederholte Handarbeit

### 7 · Buchungssatz: Kontonummer *und* Kontenname werden getippt
**Heute** `journal-entries/page.tsx:346-364` — beide Felder sind rohe `<Input>` ohne
Anbindung. `GET /api/buchhaltung/accounts` existiert und wird nur von
`admin/kontenrahmen` genutzt. Der Buchhalter tippt pro Zeile die Kontonummer *und*
schreibt den Namen ab, mit Tippfehlerrisiko das kein Validator abfängt.

Zusätzlich: `JournalLine` trägt `taxKey` und `costCenter` (`:66-67`), der Payload sendet
sie (`:208-209`) — **im Dialog gibt es dafür kein Eingabefeld.** Steuerschlüssel sind
gar nicht erfassbar.

**Aufwand S** (Autocomplete) / **M** (mit Spalten + Restbetrag-Vorbelegung)
**Nutzen sehr hoch** — die am häufigsten wiederholte Eingabe der ganzen Anwendung.

### 8 · Keine Buchungsvorlagen, kein „Buchung duplizieren"
**Heute** Kein Treffer für `BookingTemplate` im Repo. Jede wiederkehrende Buchung wird neu
getippt. Zum Vergleich: `wirtschaftsplan/budget/new/page.tsx:49` kann per
`duplicateFromId` ein Vorjahr duplizieren, `InvoiceTemplateSettings.tsx:107` dupliziert
Rechnungsvorlagen. **Das Muster ist da — im Journal fehlt es.**
**Aufwand S** (Duplizieren) / **M** (benannte Vorlagen) · **Nutzen hoch**

### 9 · „Rechnung duplizieren" fehlt
**Heute** `invoices/[id]/page.tsx` bietet Bearbeiten, Stornieren, PDF, XRechnung, Zahlung,
Korrektur — **kein Duplizieren**. `RecurringInvoicesManager` deckt nur echte Serien ab,
nicht den „so wie letztes Mal, aber anders"-Fall.
**Aufwand S** · **Nutzen hoch**

### 10 · Dokument-Upload nimmt nur eine Datei pro Durchgang
**Heute** `documents/upload/page.tsx:228` — `const file = e.target.files?.[0]`.
20 Verträge = 20 × (Datei → Kategorie → Park → Fund → Tags → Speichern) ≈ **120
Interaktionen**. Dabei existiert `src/components/ui/file-upload-dropzone.tsx` mit
`maxFiles` und wird im Inbox bereits genutzt.
**Aufwand S** · **Nutzen hoch** — 120 Interaktionen → ~10

### 11 · Rechnungsempfänger wird nicht mit dem CRM-Kontakt verknüpft
**Heute** `src/components/invoices/RecipientSearchDialog.tsx:41-45` — `RecipientSelection`
enthält nur `recipientType`, `recipientName`, `recipientAddress`. **Keine `personId`.**
Die Adresse wird als String übergeben und in `invoices/new/page.tsx:211-231` per
`split("\n")` und Hausnummern-Regex wieder zerlegt — Adressen mit „Am Hang 12a" oder
zweizeiligem Zusatz gehen dabei kaputt.
**Aufwand M** · **Nutzen hoch** — schaltet Kontakt-360°-Sicht frei und behebt nebenbei
stille Adressfehler

### 12 · Kein Kontext-Prefill für neue Rechnungen
**Heute** `invoices/new/page.tsx:86` liest **nur** `?type=`. Alle vier Links auf die Seite
übergeben keinerlei Kontext. Von Pachtvertrag, Vertrag, Fund oder Park gibt es **gar
keinen** Einstieg „Rechnung erstellen". Zum Vergleich: `documents/upload/page.tsx:91-92`
liest `?parkId=`/`?fundId=` und belegt vor — das Muster ist etabliert, nur nicht angewandt.
**Aufwand S** · **Nutzen hoch** — spart 3 Auswahlfelder und verhindert Falschzuordnung

---

## Tier 3 — Navigation & Übersicht

### 13 · Pachtvertrag-Detail zeigt weder Zahlungen noch Abrechnungen
**Heute** `leases/[id]/page.tsx` (600 Z.) hat Karten für Flurstücke, Verpächter, Laufzeit,
Konditionen, Notizen, Aktivitäten, Upload — **nichts zu Zahlungen**. Man muss nach
`/leases/payments` wechseln — und diese Seite kennt **kein `?leaseId=`** (`:371-396`).
Also: Park raten, Liste durchscrollen.
**Aufwand S** (Param) / **M** (Karte) · **Nutzen hoch** — häufigste Rückfrage von
Grundstückseigentümern

### 14 · Von der Rechnung kein Weg zum Pachtvertrag oder Gesellschafter
**Heute** `invoices/[id]/page.tsx:169` deklariert `lease: { id: string } | null` — das Feld
wird **geladen und nie gerendert**. Verlinkt sind nur Park (`:888`) und Fund (`:935`).
**Aufwand XS** — der Datenzugriff steht schon · **Nutzen mittel-hoch**

### 15 · Filter und Tabs vergessen sich zwischen Seitenwechseln
**Heute** `usePersistedTableState` existiert, wird aber **nur in 3 Dateien** genutzt
(inbox, invoices, leases). Nicht in contracts, crm/contacts, journal-entries, parks,
vendors, funds, service-events. Analog bei Tabs: die Hubs synchronisieren `?tab=` (14
Seiten), die Detailseiten nicht — `crm/contacts/[id]/page.tsx:295` nutzt
`<Tabs defaultValue="overview">`, der Dokumente-Tab ist also nicht verlinkbar.
**22 Seiten mit `defaultValue`.**
**Aufwand XS pro Seite** · **Nutzen mittel-hoch** über sehr viele Seiten

### 16 · Gespeicherte Filter gibt es — auf genau einer Seite
**Heute** `src/hooks/useSavedFilters.ts` + `src/components/ui/saved-filter-picker.tsx`
sind generisch pro „surface" gebaut, inkl. Backend. Einziger Nutzer:
`admin/audit-logs/page.tsx` — ausgerechnet die Seite, die Buchhalter am seltensten sehen.
**Aufwand S** (zusammen mit Punkt 3 umsetzen) · **Nutzen mittel-hoch**

---

## Tier 4 — Dateneingabe

### 17 · Beträge: deutsche Notation fällt still auf 0
**Heute** 235 Vorkommen von `type="number"`. In `invoices/new/page.tsx:578-584`:
`parseFloat(e.target.value) || 0`. Beim Einfügen von „1.234,56" liefert das Number-Input
einen leeren Wert → **die Position wird stillschweigend 0,00 €**, ohne Fehlermeldung.

Inkonsequent: `journal-entries/page.tsx:98` hat ein korrektes `parseAmount(s)` mit
Komma-Behandlung, und `production-import-sheet.tsx:125` sowie `ocr/invoice-extractor.ts:32`
haben je ein eigenes `parseGermanNumber` — **drei Implementierungen, keine davon in den
Formularen.**
**Aufwand S** (Komponente) / **M** (Ausrollen) · **Nutzen hoch** — stille Nullwerte in
Rechnungen sind ein Fehlerrisiko, nicht nur lästig

### 18 · Keine Zeitraum-Schnellauswahl, keine Fälligkeits-Presets
**Heute** 87 rohe `<Input type="date">`. **Keine `DateRangePicker`-Komponente im Repo**,
kein einziges Preset. In `buchhaltung/kontoblatt/page.tsx:136-140` werden Von/Bis einzeln
getippt. Zusätzlich inkonsistent: 10 Seiten nutzen den Popover-`ui/calendar`, der Rest
rohe Date-Inputs.
**Aufwand M** · **Nutzen hoch** in der Buchhaltung, wo Zeiträume der Haupteinstieg jeder
Auswertung sind

### 19 · Auswahllisten ohne Suchfeld
**Heute** 159 Dateien nutzen Radix-`Select` — nur Erst-Buchstaben-Typeahead, kein
Suchfeld. Eine `Combobox` existiert **nicht**; `cmdk` ist installiert, wird aber
ausschließlich in `command-palette.tsx` verwendet. Bei 200 Flurstücken heißt das: scrollen.
**Aufwand M** · **Nutzen mittel-hoch**, wächst mit der Datenmenge

---

## Tier 5 — Sicherheitsnetze

### 20 · Ungespeicherte Formulare gehen ohne Warnung verloren
**Heute** Repo-weit **kein einziges** `beforeunload`, kein Router-Blocker, kein
Draft/Autosave. Der einzige `isDirty`-Treffer (`admin/roles/page.tsx:149`) dient nur dazu,
den Speichern-Button zu aktivieren.

Betroffen: `invoices/new` (898 Z.), `leases/new` (1687 Z., 4-stufiger Wizard),
`contracts/new`, der Journal-Dialog. **Beim Pacht-Wizard bedeutet ein F5 auf Schritt 4:
alles weg.**
**Aufwand S** (Hook + große Formulare) · **Nutzen hoch** — passiert bei Formularen dieser
Länge zwangsläufig

### 21 · Pacht-Wizard erzeugt bei Teilfehlern Dubletten
**Heute** `leases/new/page.tsx:321-436` feuert nacheinander `POST /api/persons` → n×
`POST /api/plots` → `POST /api/leases`. Schlägt der letzte fehl, sind Person und
Flurstücke **bereits angelegt**; die Fehlermeldung sagt das nicht. Wer erneut speichert,
legt sie ein zweites Mal an. Kein Rollback, keine Idempotenz.
**Aufwand M** · **Nutzen mittel-hoch** — Stammdaten-Dubletten tauchen später in
Abrechnungen wieder auf

### 22 · Kontakte und Lieferanten exportierbar, aber nicht importierbar
**Heute** Import gibt es für SHP, Bank, Energie, GIS, SCADA-Codes. **Kein CSV-Import für
Personen, Kontakte, Lieferanten, Verträge oder Buchungen.** Export dagegen in 18 Listen.
**Vorschlag** Generischer CSV-Assistent mit Spalten-Mapping. Das Muster ist fertig:
`production-import-sheet.tsx` (Stepper, Mapping, Preview) — nur an ein anderes Zielobjekt
gehängt.
**Aufwand M** (Wiederverwendung statt L) · **Nutzen punktuell sehr hoch** (Onboarding),
im Alltag niedriger

---

## Was schon gut gelöst ist — bitte nicht „verbessern"

- **Rechnungsformular** — Empfängersuche und Positionsvorlagen sind da und sinnvoll
  platziert ✅
- **Rechnungsliste** — die reichste Seite der App: 6 Massenaktionen, sortierbare Spalten,
  Inline-Status via `EditableCell`, persistente Filter, Skonto-Ampel, DATEV-Export,
  Vorschaudialog. **Der Referenzstandard, an dem sich die anderen Listen messen sollten** ✅
- **Dashboard „Heute"** — `today-focus-widget.tsx` aggregiert Approvals, überfällige
  Mahnungen, Inbox und ablaufende Verträge über einen einzigen Call. Die Frage „was muss
  ich heute tun" ist beantwortet ✅
- **Mahnlauf** — echter Stapelversand mit Erfolgs-/Fehlerzählung ✅
- **Vier-Augen-Prinzip** — Schwelle aus `TenantSettings`, Vorwarnung *im* Buchungsdialog
  bevor gebucht wird, 202-Response korrekt behandelt. Nur der Beleg-Link fehlt (Punkt 5) ✅
- **Massenkommunikation** — `RecipientFilterForm` mit Empfängerzahl und Beispielvorschau
  vor dem Versand. Vorbildliche Vorschau vor irreversibler Aktion ✅
- **Inline-Bearbeitung** — `EditableCell` in 10 Listen ✅
- **Löschen** — `DeleteConfirmDialog` in 29 Dateien, konsistent ✅
- **Wizards** — `ui/stepper` in 13 Flows einheitlich ✅
- **Drill-Down in der Energie-Analytik** — Jahr → Monat → Tag → Anlage mit Breadcrumb.
  Genau dieses Muster fehlt anderswo (Punkt 4) ✅

---

## Empfohlene Reihenfolge

**Erste Runde — ca. 1–2 Tage, alles XS/S:**
Punkte **1** (Cmd+K an quick-search), **4** (klickbare KPI-Karten), **5** (Approval-Link),
**6** (PDF-Embed Inbox), **14** (Rechnung → Vertrag/Gesellschafter), **3**
(Rechnungsfilter).

Sechs Eingriffe von zusammen wenigen hundert Zeilen — **vier davon aktivieren nur, was
schon gebaut ist.**

**Zweite Runde — die Punkte mit Korrektheitsanteil, nicht nur Komfort:**
**2** (echte Suche/Pagination), **7** (Kontenautocomplete), **20** (Verlustschutz),
**17** (Betragseingabe).
