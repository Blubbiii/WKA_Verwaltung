# Audit: Worker, Queues und Hintergrundverarbeitung

> Stand 2026-07-29 · **Nur Befund, nichts gefixt**

---

## 🔴 Vorab: Im Produktions-Stack läuft überhaupt kein Worker

`docker-compose.portainer.yml` enthält die Services app, postgres, redis, minio,
minio-init, meilisearch, backup, backup-manual, prometheus, metabase — **keinen
`worker`-Service.** `docker-compose.prod.yml:242` und `docker-compose.dev.yml:61` haben
ihn. `START_MODE` ist beim `app`-Container nicht gesetzt, `src/instrumentation.ts` startet
keine Worker.

**Folge:** Jeder enqueued Job bleibt unbegrenzt in Redis liegen.

- Eingangsrechnungen hängen dauerhaft auf `OCR_PROCESSING`/`PENDING`
- Kein Webhook wird zugestellt
- Approvals laufen nie ab
- Retention-Sweep (DSGVO-Löschungen) läuft nie
- Redis wächst monoton — `--maxmemory-policy noeviction` **ohne `maxmemory`**
  (`docker-compose.portainer.yml:113`) → irgendwann Schreibfehler

**Alles Weitere in diesem Dokument ist erst relevant, wenn dieser Punkt behoben ist.**

---

## Inventar

| Queue | Worker | Producer / Trigger | Registriert? | Idempotent? | Retry |
|---|---|---|---|---|---|
| `email` | ✔ Registry | `sender.ts:274`, `billing.worker.ts:756`, `reminder-service.ts:684`, `scheduled-report-service.ts:128` | Worker ja — **Payload passt nicht** (F3) | nein (`jobId` mit `Date.now()`) | 3 / exp 2 s, DLQ ✔ |
| `pdf` | ✔ | nur `enqueueAnnualReportPdfAsync`; `enqueueInvoicePdf`/`ReportPdf`/`VoteResultPdf` **ohne Aufrufer** | ja | jobId stabil → **blockiert Regenerierung** (F14) | 3 / exp 5 s, DLQ ✔ |
| `billing` | ✔ | **kein einziger Producer** | Worker ja, Jobs nie | bulk ✔ / single ✘ | 3 / exp 10 s, DLQ ✔ |
| `weather` | ✔ | `initializeWeatherScheduling()` **ohne Aufrufer** | **nein** | ja | 3 / exp 5 s, keine DLQ |
| `report` | ✔ | `scheduleDailyReportProcessing()` **ohne Aufrufer** | **nein** | ja | 2 / exp 30 s, keine DLQ |
| `reminder` | ✔ | `scheduleDailyReminderCheck()` ohne Aufrufer | **nein** | ja (Cooldown) | 2 / exp 30 s, keine DLQ |
| `scada-auto-import` | ✔ | Cron `scheduleScadaAutoImport()` **ohne Aufrufer**; nur „run now" manuell | **Cron nein** | nein | 3 / exp 10 s, keine DLQ |
| `paperless` | ✔ | `documents/route.ts:512,618`, `integrations/paperless/sync` | ✔ live | nein | 3 / exp 10 s, Status→FAILED ✔ |
| `inbox-ocr` | ✔ | `inbox/route.ts:167`, `inbox/[id]/ocr` | ✔ live | **nein** (F15) | 2 / exp 30 s, keine DLQ |
| `approvals-expiry` | ✔ | `src/workers/index.ts:237` (6 h) | ✔ **einziger vollständig korrekter Cron** | ja | 2 / exp 30 s |
| `approvals-reconcile` | ✔ | `scheduleApprovalsReconcileCheck()` **ohne Aufrufer** | **nein** | ja | 2 / exp 30 s |
| `retention-cron` | ✔ | `src/workers/index.ts:250` (täglich 03:00) | ✔ | ja (Dry-Run default) | 2 / exp 30 s |
| `tus-gc` | ✔ | `src/workers/index.ts:267` (6 h) | ✔ | ja | 2 / exp 30 s |
| `daily-digest` | **nicht in Registry** | `src/workers/index.ts:283` (08:00) | ✔ Job, **✘ Shutdown/Health** (F17) | ja | 2 / exp 30 s |
| `webhook` | ✔ | `webhooks/dispatcher.ts:56`, Admin-Test | ✔ live | nein | 3 / exp 10 s, keine DLQ |
| Cron `api/cron/check-deadlines` | — | externer Scheduler | Bearer + Rate-Limit ✔, **Secret im Prod-Stack nicht gesetzt** | ja | — |
| Cron `api/cron/bundesbank-rate-fetch` | — | externer Scheduler | Bearer ✔, **Token nicht gesetzt** | ja | — |

**Bilanz:** Von 15 Workern haben **5** einen real registrierten Trigger, plus 2
request-getriebene. **8 Queues sind faktisch tot.**

---

## P0

### F1 · Kein Worker im Produktions-Stack
Siehe oben.

### F2 · Billing-Queue: Payload ohne `type`, Worker wirft immer
`billing.queue.ts:16-31` definiert `BillingJobData = {ruleId, tenantId, …}` — **ohne
`type`**. `billing.worker.ts:1395-1424` schaltet auf `data.type` und landet im
`default`-Zweig: `throw new Error("Unknown billing job type: undefined")`.

Betroffen: `enqueueBillingJob`, `enqueueBillingBulk`, `enqueueBillingDryRun`,
`scheduleRecurringBilling`, `scheduleRecurringInvoiceProcessing`.

**Wirkung:** Sobald jemand die Abrechnungs-Automatik verdrahtet, scheitert **jeder** Job
3× und landet in `FailedJob` — ohne dass ein Mensch das je sieht (F18). Rechnungsläufe,
Mahnläufe und wiederkehrende Rechnungen sind nicht nur ungenutzt, sondern beim Aktivieren
sofort kaputt.

### F3 · Email-Schema-Mismatch führt zu Totalausfall, nicht zu Degradation
Alle 4 Producer senden `{template, data}`. `email.worker.ts:148` prüft
`knownTemplates.includes(data.type)` → `undefined` → Fallback-Zweig `:158`:
`(data.templateData.html as string)` → **TypeError auf `undefined`**. Der Job scheitert
also nicht mit Template-Fehler, sondern hart, 3× Retry, dann DLQ.

**Verstärkend:** `reminder-service.ts:195-206` schreibt `ReminderLog.emailSent = true`,
sobald `enqueueEmail` zurückkehrt.

**Wirkung:** Mahnungen und Erinnerungen sind im System als „versendet" protokolliert,
kommen aber nie an — **und der Cooldown-Check verhindert danach eine Wiederholung.**

### F4 · Redis-Verbindung reconnectet nach ~5,5 s Ausfall nie wieder
`connection.ts:24-32`: `retryStrategy` gibt bei `times > 10` `null` zurück; Delays sind
`min(times*100, 30000)` → Summe ≈ 5,5 s. Die Connection ist ein Modul-Singleton
(`connection.ts:13`), den sich **alle 15 Worker und alle Queues teilen**.

**Szenario:** Redis-Neustart dauert 10 s → Verbindung tot, wird nie neu aufgebaut. Der
Worker-Prozess lebt weiter, verarbeitet aber nichts. Der Health-Check
(`src/workers/index.ts:61`) loggt alle 60 s „Redis connection unhealthy", **beendet den
Prozess aber nicht** — der Docker-Healthcheck baut eine *eigene* Verbindung auf und meldet
weiterhin „healthy". **Kein Restart, kein Alarm.**

### F5 · Approvals-Reconcile-Cron ist nie registriert
`approvals-reconcile.queue.ts:69` hat außer dem Barrel-Re-Export **keinen Aufrufer**. Der
Worker läuft, bekommt aber nie einen Job.

**Szenario:** Ein Approval wird genehmigt, der inline-Executor stirbt (Request-Abbruch,
Deploy) → `status=APPROVED, executedAt=null`. Genau dafür existiert dieser Reconciler.

**Wirkung:** Genehmigte Buchungen und Journal-Einträge bleiben dauerhaft unausgeführt,
ohne Sichtbarkeit. **Der Ausfallpfad mit direktem Geldbezug.**

---

## P1

### F6 · Reconciler markiert fehlgeschlagene Re-Executions als erledigt
`approvals-reconcile.worker.ts:74-83`, `:101-107` setzen `executedAt: new Date()` **auch
wenn `result.success === false`** oder der Executor geworfen hat. Der Datensatz fällt
danach aus dem Suchfilter (`executedAt: null`) und wird nie wieder aufgegriffen — ein
transienter Fehler wird zu permanentem Datenverlust. Der Kommentar („damit nicht endlos
versucht wird") verwechselt Retry-Begrenzung mit Aufgabe.

### F7 · Report- und Weather-Scheduling nie initialisiert
`report.queue.ts:102`, `:76` und `weather/scheduler.ts:361` haben **keine Aufrufer**.
Geplante Berichte werden nie erzeugt und nie versendet; Wetterdaten nie synchronisiert.
Beide Worker laufen als teure No-Ops und melden im Health-Check „running".

### F8 · „Auto-Import aktiviert" ohne Scheduler
`api/energy/scada/auto-import/route.ts:66-80` setzt bei `action:"enable"` nur
`autoImportEnabled` und antwortet *„Auto-Import aktiviert für {locationCode}"*.
`scheduleScadaAutoImport()` wird nirgends aufgerufen.

**Wirkung:** Der Nutzer erhält eine positive Bestätigung für einen Automatismus, der nicht
existiert. Ertragsdaten fehlen unbemerkt.

### F9 · Mahngebühr wird berechnet, aber nie gebucht
`billing.worker.ts:694-716` ermittelt `lateFee` und schreibt sie in **Freitext**
(`invoice.notes`, `:718-725`). Kein `invoice.update` auf Beträge, keine Rechnungsposition,
kein `reminderLevel`-Feld. Mahnstufen sind nur aus einem Notiz-String rekonstruierbar →
derselbe Level kann beliebig oft erneut versendet werden.

*(Deckt sich mit Finding 2.2 aus dem Prozessketten-Audit — dort aus der anderen Richtung.)*

### F10 · Mahnung meldet Erfolg, obwohl der Versand scheiterte
`billing.worker.ts:785-790`: `enqueueEmail`-Fehler wird geschluckt, der Job liefert
`success: true` (`:812`), und die Notiz behauptet „Mahnung versendet". In Kombination mit
F3 gilt das für **jede** Mahnung.

### F11 · Fachliche Fehlschläge werden als „completed" verbucht
`billing.worker.ts:1427-1432` gibt `result` unverändert zurück; ein
`result.success === false` wird **nicht geworfen**. BullMQ zählt den Job als erfolgreich,
der `failed`-Handler und damit die DLQ greifen nicht, Queue-Statistiken zeigen 0 Fehler.

**Ein Bulk-Lauf, bei dem 200 von 300 Gutschriften scheitern, ist in der Admin-UI grün.**

### F12 · Einzelrechnung ohne Idempotenzschlüssel
`billing.worker.ts:322-358`: `getNextInvoiceNumber()` + `prisma.invoice.create()` ohne
Dedup-Prüfung — im Gegensatz zum Bulk-Pfad, der es korrekt macht. Committet der Create und
geht die Antwort verloren, retried BullMQ → **zweite Rechnung mit zweiter Nummer**.

### F13 · Bulk-Invoice reißt Lücken in den Nummernkreis
`billing.worker.ts:1135-1139` reserviert **vorab** `shareholders.length` Nummern; der
Idempotenz-Check folgt erst in der Schleife (`:1165-1188`) und überspringt bereits
existierende — die Nummer verfällt.

Retry für 300 Gesellschafter, 298 existieren bereits → **298 Nummern verbrannt.**
GoBD-relevant.

### F14 · Stabile Job-IDs verhindern PDF-Neuerzeugung
`pdf.queue.ts:214`, `:250`. BullMQ behandelt `queue.add` mit existierender jobId als
No-Op, solange der Job im completed-Set liegt (`removeOnComplete: {count: 100}`).

Jahresbericht erzeugt → Stammdaten korrigiert → erneut „Bericht erstellen" → **der alte
Job wird zurückgegeben**, das Frontend zeigt sofort „fertig" mit dem veralteten
Storage-Key. Kein Fehler, keine Warnung.

### F15 · Inbox-OCR: `PROCESSING` ohne Timeout, Lock zu kurz
`inbox-ocr.worker.ts:63-66` setzt `ocrStatus: PROCESSING`. Der Worker (`:141-148`) setzt
**keine `lockDuration`** → BullMQ-Default 30 s, bei CPU-gebundenem Tesseract auf dem
Main-Thread.

12-Seiten-PDF, OCR dauert 90 s → Lock läuft ab → stalled → Neuzustellung an den zweiten
Slot → **zwei parallele OCR-Läufe auf demselben Datensatz**, danach
`maxStalledCount`-Fail. Der `failed`-Handler (`:157`) setzt den Status **nicht** zurück
→ Rechnung hängt dauerhaft, Rettung nur per DB-Korrektur.

### F16 · Fehlerklassifikation invertiert
`inbox-ocr.worker.ts:86-95`: jeder Fehler aus `getFileBuffer()` (S3-Timeout, transient)
führt zu `return {success:false}` statt `throw` → **kein Retry**, Status hart auf `FAILED`.

Umgekehrt wird bei `webhook.worker.ts:76-89` ein permanenter HTTP 404/410/401 genauso
retried wie ein 503. **Beide Richtungen falsch.**

### F17 · Daily-Digest-Worker umgeht Registry, Shutdown und Health
`src/workers/index.ts:280-284` startet ihn direkt, er steht aber nicht im
`workerRegistry`. Deploy sendet SIGTERM → `stopAllWorkers()` kennt ihn nicht →
`closeConnections()` reißt die geteilte Redis-Verbindung unter einem laufenden Digest-Job
weg → `dailyDigestLastSentAt` ist für einen Teil der User gesetzt, für den Rest nicht.
Zusätzlich meldet `getWorkersStatus()` ihn nie — ein abgestürzter Digest-Worker ist
unsichtbar.

### F18 · Dead-Letter-Queue ist write-only und deckt 3 von 15 Workern ab
`persistFailedJob` wird nur von `billing.worker.ts:1501`, `email.worker.ts:316`,
`pdf.worker.ts:394` aufgerufen. Die Tabelle `FailedJob` wird **nirgends im Code gelesen**
— keine API, keine UI, kein Alert.

Endgültig gescheiterte Jobs (inkl. sämtlicher E-Mails, siehe F3) verschwinden lautlos in
einer Tabelle, die niemand ansieht. Für weather, report, reminder, scada, webhook und
inbox-ocr existiert nicht einmal das.

### F19 · (Security) Admin-Jobs-API ohne Mandantentrennung
`api/admin/jobs/[id]/route.ts:62-107` und `/retry/route.ts` nutzen `requireAdmin()`
(`withPermission.ts:299-320` — prüft nur Rollen-Hierarchie, **kein Tenant-Scope**) und
rufen `findJobById()` (`registry.ts:394-405`), das über **alle** Queues **aller Mandanten**
iteriert. `serializeJob` (`registry.ts:287`) gibt `job.data` **vollständig** zurück.

Ein Admin von Mandant A kann fremde Empfänger-E-Mail-Adressen, Rechnungspositionen,
Beträge und `tenantId` lesen; `retry` und `DELETE` sind ebenfalls mandantenübergreifend
ausführbar.

---

## P2

### F20 · Repeatable-Jobs lassen sich nicht entfernen (falsche Keys)
BullMQ bildet den Key als `${name}:${jobId}:${endDate}:${tz}:${suffix}` mit dem
Cron-Pattern als Suffix. Falsch gebaut:
- `billing.queue.ts:172-174` → Suffix `${ruleId}` statt Pattern
- `weather.queue.ts:208-213` → Literal `*` (kein Globbing bei `removeRepeatableByKey`)
- `scada-auto-import.queue.ts:193` → Literal `*`

Alle drei ohne Scan-Fallback → wird eine BillingRule gelöscht oder ein Park deaktiviert,
**feuert der Cron weiter und arbeitet gegen gelöschte Entitäten.**

**Korrekt gemacht in `approvals-expiry.queue.ts:118-142`** (richtiges Key-Format +
Scan-Fallback) — das ist die Vorlage.

### F21 · Transaktionsgrenze: DB-Commit vor Enqueue
`api/inbox/route.ts:145-172`: `incomingInvoice.create()` committet, danach
`await enqueueInboxOcrJob(...)`. Redis kurz weg → Enqueue wirft → 500. Der Datensatz
existiert aber bereits → erneuter Upload liefert `P2002` → 409 „Rechnung existiert
bereits". Die Rechnung hängt ohne OCR fest.

### F22 · Cron-Routen gut abgesichert, aber im Prod-Stack nicht verdrahtet
`api/cron/check-deadlines/route.ts:18-28` (Bearer `CRON_SECRET` + IP-Rate-Limit,
fail-closed) und `api/cron/bundesbank-rate-fetch/route.ts:20-36` sind **sauber**. Aber:
keine der Variablen steht in `docker-compose.portainer.yml:47-70`, und es gibt keinen
Scheduler-Eintrag → Fristenprüfung und Bundesbank-Zinssatz-Update laufen nie.

*Kleinigkeit:* `authHeader !== \`Bearer ${cronSecret}\`` ist nicht timing-safe.

### F23 · Keine Queue-Observability
`wpm_queue_jobs_active` ist in `lib/metrics/prometheus.ts:69` definiert und wird
**nirgends gesetzt**. `getQueueHealth()` prüft nur, ob `getJobCounts()` antwortet — nicht,
ob ein Consumer existiert. `api/health/ready` prüft nur DB + Redis-PING.

**Der aktuelle Zustand (F1: kein Worker läuft, alle Queues wachsen) ist über keinen
einzigen Health-Endpunkt oder Prometheus-Wert sichtbar.**

### F24 · Cron-Patterns ohne Zeitzone
Kein einziger `repeat` setzt `tz`. BullMQ wertet in Prozess-Lokalzeit aus; der Container
hat kein `TZ` → UTC. „Täglich 08:00" (Mahnlauf, Digest) läuft real um 09:00 bzw. 10:00
Berlin und verschiebt sich zweimal jährlich um eine Stunde.

### F25 · Überlappende Läufe möglich
`docker-compose.prod.yml:279` setzt `WORKER_REPLICAS: 2`. Kein verteilter Lock für
Cron-Jobs. Bei Retention/Digest unkritisch (idempotent), **beim SCADA-Import kritisch** —
trifft auf das bereits dokumentierte `ScadaImportLog=RUNNING`-Problem und blockiert sich
selbst.

### F26 · Webhook-Secret im Job-Payload
`webhook.queue.ts:15-20` transportiert `secret` im Payload → Klartext in Redis, in
`job.data` und in `FailedJob.payload`. Außerdem ein Snapshot: eine Secret-Rotation wirkt
nicht auf bereits eingereihte Jobs → Signaturen mit altem Secret, Empfänger verwirft.

### F27 · PDF-Base64 im Job-Result
`pdf.worker.ts:326-328` legt bei `saveToStorage === false` das komplette PDF
base64-kodiert in den Job-Return-Wert → 100 × mehrere MB in Redis. Zusammen mit
`noeviction` ohne `maxmemory` genau das Szenario, vor dem `checkRedisMemoryConfig()` warnt.

---

## Als solide geprüft

- **`lib/config/queue-config.ts`** — zentrale Presets, von **allen 17** Queues verwendet.
  `attempts` und exponentielles `backoff` überall gesetzt; **nirgends** unendliche oder
  fehlende Retries. Env-überschreibbar. ✅
- **`billing.worker.ts:1465-1480`** — `lockDuration: 600000`, `stalledInterval: 60000`,
  `maxStalledCount: 1` mit erklärendem Kommentar („würde zu doppelten Rechnungen führen").
  Bewusste, korrekte Entscheidung — genau das, was F15 fehlt. ✅
- **`billing.worker.ts:1162-1188`** — Bulk-Idempotenz über `internalReference`-Marker plus
  partieller Unique-Index. Bis auf die Nummernvergabe (F13) vorbildlich. ✅
- **`billing.worker.ts:441-448`** — Kommentar zum Settlement-Duplikat-Check zeigt echtes
  Nebenläufigkeitsdenken (Race-Window analysiert, P2002 gefangen, Index dokumentiert). ✅
- **`reminder-service.ts:95-140`** — Cooldown-Dedup über `ReminderLog`, gebatcht statt
  N+1. ✅
- **`retention-cron.worker.ts:34-38` / `daily-digest.worker.ts:33-36`** — secure-by-default
  Dry-Run (alles außer explizit `"false"`). Für DSGVO-Löschungen genau richtig. ✅
- **`approvals-expiry.queue.ts:118-142`** — einziger vollständig korrekter Cron.
  Referenzimplementierung für F20. ✅
- **`src/workers/index.ts:104-189`** — Graceful Shutdown mit SIGTERM/SIGINT, 30 s Timeout,
  Worker→Redis→Prisma in korrekter Reihenfolge, `stop_grace_period: 30s` passend. Nur die
  Registry-Lücke (F17) untergräbt es. ✅
- **`connection.ts:141-182`** — `checkRedisMemoryConfig()` prüft `maxmemory`-Policy beim
  Start, behandelt managed-Redis ohne `CONFIG GET` sauber. ✅
- **`webhook.worker.ts:62-125`** — `WebhookDelivery`-Zeile pro Versuch inkl. Statuscode,
  Dauer, gekürztem Body. Beste Observability aller Worker. ✅
- **`paperless.worker.ts:129-146`** — setzt `paperlessSyncStatus: FAILED` bei endgültigem
  Fehlschlag, DB-Fehler dabei gefangen. Genau das Muster, das inbox-ocr fehlt. ✅
- **`email.worker.ts:77-81`** — E-Mail-Masking im Log, PII-bewusst. ✅
- **`withRequestContext`** mit `requestId`/`tenantId`/`jobId` in billing/email/pdf/report —
  konsequent für Log-Korrelation. ✅
