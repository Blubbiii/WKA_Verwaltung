# Abläufe (`journeys/`)

Tests, die **etwas tun** — anlegen, ändern, löschen — und die Wirkung prüfen.

Abgegrenzt von den Spezifikationen eine Ebene höher (`e2e/*.spec.ts`): die sind
ein **Rauchtest**. Sie prüfen, dass Seiten laden, Navigation greift und
Formulare rendern. Das hat Wert, aber es ist etwas anderes.

## Warum es diesen Ordner gibt

Eine Vermessung der alten Suite am 01.08.2026:

| | |
|---|---|
| Seiten im WPM | 227 |
| davon je angesteuert | 32 (14 %) |
| Tests, die etwas anlegen | **0** |
| Tests, die etwas löschen | **0** |
| `catch(() => {})` — verschluckte Fehler | **162** |
| `if (await …isVisible)` — stille Zweige | **72** |

Der Test `Rechnung: Status-Workflow DRAFT → SENT` öffnet eine Detailseite und
prüft, dass sie länger als hundert Zeichen ist. Der Name verspricht einen
Arbeitsablauf, der Test prüft, dass Text da ist.

Bei 72 stillen Zweigen heisst „147 Tests grün" nicht, dass 147 Dinge geprüft
wurden — nur, dass nichts geworfen hat. Das ist derselbe Befund wie im übrigen
Audit, nur im Prüfwerkzeug selbst: ein nicht stattgefundener Vorgang sieht aus
wie ein unauffälliger.

## Die vier Regeln

**1 · Nichts wird stillschweigend übersprungen.**
Was der Test braucht, muss da sein. Statt `if (await x.isVisible())` steht hier
`must(x, "Was gesucht wurde")` — fehlt es, scheitert der Test mit einer
Meldung, die sagt was. Für echte Abhängigkeiten vom Datenbestand gibt es
`requireOrSkip()`; die überspringt **sichtbar** mit Begründung.

**2 · Geprüft wird die Wirkung, nicht die Optik.**
Nach dem Speichern wird gefragt, ob der Datensatz da ist — über die API, nicht
über eine Erfolgsmeldung. Nach dem Löschen wird gefragt, ob er weg ist. Aus
der Ansicht verschwunden ist nicht dasselbe wie gelöscht.

**3 · Jeder erzeugte Datensatz trägt ein Präfix.**
`E2E-<Datum>-<Zufall>`. Das Aufräumen findet daran seine eigenen Spuren wieder
und fasst nie einen echten Datensatz an — es **verweigert** das Löschen von
allem ohne Präfix. Ein Aufräumen, das „alle Parks mit Test im Namen" löscht,
trifft irgendwann ein echtes „Testfeld Nord".

**4 · Aufgeräumt wird nach jedem Test, auch nach einem Fehlschlag.**
Sonst hinterlässt ein abgebrochener Lauf alles Bisherige, und irgendwann räumt
niemand mehr auf, weil unklar ist, was noch gebraucht wird.

## Laufen lassen

```bash
# gegen die lokale Entwicklungsinstanz
npm run test:e2e -- e2e/journeys

# gegen eine andere Instanz
E2E_BASE_URL=http://192.168.178.101:3050 npx playwright test e2e/journeys --project=chromium
```

Achtung bei einer gemeinsam genutzten Instanz: die Anmeldung ist auf **5
Versuche je 15 Minuten** begrenzt, gezählt pro E-Mail. Jeder Aufruf von
`playwright test` meldet sich einmal an — mehrere Läufe kurz hintereinander
sperren sich selbst aus. Deshalb möglichst alles in **einem** Aufruf.

## Stand und was fehlt

| Bereich | Status |
|---|---|
| Park — anlegen über den Assistenten, ändern, löschen | ✅ |
| Assistenten — 8 Einstiege, Schrittwechsel, Zustand bei „Zurück" | ✅ |
| Rechnung — anlegen, Position, Status, löschen | offen |
| Pacht — Assistent über 4 Schritte | offen |
| Buchhaltung — 41 Seiten, bisher **null** Abdeckung | offen |
| GIS — Flächen einzeichnen, SHP-Import | offen |
| SCADA — Import ausführen, Anomalie erzeugen | offen |
| Admin — Einstellung ändern und zurücksetzen | offen |

Die Reihenfolge ist bewusst: erst die Kernobjekte mit echtem
Lebenszyklus, dann die Buchhaltung — dort wird gerechnet, und dort tut ein
Fehler am meisten weh.

## In CI

Seit dem 01.08.2026 läuft dieser Ordner bei jedem Push — Job `e2e` in
`.github/workflows/ci.yml`, mit eigener Postgres- und Redis-Instanz, frischem
Schema und Seed-Daten.

Der Grund steht im Job: die Suite lief zuletzt am 13. April und danach vier
Monate nicht. Eine Suite, die niemand startet, verfällt — und ihr Grün vom
letzten Lauf suggeriert eine Sicherheit, die es nicht gibt.

**Bewusst nur `e2e/journeys`.** Die älteren Spezifikationen eine Ebene höher
kommen erst dazu, wenn ihre 162 verschluckten Fehler und 72 stillen Zweige
beseitigt sind. Sie in CI aufzunehmen hiesse, ihr Grün zum Freigabekriterium
zu machen.
