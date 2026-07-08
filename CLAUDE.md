# WindparkManager — Claude / Agent Instructions

Diese Datei wird von KI-Assistenten (Claude Code, Cursor, Codex …) beim Arbeiten am WPM-Codebase geladen. Kurz halten — Details in `docs/`.

## 🚨 God Files — maximale Vorsicht bei Änderungen

Aus dem Knowledge-Graph-Audit (2026-07-07) sind das die 3 Dateien mit dem größten Blast-Radius im ganzen Codebase:

| Datei | Dependent Edges | Bei Bruch betroffen |
|---|---|---|
| [src/lib/api-errors.ts](src/lib/api-errors.ts) | **1.398** | Jede der 549 API-Response-Handler |
| [src/lib/auth/withPermission.ts](src/lib/auth/withPermission.ts) | **1.052** | Fast jede API-Auth |
| [src/lib/logger.ts](src/lib/logger.ts) | **622** | Alle strukturierten Logs |

**Regel:** Änderungen an diesen Dateien brauchen extra Prüfung:
1. `npx tsc --noEmit && npm run lint && npm run build` MUSS grün sein
2. Manueller Regressions-Test gegen mindestens 3 zufällige API-Routes verschiedener Domänen
3. Commit-Message erklärt WARUM die God-File angefasst wurde

## 📥 Neue Fetches: react-query, nicht useEffect + fetch

**Status Quo:** 79% der Client-Fetches nutzen handrolled `useEffect + fetch + useState + AbortController` (281 Files). Nur 11% nutzen `useQuery` (38 Files). Die Deps für react-query sind installiert (`@tanstack/react-query`).

**Regel ab jetzt:**
- **Neue** Client-Fetches: **immer** `useQuery` / `useMutation`
- **Bestehende** `useEffect + fetch`: NUR umziehen wenn du eh in der Datei arbeitest — kein separater Migration-PR

**Muster für neue Fetches:**

```tsx
"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Read
const { data: parks, isLoading, error } = useQuery({
  queryKey: ["/api/parks", tenantId],
  queryFn: async () => {
    const res = await fetch("/api/parks");
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  staleTime: 60_000,
});

// Write
const queryClient = useQueryClient();
const createPark = useMutation({
  mutationFn: async (input: CreateParkInput) => {
    const res = await fetch("/api/parks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["/api/parks"] });
    toast.success(t("created"));
  },
  onError: (e) => toast.error(e.message),
});
```

## Weitere verbindliche Konventionen

- **API-Routes:** IMMER `apiError("CODE", status, { message?, details? })` aus `@/lib/api-errors`. NIEMALS `NextResponse.json({ error })` direkt.
- **i18n:** IMMER alle 3 Message-Files updaten (`src/messages/{de,en,de-personal}.json`). `t` MUSS in `useCallback`/`useEffect` Dep-Arrays.
- **Pagination:** `PAGE_SIZE_DEFAULT/LARGE/DROPDOWN` aus `@/lib/config/pagination` — niemals `limit: 20` hardcoded.
- **Redis:** `getBaseRedisOptions()` aus `@/lib/config/redis` — niemals URL selbst parsen.
- **Business-Werte** (Tax, Skonto, Mahngebühren): IMMER aus `getTenantSettings()` — niemals hardcoded.
- **Prisma:** `import { prisma } from "@/lib/prisma"` (Singleton). `import type { … } from "@prisma/client"` nur für Types.
- **Build-Verifikation vor jedem Commit:** `npx tsc --noEmit && npm run lint && npm run build` — alle 3 müssen sauber sein.

## Tech-Stack

Next.js 16 App-Router · React 19 · TypeScript 6 · Prisma 7 · PostgreSQL/TimescaleDB · BullMQ · Redis · MinIO/S3 · shadcn/ui + Tailwind 4 · next-intl · NextAuth v5

## Brand

**Warm Navy** — primary light `#335E99` / dark `#598ACF`. Kein Teal/Turquoise.

## Danach

- Ausführliche Architektur & Runbooks: `docs/`
- Roadmap: `docs/ROADMAP.md` + `CHANGELOG.md`
- Wenn `graphify-out/graph.json` existiert: bei Fragen zur Codebase erst dort suchen statt Files einzeln lesen.
