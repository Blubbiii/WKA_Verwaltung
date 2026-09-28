# WindparkManager — Claude / Agent Instructions

Nur, was aus dem Code nicht hervorgeht und kein Werkzeug schon erzwingt.

## Vor jedem Commit

`npx tsc --noEmit && npm run lint && npm run build` — alle drei sauber. Der Build findet, was tsc nicht sieht (Client/Server-Grenze).

## 🚨 God Files

[src/lib/api-errors.ts](src/lib/api-errors.ts), [src/lib/auth/withPermission.ts](src/lib/auth/withPermission.ts), [src/lib/logger.ts](src/lib/logger.ts) — fast jede API-Route hängt daran. Bei Änderungen zusätzlich: Regressionstest gegen mindestens 3 API-Routen verschiedener Domänen, und die Commit-Message sagt, WARUM die Datei angefasst wurde.

## 🔒 Datenbankzugriff: mandantDb, nicht prisma

- API-Routen: `const db = mandantDb(check.tenantId!)` aus `@/lib/mandant/mandant-db` — hängt den Mandanten an jede Abfrage (auch Ändern/Löschen per ID) und setzt ihn beim Anlegen.
- `prisma` direkt nur für bewusst mandantenübergreifende Arbeit (Superadmin, Worker, Cron, Login). Eine solche API-Route beginnt mit `// mandantenübergreifend: <Grund>`; der Grund ist, was im Review geprüft wird. `src/lib/mandant/sperrklinke.test.ts` lässt keine unbegründete Route durch.
- Rohes SQL (`$queryRaw`) filtert `mandantDb` nicht — dort `"tenantId" = ${tenantId}` selbst führen. `src/lib/mandant/rohsql.test.ts` verlangt das.
- Fremdschlüssel beim Anlegen (`parkId`, `fundId` …) prüft `mandantDb` nicht — den Zieldatensatz vorher mit `db.park.findFirst({ where: { id } })` laden, sonst zeigt ein neuer Datensatz auf einen fremden Mandanten.

## 📥 Neue Fetches: react-query

Die meisten bestehenden Komponenten laden mit `useEffect + fetch`. **Neue** Client-Fetches trotzdem mit `useQuery` / `useMutation` (`@tanstack/react-query`). Bestehende nur umziehen, wenn du ohnehin in der Datei arbeitest.

## 📋 Neue Listen: `<DataTable>` aus `@/components/ui/data-table`

Statt `<Table>` von Hand. Bringt Sortierung (deutsche Kollation, `WEA 10` hinter `WEA 9`, leere Werte immer am Ende), Suche, Paginierung und einen Leerzustand, der „noch nichts angelegt" von „Filter passt auf nichts" unterscheidet. Spalte ohne `sortValue` = kein klickbarer Kopf.

**Nicht** für serverseitig paginierte Listen — sie durchsucht nur die geladene Seite. Die behalten ihre eigene Steuerung.

## 📅 Datumseingabe

- **Standard:** `<Input type="date">` — Filter, Zeiträume nahe am Heute, Dialoge.
- **Datum kann Jahre zurückliegen** (Inbetriebnahme, Vertragsbeginn, Beitritt): Textfeld mit `parseDateInput`/`formatDateInput` plus Kalender-Popover.
- Nicht mischen innerhalb einer Ansicht. `Calendar` aus `lucide-react` ist das Symbol, `Calendar` aus `@/components/ui/calendar` die Komponente.

## Weitere Konventionen

- **API-Fehler:** `apiError("CODE", status, { message?, details? })` aus `@/lib/api-errors`, nie `NextResponse.json({ error })`.
- **i18n:** immer alle drei Dateien `src/messages/{de,en,de-personal}.json` — `de` siezt, `de-personal` duzt.
- **Pagination:** `PAGE_SIZE_DEFAULT/LARGE/DROPDOWN` aus `@/lib/config/pagination`, nie `limit: 20`.
- **Redis:** `getBaseRedisOptions()` aus `@/lib/config/redis`, nie die URL selbst parsen.
- **Business-Werte** (Steuer, Skonto, Mahngebühren): aus `getTenantSettings()`, nie hardcoded.
- **Brand:** Warm Navy — primary light `#335E99` / dark `#598ACF`. Kein Teal/Turquoise.

## Nachschlagen

Fragen zur Codebase: erst `graphify-out/graph.json`, dann Dateien einzeln.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
