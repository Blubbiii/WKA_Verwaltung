# Offene manuelle Migrationen

Diese Dateien sind geschrieben und gegen `prisma validate` geprüft, aber **noch
nicht auf der Datenbank ausgeführt**. Der Code im Repo setzt sie voraus.

Reihenfolge ist beliebig — die zehn berühren verschiedene Tabellen.

| Datei | Muss vor Deploy? | Was passiert |
|---|---|---|
| [merge_duplicate_reverse_permission.sql](merge_duplicate_reverse_permission.sql) | **ja** | Überträgt Rollenzuweisungen von `accounting:journal:reverse` auf `accounting:reverse` und löscht die doppelte Permission. Ohne diese Migration verlieren Rollen, die nur die alte Permission hatten, das Storno-Recht. |
| [invoice_recipient_person.sql](invoice_recipient_person.sql) | **ja** | Neue Spalte `invoices.recipientPersonId` + FK + Index. Ohne sie schlägt jedes Anlegen und Bearbeiten einer Rechnung fehl (Prisma schreibt die Spalte). |
| [fault_cases.sql](fault_cases.sql) | **ja** | Neue Tabellen `fault_cases` und `fault_case_scada_events` samt vier Enums (A1: Störungsvorgang mit bewertetem Ertragsausfall). Ohne sie schlägt jeder Zugriff auf `/faults` fehl. |
| [availability_guarantees.sql](availability_guarantees.sql) | **ja** | Drei Tabellen für Verfügbarkeitsgarantien, Bonus-/Malus-Staffel und Jahresabgleich samt fünf Enums (A2). Ohne sie schlägt `/api/availability/*` fehl. |
| [metering_points_settlement_checks.sql](metering_points_settlement_checks.sql) | **ja** | Zählpunkte (Marktlokation/Messlokation) und Abgleichsergebnisse (A3). Ohne sie schlägt `/api/energy/metering-points` und die Abrechnungsprüfung fehl. |
| [curtailment_events.sql](curtailment_events.sql) | **ja** | Abregelungsereignisse mit Ausfallarbeit und Entschädigungsforderung (A4). Ohne sie schlägt `/api/curtailment` fehl. |
| [lease_lessors.sql](lease_lessors.sql) | nein | Miteigentumsanteile am Pachtvertrag und deren Aufteilung in der Abrechnung (A5). **Kein Backfill** — ohne erfasste Anteile gilt weiterhin `Lease.lessorId`, Bestandsverträge rechnen unverändert. Erst nötig, wenn eine Erbengemeinschaft erfasst werden soll. |
| [insurance_policies.sql](insurance_policies.sql) | **ja** | Policen, Deckungsarten, versicherte Objekte und sechs neue Spalten an `insurance_claims` (A6). Ohne sie schlägt `/api/insurance/*` fehl; die neuen Claim-Spalten schreibt Prisma bei jeder Bewertung. |
| [dismantling.sql](dismantling.sql) | **ja** | Rückbauverpflichtung, Sicherheitsleistung und Jahresrückstellung nach HGB und EStG (A7). Ohne sie schlägt `/api/dismantling/*` fehl. |
| [share_transfers.sql](share_transfers.sql) | **ja** | Anteilsverlauf, Anteilsübertragung und fünf neue Spalten an `distributions`/`distribution_items` (A8). Ohne sie schlägt jedes Anlegen einer Ausschüttung fehl (Prisma schreibt `basis` und `undistributedAmount`). **Kein Backfill** — die Historie bleibt leer, dann gelten weiterhin die Stammdaten. Behebt zugleich Finding 4.1: die Ausschüttung liest ab jetzt `entryDate`/`exitDate` und normalisiert nicht mehr auf 100 %. |
| [regulatory.sql](regulatory.sql) | **ja** | Regulatorik-Stammdaten je Anlage und gespeicherte Meldefristen samt vier Enums (B2). Ohne sie schlägt `/verwaltung/regulatorik` und `/api/deadlines` fehl — der Fristenkalender liest die neue Tabelle mit. **Kein Backfill**: `turbines.mastrNumber` bleibt unverändert stehen, ein stiller Übertrag würde ungeprüfte Werte in ein geprüftes Feld heben. |
| [major_components.sql](major_components.sql) | **ja** | Großkomponenten-Register je Anlage samt zwei Enums (B3). Ohne sie schlägt `/api/components` fehl und die Karte im Anlagen-Reiter lädt nicht. **Kein Backfill** — aus dem bisherigen Freitext ließe sich weder eine Seriennummer noch ein Einbaudatum verlässlich ableiten. |
| [shareholder_meetings.sql](shareholder_meetings.sql) | **ja** | Gesellschafterversammlung, Tagesordnung und Anwesenheitsliste samt fünf Enums (B4). Ohne sie schlägt `/api/meetings` fehl und die Karte im Gesellschafter-Reiter lädt nicht. **Kein Backfill** — bestehende `Vote`-Datensätze werden nicht zu Versammlungen umgedeutet. |
| [retire_mass_communications.sql](retire_mass_communications.sql) | nein | Benennt `mass_communications` in `mass_communications_retired_20260730` um. Das Modell ist aus `schema.prisma` entfernt; die Tabelle stört nur noch. Bewusst RENAME statt DROP — der Inhalt war nicht einsehbar. Endgültiges DROP steht als auskommentierter Nachtrag in der Datei.

## Ausführen

```bash
npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/manual/merge_duplicate_reverse_permission.sql
npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/manual/invoice_recipient_person.sql
npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/manual/fault_cases.sql
npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/manual/availability_guarantees.sql
npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/manual/metering_points_settlement_checks.sql
npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/manual/curtailment_events.sql
npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/manual/lease_lessors.sql
npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/manual/insurance_policies.sql
npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/manual/dismantling.sql
npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/manual/share_transfers.sql
npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/manual/regulatory.sql
npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/manual/major_components.sql
npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/manual/shareholder_meetings.sql
npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/manual/retire_mass_communications.sql
```

Alle vierzehn sind mehrfach ausführbar: die dreizehn DDL-Skripte über
`IF NOT EXISTS` / `IF EXISTS`, das Permission-Skript dadurch, dass der zweite
Lauf keine Zeilen mehr findet. Die Enums in `fault_cases.sql`,
`availability_guarantees.sql`, `metering_points_settlement_checks.sql`,
`curtailment_events.sql`, `share_transfers.sql`, `regulatory.sql`,
`major_components.sql` und `shareholder_meetings.sql` sind über
`EXCEPTION WHEN duplicate_object` abgesichert; das eingebettete
`INSERT INTO permissions` in `share_transfers.sql` über `ON CONFLICT DO NOTHING`.

Nach dem Ausführen: `npx prisma validate` und je einen Smoke-Test auf
`/invoices/new` (legt eine Rechnung mit Empfängerverweis an) und `/faults`
(Liste muss laden, `/faults/new` muss einen Vorgang anlegen können).

Danach diesen Eintrag hier streichen.
