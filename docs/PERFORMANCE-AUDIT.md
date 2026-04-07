# Performance Audit — WindparkManager

> Stand: April 2026 | Methode: Statische Code-Analyse (kein Lighthouse)

## Zusammenfassung

| Bereich | Status | Bewertung |
|---------|--------|-----------|
| Image Optimization | GRUEN | next/image korrekt, keine raw `<img>` |
| Third-Party Scripts | GRUEN | Nur Sentry (10% Sampling, prod-only) |
| Caching-Infrastruktur | GRUEN | Redis + React Query vorhanden |
| Memoization | GRUEN | 381x useMemo/useCallback |
| Dynamic Imports | GELB | 13 Dateien nutzen dynamic(), aber Maps/Charts fehlen |
| React Query staleTime | GELB | 60s Default zu aggressiv |
| Font Loading | ROT | Kein next/font — System-Fonts ohne Optimierung |
| Prisma Over-Fetching | GELB | 505x include vs. 1282x select |

## Empfehlungen nach Prioritaet

### HOCH
1. **Maps/Charts lazy-loaden** — Leaflet (~300KB) + Recharts (~250KB) nicht im Initial-Bundle
2. **React Query staleTime erhoehen** — 60s → 300s default, weniger unnoetige Refetches
3. **next/font konfigurieren** — Explizites Font-Loading mit `display: swap`

### MITTEL
4. **Prisma include-Ketten auditieren** — 505 Stellen, besonders 3+ Level tief
5. **tesseract.js nur on-demand** — 30MB WASM nur auf OCR-Seite laden

### NIEDRIG
6. **staleTime pro Hook dokumentieren** — Granulare Overrides behalten
7. **Sentry Bundle-Size monitoren** — Aktuell optimal
