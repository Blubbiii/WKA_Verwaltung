# AuditLog Append-Only Constraint

## Ziel
Die Tabelle `audit_logs` darf in Produktion **niemals** UPDATE oder DELETE
erfahren — auch nicht versehentlich durch Devs mit DB-Direktzugriff oder
durch fehlerhafte Migrationen.

Diese Datei dokumentiert die empfohlenen PostgreSQL-Trigger, die UPDATE
und DELETE auf `audit_logs` hard-failen lassen.

> **Wichtig:** Dieses Dokument beschreibt nur den **Soll-Zustand**. Die
> Trigger sind **bewusst nicht** als Prisma-Migration umgesetzt — siehe
> "Warum nicht via Prisma migration" unten. Ein DBA muss sie manuell
> deployen.

## SQL für DBA

Folgenden Block in PostgreSQL ausführen (idempotent — `CREATE OR REPLACE`):

```sql
-- Trigger-Function: wirft Exception bei UPDATE oder DELETE auf audit_logs.
-- Append-only-Garantie für GoBD/Compliance.
CREATE OR REPLACE FUNCTION audit_logs_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'audit_logs ist append-only — UPDATE/DELETE nicht erlaubt (operation: %)',
        TG_OP;
END;
$$;

-- Drop existierender Trigger (falls vorhanden) bevor neu erstellt
DROP TRIGGER IF EXISTS audit_logs_no_update ON audit_logs;
DROP TRIGGER IF EXISTS audit_logs_no_delete ON audit_logs;

-- UPDATE blockieren
CREATE TRIGGER audit_logs_no_update
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION audit_logs_append_only();

-- DELETE blockieren
CREATE TRIGGER audit_logs_no_delete
    BEFORE DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION audit_logs_append_only();
```

## Verifikation

Nach dem Deploy testen — beide Statements sollten **fehlschlagen**:

```sql
-- Sollte: ERROR: audit_logs ist append-only — UPDATE/DELETE nicht erlaubt
UPDATE audit_logs SET action = 'TAMPERED' WHERE id = (SELECT id FROM audit_logs LIMIT 1);

-- Sollte: ERROR: audit_logs ist append-only — UPDATE/DELETE nicht erlaubt
DELETE FROM audit_logs WHERE id = (SELECT id FROM audit_logs LIMIT 1);
```

INSERT bleibt erlaubt (kein Trigger drauf) — Audit-Logs können weiterhin
durch die App geschrieben werden.

## Ausnahmen

**Truncation nach Retention-Frist:** Falls für GoBD-Konformität nach 10
Jahren Audit-Logs gelöscht werden müssen, MUSS der DBA die Trigger
temporär deaktivieren:

```sql
ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_delete;
DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '10 years';
ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_no_delete;
```

Diese Operation MUSS in einem dokumentierten Maintenance-Window
stattfinden und im operativen Logbuch festgehalten werden.

## Warum nicht via Prisma migration

Prisma's Migration-Tool (`prisma migrate`) unterstützt Raw-PostgreSQL-
Trigger nur eingeschränkt:

1. **Prisma Schema kennt keine Trigger** — sie müssten in
   `prisma/migrations/<timestamp>_audit_append_only/migration.sql` als
   Raw-SQL eingebettet werden. Bei späterem `prisma migrate dev` oder
   `prisma db push` kann Prisma den Trigger nicht im Schema-Drift erkennen
   und ggf. überschreiben.

2. **`prisma db push` (das in WPM verwendet wird, siehe MEMORY.md)
   überspringt Migration-Folder komplett** — Raw-SQL würde nicht
   ausgeführt werden.

3. **`prisma db pull` (NIE benutzen, siehe MEMORY.md) würde Trigger
   verlieren** beim Introspect.

Daher: **Manuelle Trigger-Deployment durch DBA** ist der sichere Weg.
Der Trigger lebt außerhalb des Prisma-Lifecycles und bleibt persistent.

## Deploy-Checkliste

- [ ] SQL-Block oben in Production-DB ausgeführt (psql/Portainer-Console)
- [ ] Verifikations-Statements ausgeführt — beide Errors bestätigt
- [ ] Operations-Logbuch-Eintrag: "audit_logs append-only Trigger aktiviert am YYYY-MM-DD"
- [ ] In Disaster-Recovery-Runbook ergänzt (Trigger müssen nach DB-Restore neu erstellt werden!)
