-- Audit-Log Hardening — GoBD §147 Manipulationsschutz
-- =====================================================================
-- Zweck: Verhindert, dass die App (oder ein kompromittierter App-User)
-- AuditLog-Einträge nachträglich verändern oder löschen kann.
-- Strategie: App darf nur SELECT + INSERT auf audit_logs. Updates/Deletes
-- sind nur direkt auf DB-Ebene möglich (durch DBA für Retention-Purge).
--
-- Ausführung: Einmalig auf der Produktions-Datenbank ausführen.
--   psql -U postgres -d windparkmanager -f audit_log_hardening.sql
--
-- WICHTIG: Passe `wpm` an den tatsächlichen App-DB-User an
-- (siehe docker-compose: POSTGRES_USER).
-- =====================================================================

-- Schritt 1: App-Rolle alle Schreib-Rechte ausser INSERT entziehen
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM wpm;

-- Schritt 2: INSERT + SELECT explizit granten (sicherstellen)
GRANT SELECT, INSERT ON audit_logs TO wpm;

-- Schritt 3: Sequence-Berechtigung beibehalten (für ID-Generierung falls SERIAL)
-- Bei UUID ist das nicht nötig, schadet aber nicht.
-- GRANT USAGE, SELECT ON SEQUENCE audit_logs_id_seq TO wpm;

-- Verifikation:
-- SELECT grantee, privilege_type FROM information_schema.table_privileges
-- WHERE table_name = 'audit_logs' AND grantee = 'wpm';
-- Expected: SELECT, INSERT (nichts anderes)

-- Retention-Purge:
-- Für die GoBD-konforme Hard-Deletion nach Ablauf der Aufbewahrungsfrist
-- (10 Jahre) muss ein separater DB-User mit DELETE-Recht angelegt werden.
-- Dieser darf NUR vom Retention-Cronjob genutzt werden — nicht von der App.
--
-- Beispiel-Setup:
--   CREATE ROLE wpm_retention LOGIN PASSWORD '...';
--   GRANT SELECT, DELETE ON audit_logs TO wpm_retention;
--   -- Im Retention-Service: separater PrismaClient mit DATABASE_URL_RETENTION
