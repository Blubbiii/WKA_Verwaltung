# Product

## Register

product

## Users

**Primärnutzer:** Geschäftsführer und Sachbearbeiter:innen von Betreibergesellschaften für Windkraftanlagen (typisch GmbH & Co. KG, GbR). Altersband 30–65, das tägliche Arbeitsband liegt bei 30–45 Jahren. Sie wechseln im Tagesablauf zwischen administrativen Tasks (Verträge, Pacht, Mahnwesen), buchhalterischen Pflichten (SKR03/SKR04, UStVA, GoBD, Jahresabschluss) und operativen Auswertungen (SCADA, Energiedaten, Soll/Ist).

**Sekundärnutzer (Portal):** Gesellschafter:innen, die periodisch ihr Anleger-Dashboard prüfen, Ausschüttungen einsehen, Dokumente abrufen und an Abstimmungen teilnehmen.

**Kontext:** Desktop-First-Arbeitstool, in dem täglich mehrere Stunden gearbeitet wird. Bildschirmgröße meist Laptop/Desktop. Mobile spielt nur für das Portal und für Wartungschecks vor Ort eine Rolle. Nutzer wollen Vorgänge in wenigen Klicks abschließen — Tastatur, Kopieren in Excel/DATEV und sauberer Druck (PDF, DIN 5008) sind harte Anforderungen.

## Product Purpose

WPM ist die einzige Anwendung, mit der Betreiber von Windkraftanlagen ihre **kompletten kaufmännischen, energetischen und gesellschaftsrechtlichen Vorgänge** in einem System abbilden — von SCADA-Import über Anlagenbuchhaltung bis Gesellschafter-Portal — ohne Excel-Inselen oder ERP-Frickelei.

Erfolg heißt: ein Buchhalter kann den Monatsabschluss inkl. UStVA, Mahnlauf und Bankabgleich ohne Tool-Wechsel erledigen. Eine Sachbearbeiterin kann eine Schadensmeldung mit angehängten Dokumenten in unter zwei Minuten erfassen. Ein Gesellschafter sieht im Portal seine letzte Ausschüttung samt erläuternder Berechnung.

Das Marketing-Surface (Landing, Pricing, About) ist Sekundär und dient ausschließlich der Akquise neuer Mandanten — es muss kohärent zur Produkt-Aesthetik bleiben, aber denselben Brand-Code visuell verdichten.

## Brand Personality

**Modern · präzise · zugänglich.**

- **Modern** im Sinne von zeitgemäß und ruhig — keine Effekt-Hascherei, aber zeitgenössische Typographie, ehrliche Whitespaces, klare Kontraste.
- **Präzise** im Sinne von zahlenstark und unmissverständlich — Beträge stehen wie hingehauen, Status-Übergänge sind sichtbar, jede Aktion sagt was sie tut.
- **Zugänglich** im Sinne von einsteigerfreundlich, ohne dem Profi auf den Nerv zu gehen — Hinweise gibt es zur Hand, aber keine Klick-Strecken zum Selbstverständlichen.

**Voice:** Sachlich, deutsch, ohne Marketing-Adjektive. Fehlertexte erklären die Lage und schlagen den nächsten Schritt vor. Anredeform formell (Sie) als Default, "Du" als optionaler Tenant-Skin (`de-personal`).

## Anti-references

WPM darf weder so noch so aussehen — jeder dieser Bezugspunkte ist eine bewusste Absage:

1. **Excel-Datenfriedhof.** Endlose ungestaltete Tabellen, alles 12px Arial in #000, keine Hierarchie. Wenn unsere Tabelle nicht selbsterklärend ist, ist sie nicht fertig.
2. **SaaS-Pastell-Gradient-Glassmorphism.** Lila/Rosa-Verläufe, durchsichtige Cards, Hero-Metric-Templates, "Linear-Clone". Wir sind keine VC-Pitch-Deck-Aesthetik.
3. **Teal/Türkis-Tech-Brand.** Schon historisch verworfen — Warm Navy ist Anker, Türkis ist außerhalb der Palette.
4. **Banking-Schwer-Klassik.** Dunkelblau + Gold, gestelzte Serif-Headlines, "Versicherungs-Portal-Look". Wir wirken kompetent, nicht ehrwürdig.

## Design Principles

1. **Zahlen sind das Hauptmotiv.** Geldbeträge, Mengen, KPIs sind der Star jeder Seite — Typographie, Ausrichtung (right-align für Currency), Farb-Kodierung von Vorzeichen müssen das tragen. Buttons und Cards stehen für die Zahlen, nicht umgekehrt.
2. **Show, don't summarize.** Ein leerer Status ("Keine offenen Mahnungen") ist ein Information-Event, kein Loch — er hat eine Begründung und einen Pfad nach vorn. Empty-States sind erste Klasse.
3. **Workflow vor Eleganz.** Wenn eine Form 14 Felder hat, weil das Steuerrecht 14 Felder verlangt, dann hat sie 14 Felder — gut gegliedert, mit echtem Tab-Order, mit Auto-Save. Wir verstecken Komplexität nicht durch "modernes" Wegklicken.
4. **Konsistenz schlägt Kreativität.** Eine Aktion sieht überall gleich aus. Approval-Flows, Toasts, Bestätigungs-Dialoge — alle aus demselben Baukasten. Inkonsistenz ist die Wahrnehmungsschuld, nicht der Pluspunkt.
5. **Vertraue dem Profi.** Tastatur-Shortcuts, Bulk-Aktionen, exportierbare Daten als Pflicht — keine künstlichen Sperren oder "Sind Sie sicher"-Wände vor jeder Aktion. Wer ein 4-Augen-Prinzip braucht, kriegt es transparent und einmal.

## Accessibility & Inclusion

- **WCAG 2.1 AA als Mindeststandard** über alle nicht-Demo-Pfade hinweg.
- Body-Text-Kontrast ≥4.5:1 gegen alle Backgrounds (auch tinted Tabellenzeilen). Currency-Beträge nie reine `text-muted-foreground`-Variante.
- **Tastaturpfad vollständig** für alle Forms, Approval-Flows und Tabellen — `Tab`, `Shift+Tab`, `Enter`, `Esc` müssen das Erwartbare tun. Kein Pointer-Only-Pattern.
- **Reduced Motion** respektiert — alle Reveal- und Hover-Effekte haben `prefers-reduced-motion: reduce` Fallback.
- **Farb-Blindheit:** Status (Erfolg/Warnung/Fehler) immer doppelt kodiert — Farbe + Icon + Text-Label. Diagramme nutzen die 12-Farb-Chart-Palette so, dass benachbarte Datenreihen kontrastieren.
- **Sprachen:** drei Locale-Schienen (`de`, `de-personal`, `en`). Alle UI-Texte i18n; harte Strings sind Audit-Findings.
- **Dichte:** Default ist "Standard"; "Kompakt" für Power-User auf Buchhaltungs-Seiten geplant, ohne Tap-Target-Verlust auf Tablet.
