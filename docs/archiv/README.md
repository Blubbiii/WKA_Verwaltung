# Archiv — abgearbeitete Audit-Berichte

Hier liegen die Audit-Berichte, deren Befunde umgesetzt sind. Sie stehen nicht
mehr in `docs/`, damit dort nur bleibt, was man beim Arbeiten braucht — vorher
waren 14 der 31 Dateien historische Berichte.

**Sie sind nicht überflüssig.** Ein Audit sagt, *warum* etwas so gebaut ist, und
das steht nirgends sonst. Wer sich fragt, weshalb die Kapitalertragsteuersätze
einstellbar sind statt fest verdrahtet, findet die Antwort in
`AUDIT-HARDCODES-HGB.md` — nicht im Code.

## Was hier liegt

| Bericht | Wann | Woraus wurde was |
|---|---|---|
| `audit-2026-06-26-full.md` | Juni 2026 | Ideen A–E, umgesetzt in Phase 19 |
| `audit-hardcodes-2026-06.md` | Juni 2026 | Fest verdrahtete Werte → Mandanten-Einstellungen |
| `AUDIT-HARDCODES-HGB.md` | Juni 2026 | Handelsrechtliche Werte aus dem Code geholt |
| `AUDIT-2026-07-RECHENKORREKTHEIT.md` | Juli 2026 | Wellen 1–5, Kirchensteuer, KapESt, § 6 EEG |
| `AUDIT-2026-07-PROZESSKETTEN.md` | Juli 2026 | Zeichnungsprozess, Gesellschafterversammlung |
| `AUDIT-2026-07-RANDFAELLE.md` | Juli 2026 | Anteilsübertragung stichtagsgenau |
| `AUDIT-2026-07-REGRESSIONEN.md` | Juli 2026 | Konventions-Sperren |
| `AUDIT-2026-07-TOTE-FUNKTIONALITAET.md` | Juli 2026 | Ungenutzte Oberflächen entfernt oder angeschlossen |
| `AUDIT-2026-07-WORKER-QUEUES.md` | Juli 2026 | Worker-Service im Portainer-Stack |
| `AUDIT-2026-07-SCADA-ABRECHNUNGSKETTE.md` | Juli 2026 | Wasserzeichen, Aggregation — **Rest in Phase 21** |
| `AUDIT-2026-07-BEDIENAUFWAND.md` | Juli 2026 | DataTable, Leerzustände, klickbare Kennzahlen |
| `AUDIT-2026-07-FEHLENDE-FUNKTIONEN.md` | Juli 2026 | Marktprämie, Bankanbindung, Großkomponenten |
| `AUDIT-2026-07-GESAMTBILD.md` | Juli 2026 | Zusammenfassung der übrigen neun |
| `audit-log-append-only.md` | Juni 2026 | Datenbank-Trigger für § 147 AO |

## Ein Hinweis zu `audit-log-append-only.md`

Der ist **nicht** vollständig abgearbeitet. Der lokale Testserver meldet beim
Start:

> [SECURITY] Audit-Log Append-Only Trigger fehlt — GoBD § 147 nicht erfüllt.
> Deploy: prisma/migrations/manual/audit_log_hardening.sql

Ob das auf dem Produktionssystem eingespielt ist, wurde hier nicht geprüft.
