# Save-Correctness-Audit — Leases, Contracts, Documents, Plots, Portal, Mailings

Stand: 2026-07-10 · Domäne: Leases + Contracts + Documents + Plots + Portal + Kommunikation

---

## Top-Findings

### 1. Document-PUT ignoriert `approvalStatus` — Save meldet Erfolg, Feld bleibt unverändert
- **Datei / Zeile:** `src/app/api/documents/[id]/route.ts:207-220`
- **Bug:** `documentUpdateSchema` (Z.18) akzeptiert `approvalStatus`, aber der `data:`-Block der `prisma.document.update` schreibt es NICHT (nur title/description/category/tags/isArchived). Client sieht 200 OK, Status bleibt gleich.
- **Impact:** Doc-Reviewer schaltet Status um und wundert sich warum nichts passiert. Ausgerechnet ein Save-Bug.
- **Fix:** `...(validatedData.approvalStatus !== undefined && { approvalStatus: validatedData.approvalStatus })` ergänzen.
- **Kategorie:** 🔴 Standard (Zod-Mismatch)

### 2. Document-PUT ohne `tenantId` in `where`
- **Datei / Zeile:** `src/app/api/documents/[id]/route.ts:208`
- **Bug:** `prisma.document.update({ where: { id }, ... })` — kein `tenantId`. Der vorherige `findFirst` ist zwar tenant-scoped, aber TOCTOU-Race-Window vorhanden. Inkonsistent zu `Lease`/`Contract`-Handlern.
- **Fix:** `where: { id, tenantId: check.tenantId! }`
- **Kategorie:** 🔴 Standard

### 3. `POST /api/leases/usage-fees` — Duplikat-Check unlogisch mit `month: 0`
- **Datei / Zeile:** `src/app/api/leases/usage-fees/route.ts:120-134`
- **Bug:** Uniqueness-Lookup verwendet `month: 0`, aber `create` setzt weder `periodType` noch `month`. Der neue Konsolidierungs-Constraint ist `[tenantId, parkId, year, periodType, month]` — nach Konzept-Doc `month: null` für FINAL. Der 0/null-Mismatch führt dazu, dass Duplikate nicht erkannt werden oder der 2. Aufruf am realen DB-Constraint scheitert.
- **Fix:** `month: null, periodType: "FINAL"` konsistent zum settlement-Handler nutzen (siehe `settlement/route.ts:159-165`).
- **Kategorie:** 🔴 Lease

### 4. Plot-Merge verwirft Lease-Zuordnungen
- **Datei / Zeile:** `src/app/api/plots/merge/route.ts:61-93`
- **Bug:** Neuer merged Plot wird angelegt, aber existierende `LeasePlot`-Zuordnungen der Quell-Plots werden NICHT auf den neuen Plot migriert. Die Quellen behalten `leasePlots`, verlieren aber `geometry` (`updateMany … geometry: DbNull`). Ergebnis: verwaiste Pachtverträge zeigen auf "leere" Plots ohne Karte.
- **Fix:** Vor Cleanup `tx.leasePlot.updateMany({ where: { plotId: in }, data: { plotId: merged.id } })` — allerdings mit dedupe (Uniqueness), oder Business-Regel klären.
- **Kategorie:** 🔴 Standard/FK (Plot)

### 5. Plot-Split — gleiche Baustelle wie Merge
- **Datei / Zeile:** `src/app/api/plots/[id]/split/route.ts:51-90`
- **Bug:** Neue Plots übernehmen KEINE Lease-Zuordnungen; Original wird "als gelöscht markiert" (Kommentar Z.83), tatsächlich nur `geometry: DbNull`. `LeasePlot.plotId → original` bleibt, `status`-Feld bleibt ACTIVE.
- **Fix:** Original archivieren (`status: ARCHIVED`) und/oder LeasePlots explizit auf Split-Plots verteilen (fachlich unklar → User fragen).
- **Kategorie:** 🔴 Standard/FK (Plot)

### 6. Portal-Account-Delete schreibt Audit-Log mit fremdem Tenant
- **Datei / Zeile:** `src/app/api/portal/my-account/delete/route.ts:101-112`
- **Bug:** `tx.tenant.findFirst({ where: { status: "ACTIVE" } })` liefert einen RANDOM aktiven Tenant systemweit. Das AuditLog eines Portal-Users wird ggf. einem fremden Tenant zugeordnet. Cross-Tenant-Datenspur + DSGVO-Trail-Bruch.
- **Fix:** `session.user.tenantId` aus Session verwenden, oder via `shareholder.fund.tenantId` beziehen. `findFirst({ status: "ACTIVE" })` ist nie korrekt.
- **Kategorie:** 🔴 Portal

### 7. Portal-Proxy-DELETE — Missbrauch der `validUntil`-Semantik
- **Datei / Zeile:** `src/app/api/portal/my-proxies/[id]/route.ts:66-72`
- **Bug:** Revoke setzt `validUntil = now()`. Bei SINGLE-Proxies (dort war `validUntil = vote.endDate`) wird die originale Vote-Deadline überschrieben — Historie geht verloren. Response nennt es `revokedAt`, es ist aber `validUntil`.
- **Fix:** Dediziertes `revokedAt`-Feld hinzufügen (Migration) ODER die zwei Semantiken sauber trennen.
- **Kategorie:** 🟡 Portal

### 8. Portal-Proxy-DELETE — Proxy-Lookup ohne Tenant/Shareholder-Scope
- **Datei / Zeile:** `src/app/api/portal/my-proxies/[id]/route.ts:46-57`
- **Bug:** `voteProxy.findUnique({ where: { id }})` lädt jedes Proxy globalen IDs, prüft dann nachträglich `shareholderIds.includes(proxy.grantorId)`. Timing-Enumeration möglich (existiert vs. gehört-mir).
- **Fix:** `findFirst({ where: { id, grantorId: { in: shareholderIds }}})` — beides in einer Abfrage.
- **Kategorie:** 🟡 Portal

### 9. Contract-Create ohne Tenant-Check auf FK-Felder
- **Datei / Zeile:** `src/app/api/contracts/route.ts:235-263` und `[id]/route.ts:279-282`
- **Bug:** `parkId`, `turbineId`, `fundId`, `partnerId` werden direkt aus dem Body übernommen — keine Prüfung ob diese IDs zum eigenen Tenant gehören. Prisma-FK verhindert nur fremde IDs, nicht fremde Tenants. Cross-Tenant-Referenz möglich.
- **Fix:** Analog zu `plots/POST` (Z.236-247): pro FK `findFirst({ id, tenantId })`.
- **Kategorie:** 🔴 Contract

### 10. Contract-DELETE: verlinkte Documents nur `SetNull`, kein Cleanup der `contractDocumentUrl`-Kette
- **Datei / Zeile:** `src/app/api/contracts/[id]/route.ts:339-341`; Schema `prisma/schema.prisma:925`
- **Verhalten:** Documents mit `contractId` erhalten `contractId = null` (via `onDelete: SetNull`). Das ist OK — aber Dokumente/Tags aus dem `parentEntityType=Contract`-Autolink (documents/route.ts:346-348) verlieren jede Rückverknüpfung; Suche/Explorer zeigen sie nur noch über Tag.
- **Fix:** Beim Contract-DELETE optional zugehörige Documents archivieren (`isArchived: true`), nicht bloß relation nullen.
- **Kategorie:** 🟡 Contract

### 11. Document-Upload: Lease-Verknüpfung nur via Tag, ohne Existenz-Check
- **Datei / Zeile:** `src/app/api/documents/route.ts:342-355`
- **Bug:** `parentEntityType === "Lease"` erzeugt Tag `lease:${parentEntityId}`. Keine Prüfung ob der Lease existiert oder zum Tenant gehört. User kann beliebige UUIDs als Tag "einbrennen" — Suche findet falsche Dokumente / Cross-Tenant-Leak in freien Tag-Suchen möglich.
- **Fix:** `prisma.lease.findFirst({ id: parentEntityId, tenantId })` vor Tag-Anlage. Bei Contract analog prüfen.
- **Kategorie:** 🔴 Document

### 12. Document-Version-Upload ignoriert Storage-Quota + Tenant
- **Datei / Zeile:** `src/app/api/documents/[id]/versions/route.ts:64-94`
- **Bug:** POST versions inkrementiert `tenant.storageUsedBytes` NICHT (`/api/documents` POST tut das). Neue Versionen umgehen komplett das Quota-Tracking. Zudem: `fileSizeBytes` als `number` — bei Werten > `Number.MAX_SAFE_INTEGER` implizit truncated. Feld ist im Schema BigInt.
- **Fix:** Storage-Tracking analog zu documents/route.ts:449-453 in Transaktion aufnehmen; `BigInt`-Konvertierung.
- **Kategorie:** 🔴 Document

### 13. Settlement-Reactivate lässt Alt-Rechnungen verwaisen
- **Datei / Zeile:** `src/app/api/leases/settlement/route.ts:203-250`
- **Bug:** Wenn ein CANCELLED/SETTLED-Settlement re-aktiviert wird, werden `settlementInvoiceId`/`advanceInvoiceId` an den Items auf `null` gesetzt — die Invoice-Datensätze selbst bleiben aber bestehen und referenzieren weiterhin diese Items (`invoice.settlementItemId` als Rückreferenz). Rechnungen erscheinen dann als "orphaned" ohne Settlement-Herkunft.
- **Fix:** Beim Reactivate zugehörige Invoices explizit stornieren (Status → CANCELLED) statt bloß FK zu nullen; oder Reactivate-Aktion sperren wenn Invoices in `SENT/PAID`.
- **Kategorie:** 🔴 Lease

### 14. Mailings-Send: Empfänger-Snapshot erst zur Sendezeit gebaut
- **Datei / Zeile:** `src/app/api/mailings/[id]/send/route.ts:65-95`
- **Bug:** DRAFT-Mailings speichern nur `recipientFilter` (JSON). Erst beim SEND wird `getShareholdersWithDeliveryInfo` LIVE ausgeführt. Wenn zwischen DRAFT-Speichern und SEND ein Contact/Shareholder gelöscht/deaktiviert wird, wird er einfach nicht angeschrieben — der Sender hat aber im Draft "150 Empfänger" gesehen. Kein Warnhinweis.
- **Fix:** Beim Übergang zu SENDING einen Snapshot der Empfänger-IDs in einem Feld ablegen und für zukünftige Wiederholung/Fehleranalyse fixieren.
- **Kategorie:** 🟡 Kommunikation

### 15. Mailings-Send: kein Ende-zu-Ende-Transaktions-Schutz
- **Datei / Zeile:** `src/app/api/mailings/[id]/send/route.ts:100-201`
- **Bug:** Sequenzieller `for..of` über Empfänger mit `sendEmailSync` pro Iteration; `mailing.status = "SENDING"` (Z.88), Loop, `mailing.status = final` (Z.192). Bricht die Serverless-Funktion mitten drin ab (Timeout, Redeploy, Crash), bleibt `mailing.status = SENDING` FÜR IMMER; TeilEmails sind schon raus. Kein Recovery-Pfad, kein Resume.
- **Fix:** BullMQ-Job (existiert bereits im Stack): jeder Empfänger = 1 Job. Mailing-Status wird nachträglich aus Recipient-Aggregation berechnet.
- **Kategorie:** 🔴 Kommunikation

### 16. LeasePlot-Update in `PATCH /api/leases/[id]` — Delete-then-Create ohne History-Schutz
- **Datei / Zeile:** `src/app/api/leases/[id]/route.ts:163-174`
- **Bug:** Bei jedem `plotIds`-Update wird die komplette `leasePlot`-Tabelle für den Lease gelöscht und neu angelegt. Falls andere Entities (z.B. LeaseSettlementItem.plotSummary) implizit auf diese Zuordnungen zeigen, geht Zwischenhistorie verloren. Zudem: keine `tenantId`-Absicherung im `plot.findMany` scope-check reicht — aber das Delete-Create ist stumpf.
- **Fix:** Diff-Update (add missing, remove obsolete) statt "alles neu".
- **Kategorie:** 🟡 Lease

### 17. Contract-Auto-Renewal: kein Auto-Create bei erreichtem `endDate`
- **Datei / Zeile:** `src/app/api/contracts/**` (kein Handler existiert)
- **Bug/Beobachtung:** Schema hat `autoRenewal`, `renewalPeriodMonths`, aber es gibt KEINEN Cron/Handler, der bei erreichtem `endDate` einen neuen Contract erzeugt oder die Laufzeit verlängert. Aus User-Sicht: "Auto-Renew" hakt an, es passiert aber nichts.
- **Fix:** Fachlich klären ob Auto-Renew "Laufzeit verlängern" oder "neuen Contract anlegen" heißt. Cron-Job oder BullMQ-Task ergänzen.
- **Kategorie:** 🟡 Contract

### 18. CPI-Adjustment: Nur Read-Endpoint, kein Write-Handler
- **Datei / Zeile:** `src/app/api/leases/cpi-due/route.ts` (nur GET); `src/lib/leases/cpi-check.ts`
- **Bug/Beobachtung:** Widget zeigt fällige CPI-Anpassungen. Es gibt aber KEINEN Endpoint, der `cpiLastAdjustedAt` setzt oder neue Grundentgelte + Zahlungsplan atomar schreibt. User klickt "Anpassen" — leerer Handler.
- **Fix:** `POST /api/leases/[id]/cpi-adjust` mit Transaktion: (a) neuen Grundentgelt-Betrag setzen, (b) `cpiLastAdjustedAt = now`, (c) offene Zahlungsplan-Einträge neu berechnen, (d) AuditLog.
- **Kategorie:** 🔴 Lease

### 19. Shapefile-Import: keine Person-Uniqueness bei Rechtsformen
- **Datei / Zeile:** `src/app/api/plots/import-shp/confirm/route.ts:314-327`
- **Bug:** Legal-Person-Lookup nur über `companyName` case-insensitive. Ohne Adress-Vergleich werden verschiedene "GmbH" (z.B. mehrere "Meyer GmbH") als identisch behandelt und Verträge falsch zusammengeführt.
- **Fix:** Zusätzlich `postalCode + city` in den Match-Key aufnehmen; oder Owner-Overrides zwingend nutzen.
- **Kategorie:** 🟡 Standard/FK

### 20. `usage-fees/import` — keine Cross-Tenant-Validierung für items[]
- **Datei / Zeile:** `src/app/api/leases/usage-fees/import/route.ts:88-113`
- **Bug:** Iteriert über `items[]` und schreibt `leaseId` + `lessorPersonId` DIREKT ins Item, ohne zu prüfen ob diese Entities zum aktuellen Tenant gehören. Ein Angreifer mit `LEASES_UPDATE`-Recht könnte durch Body-Manipulation Fremd-IDs unterschieben.
- **Fix:** Vor Loop-Start alle Lease/Person-IDs sammeln und mit `findMany({ id: in, tenantId })` gegen Tenant validieren.
- **Kategorie:** 🔴 Standard

---

## Quer-Beobachtungen (nicht in Top 20)

- Beide Settlement-Routen (`/api/leases/usage-fees/*` und `/api/leases/settlement/*`) schreiben auf DASSELBE Prisma-Modell `LeaseRevenueSettlement`. Der Konzept-Doc `docs/concepts/LEASE_SETTLEMENT_CONSOLIDATION.md` bestätigt: `usage-fees` ist der ALTE Weg. Beide sind live und divergieren (Punkt 3). Empfehlung: `usage-fees` deprecieren, Redirect auf `settlement`.
- `PersonEditDialog.tsx:93-112` PATCHt `bankIban`/`bankBic`/`bankName` direkt an `/api/persons/[id]` — der Portal-Approval-Workflow (`PendingBankUpdate`) wird umgangen. Für Admin-Kontext OK; sicherstellen dass Portal-Users diesen Dialog nie sehen.
- Alle `POST/PATCH`-Handler nutzen konsistent `apiError`. Keine `NextResponse.json({error})` mehr gefunden — CLAUDE.md-Konvention eingehalten.

Datei: `c:/VS_Code/Verwaltung/graphify-out/save-audit-leases.md`
