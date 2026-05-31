# Pacht-Settlement — Doppel-Architektur

WPM hat **zwei parallele Systeme** für Pacht-Abrechnung. Beide sind aktiv genutzt mit unterschiedlichen UI-Zugängen und Zielgruppen. Diese Doku erklärt **wann welches System** zu benutzen ist.

## Übersicht

| Aspekt | `LeaseSettlementPeriod` | `LeaseRevenueSettlement` |
|--------|-------------------------|---------------------------|
| **API-Pfad** | `/api/admin/settlement-periods/*` | `/api/leases/settlement/*` |
| **UI-Zugang** | Admin → Abrechnung → Perioden | Pacht → Abrechnungen |
| **Zielgruppe** | Tenant-Admins (übergreifend) | Operative Pachtverwalter |
| **Granularität** | **Park × Jahr × Periodentyp** (Q1/Q2/Q3/Q4/FINAL) | **Lease × Jahr** (eine Abrechnung pro Pachtvertrag) |
| **Calculator** | `src/lib/settlement/calculator.ts` | `src/lib/lease-revenue/calculator.ts` |
| **Use-Case** | Bulk-Abrechnungen aller Pachtgeber eines Parks für eine Periode | Detaillierte Einzelabrechnung pro Lease (z.B. bei manueller Anpassung) |

## Wann welches System?

### Standard-Workflow (90% der Fälle)
→ **`LeaseSettlementPeriod`** verwenden.

Der Admin legt pro Park + Jahr Perioden an (Q1 ADVANCE, Q2 ADVANCE, … FINAL), berechnet sie, erstellt Bulk-Gutschriften, sendet sie als Batch. Vier-Augen-Approval über die Status-Machine:

```
OPEN → calculate → IN_PROGRESS → create-invoices → submit → PENDING_REVIEW → approve → APPROVED → send-all → close → CLOSED
```

Alle Endpoints unter `/api/admin/settlement-periods/[id]/*`.

### Spezial-Workflow (operative Pacht-Sicht)
→ **`LeaseRevenueSettlement`** verwenden.

Wenn ein einzelner Pachtvertrag eine **abweichende Behandlung** braucht (manueller Vorschuss-Override, Korrektur eines bereits abgeschlossenen Lease, separate Abrechnung wegen Lease-Wechsel mid-period), läuft das über `/api/leases/settlement/*`. Eigenes Status-Modell, eigene Calculator-Logik die feingranular auf Lease-Ebene arbeitet.

## Warum nicht konsolidieren?

Das war Audit-Finding H3 (Workflow-Architect). Die ehrliche Antwort:

1. **Beide sind produktiv genutzt** mit unterschiedlichen UI-Pages und Workflows
2. **Eigene Datenmodelle:** `LeaseSettlementPeriod` aggregiert auf Park+Jahr, `LeaseRevenueSettlement` arbeitet auf Lease+Jahr — die Granularität ist nicht trivial überführbar
3. **Eigene Calculator-Module** mit ~1000+ LOC jeweils, eigenen Tests und Edge-Case-Handling
4. **Eigene Status-Machines:** zwar ähnlich (OPEN/IN_PROGRESS/APPROVED/CLOSED), aber jeweils mit unterschiedlichen Übergangs-Regeln

Eine Konsolidierung würde 2-3 Wochen vollzeit kosten + hohes Regressions-Risiko in den kritischsten Money-Path. Der Nutzen ist Wartungs-Komfort, nicht Funktionalität.

## Stattdessen: klare Verantwortung

Wann immer du an einer Settlement-Funktion arbeitest, frag dich:
- **"Ist das eine Periode (Park+Jahr+Typ) oder eine Einzelabrechnung (Lease+Jahr)?"**
- Periode → `/api/admin/settlement-periods/*`
- Einzelabrechnung → `/api/leases/settlement/*`

Wenn du dir nicht sicher bist welches System gemeint ist, frag im Team — beide Systeme sind aktiv, beide haben echte Use-Cases.

## Status-Machine (LeaseSettlementPeriod)

Nach Phase 5 vollständig:

```
OPEN
  │
  │ POST /calculate
  ▼
IN_PROGRESS  ←──────┐
  │                 │
  │ POST /create-invoices (idempotent — kann mehrfach laufen)
  │ POST /send-all-invoices (nur erlaubt nach APPROVED)
  │                 │
  │ POST /submit    │ POST /approve {action:"reject"}
  ▼                 │
PENDING_REVIEW ─────┤
  │                 │
  │ POST /approve {action:"approve"}
  │ (Approver ≠ Submitter — Vier-Augen)
  ▼                 │
APPROVED            │
  │
  │ POST /send-all-invoices (Status muss APPROVED sein)
  │ POST /close (nur wenn alle Invoices PAID oder CANCELLED)
  ▼
CLOSED
```

### Neue Endpoints (Phase 5)

| Endpoint | Permission | Übergang |
|----------|------------|----------|
| `POST /[id]/submit` | `invoices:update` | IN_PROGRESS → PENDING_REVIEW |
| `POST /[id]/close` | `requireAdmin` | APPROVED → CLOSED (wenn alle Invoices PAID/CANCELLED) |

## Bekannte Einschränkungen

### R-4: Pachtgeber-Wechsel mid-period (NICHT zeit-anteilig)

Wenn ein Lease **innerhalb** einer Period startet oder endet (z.B. Verkauf am 15.07. eines Jahres), bekommt der zum Berechnungszeitpunkt aktive Pachtgeber den **vollen Period-Betrag**. Eine zeit-anteilige Berechnung ist nicht implementiert.

**Workaround:** Operator setzt manuelle Korrektur-Rechnung. Der Calculator loggt eine WARN-Message wenn er einen Lease mit Start/End-Datum innerhalb der Period verarbeitet — danach kann der Operator gezielt nachprüfen.

**Future:** Echte zeit-anteilige Berechnung (~3h + Tests) — siehe TODO im `src/lib/settlement/calculator.ts` Z.424+.
