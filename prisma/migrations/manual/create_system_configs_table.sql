-- =============================================================================
-- System Configuration Table
-- =============================================================================
-- This migration creates the system_configs table for storing system-wide
-- configuration values. Run this SQL in your Supabase SQL Editor or via
-- prisma db push / prisma migrate.

-- Create the system_configs table
CREATE TABLE IF NOT EXISTS system_configs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  encrypted BOOLEAN NOT NULL DEFAULT false,
  category TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,

  -- Unique constraint: key must be unique per tenant (or globally if tenant_id is null)
  CONSTRAINT system_configs_tenant_key_unique UNIQUE (tenant_id, key)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_system_configs_tenant_id ON system_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_system_configs_category ON system_configs(category);
CREATE INDEX IF NOT EXISTS idx_system_configs_key ON system_configs(key);

-- Enable Row Level Security
ALTER TABLE system_configs ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Row Level Security Policies
-- =============================================================================

-- Policy: Superadmins can read all configs
CREATE POLICY "Superadmins can read all configs" ON system_configs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()::text
      AND u.role = 'SUPERADMIN'
    )
  );

-- Policy: Admins can read their tenant's configs and global configs
CREATE POLICY "Admins can read tenant configs" ON system_configs
  FOR SELECT
  USING (
    tenant_id IS NULL OR
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()::text
      AND u.tenant_id = system_configs.tenant_id
      AND u.role IN ('SUPERADMIN', 'ADMIN')
    )
  );

-- Policy: Superadmins can insert configs
CREATE POLICY "Superadmins can insert configs" ON system_configs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()::text
      AND u.role = 'SUPERADMIN'
    )
  );

-- Policy: Superadmins can update configs
CREATE POLICY "Superadmins can update configs" ON system_configs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()::text
      AND u.role = 'SUPERADMIN'
    )
  );

-- Policy: Superadmins can delete configs
CREATE POLICY "Superadmins can delete configs" ON system_configs
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()::text
      AND u.role = 'SUPERADMIN'
    )
  );

-- =============================================================================
-- Trigger for updated_at
-- =============================================================================

-- Create the trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS update_system_configs_updated_at ON system_configs;
CREATE TRIGGER update_system_configs_updated_at
  BEFORE UPDATE ON system_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Default Configuration Values (Optional)
-- =============================================================================
-- Uncomment and modify these INSERT statements to set default values

-- INSERT INTO system_configs (key, value, encrypted, category, label, tenant_id) VALUES
-- ('general.app.name', 'WindparkManager', false, 'general', 'Anwendungsname', NULL),
-- ('general.app.timezone', 'Europe/Berlin', false, 'general', 'Zeitzone', NULL),
-- ('general.maintenance.enabled', 'false', false, 'general', 'Wartungsmodus aktiviert', NULL),
-- ('weather.sync.interval', '60', false, 'weather', 'Sync Intervall (Minuten)', NULL),
-- ('weather.cache.ttl', '15', false, 'weather', 'Cache TTL (Minuten)', NULL),
-- ('storage.provider', 'local', false, 'storage', 'Storage Provider', NULL);
