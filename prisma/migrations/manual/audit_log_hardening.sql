-- Audit-Log Hardening — GoBD §146/§147 AO Manipulationsschutz
-- =====================================================================
-- Zweck: Verhindert, dass die App (oder ein kompromittierter App-User)
-- AuditLog-Eintraege nachtraeglich veraendern oder loeschen kann.
--
-- Doppelte Verteidigungslinie:
--   1) GRANT/REVOKE: App-DB-User darf nur SELECT + INSERT.
--   2) Trigger: Selbst Superuser/DBA wird beim UPDATE/DELETE abgewiesen
--      (Ausnahme: dedizierter Retention-User wpm_retention).
--
-- Ausfuehrung (einmalig pro Datenbank — idempotent):
--   docker exec -i windparkmanager-postgres-1 psql -U wpm -d windparkmanager \
--     -f - < prisma/migrations/manual/audit_log_hardening.sql
--
-- WICHTIG: Passe `wpm` an den tatsaechlichen App-DB-User an
-- (siehe docker-compose: POSTGRES_USER).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Schritt 1: App-Rolle alle Schreib-Rechte ausser INSERT entziehen
-- ---------------------------------------------------------------------
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM wpm;

-- Schritt 2: INSERT + SELECT explizit granten (sicherstellen)
GRANT SELECT, INSERT ON audit_logs TO wpm;

-- ---------------------------------------------------------------------
-- Schritt 3: Trigger-Funktion fuer Append-Only-Garantie
-- ---------------------------------------------------------------------
-- Verhindert UPDATE/DELETE auch dann, wenn ein User mit hoeheren Rechten
-- (z.B. postgres/Superuser) versucht, audit_logs zu manipulieren.
-- Ausnahme: Der dedizierte Retention-User wpm_retention darf DELETE
-- ausfuehren (fuer den 10-Jahres-Retention-Cron nach GoBD/DSGVO).
CREATE OR REPLACE FUNCTION audit_logs_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Ausnahme fuer Retention-Cron-User
    IF current_user = 'wpm_retention' AND TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION
        'audit_logs ist append-only — UPDATE/DELETE nicht erlaubt (operation: %, user: %)',
        TG_OP, current_user;
END;
$$;

-- Schritt 4: Trigger registrieren (idempotent durch DROP IF EXISTS)
DROP TRIGGER IF EXISTS audit_logs_no_update ON audit_logs;
CREATE TRIGGER audit_logs_no_update
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION audit_logs_append_only();

DROP TRIGGER IF EXISTS audit_logs_no_delete ON audit_logs;
CREATE TRIGGER audit_logs_no_delete
    BEFORE DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION audit_logs_append_only();

-- ---------------------------------------------------------------------
-- Verifikation (manuell nach Deploy ausfuehren)
-- ---------------------------------------------------------------------
-- 1) Rechte pruefen:
--    SELECT grantee, privilege_type FROM information_schema.table_privileges
--    WHERE table_name = 'audit_logs' AND grantee = 'wpm';
--    Expected: SELECT, INSERT (nichts anderes)
--
-- 2) Trigger pruefen:
--    SELECT tgname FROM pg_trigger
--    WHERE tgname IN ('audit_logs_no_update', 'audit_logs_no_delete');
--    Expected: beide Zeilen
--
-- 3) Negativ-Test (beide muessen fehlschlagen):
--    UPDATE audit_logs SET action = 'TAMPERED' WHERE id = (SELECT id FROM audit_logs LIMIT 1);
--    DELETE FROM audit_logs WHERE id = (SELECT id FROM audit_logs LIMIT 1);

-- ---------------------------------------------------------------------
-- Retention-User (optional, fuer 10-Jahres-Lösch-Cron)
-- ---------------------------------------------------------------------
-- Fuer die GoBD-konforme Hard-Deletion nach Ablauf der Aufbewahrungsfrist
-- (10 Jahre) muss ein separater DB-User angelegt werden, der DELETE darf.
-- Dieser User darf NUR vom Retention-Cronjob genutzt werden — nicht von
-- der App. Der Trigger oben erlaubt DELETE nur fuer current_user = 'wpm_retention'.
--
-- Beispiel-Setup (vom DBA auszufuehren):
--   CREATE ROLE wpm_retention LOGIN PASSWORD '<separates_secret>';
--   GRANT SELECT, DELETE ON audit_logs TO wpm_retention;
--   -- Im Retention-Service: separater PrismaClient mit DATABASE_URL_RETENTION

-- ---------------------------------------------------------------------
-- Rollback (NUR im Notfall ausfuehren!)
-- ---------------------------------------------------------------------
-- DROP TRIGGER IF EXISTS audit_logs_no_update ON audit_logs;
-- DROP TRIGGER IF EXISTS audit_logs_no_delete ON audit_logs;
-- DROP FUNCTION IF EXISTS audit_logs_append_only();
-- GRANT UPDATE, DELETE ON audit_logs TO wpm;
