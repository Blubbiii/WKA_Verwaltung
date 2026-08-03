# Abhängigkeiten — Stand und offene Entscheidungen

Wozu diese Datei: die Begründungen für aufgeschobene Aktualisierungen standen
bisher nur in Commit-Nachrichten. Wer das nächste Mal aktualisiert, hat sie
nicht vor Augen und prüft dieselben Fragen noch einmal — oder, schlimmer,
nimmt eine Aktualisierung mit, die aus gutem Grund liegengeblieben war.

Stand: 03.08.2026

## Das Vorgehen in drei Kategorien

| | Was | Wie |
|---|---|---|
| **1 + 2** | Patch- und Minor-Sprünge innerhalb der deklarierten Bereiche | `npm update`, danach `tsc` + `lint` + `build` + Journey-Suite |
| **3** | Gezielte Major-Sprünge, meist wegen einer Sicherheitslücke | Einzeln, mit einer Begründung im Commit |
| **4** | Der Rest | Bleibt liegen — hier dokumentiert, warum |

Die Journey-Suite ist bei Kategorie 1+2 nicht optional. Ein Radix-Sprung
bricht keine Typen; er bricht das Verhalten eines Auswahlfelds, und das sieht
man nur, wenn man es bedient.

## Festgehalten: `bullmq` auf `~5.79.2`

**Kein Versehen.** `bullmq` 5.81 hat die Typparameter von `Queue` umgebaut —
aus zwei wurden sechs, und die abgeleiteten Voreinstellungen lösen sich nicht
mehr auf die konkreten Typen auf. Ergebnis: 64 Typfehler in 13 Warteschlangen-
Dateien, nach einem **Minor**-Sprung.

Betroffen ist das Job-System: Abrechnung, Mahnwesen, SEPA, SCADA-Import. Das
ist keine Stelle, an der man Typen nebenbei zurechtbiegt.

Der Bereich steht deshalb auf `~5.79.2` — Patches innerhalb 5.79 kommen weiter
an, 5.80+ nicht. Wer das aufmacht, muss die Warteschlangen-Typen anpassen und
die Jobs tatsächlich laufen lassen, nicht nur übersetzen.

## Gesperrt: TypeScript bleibt auf 6.x

**Entscheidung vom 03.08.2026.** TypeScript wird erst auf 7 gehoben, wenn
**alle** Werkzeuge es unterstützen. Kein Teil-Sprung, kein paralleler Betrieb
zweier Fassungen.

### Was blockiert

`@typescript-eslint` deklariert `typescript >=4.8.4 <6.1.0` — und zwar in
jeder veröffentlichten Fassung, einschliesslich der Alpha-Versionen (geprüft
am 03.08.2026 an 8.66.0 und 8.66.1-alpha.0). Das ist kein vergessener Bereich:
die typbasierten Regeln benutzen die Compiler-Interna von TypeScript, und
genau die brechen bei einer Neuimplementierung.

`npm run lint` ist Teil des Pflicht-Gates und in der CI der **erste** Job, an
dem der Build hängt. Fällt typescript-eslint aus, steht die ganze Kette.

### Warum es sich auch nicht lohnt

`tsc --noEmit` braucht hier **14 Sekunden** bei 2253 Dateien, `npm run lint`
drei. Das Verkaufsargument von TypeScript 7 ist Geschwindigkeit — der Gewinn
wäre rund zehn Sekunden je Prüfung. An der Korrektheit ändert sich nichts.

### Wie man den Stand prüft

```bash
npm view typescript-eslint peerDependencies.typescript
npm view @typescript-eslint/parser peerDependencies.typescript
```

Schliesst der Bereich TypeScript 7 nicht ein, bleibt es beim Nein.

### Was beim Freiwerden zusätzlich zu prüfen ist

- `next build` typprüft mit der installierten Fassung — `next.config.ts` hat
  **kein** `ignoreBuildErrors`. Ein Bruch trifft damit auch das Docker-Image.
- `prisma` / `@prisma/client` 7.9.1: Peer `>=5.4.0`, also offen — aber
  ungeprüft.
- `valibot`: `>=5`, offen.
- Unkritisch, weil sie keine Typen prüfen: `vitest`, `tsx` (Worker zur
  Laufzeit).

### Zwei Dinge, die trotzdem gelten

**6.0.3 ist die letzte 6er-Fassung.** Es kommen keine Patches mehr. Taucht
eine Sicherheitslücke in TypeScript auf, wird der Sprung erzwungen — dann
zählt, dass hier steht, was im Weg ist.

**`Dockerfile:92` installiert `typescript` ohne Version.** Seit 7.0.2
npm-`latest` ist, landet es bei jedem Image-Bau in der prisma-cli-Stufe. Die
Entscheidung ist im Image also derzeit **nicht durchgesetzt**. Dass nichts
auffällt, spricht dafür, dass diese Stufe TypeScript nur mitschleppt und nicht
zum Prüfen nutzt — verlassen sollte man sich darauf nicht.

## Aufgeschoben, mit Begründung

| Paket | Von → Nach | Warum nicht |
|---|---|---|
| `typescript` | 6.0.3 → 7.0.2 | **Gesperrt** — siehe Abschnitt oben. `@typescript-eslint` unterstützt TS 7 in keiner veröffentlichten Fassung. |
| `bullmq` | 5.79 → 6.0.6 | Siehe oben — schon 5.81 bricht. Der Major erst recht. |
| `ioredis` | 5.10 → 6.0.0 | `bullmq` 5.79 erwartet ioredis 5. Zusammen mit bullmq 6 anzugehen, nicht davor. |
| `meilisearch` | 0.49 → 0.60 | Wird aktiv genutzt. Elf Minor-Sprünge in einer 0.x-Reihe sind faktisch Majors. Braucht eine laufende Meilisearch-Instanz zum Prüfen. |
| `eslint` | 9.39 → 10.8 | Konfigurationsbruch. Wir stehen auf 0 Fehlern und 0 Warnungen — der Sprung bringt kein Problem in Ordnung, kann aber eins schaffen. |
| `@types/node` | 24.13 → 26.1 | Wir laufen auf Node 24.13. Typen für Node 26 beschreiben APIs, die es hier nicht gibt. |
| `next-auth` | beta.32 → 4.24 | **Keine Aktualisierung.** npm zeigt v4 als `latest`, weil v5 noch Beta ist. Wir wollen v5. |

## Sicherheitsbefunde, die bleiben

`npm audit` meldet fünf Befunde. Alle liegen in Bäumen, die uns nicht gehören,
und `npm audit fix --force` würde `next` bzw. `exceljs` zwangsweise verbiegen.

| Befund | Wo | Einschätzung |
|---|---|---|
| `postcss` ≤ 8.5.22 (hoch) | `next/node_modules/postcss` | Nur zur Bauzeit, verarbeitet unser eigenes CSS. Unsere eigene postcss-Abhängigkeit ist aktuell. |
| `sharp` < 0.35 (hoch) | `next/node_modules/sharp` | **Unser** Weg läuft über sharp 0.35.3 — siehe unten. Diese Kopie gehört zur Bildoptimierung von Next. |
| `uuid` < 11.1.1 (mittel) | `exceljs/node_modules/uuid` | Fehlende Puffergrenze in v3/v5/v6, wenn `buf` übergeben wird. exceljs erzeugt Zufalls-UUIDs. |

## `sharp` ist jetzt eine eigene Abhängigkeit

Vorher stand `import sharp from "sharp"` in `lib/pdf/utils/staticMap.ts`, ohne
dass das Paket in `package.json` deklariert war — es kam zufällig über Next
mit. Hätte Next es fallen gelassen, wäre die Kartenerzeugung im PDF zur
Laufzeit gebrochen, nicht beim Übersetzen.

Jetzt deklariert und auf 0.35.3 gehoben. Das war nicht nur Ordnungsliebe: die
vier libvips-CVEs sind auf unserem Weg erreichbar, weil die Kartenkacheln von
einem **externen** Server kommen — fremde Bilddaten gehen durch die
Bibliothek.

0.35 stellt die Typ-Exporte um (`sharp.OverlayOptions` wird über den
Vorgabe-Import nicht mehr als Typ gefunden); der Typ wird jetzt ausdrücklich
geholt, die Laufzeit-API ist unverändert. Geprüft wird das in
`lib/pdf/utils/static-map-sharp.test.ts` — genau die Aufrufe, die
`staticMap.ts` benutzt, auf selbst erzeugten Bildern. Der echte Weg mit
echten Kacheln braucht einen erreichbaren Kachelserver und ist damit **nicht**
abgedeckt.

## `recharts` 3.10 typisiert Tooltip-Label als `ReactNode`

`labelFormatter` bekommt jetzt `ReactNode` statt eines schmaleren Typs. In
`energy/analytics/daily-overview.tsx` ging daraus `new Date(v)` hervor. Die
Stelle prüft jetzt auf Zeichenkette oder Zahl — und zusätzlich auf ein
ungültiges Datum, denn `new Date("abc")` wirft nicht, sondern liefert
`Invalid Date`, und das stünde so im Tooltip.
