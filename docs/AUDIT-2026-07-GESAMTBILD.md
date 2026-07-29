# Vollaudit WPM — Gesamtbild

> Stand 2026-07-29 · Neun Prüfbereiche · **129 Fehlerbefunde (26× P0) + 42 Verbesserungsvorschläge**
> Alle Einzelberichte: `docs/AUDIT-2026-07-*.md`

---

## Übersicht

| Bereich | Befunde | P0 | Dokument |
|---|---:|---:|---|
| SCADA → Abrechnungskette | 8 | 3 | [SCADA-ABRECHNUNGSKETTE](AUDIT-2026-07-SCADA-ABRECHNUNGSKETTE.md) |
| Rechenkorrektheit | 25 | 7 | [RECHENKORREKTHEIT](AUDIT-2026-07-RECHENKORREKTHEIT.md) |
| Prozessketten | 26 | 3 | [PROZESSKETTEN](AUDIT-2026-07-PROZESSKETTEN.md) |
| Randfälle & Grenzwerte | 19 | 4 | [RANDFAELLE](AUDIT-2026-07-RANDFAELLE.md) |
| Worker & Queues | 27 | 5 | [WORKER-QUEUES](AUDIT-2026-07-WORKER-QUEUES.md) |
| Tote Funktionalität | 18 | 4 | [TOTE-FUNKTIONALITAET](AUDIT-2026-07-TOTE-FUNKTIONALITAET.md) |
| Regressionen (eigene Fixes) | 6 | — | [REGRESSIONEN](AUDIT-2026-07-REGRESSIONEN.md) |
| **Σ Fehler** | **129** | **26** | |
| Bedienaufwand | 22 Vorschläge | | [BEDIENAUFWAND](AUDIT-2026-07-BEDIENAUFWAND.md) |
| Fehlende Funktionen | 20 Vorschläge | | [FEHLENDE-FUNKTIONEN](AUDIT-2026-07-FEHLENDE-FUNKTIONEN.md) |

---

## Der zentrale Befund

**Das System ist deutlich vollständiger gebaut, als es funktionsfähig ist.**

Das Problem sind nicht fehlende Features. Es sind fertig gebaute Features, die nicht
angeschlossen sind oder nicht laufen:

- **Kein Worker-Service im Produktions-Stack** → 8 von 15 Queues faktisch tot,
  Eingangsrechnungen hängen, kein Webhook wird zugestellt, DSGVO-Retention läuft nie
- **~5.500 Zeilen fertige Buchhaltungs-Funktionalität ohne eingehenden Link** —
  Jahresabschluss, Bilanz, GewSt, GoBD-Export, DATEV-Export, Anlagenspiegel, Cashflow,
  Periodensperre, Storno-Audit
- **E-Bilanz (§5b EStG), Bundesanzeiger (§325 HGB), DSGVO-Art.-15-Export und
  GoBD-Verfahrensdokumentation** sind voll implementiert — ohne Oberfläche
- **Volltextsuche**: der Index wird bei jedem Upload befüllt und **nie gelesen**
- **`api/quick-search`** trägt im Header „for the Command Palette (Cmd+K)" und hat
  null Aufrufer

Parallel dazu wird an mehreren Stellen **falsch gerechnet** — und die Ursache ist
erstaunlich konsistent.

---

## Sechs Muster, die 80 % der Befunde erklären

### 1 · Doppelimplementierungen — die Hauptfehlerquelle

Immer dasselbe Bild: es gibt einen **korrekten** und einen **aktiven** Codepfad, und der
aktive ist der falsche.

| Domäne | Korrekt (tot) | Aktiv (falsch) | Folge |
|---|---|---|---|
| Energieabrechnung | `settlement/energy-calculator.ts` — Betreiber stichtagsgenau, Status gefiltert | `calculate/route.ts` | Gutschrift an den falschen Fonds |
| Pacht | — beide falsch, gegenläufig | `settlement/calculator.ts` **und** `lease-revenue/calculator.ts` | Miteigentümer bekommt 0 € oder das Doppelte |
| Mahnwesen | `dunning.ts` — kennt `PARTIALLY_PAID` und `dunningHold` | `send-reminder` ignoriert beides | doppelte Mahnungen |
| Datumsrechnung | `liquidity.ts` — normalisiert korrekt auf den 1. | `scheduler.ts`, `recurring-invoice-service.ts` | ein Monat fällt aus der Abrechnung |
| Zahlenparsing | `journal-entries` hat `parseAmount` mit Komma | Formulare nutzen `parseFloat` | „1.234,56" wird still zu 0,00 € |
| Flächenberechnung | 5 widersprüchliche Implementierungen, keine mit echtem Centroid | | verschobene Pufferkreise |

**Konsequenz für die Priorisierung:** Die Calculator-Konsolidierung war im
Architektur-Audit als *Wartbarkeitsthema* eingestuft. Sie ist die **Ursache von neun
Rechenfehlern in echten Rechnungen**. Das ist Fehlerbehebung, nicht Aufräumen.

### 2 · Der Produktionsstack läuft anders, als der Code annimmt

`docker-compose.portainer.yml` — der Stack, der tatsächlich läuft — enthält **keinen
`worker`-Service**. `prod.yml` und `dev.yml` haben ihn. Dazu: `CRON_SECRET`,
`CRON_BEARER_TOKEN` und `INBOUND_EMAIL_API_KEY` stehen in keinem Compose-File.

Acht Scheduling-Funktionen existieren und werden **nirgends aufgerufen** — Reminder,
Weather, Report, SCADA-Auto-Import, Approvals-Reconcile. Die UI bestätigt trotzdem
„Auto-Import aktiviert für {locationCode}".

**Nichts davon ist im Code sichtbar.** Es ist eine Lücke zwischen Repository und Betrieb.

### 3 · Prüfungen sitzen im falschen Pfad

- `preview()` validiert die Anteilssumme, `execute()` nicht → 150 % Anteile ergeben
  **150.000 € statt 100.000 €** Ausschüttung, Status `EXECUTED`, kein Fehler
- Der offene Betrag wird korrekt berechnet — **aber nur für die Zinsen** verwendet; gemahnt
  wird der Bruttobetrag
- Manuell erfasste Buchungen sind gegen Feldlängen abgesichert, **der programmatische Pfad
  nicht** — und genau der bricht dann
- `dataCompleteness` wird berechnet und direkt daneben **nicht verwendet**

### 4 · Stille Fehlschläge

Das gefährlichste Muster, weil nichts davon auffällt:

- Fünf Dashboard-Widgets zeigen **erfundene Daten** bei API-Fehler — darunter ein
  Health-Widget, das „healthy" meldet, **weil** es die Status-API nicht erreicht
- Fachlich gescheiterte Jobs werden als `completed` verbucht → ein Bulk-Lauf mit 200 von
  300 Fehlern ist in der Admin-UI **grün**
- Mahnungen gelten als versendet, sobald das Enqueue zurückkehrt — der Cooldown verhindert
  danach jede Wiederholung
- Der Reconciler markiert **gescheiterte** Re-Executions als erledigt
- Die Dead-Letter-Queue wird nirgends gelesen
- Turbinen ohne Betreiber werden bei der Verteilung still übersprungen, die API meldet
  „Berechnung erfolgreich"

### 5 · Rückwärts-Korrekturen propagieren nicht

Jede Kette lässt sich vorwärts durchlaufen, aber nicht zurück:

- **Invoice-Storno** gibt weder Settlement noch `invoiceId` noch Produktionsdaten frei →
  die Fehlermeldung empfiehlt genau den Weg, der garantiert in eine Sackgasse führt
- **`unmatch`** einer Bank-Transaktion rollt die Zahlung nicht zurück → 1.000 € Eingang
  können 2.000 € Forderung tilgen
- **SCADA-Reimport** überschreibt bereits abgerechnete Produktion und setzt sie auf `DRAFT`
- **Flurstück-Split** nach der Abrechnung lässt Teilflächen still herausfallen (−60 %)
- **Storno (Generalumkehr)** hat gar keinen UI-Auslöser — eine gebuchte Fehlbuchung ist
  über die Oberfläche nicht korrigierbar

### 6 · Testabdeckung sitzt an der falschen Stelle

`lease-revenue/calculator.ts` — der Calculator, der die Rechnungen speist — hat **kein
Testfile**. Die 25 Tests in `settlement/calculator.test.ts` prüfen ausschließlich Geometrie
und Adressformatierung. Es gibt keinen Test, der prüft, dass
`Σ Positionsbeträge == Topf`.

**Genau dieser eine Invarianten-Test hätte fünf der sieben Rechen-P0 sofort gefunden.**

---

## Was wir uns selbst eingebrockt haben

Die Regressionsprüfung der eigenen ~195 Fixes hat **6 Regressionen** gefunden, davon eine
mit Datenschutzbezug:

**`updateWithAudit` schreibt IBANs und SMTP-Passwörter im Klartext ins AuditLog.** Die
Verschlüsselungs-Middleware entschlüsselt beim Lesen, `diffRecords` schreibt die
Klartext-Werte in die unverschlüsselte JSON-Spalte. Die Fund-Route strippt das Passwort
sorgfältig aus der Response — und schreibt es zwei Zeilen vorher ins Log.
**Der Fix „SMTP-Passwörter verschlüsseln" hat gleichzeitig einen neuen Klartext-Pfad
geschaffen.**

Dazu: Die Tax-Zentralisierung ist **nicht verhaltensgleich** (1-Cent-Abweichungen, die über
Positionen akkumulieren). Die 36 Goldmaster-Tests deckten nur **eine von drei**
Delegationen ab.

**Sauber war** der Turbine-Dialog-Refactor (−76 % LOC, Feld für Feld verifiziert),
Optimistic Locking, Idempotency-Wrapper, `enumParam` und `sidebar/counts`.

> **Lehre:** Rein strukturelle Refactorings sind sicher. Refactorings mit Rechenanteil
> brauchen die Testabdeckung **vor** dem Umbau auf allen betroffenen Einstiegspunkten —
> nicht nur auf dem, der zufällig schon Tests hatte.

---

## Was gut ist

Das gehört dazu, sonst entsteht ein falsches Bild. Über alle neun Bereiche wurden
**~80 Stellen explizit geprüft und für korrekt befunden.**

- **Das Rechnungswesen ist der stärkste Teil des Systems** — SKR03/04, Bilanz, GuV
  (§275 HGB), EÜR, SuSa, UStVA, ZM, GewSt, E-Bilanz/XBRL, Anlagenspiegel + AfA,
  Periodensperre, Storno-Audit-Trail, Jahresabschluss, GoBD-Z3, DATEV-EXTF,
  Wertberichtigungen, Verzugszinsen nach §288 BGB mit Basiszinssatz-Historie
- **E-Rechnung ist fertig** — XRechnung (UBL 2.1) + ZUGFeRD 2.2 inkl. Validator
- **`recordPayment()` selbst ist solide** — `SELECT … FOR UPDATE`, Decimal-Arithmetik,
  Überzahlungs-Guard, Periodensperre in der Transaktion. Die Brüche liegen ringsherum
- **Die zentrale `queue-config.ts`** — alle 17 Queues nutzen sie, Retries und
  exponentielles Backoff überall gesetzt, nirgends unendliche Retries
- **i18n außergewöhnlich gepflegt** — 8.988 Keys × 3 Sprachen mit identischer Key-Zahl,
  nur 32 Aufrufe ohne Ziel (31 davon in einer einzigen Komponente)
- **Codehygiene** — kein `console.log` im Produktionscode, kein leerer `onClick`, kein
  `href="#"`, kein Formular ohne Handler, 50 von 51 Config-Keys werden gelesen
- **Rechnungsliste** — 6 Massenaktionen, Inline-Bearbeitung, persistente Filter,
  Skonto-Ampel. Der Referenzstandard für die übrigen Listen
- **Vier-Augen-Prinzip** — Schwelle aus `TenantSettings`, Vorwarnung *im* Buchungsdialog
  bevor gebucht wird
- **secure-by-default Dry-Run** bei Retention und Digest — für DSGVO-Löschungen genau
  richtig
- **Mandanten-Isolation im Portal** — konsequent über `fund: { tenantId }`

---

## Empfohlene Reihenfolge

### Stufe 0 — sofort verifizieren (Minuten)
**Läuft auf dem Server ein Worker-Container?** Wenn nein, ist das der wichtigste Befund
des gesamten Audits — es betrifft die halbe Anwendung und wird in keiner Zahl sichtbar.

### Stufe 1 — Geldabfluss stoppen (Tage)
1. **Invarianten-Test** `Σ Positionsbeträge == Topf` schreiben — *vor* jedem Fix
2. **3.1** teilbezahlte Vorschüsse werden nicht verrechnet (Enum-Filter, Einzeiler)
3. **F12** Erlösbasis zählt Monats- **und** Jahresabrechnung (fehlender `month`-Filter)
4. **F4** Einmalentschädigungen werden jährlich ausgezahlt (fehlender `compensationType`-Filter)
5. **4 / F10** Anteilssummen-Prüfung in `execute()`
6. **F8** Vorschussverrechnung Brutto gegen Netto

### Stufe 2 — Datenschutz & Buchhaltung (Tage)
7. **Regression F4** `ignoreFields` in `updateWithAudit` — trivial, aber Klartext-Passwörter
8. **1.1** Zahlungsbuchung (Bank an Forderung) erzeugen — größter Brocken, ohne den ist
   die Buchhaltung strukturell unbrauchbar
9. **1.2** `unmatch` rückabwickeln
10. **Widgets 2** erfundene Fallback-Daten entfernen, besonders das Health-Widget

### Stufe 3 — die Doppelimplementierungen auflösen (Wochen)
11. Pacht-Calculator konsolidieren — löst F1, F2, F3, F5, F6, F7 und Randfall 3
12. `energy-calculator.ts` aktivieren statt `calculate/route.ts` — löst P1-5 und P1-6
13. Mahnwesen auf einen Pfad — löst 2.1 bis 2.5
14. `addMonthsSafe`-Helper — löst Randfall 1, 2, 15 und zwei weitere Stellen

### Stufe 4 — Fertiges anschließen (Tage, hoher sichtbarer Nutzen)
15. Die 16 verwaisten Buchhaltungsseiten verlinken (~5.500 Zeilen aktivieren)
16. `quick-search` an Cmd+K anbinden (~40 Zeilen)
17. Storno-Auslöser in der Journal-UI
18. KPI-Karten klickbar, Approval-Beleg verlinken, PDF-Vorschau in der Inbox

### Danach — Verbesserungen
Die 42 Vorschläge aus [BEDIENAUFWAND](AUDIT-2026-07-BEDIENAUFWAND.md) und
[FEHLENDE-FUNKTIONEN](AUDIT-2026-07-FEHLENDE-FUNKTIONEN.md). Stärkster Einzelblock dort:
**Störungsvorgang → bewerteter Ertragsausfall → Verfügbarkeitsabgleich → Gegenrechnung**
(A1–A3), weil 80 % des Unterbaus bereits existiert.

---

## Methodischer Hinweis

Jeder Prüfbereich hatte einen eigenen Blickwinkel und die ausdrückliche Anweisung, bereits
abgedeckte Themen nicht zu wiederholen. Alle Befunde sind mit Datei und Zeile belegt; die
Rechenfehler zusätzlich mit durchgerechneten Zahlenbeispielen.

Die Berichte nennen konsequent auch, **was geprüft und für korrekt befunden wurde** — das
ist für die Einordnung genauso wichtig wie die Fundliste und verhindert, dass funktionierende
Teile „mitrepariert" werden.
