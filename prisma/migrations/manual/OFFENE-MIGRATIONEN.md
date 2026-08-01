# Manuelle Migrationen — Stand 01.08.2026: erledigt

Auf der Produktionsdatenbank (192.168.178.101) **vollständig angewendet und
verifiziert**. Diese Dateien bleiben als Referenz und für Umgebungen ohne den
Docker-Entrypoint.

## Wichtig: der Container macht die Schema-Migration selbst

Eine frühere Fassung dieser Datei behauptete, sechzehn Skripte müssten „vor dem
Deploy" von Hand laufen. **Das war falsch** und hätte unnötige Handarbeit
verursacht. `docker-entrypoint.sh` führt beim Start aus:

```sh
prisma db push --url "$DATABASE_URL" --accept-data-loss
```

Damit entstehen **alle** Tabellen, Spalten, Enums und Indizes aus
`schema.prisma` von selbst. Geprüft: alle 29 neuen Tabellen sind im Schema
abgebildet, keine existiert nur als SQL. Auch der Rechte-Katalog synchronisiert
sich beim Boot über `instrumentation.ts` → `sync-permissions.ts`.

**Für die reguläre Bereitstellung ist deshalb kein DDL-Skript nötig.**

## Was `db push` NICHT kann

| Datei | Warum von Hand | Status |
|---|---|---|
| [merge_duplicate_reverse_permission.sql](merge_duplicate_reverse_permission.sql) | Verschiebt **Rollenzuweisungen**, kein Schema. `db push` kennt sie nicht, der Katalog-Sync legt nur an und löscht nie. Ohne sie verliert eine Rolle, die nur `accounting:journal:reverse` hält, still das Storno-Recht. | ✅ 01.08.2026 angewendet (`INSERT 0 0`, `DELETE 1` — keine Rolle war betroffen) |
| [retire_mass_communications.sql](retire_mass_communications.sql) | Benennt `mass_communications` um, statt sie zu verlieren. Das Modell ist aus `schema.prisma` entfernt, `db push --accept-data-loss` würde die Tabelle **droppen**. Wer den Inhalt braucht, muss vor dem ersten Start des neuen Images umbenennen. | offen — bewusst, Inhalt wurde nicht benötigt |

## Zwei Fallstricke von `--accept-data-loss`

1. **Es löscht ohne Rückfrage**, was nicht mehr im Schema steht. Vor einem
   Deploy mit Schema-Änderungen gehört ein `pg_dump` davor — nicht als Ritual,
   sondern weil genau das der Fall ist, in dem es gebraucht wird.
2. Ein Modell aus `schema.prisma` zu entfernen ist damit eine **destruktive**
   Änderung. Soll der Inhalt erhalten bleiben, vorher umbenennen (siehe
   `retire_mass_communications.sql` als Muster).

## Verifikation

Reine Leseabfragen, in psql auf dem Postgres-Container:

```sql
-- 1) Neue Tabellen — erwartet: 29
SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN
('fault_cases','fault_case_scada_events','availability_guarantees','availability_guarantee_tiers',
 'availability_settlements','metering_points','settlement_checks','curtailment_events','lease_lessors',
 'lease_revenue_settlement_item_lessors','insurance_policies','insurance_coverages','insured_objects',
 'dismantling_obligations','dismantling_provisions','shareholder_shares','share_transfers',
 'regulatory_profiles','compliance_deadlines','major_components','shareholder_meetings',
 'meeting_agenda_items','meeting_attendance','subscriptions','aml_checks','hourly_spot_prices',
 'market_premium_calculations','bank_connections','bank_fetch_runs');

-- 2) Neue Spalten an bestehenden Tabellen — erwartet: 8
SELECT count(*) FROM information_schema.columns
WHERE (table_name='distributions' AND column_name IN ('periodStart','basis','undistributedAmount'))
   OR (table_name='distribution_items' AND column_name IN ('days','nominalPercentage'))
   OR (table_name='invoices' AND column_name='recipientPersonId')
   OR (table_name='insurance_claims' AND column_name IN ('policyId','faultCaseId'));

-- 3) Abgelöste Storno-Permission — erwartet: 0
SELECT count(*) FROM permissions WHERE name='accounting:journal:reverse';
```

Lauf vom 01.08.2026: **29 / 8 / 0** nach Anwendung der Rechte-Migration.

Zugang (Portainer → Container `windparkmanager-postgres-1` → Console):

```sh
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

## Was die Migration NICHT mitbringt

Struktur, keine Inhalte. Alle neuen Funktionen starten bewusst leer — es wurde
nirgends etwas geraten oder aus Freitext übernommen:

- **B2 Regulatorik** — MaStR-Nummer, EEG-Anlagenschlüssel und Vergütungsregime
  je Anlage erfassen, danach „Fristen erzeugen". `turbines.mastrNumber` bleibt
  als ungeprüftes Altfeld daneben stehen.
- **B1 Marktprämie** — ohne Korrekturfaktor (§ 36h EEG) und § 51-Schwelle je
  Anlage wird nichts gerechnet; beides wird ausdrücklich nicht geschätzt.
- **B3 Großkomponenten** — Getriebe, Generator, Rotorblätter mit Seriennummer
  und Einbaudatum.
- **A5 Verpächteranteile** — nichts zu tun. Ohne erfasste Anteile gilt weiter
  `Lease.lessorId`, Bestandsverträge rechnen unverändert.
- **A8 Anteilsverlauf** — nichts zu tun. Der Rückfall liest `entryDate` und
  `exitDate`, die längst gepflegt sind. Die Ausschüttung rechnet damit ab
  sofort zeitanteilig richtig (Finding 4.1).
