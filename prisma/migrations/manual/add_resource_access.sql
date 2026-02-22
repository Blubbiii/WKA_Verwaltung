-- =============================================================================
-- Migration: Add ResourceAccess Table
-- Description: Datensatz-Level Berechtigungen fuer feingranulare Zugriffskontrolle
-- Date: 2026-02-05
-- =============================================================================

-- Erstelle resource_access Tabelle
CREATE TABLE IF NOT EXISTS resource_access (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,

  -- Benutzer dem Zugriff gewaehrt wird
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Ressourcen-Identifikation
  resource_type TEXT NOT NULL,  -- "PARK", "FUND", "TURBINE", etc.
  resource_id TEXT NOT NULL,    -- ID der spezifischen Ressource

  -- Zugriffslevel (hierarchisch: READ < WRITE < ADMIN)
  access_level TEXT NOT NULL,   -- "READ", "WRITE", "ADMIN"

  -- Audit-Informationen
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,              -- User-ID des Admins der Zugriff gewaehrt hat
  expires_at TIMESTAMPTZ,       -- Optional: Zeitlich begrenzter Zugriff
  notes TEXT,                   -- Optionale Notiz warum Zugriff gewaehrt wurde

  -- Constraints
  CONSTRAINT valid_access_level CHECK (access_level IN ('READ', 'WRITE', 'ADMIN')),
  CONSTRAINT valid_resource_type CHECK (resource_type IN ('PARK', 'FUND', 'TURBINE', 'DOCUMENT', 'CONTRACT', 'LEASE', 'INVOICE', 'SHAREHOLDER'))
);

-- Eindeutiger Index: Ein User hat nur einen Zugriff pro Ressource
CREATE UNIQUE INDEX IF NOT EXISTS resource_access_user_resource_unique
  ON resource_access(user_id, resource_type, resource_id);

-- Index fuer User-Abfragen
CREATE INDEX IF NOT EXISTS resource_access_user_id_idx
  ON resource_access(user_id);

-- Index fuer Ressourcen-Abfragen
CREATE INDEX IF NOT EXISTS resource_access_resource_idx
  ON resource_access(resource_type, resource_id);

-- Index fuer Ablaufdatum (fuer Cleanup-Jobs)
CREATE INDEX IF NOT EXISTS resource_access_expires_at_idx
  ON resource_access(expires_at)
  WHERE expires_at IS NOT NULL;

-- =============================================================================
-- Row Level Security (optional, falls aktiviert)
-- =============================================================================

-- RLS aktivieren
ALTER TABLE resource_access ENABLE ROW LEVEL SECURITY;

-- Policy: Nur Admins koennen ResourceAccess verwalten
CREATE POLICY "Admins can manage resource access" ON resource_access
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()::text
      AND users.role IN ('SUPERADMIN', 'ADMIN')
    )
  );

-- =============================================================================
-- Beispiel-Daten (optional, fuer Testing)
-- =============================================================================

-- Beispiel: User bekommt Lesezugriff auf einen bestimmten Windpark
-- INSERT INTO resource_access (user_id, resource_type, resource_id, access_level, notes)
-- VALUES (
--   'user-uuid-here',
--   'PARK',
--   'park-uuid-here',
--   'READ',
--   'Zugriff fuer Jahresbericht-Review gewaehrt'
-- );

-- =============================================================================
-- Cleanup-Funktion fuer abgelaufene Zugriffe
-- =============================================================================

-- Funktion zum Loeschen abgelaufener Zugriffe
CREATE OR REPLACE FUNCTION cleanup_expired_resource_access()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM resource_access
  WHERE expires_at IS NOT NULL
    AND expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Optional: Cron-Job fuer taegliche Bereinigung (erfordert pg_cron Extension)
-- SELECT cron.schedule('cleanup-expired-access', '0 3 * * *', 'SELECT cleanup_expired_resource_access()');

-- =============================================================================
-- Rollback (falls noetig)
-- =============================================================================

-- DROP TABLE IF EXISTS resource_access;
-- DROP FUNCTION IF EXISTS cleanup_expired_resource_access();
