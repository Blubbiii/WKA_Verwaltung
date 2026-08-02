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

## Zwei Sperren, die die Suite selbst trifft

**Anmeldung: 5 Versuche je 15 Minuten**, gezählt pro E-Mail. Jeder Aufruf von
`playwright test` meldet sich einmal an — mehrere Läufe kurz hintereinander
sperren sich selbst aus. Deshalb möglichst alles in **einem** Aufruf.

**API: 100 Anfragen je Minute**, gezählt pro Nutzer. Ein vollständiger
Durchlauf streift diese Grenze: jeder Seitenaufruf löst mehrere Anfragen aus.
`WpmApi` wartet bei HTTP 429 einmal 20 Sekunden ab und versucht es erneut —
genau einmal. Bleibt es dabei, ist etwas anderes los als eine kurze Spitze.

Beides ist **kein Fehler**, sondern gewolltes Verhalten, das ein Client zu
respektieren hat. Wer die Suite deutlich ausbaut, sollte ihr ein eigenes
Konto geben, statt die Grenzen anzuheben.

## Stand und was fehlt

| Bereich | Status |
|---|---|
| Park — anlegen über den Assistenten, ändern, löschen | ✅ |
| Assistenten — 8 Einstiege, Schrittwechsel, Zustand bei „Zurück" | ✅ |
| Rechnung — anlegen, Betrag prüfen, suchen, löschen | ✅ |
| Buchhaltung — Soll=Haben, Vorbuchung, Festschreiben, Storno, Bilanzdifferenz | ✅ |
| Admin — Einstellung ändern, prüfen, exakt zurücksetzen; 22 Seiten erreichbar | ✅ |
| Pacht — Verpächter anlegen, im Assistenten auswählen, Schritt 1 → 2 | ✅ |
| Pacht — Schritte 2–4 (brauchen Flurstücke) | offen |
| Vertrag — vier Schritte durchklicken, speichern, Vertragsart prüfen, löschen | ✅ |
| GIS — Polygon anlegen und unverändert auslesen, Seiten erreichbar | ✅ |
| GIS — Zeichnen auf der Karte (Mausbewegung auf Canvas) | bewusst nicht |
| SCADA — Seiten erreichbar, Anomalie-Auswertung antwortet | ✅ |
| SCADA — Import mit echter WSD-Datei ausführen | offen |
| Anlagen-Import — eigene Beispieldatei hochladen, zuordnen, validieren | ✅ |
| Anlagen-Import — Einspielen ausführen | bewusst nicht |
| Sechs Assistenten ohne generischen Durchlauf und ohne eigenen Test | offen |

Die Reihenfolge ist bewusst: erst die Kernobjekte mit echtem
Lebenszyklus, dann die Buchhaltung — dort wird gerechnet, und dort tut ein
Fehler am meisten weh.

Zwei Einträge stehen auf **„bewusst nicht"**, und zwar aus verschiedenen
Gründen. Das Zeichnen auf der Karte wäre ein Test der Kartenbibliothek. Das
Einspielen des Anlagen-Imports dagegen wäre ein Test, der Schaden anrichtet:
die Beispieldatei enthält zwölf Monate erfundener Erträge für die **echten**
Anlagen, und aus diesem Bestand werden Abrechnung und Ausschüttung gerechnet.
Der Test geht bis zur Validierung — die ruft die API mit `action: "validate"`
und schreibt nichts. Der nächste Klick wäre `action: "import"`.

## Was der erste Gesamtlauf gefunden hat (02.08.2026)

81 Tests gegen die Produktion, 5 rot. **Vier davon waren echte Fehler im
Programm**, einer lag am Test:

| Fund | Wirkung |
|---|---|
| Buchungsdatum „in der Zukunft" beim heutigen Tag | Zwischen 00:00 und 02:00 Ortszeit liess sich nichts buchen — jeden Tag, seit jeher |
| Vertrag anlegen scheiterte an leeren Freiwilligenfeldern | Ein Vertrag mit nur den Pflichtfeldern liess sich gar nicht speichern |
| Beispieldatei des Netzbetreiber-Imports passte nicht zum Import | Wer sie herunterlud und hochlud, kam in Schritt 2 nicht weiter |
| Kartenseite ohne jede Überschrift | Einzige Seite ohne `h1` — per Überschriften nicht auffindbar |
| Vertragsbeginn hängt an einem Popover-Kalender | Der generische Läufer kam nicht durch Schritt 2 → `pickDate()` |

Zwei der Fehler standen seit Monaten im Programm und wären ohne diesen Lauf
nicht aufgefallen: beide sehen im Alltag aus wie Bedienfehler.

Bemerkenswert am ersten: gefunden hat ihn nicht die Sorgfalt, sondern der
**Zufall** — der Lauf startete kurz nach Mitternacht. Ein Testlauf, der immer
zur selben Tageszeit läuft, hätte ihn nie gesehen.

## Das Aufräumen hat in CI nie funktioniert (behoben 02.08.2026)

Ein Fehler, der bemerkenswert lange unsichtbar blieb, weil kein Test deshalb
fehlschlug.

Der Riegel vor jedem Löschen prüfte gegen `/^E2E-\d{8}-[a-z0-9]{5}/` — acht
Ziffern, Bindestrich, fünf Zeichen. Der Workflow setzt aber
`E2E_RUN_ID=ci-<Laufnummer>`, das Präfix lautet damit `E2E-ci-17234567890`,
und `ci` sind keine acht Ziffern.

Folge: `isTestArtifact()` sagte in CI zu **jedem** Namen nein, `remove()`
verweigerte jedes Löschen, und **jeder CI-Lauf liess seinen kompletten Bestand
liegen**. Aufgefallen ist es erst, als ein späterer Test über die Reste eines
früheren stolperte — `firstRow()` in der Parkliste griff einen Rest ab.

Der Riegel hat dabei richtig gehandelt: er hat sich geweigert, etwas zu
löschen, das er nicht als eigene Spur erkannte. Falsch war, dass zwei
Konstanten dieselbe Konvention doppelt kodierten und auseinanderliefen — genau
wie bei der Beispieldatei des Netzbetreiber-Imports.

Drei Konsequenzen:

1. Das Muster beschreibt jetzt nur noch, was das Präfix ausmacht: `E2E-` und
   eine Kennung. Was die Kennung ist, entscheidet `RUN_ID` allein.
2. `tests/integration/e2e-run-context.test.ts` **liest die CI-Datei** und
   prüft, dass die dort gesetzte Kennung wiedererkannt wird. Selbstgewählte
   Beispiele hätten den Fehler nicht gefunden — ich hätte sie passend zum
   Muster gewählt.
3. Liegengebliebenes wird jetzt auf die Konsole geschrieben, nicht nur als
   Anmerkung. Der `list`-Reporter zeigt Anmerkungen nicht an, und genau dieses
   Schweigen hat den Fehler getragen.

Eine Sicherung, die abgeschaltet ist und deren Abschaltung wie normaler
Betrieb aussieht, ist schlimmer als keine.

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
