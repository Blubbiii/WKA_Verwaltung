-- =============================================================================
-- Create read-only PostgreSQL user for Metabase
--
-- Run once on the postgres container:
--   docker exec -i wpm-postgres psql -U wpm -d windparkmanager \
--     < scripts/create-readonly-db-user.sql
--
-- Then configure Metabase with:
--   Host: postgres  Port: 5432  DB: windparkmanager
--   User: wpm_readonly  Password: <set below>
-- =============================================================================

-- Create user (change password before running!)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'wpm_readonly') THEN
    CREATE USER wpm_readonly WITH PASSWORD 'changeme_readonly_password';
  END IF;
END $$;

-- Grant connect + usage
GRANT CONNECT ON DATABASE windparkmanager TO wpm_readonly;
GRANT USAGE ON SCHEMA public TO wpm_readonly;

-- Grant SELECT on all existing tables
GRANT SELECT ON ALL TABLES IN SCHEMA public TO wpm_readonly;

-- Grant SELECT on future tables automatically
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO wpm_readonly;

\echo 'Read-only user wpm_readonly created and granted SELECT on all tables.'
