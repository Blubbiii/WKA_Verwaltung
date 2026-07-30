# Offene manuelle Migrationen

Diese Dateien sind geschrieben und gegen `prisma validate` geprüft, aber **noch
nicht auf der Datenbank ausgeführt**. Der Code im Repo setzt sie voraus.

Reihenfolge ist beliebig — die drei berühren verschiedene Tabellen.

| Datei | Muss vor Deploy? | Was passiert |
|---|---|---|
| [merge_duplicate_reverse_permission.sql](merge_duplicate_reverse_permission.sql) | **ja** | Überträgt Rollenzuweisungen von `accounting:journal:reverse` auf `accounting:reverse` und löscht die doppelte Permission. Ohne diese Migration verlieren Rollen, die nur die alte Permission hatten, das Storno-Recht. |
| [invoice_recipient_person.sql](invoice_recipient_person.sql) | **ja** | Neue Spalte `invoices.recipientPersonId` + FK + Index. Ohne sie schlägt jedes Anlegen und Bearbeiten einer Rechnung fehl (Prisma schreibt die Spalte). |
| [retire_mass_communications.sql](retire_mass_communications.sql) | nein | Benennt `mass_communications` in `mass_communications_retired_20260730` um. Das Modell ist aus `schema.prisma` entfernt; die Tabelle stört nur noch. Bewusst RENAME statt DROP — der Inhalt war nicht einsehbar. Endgültiges DROP steht als auskommentierter Nachtrag in der Datei.

## Ausführen

```bash
npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/manual/merge_duplicate_reverse_permission.sql
npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/manual/invoice_recipient_person.sql
npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/manual/retire_mass_communications.sql
```

Alle drei sind mehrfach ausführbar: die beiden DDL-Skripte über
`IF NOT EXISTS` / `IF EXISTS`, das Permission-Skript dadurch, dass der zweite
Lauf keine Zeilen mehr findet.

Nach dem Ausführen: `npx prisma validate` und einen Smoke-Test auf
`/invoices/new` (legt eine Rechnung mit Empfängerverweis an).

Danach diesen Eintrag hier streichen.
