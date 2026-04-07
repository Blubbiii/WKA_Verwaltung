# WindparkManager Design System

> Version 1.0 | Stand: April 2026
> Technische Basis: Next.js 16, React 19, Tailwind CSS 4.2, shadcn/ui (Radix v2)

---

## 1. Grundprinzipien

### Zielgruppe
WindparkManager richtet sich an **Betreibergesellschaften, Gesellschafter und Geschaeftsfuehrer** im Bereich erneuerbare Energien. Die Zielgruppe ist **30-65 Jahre**, wobei vor allem juengere Mitarbeiter (30-45) taeglich mit der Software arbeiten. Die UI muss intuitiv, uebersichtlich und vertrauenswuerdig wirken.

### Design-Philosophie
1. **Klarheit vor Aesthetik** — Daten muessen sofort erfassbar sein
2. **Konsistenz** — Gleiche Aktionen sehen ueberall gleich aus
3. **Progressive Disclosure** — Wenig auf den ersten Blick, Details on demand
4. **Responsive First** — Desktop (1920px), Laptop (1280px), Tablet (768px), Handy (375px)
5. **Barrierefreiheit** — WCAG 2.1 AA als Mindeststandard

### Markenidentitaet
- **Name:** WindparkManager (WPM)
- **Brand Color:** Warm Navy — `hsl(215, 50%, 40%)` / `#335E99`
- **Charakter:** Professionell, zuverlaessig, modern aber nicht verspielt
- **Kein Teal/Tuerkis** — bewusste Designentscheidung

---

## 2. Farben

### 2.1 Brand-Farben

| Token | Light Mode | Dark Mode | Hex (Light) | Verwendung |
|-------|-----------|-----------|-------------|------------|
| `--primary` | `215 50% 40%` | `215 55% 58%` | #335E99 | Buttons, Links, Akzente |
| `--primary-foreground` | `0 0% 100%` | `0 0% 100%` | #FFFFFF | Text auf Primary |

### 2.2 Semantische Farben

| Token | Wert (Light) | Hex | Verwendung |
|-------|-------------|-----|------------|
| `--success` | `142 55% 40%` | #2D9F4F | Erfolg, aktive Status |
| `--warning` | `38 92% 50%` | #F5A623 | Warnungen, auslaufend |
| `--destructive` | `0 84.2% 60.2%` | #EF4444 | Fehler, loeschen |
| `--info` | `215 50% 40%` | #335E99 | Informationen (=Primary) |

### 2.3 Neutrale Farben

| Token | Wert (Light) | Verwendung |
|-------|-------------|------------|
| `--background` | `0 0% 100%` | Seitenhintergrund |
| `--foreground` | `222.2 84% 4.9%` | Haupttext |
| `--muted` | `210 40% 96.1%` | Subtile Hintergruende |
| `--muted-foreground` | `215.4 16.3% 46.9%` | Sekundaertext, Labels |
| `--border` | `214.3 31.8% 91.4%` | Raender, Trennlinien |
| `--card` | `0 0% 100%` | Card-Hintergrund |
| `--accent` | `210 40% 96.1%` | Hover-Zustaende |

### 2.4 Chart-Farben (12er Palette)

| Token | Farbe | Verwendung |
|-------|-------|------------|
| `--chart-1` | Navy | Primaerwert |
| `--chart-2` | Orange | Sekundaer |
| `--chart-3` | Gruen | Teriaer |
| `--chart-4` | Blau | Quartaer |
| `--chart-5` | Rot | Negativ/Warnung |
| `--chart-6` | Petrol | Ergaenzend |
| `--chart-7` | Rose | Ergaenzend |
| `--chart-8` | Himmelblau | Ergaenzend |
| `--chart-9` | Koralle | Ergaenzend |
| `--chart-10` | Lila | Ergaenzend |
| `--chart-11` | Mint | Ergaenzend |
| `--chart-12` | Pink | Ergaenzend |

**Nutzung in Code:**
```tsx
const color = "hsl(var(--chart-1))";  // Immer ueber CSS-Variable
```

### 2.5 KPI-Widget Farben (Hardcoded)

| Widget | Hex | Kontext |
|--------|-----|---------|
| Parks | `#0891b2` | Cyan |
| Turbinen | `#475569` | Slate |
| Gesellschafter | `#7c3aed` | Violet |
| Kapital | `#059669` | Emerald |
| Offene Rechnungen | `#d97706` | Amber |
| Vertraege | `#ea580c` | Orange |
| Dokumente | `#db2777` | Pink |
| Abstimmungen | `#4f46e5` | Indigo |
| Energieertrag | `#65a30d` | Lime |
| Verfuegbarkeit | `#16a34a` | Gruen |
| Windgeschwindigkeit | `#0284c7` | Sky |
| Pachteinnahmen | `#e11d48` | Rose |

---

## 3. Typografie

### 3.1 Font-Stack

| Typ | Fonts |
|-----|-------|
| **Sans (Standard)** | -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif |
| **Mono** | ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, monospace |
| **Serif** | Georgia, "Times New Roman", serif |

### 3.2 Heading-Skala

| Element | Klassen | Groesse | Verwendung |
|---------|---------|---------|------------|
| Page Title | `text-xl sm:text-2xl md:text-3xl font-bold tracking-tight` | 20-30px | Seitentitel in PageHeader |
| Card Title | `text-2xl font-semibold leading-none tracking-tight` | 24px | Card-Ueberschriften |
| Section Title | `text-lg font-semibold tracking-tight` | 18px | Sektionen, EmptyState |
| Label | `text-sm font-medium` | 14px | Formular-Labels, Stats |
| KPI Value | `text-2xl font-bold tracking-tight font-mono` | 24px | Zahlen in Stats-Cards |
| Badge | `text-xs font-semibold` | 12px | Status-Badges |
| Body | `text-sm` | 14px | Standard-Fliesstext |
| Caption | `text-xs text-muted-foreground` | 12px | Hilfstexte, Timestamps |

### 3.3 Regeln
- **Seitentitel** immer `h1` mit `tracking-tight`
- **Zahlen** in KPI-Karten verwenden `font-mono` fuer tabellarische Ausrichtung
- **Kein manuelles Setzen von `font-size`** — immer Tailwind-Klassen verwenden

---

## 4. Spacing & Layout

### 4.1 Abstandsskala (Tailwind Standard)

| Token | Pixel | Verwendung |
|-------|-------|------------|
| `gap-1` / `p-1` | 4px | Minimaler Abstand (Icons) |
| `gap-2` / `p-2` | 8px | Enge Elemente (Button-Gruppen) |
| `gap-3` / `p-3` | 12px | Standard-Abstand |
| `gap-4` / `p-4` | 16px | Card-Inhalte, Formulare |
| `gap-6` / `p-6` | 24px | Card-Padding, Sektionen |
| `space-y-4` | 16px | Vertikaler Abstand zwischen Bloecken |
| `space-y-6` | 24px | Grosser vertikaler Abstand |

### 4.2 Seiten-Layout

```
+------------------------------------------------------------------+
| Header (h-16, border-b, px-3 sm:px-4 md:px-6)                   |
+--------+---------------------------------------------------------+
| Sidebar | Main Content Area                                      |
| (w-64)  | (flex-1, overflow-y-auto, bg-muted/30)                 |
| hidden  | padding: p-3 sm:p-4 md:p-6                             |
| md:block|                                                         |
|         | +-----------------------------------------------------+ |
|         | | Breadcrumb                                           | |
|         | +-----------------------------------------------------+ |
|         | | PageHeader (title + actions)                         | |
|         | +-----------------------------------------------------+ |
|         | | StatsCards (grid)                                    | |
|         | +-----------------------------------------------------+ |
|         | | SearchFilter                                         | |
|         | +-----------------------------------------------------+ |
|         | | Table / Content                                      | |
|         | +-----------------------------------------------------+ |
|         | | Footer                                               | |
|         | +-----------------------------------------------------+ |
+---------+---------------------------------------------------------+
| BatchActionBar (fixed bottom, z-50, bei Selektion)                |
+-------------------------------------------------------------------+
```

### 4.3 Grid-System

| Spalten | Klassen | Verwendung |
|---------|---------|------------|
| 2 | `grid-cols-2` | KPI-Karten (mobil) |
| 3 | `grid-cols-1 sm:grid-cols-2 md:grid-cols-3` | KPI mit 3 Werten |
| 4 | `grid-cols-2 md:grid-cols-4` | Standard KPI-Grid |
| 12 | Dashboard react-grid-layout | Widget-Grid (rowHeight: 100px) |

### 4.4 Responsive Breakpoints

| Breakpoint | Pixel | Geraet | Sidebar |
|------------|-------|--------|---------|
| Default | <640px | Handy | Sheet-Drawer |
| `sm:` | 640px | Grosses Handy | Sheet-Drawer |
| `md:` | 768px | Tablet | Sichtbar |
| `lg:` | 1024px | Laptop | Sichtbar |
| `xl:` | 1280px | Desktop | Sichtbar |

---

## 5. Schatten & Elevation

### 5.1 Schattenstufen

| Stufe | Klasse | Verwendung |
|-------|--------|------------|
| 0 | Kein Schatten | Flache Elemente, Inputs |
| 1 | `shadow-sm` | Cards, Buttons (Standard) |
| 2 | `shadow-md` | Hover-Zustand, aktive Cards |
| 3 | `shadow-lg` | Dropdowns, Sheets, BatchActionBar |
| 4 | `shadow-xl` | Modale Dialoge |
| 5 | `shadow-2xl` | Command Palette, Overlay-Dialoge |

### 5.2 Regeln
- **Cards** starten mit `shadow-sm`, werden bei Hover zu `shadow-md`
- **Floating Elements** (Dropdowns, Popovers) verwenden `shadow-lg`
- **Modale** verwenden `shadow-xl` oder `shadow-2xl`
- **Uebergaenge:** Immer `transition-shadow duration-200`

---

## 6. Animationen & Motion

### 6.1 Dauer-Tokens

| Token | Wert | Verwendung |
|-------|------|------------|
| `--duration-fast` | 150ms | Hover, Farbwechsel |
| `--duration-normal` | 250ms | Standard-Transitionen |
| `--duration-slow` | 400ms | Seitenuebergaenge |

### 6.2 Easing-Funktionen

| Name | Wert | Verwendung |
|------|------|------------|
| ease-out | Standard | Elemente die eintreten |
| ease-in-out | Standard | Zyklische Animationen |
| `--ease-out-expo` | `cubic-bezier(0.16, 1, 0.3, 1)` | Dramatische Exits |
| spring | `stiffness: 300, damping: 15-20` | Framer Motion Eintraege |

### 6.3 Animations-Patterns

| Pattern | Animation | Dauer | Verwendung |
|---------|-----------|-------|------------|
| **Fade In** | opacity 0→1, y 4px→0 | 150ms | Standard-Eintritt |
| **Slide In** | x 100%→0 | 300ms | Sheet/Drawer |
| **Scale In** | scale 0.95→1, opacity | 200ms | Modale, Dropdowns |
| **Shimmer** | Gradient-Sweep | 2.5s infinite | Skeleton-Loader |
| **Float** | y ±10px | 6s infinite | Hero-Illustrationen |
| **Stagger** | 50ms Delay pro Item | variabel | Listen, Stats-Cards |

### 6.4 Regeln
- **Buttons/Links**: `transition-colors duration-150` (immer)
- **Cards**: `transition-shadow duration-200`
- **Skeleton-Rows**: Stagger-Delay `i * 50ms`
- **Stats-Cards**: Stagger-Delay `i * 100ms`
- **Button Active**: `active:scale-[0.98]` (subtiler Press-Effekt)
- **Keine Animation >500ms** ausser dekorative Loops

---

## 7. Komponenten-Bibliothek

### 7.1 Buttons

**Varianten:**

| Variante | Klasse | Verwendung |
|----------|--------|------------|
| `default` | Navy-Hintergrund, weisser Text | Primaere Aktionen |
| `destructive` | Roter Hintergrund | Loeschen, Stornieren |
| `outline` | Rahmen, kein Hintergrund | Sekundaere Aktionen |
| `secondary` | Grauer Hintergrund | Teriaere Aktionen |
| `ghost` | Kein Hintergrund, Hover-Effekt | Toolbar-Icons |
| `link` | Unterstrichener Text | Inline-Links |
| `success` | Gruener Hintergrund | Bestaetigen, Aktivieren |
| `warning` | Gelber Hintergrund | Achtung-Aktionen |

**Groessen:**

| Groesse | Klasse | Hoehe | Verwendung |
|---------|--------|-------|------------|
| `sm` | `h-9 px-3` | 36px | Tabellen-Aktionen, kompakt |
| `default` | `h-10 px-4 py-2` | 40px | Standard |
| `lg` | `h-11 px-8` | 44px | Hero-CTAs, prominente Aktionen |
| `icon` | `h-10 w-10` | 40x40px | Icon-Only Buttons |

**Spezialvarianten:**
- `LoadingButton` — Spinner + optionaler `loadingText`
- `asChild` — Rendert als Link (`<a>`) via Radix Slot

### 7.2 Badges

| Variante | Farbe | Verwendung |
|----------|-------|------------|
| `default` | Primary/Navy | Standard-Tags |
| `secondary` | Grau | Neutrale Tags |
| `destructive` | Rot | Fehler, storniert |
| `outline` | Rahmen | Subtile Tags |
| `success` | Gruen (emerald) | Aktiv, bezahlt |
| `warning` | Gelb (amber) | Auslaufend, Warnung |

**Status-Mapping:**
```
ACTIVE    → success
DRAFT     → outline
SENT      → default
PAID      → success
CANCELLED → destructive
EXPIRED   → warning
ARCHIVED  → secondary
```

### 7.3 Cards

**Aufbau:**
```tsx
<Card>                    // rounded-lg border shadow-sm
  <CardHeader>            // p-6, flex-col space-y-1.5
    <CardTitle />         // text-2xl font-semibold
    <CardDescription />   // text-sm text-muted-foreground
  </CardHeader>
  <CardContent>           // p-6 pt-0
    {/* Inhalt */}
  </CardContent>
  <CardFooter>            // flex items-center p-6 pt-0
    {/* Aktionen */}
  </CardFooter>
</Card>
```

**Varianten:**
- **Standard Card** — `shadow-sm`, statisch
- **Interactive Card** — `hover:shadow-md`, `translateY(-1px)`, cursor-pointer
- **Stats Card** — `border-l-4 border-l-primary/20`, Gradient-Hintergrund
- **Feature Card** — `border-l-[3px] border-l-primary`, groesserer Hover-Effekt

### 7.4 Tabellen

**Struktur:**
```tsx
<div className="rounded-md border overflow-x-auto">
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead className="w-12">  {/* Checkbox */}
        <TableHead>Name</TableHead>
        <TableHead>Status</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell>...</TableCell>
      </TableRow>
    </TableBody>
  </Table>
</div>
```

**Zeilen-Styling:**
- Default: `border-b border-l-2 border-l-transparent`
- Hover: `hover:bg-muted/50 hover:border-l-primary/40`
- Selektiert: `data-[state=selected]:bg-muted`
- Alternierend: `even:bg-muted/30`

**Sticky Header:** `position: sticky; top: 0; z-index: 10; backdrop-filter: blur(4px)`

**Filter-Feedback:** `transition-opacity` + `opacity-50 pointer-events-none` bei Re-Fetch

### 7.5 Formulare

**Stack:** react-hook-form + Zod + Radix UI Primitives

**Standard-Pattern:**
```tsx
<Form {...form}>
  <FormField control={form.control} name="fieldName"
    render={({ field }) => (
      <FormItem>
        <FormLabel>Bezeichnung</FormLabel>
        <FormControl>
          <Input placeholder="Platzhalter..." {...field} />
        </FormControl>
        <FormDescription>Hilfetext</FormDescription>
        <FormMessage />  {/* Validierungsfehler */}
      </FormItem>
    )}
  />
</Form>
```

**Input-Komponenten:**
- `Input` — Textfelder (`h-10`, `rounded-md`)
- `Textarea` — Mehrzeilige Eingabe (`min-h-[80px]`)
- `Select` — Dropdown mit Animation
- `Checkbox` — Radix Checkbox
- `Switch` — Toggle-Schalter
- `RadioGroup` — Radix Radio Buttons
- `Calendar` — Datumsauswahl

### 7.6 Dialoge & Modals

| Typ | Verwendung | Overlay |
|-----|-----------|---------|
| `Dialog` | Formulare, Details | `bg-black/80 backdrop-blur-sm` |
| `AlertDialog` | Bestaetigungen | `bg-black/80 backdrop-blur-sm` |
| `DeleteConfirmDialog` | Loesch-Bestaetigung | Rotes Trash-Icon, Warntext |
| `Sheet` | Seitenpanels, Mobile-Sidebar | Seitlich einfliegend |
| `CommandPalette` | Globale Suche (Ctrl+K) | `bg-black/50 backdrop-blur-sm` |

**Animation:**
```
Oeffnen:  fade-in-0 + zoom-in-95 (200ms)
Schliessen: fade-out-0 + zoom-out-95 (200ms)
```

### 7.7 Feedback-Komponenten

**Toast (Sonner):**
```tsx
toast.success("Park wurde erstellt");
toast.error("Fehler beim Speichern");
toast.warning("3 Eintraege uebersprungen");
```
- Position: Bottom-Right
- Dauer: 4s (auto-dismiss)
- Styling: Card-Background, shadow-lg

**EmptyState:**
```tsx
<EmptyState
  icon={Wind}
  title="Keine Parks gefunden"
  description="Erstellen Sie Ihren ersten Windpark"
  illustration="🌬️"
  action={<Button>Park erstellen</Button>}
/>
```
- Zentriert, `py-16`
- Framer Motion Stagger-Animation
- Icon in `p-5` Container mit `bg-muted`

**Skeleton-Loader:**
- Shimmer-Gradient Animation (2.5s)
- `PageLoading` — Dashboard-Skeleton
- `TableLoading` — Tabellen-Skeleton (5 Zeilen)
- Stagger-Delay: `i * 50ms`

**BatchActionBar:**
- Fixed bottom, `z-50`
- Slide-in-from-bottom Animation
- Selection-Count Badge in `bg-primary/10`
- "Auswahl aufheben" Ghost-Button
- Action-Buttons rechts

### 7.8 Inline-Edit (EditableCell)

| Zustand | Darstellung |
|---------|-------------|
| **Display** | Text + Pencil-Icon (opacity-0, hover:opacity-100) |
| **Editing** | Input-Feld, autofocus |
| **Saving** | Spinner rechts im Input |
| **Error** | Roter Border + Fehlertext darunter |

**Interaktion:** Klick → Edit, Enter → Save, Escape → Cancel, Blur → Save

### 7.9 Weitere Komponenten

| Komponente | Datei | Beschreibung |
|------------|-------|--------------|
| `Tabs` | tabs.tsx | Tab-Navigation mit Inhaltsbereichen |
| `Tooltip` | tooltip.tsx | Hover-Tooltip mit Pfeil |
| `Popover` | popover.tsx | Klick-Popup fuer erweiterte Inhalte |
| `Collapsible` | collapsible.tsx | Auf-/Zuklappbare Sektionen |
| `Progress` | progress.tsx | Fortschrittsbalken |
| `Avatar` | avatar.tsx | Benutzer-Avatar (Bild/Initialen) |
| `Separator` | separator.tsx | Horizontale Trennlinie |
| `Stepper` | stepper.tsx | Multi-Step Formular-Navigation |
| `FileUploadDropzone` | file-upload-dropzone.tsx | Drag-and-Drop Datei-Upload |
| `RichTextEditor` | rich-text-editor.tsx | TipTap WYSIWYG-Editor |
| `VirtualTable` | virtual-table.tsx | Virtualisierte Tabelle (Performance) |
| `AnimatedList` | animated-list.tsx | Stagger-animierte Liste |
| `SuccessAnimation` | success-animation.tsx | Erfolgs-Checkmark (Spring) |

---

## 8. Seitenlayouts

### 8.1 Listenseite (Standard)

```
PageHeader (Titel + "Neu erstellen" Button)
    ↓
StatsCards (2-4 KPI-Karten)
    ↓
SearchFilter (Suchfeld + Dropdown-Filter)
    ↓
Table (Checkbox + Datenspalten + Actions-Dropdown)
    ↓
[BatchActionBar bei Selektion]
    ↓
[EmptyState wenn keine Daten]
```

**Beispiele:** Parks, Invoices, Funds, Leases, Contracts, Vendors, Journal-Entries

### 8.2 Detailseite

```
Zurueck-Button + Titel
    ↓
Tabs (Uebersicht | Details | Dokumente | ...)
    ↓
  Tab-Inhalt:
    Cards mit Feldern (Label: Wert)
    Inline-EditableCell fuer bearbeitbare Felder
    Tabellen fuer Unterdaten
    ↓
AlertDialog bei destruktiven Aktionen
```

**Beispiele:** Park-Detail, Fund-Detail, Invoice-Detail

### 8.3 Formularseite

```
PageHeader (Titel)
    ↓
Form (react-hook-form)
  FormField (Label + Input + Validation)
  FormField (Label + Select + Validation)
  ...
    ↓
Footer: Abbrechen (ghost) + Speichern (primary/LoadingButton)
```

**Beispiele:** Park-Wizard, Invoice-New, Contract-Edit

### 8.4 Dashboard

```
Greeting (zeitbasiert + Benutzername)
    ↓
Widget-Grid (react-grid-layout, 12 Spalten)
  KPI-Widgets (3x2)
  Chart-Widgets (4x3)
  Listen-Widgets (3x4)
  Wetter-Widget
    ↓
[Dashboard bearbeiten via User-Menu]
```

### 8.5 Analytics (Tab-basiert)

```
PageHeader + Filter-Bar (Park + Jahr)
    ↓
Tabs (Tagesbericht | Produktion | Betrieb | Finanzen | Werkzeuge | Bericht)
    ↓
  CollapsibleSection
    Chart-Komponente (recharts)
    KPI-Row (4 Metriken)
    Heatmap / Pareto / Trend
```

---

## 9. Icons

### 9.1 Bibliothek
**lucide-react** v1.7.0 — 2500+ SVG Icons, tree-shakeable

### 9.2 Groessen

| Groesse | Klasse | Pixel | Verwendung |
|---------|--------|-------|------------|
| XS | `h-3 w-3` | 12px | Inline-Hinweise, EditableCell Pencil |
| SM | `h-4 w-4` | 16px | Standard (Buttons, Tabellen, Navigation) |
| MD | `h-5 w-5` | 20px | Stats-Card Icons, Sidebar |
| LG | `h-8 w-8` bis `h-12 w-12` | 32-48px | EmptyState, Error-Boundaries |
| XL | `h-16 w-16` | 64px | Error-Seiten, Onboarding |

### 9.3 Regeln
- Icons in Buttons: **links** vom Text, `h-4 w-4`
- Standalone Icons (icon-only Button): `size="icon"`, `h-10 w-10`
- Status-Icons: `CheckCircle2` (Erfolg), `AlertTriangle` (Warnung), `AlertCircle` (Fehler), `XCircle` (Kritisch)
- Navigation: `ChevronDown`, `ChevronRight`, `ArrowLeft`, `ArrowRight`

---

## 10. Status & Feedback

### 10.1 Entity-Status Farben

| Status | Badge-Variante | Farbe | Verwendung |
|--------|---------------|-------|------------|
| ACTIVE | `success` | Gruen | Aktive Parks, Vertraege |
| DRAFT | `outline` | Grau/Rahmen | Entwuerfe |
| SENT | `default` | Navy | Versendete Rechnungen |
| PAID | `success` | Gruen | Bezahlte Rechnungen |
| CANCELLED | `destructive` | Rot | Storniert |
| EXPIRED | `warning` | Gelb | Abgelaufen |
| ARCHIVED | `secondary` | Grau | Archiviert |

### 10.2 Verfuegbarkeits-Ampel

| Status | Farbe | Bedingung |
|--------|-------|-----------|
| Gruen | `bg-green-500` | Ist >= Ziel |
| Gelb | `bg-yellow-500` | Ist < Ziel, aber >= Ziel - 2% |
| Rot | `bg-red-500` | Ist < Ziel - 2% |

### 10.3 Loading-States

| Situation | Anzeige |
|-----------|---------|
| Erster Seitenaufruf | `loading.tsx` Skeleton (PageLoading/TableLoading) |
| Daten laden (Initial) | Skeleton-Rows in Tabelle (5 Zeilen) |
| Filter-Aenderung (Re-Fetch) | Tabelle dimmt: `opacity-50 pointer-events-none` |
| Button-Aktion | `LoadingButton` mit Spinner |
| Inline-Edit Speichern | Spinner rechts im Input |

### 10.4 Fehler-Anzeige

| Kontext | Komponente | Verhalten |
|---------|-----------|-----------|
| Seiten-Fehler | `error.tsx` | Card mit Sentry-Report, Retry/Zurueck/Dashboard |
| Formular-Validierung | `FormMessage` | Roter Text unter dem Feld |
| API-Fehler | `toast.error()` | Bottom-Right Toast |
| Leere Daten | `EmptyState` | Illustration + CTA-Button |
| Inline-Edit Fehler | Roter Border + Text | Unterhalb des Inputs |

---

## 11. Responsive Patterns

### 11.1 Mobile (< 768px)

- Sidebar: Versteckt, Hamburger-Button im Header oeffnet Sheet-Drawer
- PageHeader: Titel + Aktionen stacken vertikal
- Stats-Cards: 2 Spalten statt 4
- Tabellen: `overflow-x-auto` (horizontal scrollbar)
- Filter: Full-width Selects, gestapelt
- BatchActionBar: Kompakt, Buttons scrollen horizontal
- LanguageSwitcher: Versteckt
- Keyboard-Hints: Versteckt

### 11.2 Tablet (768px - 1024px)

- Sidebar: Sichtbar (schmal)
- Stats-Cards: 2-3 Spalten
- Tabellen: Alle Spalten sichtbar

### 11.3 Desktop (> 1024px)

- Sidebar: Voll sichtbar mit Labels
- Stats-Cards: 4 Spalten
- Tabellen: Alle Spalten + inline Edit

---

## 12. Dark Mode

### 12.1 Umschaltung
- Toggle via `data-tour="header-theme-toggle"` Button im Header
- Nutzt `next-themes` Provider
- Persistiert in `localStorage`
- System-Praeferenz als Default

### 12.2 Farb-Overrides

| Token | Light | Dark |
|-------|-------|------|
| `--primary` | `215 50% 40%` | `215 55% 58%` (heller) |
| `--background` | `0 0% 100%` | `222.2 84% 4.9%` |
| `--card` | `0 0% 100%` | `222.2 84% 4.9%` |
| `--muted` | `210 40% 96.1%` | `217.2 32.6% 17.5%` |
| `--border` | `214.3 31.8% 91.4%` | `217.2 32.6% 17.5%` |

### 12.3 Regeln
- **Niemals hardcoded Farben** in Komponenten — immer CSS-Variablen
- Charts verwenden `hsl(var(--chart-N))` — automatisch Dark-Mode kompatibel
- Sidebar hat eigene Dark-Mode Farben (`--sidebar-*`)
- Glassmorphism-Effekte: `bg-background/60 backdrop-blur-md`

---

## 13. Custom CSS Utilities

| Klasse | Beschreibung | Verwendung |
|--------|-------------|------------|
| `.card-interactive` | Card mit Hover-Shadow + translateY | Klickbare Cards |
| `.glass` | Glassmorphism-Effekt | Overlays, spezielle Sektionen |
| `.gradient-text` | Navy→Blau Text-Gradient | Ueberschriften, Marketing |
| `.dot-pattern` | Punktraster-Hintergrund | Hero-Sektionen |
| `.feature-card` | Card mit linkem Akzent-Border | Feature-Listen |
| `.topo-pattern` | Topografie-Linien-Hintergrund | Dekorative Sektionen |
| `.chart-grid-bg` | Subtiles Gitter fuer Charts | Chart-Container |
| `.gradient-border` | Gradient-Rahmen via ::before | Hervorgehobene Cards |
| `.glow-teal` | Subtiler Glow-Effekt | Call-to-Actions |

---

## 14. Dos & Don'ts

### Do
- CSS-Variablen fuer alle Farben verwenden (`hsl(var(--primary))`)
- Tailwind-Klassen statt inline Styles
- `cn()` Utility fuer bedingte Klassen
- Framer Motion fuer komplexe Animationen, CSS fuer einfache
- Sonner `toast.success/error` fuer Feedback
- `FormMessage` fuer Validierungsfehler
- `EmptyState` mit CTA-Button fuer leere Listen
- Semantische HTML-Elemente (`<nav>`, `<main>`, `<table>`)
- `aria-label` auf allen interaktiven Elementen
- `focus-visible:ring-2` fuer Fokus-Indikatoren

### Don't
- Hardcoded Hex-Farben in Komponenten (nur in KPI-Config erlaubt)
- `!important` in Tailwind-Klassen
- Inline `style={{}}` ausser fuer dynamische Werte (Grid-Positionen)
- Animationen laenger als 500ms (ausser dekorative Loops)
- Teal/Tuerkis als Akzentfarbe (Designentscheidung)
- `z-index` Werte ohne dokumentierten Grund
- Eigene Breakpoints definieren — Tailwind-Standard nutzen
- Font-Sizes als Pixel-Werte — immer Tailwind text-* Klassen
- Neue UI-Primitives ohne Radix/shadcn-Basis
- `console.log` in Produktions-Komponenten

---

## 15. Z-Index Skala

| Wert | Verwendung |
|------|------------|
| 0 | Standard-Content |
| 10 | Sticky Table-Headers |
| 40 | Dropdowns, Popovers |
| 50 | BatchActionBar, Toasts |
| 9998 | Command Palette Overlay |
| 9999 | Command Palette Content |

---

## 16. Dateistruktur

```
src/
  app/
    globals.css              ← Design-Tokens, Animationen, Utilities
    layout.tsx               ← Root-Layout (Fonts, Theme)
    (dashboard)/
      layout.tsx             ← Dashboard-Layout (Sidebar + Header)
  components/
    ui/                      ← 49 UI-Primitives (shadcn/ui)
    layout/
      header.tsx             ← App-Header
      sidebar.tsx            ← Navigation-Sidebar
      mobile-sidebar.tsx     ← Mobile Sheet-Drawer
      breadcrumb.tsx         ← Auto-generierte Breadcrumbs
    dashboard/
      greeting.tsx           ← Zeitbasierte Begruessung
      kpi-card.tsx           ← KPI-Widget
      analytics-charts.tsx   ← Chart-Konfiguration
  config/
    nav-config.ts            ← Sidebar-Navigation Struktur
  hooks/
    useFeatureFlags.ts       ← Feature-Flag System
    useBatchSelection.ts     ← Tabellen-Selektion
    useRecentlyVisited.ts    ← Zuletzt besucht
    useDebounce.ts           ← Input-Debouncing
  lib/
    utils.ts                 ← cn() Utility (clsx + tailwind-merge)
```

---

## 17. Versionierung

| Datum | Version | Aenderungen |
|-------|---------|-------------|
| 2026-04 | 1.0 | Initiale Dokumentation aller Design-Patterns |
