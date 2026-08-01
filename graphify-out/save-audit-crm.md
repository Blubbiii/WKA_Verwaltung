# Save-Correctness-Audit — CRM / Contacts / Vendors / Activities

Datum: 2026-07-10 · Scope: `src/app/api/crm/**`, `src/app/api/vendors/**`, `src/components/crm/**`, `src/app/(dashboard)/crm|vendors/**`

## Zusammenfassung

18 Handler geprüft. **Handler-Layer ist überwiegend sauber**: tenantId ist in allen Where/Data-Klauseln gesetzt, apiError statt Roh-NextResponse, Zod-Schemas vorhanden, soft-delete respektiert (`deletedAt: null`). Deduplikation und derived-vs-custom-Labels sind sauber implementiert.

Die **echten Bugs stecken im Client + in einer POST-Aktivitäten-Route**: Daten-Löschung durch nicht-hydratisierte Form-Felder, ein Cross-Tenant-FK-Loophole, ein 409-Response-Feldname-Drift und mehrere „Clear-Field-persistiert-nicht" Fehler.

---

## Findings

### 🔴 Kritisch — Daten falsch/nicht persistiert

**1. Vendor-Edit LÖSCHT `vatId`, `street`, `postalCode` still** — [vendors/page.tsx#L96-L114](src/app/(dashboard)/vendors/page.tsx#L96)
Beim Öffnen des Edit-Dialogs werden `vatId`, `street`, `postalCode` hart auf `""` gesetzt (weil sie im Client-Interface `Vendor` an [L51-L62](src/app/(dashboard)/vendors/page.tsx#L51) fehlen). Save schickt `null` → Prisma überschreibt bestehende Werte. **UI:** Nutzer korrigiert Namen, USt-IdNr./Anschrift verschwinden.
Fix: `Vendor`-Interface um die drei Felder erweitern und aus `vendor.vatId ?? ""` etc. hydrieren.

**2. Activities-POST hat keine Tenant-Verifikation der FKs** — [api/crm/activities/route.ts#L119-L145](src/app/api/crm/activities/route.ts#L119)
`personId/fundId/leaseId/parkId` werden ungeprüft in `crmActivity.create` verwendet. Zod prüft nur UUID-Format. Ein Nutzer in Tenant A kann eine Aktivität mit `personId` aus Tenant B anlegen → beim Reload sieht er Namen/Details der fremden Person via `include: { person: {...} }`.
Fix: analog zu `contact-links/route.ts#L92-L109` erst `findFirst({ where: { id, tenantId } })` pro angegebener Entität.

**3. Contact-Edit: `country: null` → 500-Save-Fehler** — [contacts/[id]/route.ts#L24](src/app/api/crm/contacts/%5Bid%5D/route.ts#L24)
Zod: `country: z.string().max(100).optional()` (kein `.nullable()`). Client [contact-edit-dialog.tsx#L118-L120](src/components/crm/contact-edit-dialog.tsx#L118) mapped alle Empty-Strings pauschal auf `null`, inkl. `country`.
**UI:** Nutzer leert Land-Feld → Save wirft 500 mit „Expected string, received null" Toast. Fix: `.nullable()` an country oder Client-Guard "country darf nicht null werden".

**4. Activity-Edit persistiert Feld-Löschung nicht** — [activity-form-dialog.tsx#L115-L118](src/components/crm/activity-form-dialog.tsx#L115)
`if (direction) body.direction = direction;` (analog `duration`, `startTime`, `dueDate`). Wenn der Nutzer ein zuvor gesetztes Feld leert (Zustand → ""), sendet der Client den Key nicht mit → PUT-Handler ignoriert per `!== undefined`-Check → alter DB-Wert bleibt.
**UI:** Task Fälligkeit „entfernen", speichern, F5 → Fälligkeit wieder da. Fix: bei leerem State explizit `null` senden.

**5. Dedup-Warnung (409) wird nie angezeigt** — [contacts/page.tsx#L429-L432](src/app/(dashboard)/crm/contacts/page.tsx#L429)
`setDedupMatch(err.existing as ExistingMatch)`. Backend liefert aber `{ code, error, details: { existing } }` (siehe [api-errors.ts#L145-L152](src/lib/api-errors.ts#L145)). `err.existing` ist `undefined` → Banner rendert nicht, kein Toast → UI wirkt still eingefroren nach Klick auf „Speichern" bei Duplikat.
Fix: `setDedupMatch((err.details as {existing: ExistingMatch}).existing)`.

**6. Zod-Validierungsfehler geben HTTP 500 statt 400** — mehrere Routes, z.B. [activities/route.ts#L114](src/app/api/crm/activities/route.ts#L114), [contacts/[id]/route.ts#L104](src/app/api/crm/contacts/%5Bid%5D/route.ts#L104), [activities/[id]/route.ts#L82](src/app/api/crm/activities/%5Bid%5D/route.ts#L82)
Verwendet `apiError("INTERNAL_ERROR", ...)` mit Default-Status 500 statt `BAD_REQUEST/VALIDATION_FAILED` (400). Verzerrt Monitoring/Alerts und macht Debugging schwer (echte 500er nicht mehr trennbar von Input-Fehlern). Kein Datenverlust, aber Prio-hoch für Ops.

### 🟡 UX / Konsistenz

**7. Optimistic Bulk-Tag ohne Rollback** — [contacts/page.tsx#L372-L402](src/app/(dashboard)/crm/contacts/page.tsx#L372)
`Promise.allSettled` → Success-Toast zählt zwar Fehler, aber `load()` erfolgt in allen Fällen. Fehlgeschlagene Tag-Zuweisungen bleiben stumm ohne Rollback-Hinweis. Kein Datenverlust.

**8. Bulk-Löschen mit `window.confirm`** — [vendors/page.tsx#L335](src/app/(dashboard)/vendors/page.tsx#L335)
Nutzt native `confirm()` statt AlertDialog. Nicht barrierefrei, nicht i18n. Für Einzel-Löschung wird AlertDialog verwendet — inkonsistent.

**9. Contact-Detail: Type-Change hat keine Server-Antwort-Rehydrierung** — [contacts/[id]/page.tsx#L155-L173](src/app/(dashboard)/crm/contacts/%5Bid%5D/page.tsx#L155)
`handleContactTypeChange` setzt Local State ohne Fehler-Rollback bei 5xx. Nicht kritisch, weil kein Cache-Divergenz-Risiko (Route macht keine Nebeneffekte auf contactType).

**10. Vendor-Interface unvollständig** — [vendors/page.tsx#L51-L62](src/app/(dashboard)/vendors/page.tsx#L51)
Fehlen: `vatId`, `street`, `postalCode`, `personId` — führt direkt zu Finding #1. Batch-Export exportiert nur 3 Spalten obwohl DB deutlich mehr hat.

**11. Activity `type` im Edit-Body irrelevant** — [activity-form-dialog.tsx#L109](src/components/crm/activity-form-dialog.tsx#L109)
Client sendet `type` beim PUT, das UpdateSchema in `activities/[id]/route.ts` enthält es aber nicht → Zod strippt still. Aktuell OK weil UI Type-Editing versperrt, aber falls jemand versucht Type nachträglich zu ändern, verhält sich Save ohne Fehler falsch.

**12. Activity-Timeline lädt nicht neu nach Delete** — [activity-timeline.tsx#L316-L318](src/components/crm/activity-timeline.tsx#L316)
`handleDeleted` filtert nur local. `lastActivityAt` auf der Person wurde bei POST gesetzt (activities/route.ts#L150), aber nicht bei DELETE zurückgerechnet. Kontakt-Header zeigt weiterhin falsches "Letzte Aktivität"-Datum bis F5.

**13. Contact-Edit-Dialog: `email` empty roundtrip** — [contact-edit-dialog.tsx#L118-L120](src/components/crm/contact-edit-dialog.tsx#L118)
Client normalisiert `email: ""` → `null`. Backend akzeptiert `.or(z.literal(""))` + `null` — funktioniert, doppelte Normalisierung ist aber vermeidbar Aufwand.

**14. Tag-Farb-Format ungeprüft** — [tags/route.ts#L13](src/app/api/crm/tags/route.ts#L13), [tags/[id]/route.ts#L12](src/app/api/crm/tags/%5Bid%5D/route.ts#L12)
`color: z.string().max(20)`. Ein Nutzer könnte "javascript:alert(1)" abspeichern; UI verwendet den Wert als `backgroundColor`/`color` via inline-Style ([person-tags.tsx#L117](src/components/crm/person-tags.tsx#L117)) — kein XSS-Vector direkt, aber Layout-Breaking möglich. Optional: hex-Regex `^#[0-9a-fA-F]{6}$`.

**15. `handleBatchDelete` in vendors ohne Concurrency-Limit** — [vendors/page.tsx#L333-L355](src/app/(dashboard)/vendors/page.tsx#L333)
Sequentielles await mit For-Loop. Bei 100+ Selects reagiert UI minutenlang nicht. `Promise.allSettled` mit `pLimit(5)` wäre klaren Fix.

---

## Positiv-Bestätigungen

- **Tenant-Isolation** in allen Where-Klauseln der geprüften Handler (contacts, activities/[id], tags, contact-links, email-templates, vendors) korrekt.
- **Soft-Delete** (`deletedAt: null`) konsistent respektiert bei Vendors, Activities, Leases, Contracts.
- **Dedup-Logik** in Contacts-POST sauber: findMatchingPerson + `force`-Escape-Hatch.
- **Derived-vs-Custom-Labels**: derived-Labels werden nie in PersonTag geschrieben; Suffix-Filter `labelFilterToWhere` sauber getrennt.
- **createdById**-Zuordnung in Activities korrekt (`check.userId!`).
- **Prisma-P2002-Handling** in Tags-POST + ContactLinks-POST sauber.
- **AbortController-Pattern** bei List-Views (contacts/page.tsx, vendors/page.tsx, contacts/[id]/page.tsx) korrekt gegen Stale-Responses geschützt.

Keine Prisma-Feldname-Drifts gefunden (Client-Payload-Keys matchen Schema-Feldnamen).
