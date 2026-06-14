# UI-Redesign-Konzept WindparkManager — 2026-06

Drei Lenses kombiniert: **Emil Kowalski** (Detail-Polish), **impeccable** (Anti-Slop + Strategie), **design-taste-frontend** (metrische Härte). Ziel ist nicht ein Skin, sondern eine geschärfte Identität, die zur PRODUCT.md passt: *modern · präzise · zugänglich*, ohne in SaaS-Pastell, Excel-Friedhof oder Banking-Schwer zu kippen.

---

## 0. Strategische Vorentscheidungen

Vor allen Pixeln drei Festlegungen, die alles unten ableiten.

### 0.1 Color Strategy — "Restrained mit Navy-Verdichtung"

Impeccable kennt vier Stufen: *Restrained · Committed · Full Palette · Drenched*. Für Produkt-UI wie WPM ist **Restrained** die erwachsene Wahl:

- Tinted Neutrals als Surface (Hauch Navy-Stich, Chroma 0.005-0.015)
- **Ein Akzent** = Warm Navy, ≤10 % der Fläche
- Status-Farben (Success/Warning/Destructive) sind Funktional, nicht Brand
- Marketing-Landing darf später auf **Committed** kippen (Navy auf ~40 % der Fläche), wenn Hero erlaubt — Produkt bleibt Restrained

Das löst den Datenfriedhof: das Auge findet die Zahl, weil daneben nichts schreit.

### 0.2 OKLCH-Migration (Token-Layer, keine Komponenten-Berührung)

HSL hat das bekannte Problem ungleicher Wahrnehmungs-Helligkeit zwischen Hues — unser Navy `hsl(215 50% 40%)` wirkt deutlich dunkler als unser Success-Grün `hsl(142 55% 40%)` bei identischem L-Wert. OKLCH fixt das ohne Komponentenarbeit:

| Token | Heute (HSL) | Vorschlag (OKLCH) | Effekt |
|---|---|---|---|
| `--primary` light | `215 50% 40%` | `oklch(0.52 0.13 250)` | Identische Helligkeit zu Status-Tokens |
| `--primary` dark  | `215 55% 58%`  | `oklch(0.70 0.13 250)` | Symmetrisches Up-Shift, kein Hue-Drift |
| `--success` | `142 55% 40%` | `oklch(0.58 0.16 145)` | Wahrnehmungs-gleich zu Primary |
| `--background` light | `0 0% 100%`  | `oklch(0.995 0.003 250)` | Hauch Navy-Stich (Brand-Tinte) |

Migration ist ein einmaliger Token-Sweep in `globals.css` + Tailwind-`@theme`. Komponenten greifen weiter `hsl(var(--primary))`-frei über die abgeleiteten Tailwind-Klassen zu. ⚠ Browser-Support: Safari 15.4+, Chrome 111+ — für WPM-Zielgruppe unproblematisch.

### 0.3 Glasmorphismus — gezielt, nicht als Default

Die CLAUDE.md-Notiz *"Glasmorphismus-Theme (Personio-Style)"* schlägt frontal in Impeccables Absolute-Ban *"Glassmorphism as default"*. Vorschlag — **rare & purposeful**:

| Surface | Glass? | Begründung |
|---|---|---|
| Cards, Tables | **Nein** | Kontrast-Risiko, Datenfriedhof verschleiern statt strukturieren |
| Sticky-Header (gescrollt) | **Ja** | `backdrop-filter: blur(12px)`, opacity 0.85 — Hierarchie über Content |
| Sidebar | **Nein** | Lesbarkeit kritisch, Hover-Preview separat |
| Toast-Container | **Ja** | Schwebt über Content, Inhalt darunter muss erkennbar bleiben |
| Command Palette | **Ja** | Modal-Overlay-Charakter |
| Dashboard Hero-Bereich | **Optional** | Erst nach 0.4 + 0.6 entscheiden |

Damit ist Glasmorphismus drei isolierte Surfaces — keine Layer-Soße über alles. Das ist Personio-Style auf ehrlich, nicht Personio-Style copy-paste.

---

## 1. Typografie — fester, tabellarischer, ruhiger

### 1.1 Inter Var statt Inter

WPM nutzt aktuell Inter (Static). Inter Var hat:
- Echte optische Größen (`opsz`-Achse) — h1 wird wirklich anders gezeichnet als Body
- Tabular-Number-Toggle via `font-feature-settings: "tnum" 1, "cv11" 1` für Buchhaltung
- Geringere Bytes (1 Var-File vs. 4 Weights)

Single-line-Change in `next/font/google`. Lädt schneller, sieht erwachsener.

### 1.2 Currency-Typography schärfen

Die aktuelle Regel *"KPIs in `font-mono`"* (DESIGN-SYSTEM.md §3.3) ist die SaaS-Default-Lösung. Besser:

```css
.tabular-currency {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1, "ss01" 1, "cv11" 1;
  letter-spacing: -0.01em;
}
```

→ Inter mit Tabular-Numerals statt Mono. Liest sich wie Geld, nicht wie Code.

### 1.3 Heading-Skala mit echten Optical-Sizes

| Heute | Vorschlag | Rationale |
|---|---|---|
| `text-3xl font-bold tracking-tight` (h1) | `text-3xl font-semibold tracking-[-0.03em]` | Semibold + tighter Tracking liest premium, nicht laut (Emil) |
| `text-2xl font-semibold tracking-tight` (Card) | unverändert | OK |
| `text-sm font-medium` (Label) | `text-[13px] font-medium tracking-[0.005em]` | Mikro-Tracking gegen "AI-Label-Look" |

`text-wrap: balance` auf alle h1/h2 — gleiche Zeilenlängen ohne Layout-Risiko (Emil-Trope).

### 1.4 Display-Floor enforced

Impeccable: Display-Headings nie `clamp() max > 6rem`, nie `letter-spacing < -0.04em`. Marketing-Hero damit gedeckelt; Product-Pages haben das Problem nie.

---

## 2. Layout & Information-Density

### 2.1 Dashboard — Hierarchie statt Gleichberechtigung

**Heute:** 12 identische KPI-Karten im responsive Grid. Klassischer Hero-Metric-Template-Trope (impeccable Absolute Ban) und gleichzeitig Identical-Card-Grid (zweiter Ban).

**Neu:** 3-Zonen-Komposition

```
┌──────────────────────────────────────────────────────┐
│  Heute · 5 Tasks · Letztes Update vor 12 min        │   ← Ruhiges Eyebrow (EINMAL, nicht pro Section)
├────────────────────┬─────────────────────────────────┤
│  Kapital aktuell   │   Sparkline 12 Mt              │
│  4 281 932,40 €    │   ▁▂▂▃▅▆▆▅▆█                  │   ← Eine dominante KPI
│  +3,2 % vs. Q1     │                                 │
├──────────┬─────────┼─────────────────────────────────┤
│ 14 of-   │  6 of-  │   Ereignis-Feed                │
│ fene Rg. │ fene Mh.│   • 11:42 SEPA-Lauf freig...  │
│ Sek.-KPI │ Sek.-KPI│   • 10:08 Vertrag Müller...   │   ← Story statt Zahlen-Wand
├──────────┴─────────┼  • 09:14 SCADA-Upload...      │
│ 3 Genehmigungen    │   • 08:00 Monatslauf gestart...│
│ Wartung diese Woche│                                 │
└────────────────────┴─────────────────────────────────┘
```

KPI-Hardcoded-Hex (DESIGN-SYSTEM §2.5) wird gestrichen — die Sekundär-KPIs nutzen alle `text-foreground` + Trend-Pfeil. Die einzige Brand-Farbe ist der Sparkline-Stroke. Das ist *committed restraint*.

### 2.2 Sidebar — Active-Indikator + Connector-Lines

| Heute | Vorschlag |
|---|---|
| Active-Item: Background-Tint | Active-Item: 3 px Left-Stripe in Primary + leichter BG-Tint |
| Nested-Items: Indent + Border-Left grau | Nested: vertikale Connector-Line, gehakt wie Tree-View |
| Section-Headers: tracking-wider, uppercase | Section-Headers: normal-case, Muted-Foreground, optional Collapse |

Side-Stripe als 1 px Decoration ist Anti-Pattern; als 3 px Active-Marker auf Nav-Items ist es eine etablierte Konvention — der Unterschied liegt im *Zweck*.

### 2.3 Tabellen — die kritische Surface

Buchhaltung ist 60 % der Nutzungszeit. Drei Eingriffe:

1. **Sticky-Header + Sticky-First-Column** auf allen `min-w-[800px]`-Tables. Heute scrollt Header weg, Buchungs-Vergleich unmöglich.
2. **Zebra nur on hover**, nicht permanent. Permanente Zebra schlägt mit OKLCH-Tinted-BG zur visuellen Suppe zusammen.
3. **Status-Cells doppelt kodiert**: Icon + Text + Farbe. PRODUCT.md §A11y verlangt das, heute ist es uneinheitlich.

```tsx
<TableCell className="text-right tabular-currency">
  {amount < 0 ? `(${formatCurrency(Math.abs(amount))})` : formatCurrency(amount)}
</TableCell>
```

Negativ-Beträge in Klammern (DIN-EN 1862 / Buchhaltungs-Konvention) statt `-` mit roter Farbe.

### 2.4 Forms — Multi-Column auf md+

Aktuelle Forms (Tenant-Settings, Invoice-Edit) sind 1-spaltig vertikal. Auf 27-Zoll-Monitoren entsteht Schluchten-Whitespace. Lösung:

```tsx
<div className="grid gap-x-6 gap-y-4 md:grid-cols-2 lg:grid-cols-3">
  {/* Felder mit gruppen-spannenden Section-Headers */}
</div>
```

- Felder mit langem Label/Hint: `md:col-span-2`
- Sections: visuelles Trennen über Section-Header + 1 px Border-Top (nicht Card-in-Card)
- **Inline-Auto-Save-Indicator** rechts unten: `Gespeichert · vor 3 s` (Emil-Detail)

---

## 3. Motion — weniger, aber präziser

### 3.1 Reveal-Animationen ausdünnen

`globals.css` definiert `reveal-up`, `reveal-left`, `glow-pulse`, `draw-line`, `float`, `bounce-slow` — viele davon sind Marketing-Reveals, nicht Produkt-Motion. Impeccable warnt: *"reveal-animations must enhance an already-visible default"* — was heute nur halb gilt, weil viele Sections per Class-Trigger eingeblendet werden.

**Aufräumen:**
- Produkt-Pages: kein `reveal-*`, keine Staffel-Entries — Inhalt steht von Frame 1 sichtbar da
- Marketing-Landing: max 1 Reveal pro Section, mit echtem Inhalt (z.B. Counter, Chart-Draw)
- `float`, `bounce-slow`, `glow-pulse` → für Hero-Illustrationen reserviert, sonst aus

### 3.2 Page-Transitions — schnell, ruhig

`--duration-slow` (400 ms) für Page-Transitions ist zu viel für täglichen App-Wechsel. Vorschlag:

| Token | Heute | Vorschlag | Use-Case |
|---|---|---|---|
| `--duration-instant` | — | `100ms` | Page-Cross-Fade |
| `--duration-fast` | 150ms | unverändert | Hover, Color, Tooltip |
| `--duration-normal` | 250ms | unverändert | Sheet, Dialog, Collapse |
| `--duration-slow` | 400ms | nur für dekorative Loops | Skeleton-Sweep etc. |

### 3.3 Reduced-Motion-Path

Heute existiert kein expliziter Reduced-Motion-Override in `globals.css`. Pflicht:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0ms !important;
  }
}
```

Genau einmal, am Ende von `globals.css`. Schlanker als per-Animation-Override.

---

## 4. Components — gezielte Polish-Maßnahmen

### 4.1 Toast mit Undo-Action

Heute: 2 s Auto-Dismiss, kein Undo. Emil's Detail-Polish: jeder destruktive Toast bekommt Undo-Knopf für 5 s. Bei `toast.success("Rechnung gelöscht")` muss `toast({ description: "Rechnung gelöscht", action: { label: "Rückgängig", onClick: undo } })` möglich werden.

### 4.2 EmptyState mit Begründung

Heute: zentriertes Icon + "Keine Einträge". Neu: drei Pfade

- **Filter aktiv:** "Keine Treffer für *Status: Bezahlt*" + Link "Filter zurücksetzen"
- **Wirklich leer:** "Noch keine offenen Rechnungen. Das nächste Fälligkeitsdatum ist *2026-07-01*."
- **Neuer Tenant:** Onboarding-CTA mit echtem Next-Step, nicht generisches "Erste Rechnung anlegen"

### 4.3 ApprovalCard

4-Augen-Approvals werden heute als Tabellenzeilen gezeigt. Bessere Affordance:

```
┌──────────────────────────────────────────────────────┐
│ ●  Max Schmidt                       vor 3 Stunden   │
│    will SEPA-Lauf 2026-06 freigeben                  │
│    Betrag: 47 281,42 €                              │
│    ┌─────────────────────────────────────────────┐  │
│    │ Begründung: Monatslauf Juni, 14 Rechnungen │  │
│    └─────────────────────────────────────────────┘  │
│                                                      │
│    [Ablehnen]  [Details]   [Freigeben]              │
└──────────────────────────────────────────────────────┘
```

Avatar + Begründung + 3 Actions. Liest sich in 2 s, statt 4-Augen-Workflow wirkt menschlich, nicht bürokratisch.

### 4.4 AmountInput

Eigene Komponente für Geld-Eingaben:
- € als Suffix, right-aligned
- Komma + Tausender-Punkt erlaubt, beim Blur normalisiert
- Negativ entweder `-` oder `(123,45)` — beides akzeptiert
- Tab-Order: Direkt nach Eingabe zum nächsten Currency-Feld
- Optional: `Esc` setzt auf vorherigen Wert zurück (Emil-Detail)

---

## 5. Spezifische Surfaces

### 5.1 `/buchhaltung/reports` (GuV, BWA, SuSa)

Heute Tabelle. Bei GuV/BWA ist die "Financial Statement"-Form aus dem Steuerrecht etabliert — übernehmen:

- Zweispaltig: aktuelle Periode | Vorjahres-Periode
- Right-aligned Currency, tabular-Numerals
- Subtotalen mit Border-Top, Totale mit Border-Top-Double
- "Versteckte Hierarchie" über Indent (Materialaufwand → Lohnaufwand → Sozialaufwand…)

### 5.2 `/admin/permissions`

Permission-Matrix wächst stark (~125 Permissions × N Rollen). Heute: lange Tabelle.

Neu: 3-Pane-Layout
- Links: Rollen-Liste (mit Avatar-Initial + Permission-Count)
- Mitte: Matrix mit Sticky-Header & First-Col, Suche oben
- Rechts: Permission-Detail-Panel (Beschreibung, Module, Audit-Spuren)

### 5.3 `/buchhaltung/sepa`

Step-Through-Form heute. Stripper Wizard:
1. Auswahl der Rechnungen (Multi-Select mit Summary)
2. Bankkonto-Wahl + IBAN-Anzeige
3. Preview-XML
4. 4-Augen-Approval

Jede Step hat eigene URL (`/sepa/new/step-1`), Back-Button funktioniert nativ.

### 5.4 Sidebar-Hover-Preview (neue Idee)

Beim Hover über "Buchhaltung" in der Sidebar erscheint mit 200 ms Delay ein schwebendes Panel mit den 4 wichtigsten Sub-Items + Recent-Action. Spart 1 Klick im Workflow. Das ist Glass-Surface-Kandidat #3.

---

## 6. Was bleibt ungetauscht (bewusste No-Ops)

- Tailwind 4.2 + shadcn/ui — keine Lib-Migration, das Fundament passt
- 12-Spalten-Dashboard-Grid via `react-grid-layout` — Customizing-Story zu wertvoll
- 3-Locale-System (`de` / `de-personal` / `en`) — i18n-Architektur unangetastet
- Sidebar-Width 64 px collapsed / 256 px expanded — bewährt
- shadow-Stufen (sm/md/lg/xl/2xl) — passen zur OKLCH-Migration nahtlos

---

## 7. Roadmap-Vorschlag

| Welle | Aufwand | Reihenfolge | Quick-Win? |
|---|---|---|---|
| **R-1** OKLCH-Migration im Token-Layer | 4 h | Direkt nach Welle 6 | ✓ |
| **R-2** Currency-Typography (Tabular-Inter) | 2 h | parallel zu R-1 | ✓ |
| **R-3** Sidebar Active-Stripe + Connector-Lines | 3 h | nach R-1 | ✓ |
| **R-4** EmptyState mit 3 Pfaden (Komponente) | 4 h | nach R-3 | ✓ |
| **R-5** Reveal-Animation-Cleanup + Reduced-Motion | 2 h | parallel | ✓ |
| **R-6** Dashboard-Neukomposition (3-Zonen) | 8 h | Sprint-Item | – |
| **R-7** GuV/BWA Financial-Statement-Layout | 6 h | Sprint-Item | – |
| **R-8** ApprovalCard + AmountInput-Komponenten | 6 h | Sprint-Item | – |
| **R-9** Sidebar-Hover-Preview (Glass-Panel) | 4 h | Sprint-Item | – |
| **R-10** Permissions-3-Pane | 8 h | Sprint-Item | – |
| **R-11** SEPA-Wizard | 10 h | Sprint-Item | – |

**Quick-Wins (R-1 bis R-5):** zusammen ~15 h und sichtbar nach jedem Commit.
**Sprint-Items (R-6 bis R-11):** etwa eine Arbeitswoche, deutlich sichtbarer Sprung.

---

## 8. Was wir explizit NICHT machen

Aus Anti-Slop-Test:
- Keine cream/sand/beige Backgrounds — wir haben Navy als Anchor, das hält
- Keine Side-Stripes auf Cards/Alerts (3 px-Active-Marker auf Nav ist davon getrennt)
- Keine Gradient-Texte
- Keine durchgehende Glassmorph-Beschichtung — nur 3 spezifische Surfaces
- Kein Hero-Metric-Template auf Dashboard
- Keine "01 / 02 / 03"-Section-Numerierungen
- Keine Tracking-Eyebrows über jeder Section (das *eine* dezente "Heute" auf Dashboard ist Voice, nicht Default)
