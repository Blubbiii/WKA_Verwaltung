-- Migration: Add SCADA Auto-Import Support
-- Adds auto-import configuration fields to scada_turbine_mappings
-- and creates the scada_auto_import_logs table for tracking automated import runs.

-- =============================================================================
-- 1. Extend scada_turbine_mappings with auto-import config
-- =============================================================================

ALTER TABLE "scada_turbine_mappings"
  ADD COLUMN "autoImportEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "autoImportPath" TEXT,
  ADD COLUMN "lastAutoImport" TIMESTAMP(3),
  ADD COLUMN "autoImportInterval" TEXT NOT NULL DEFAULT 'DAILY';

-- Index for quickly finding all auto-import-enabled mappings per tenant
CREATE INDEX "scada_turbine_mappings_tenant_auto_import_idx"
  ON "scada_turbine_mappings" ("tenantId")
  WHERE "autoImportEnabled" = true;

-- =============================================================================
-- 2. Create scada_auto_import_logs table
-- =============================================================================

CREATE TABLE "scada_auto_import_logs" (
  "id" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "locationId" TEXT,
  "filesFound" INTEGER NOT NULL DEFAULT 0,
  "filesImported" INTEGER NOT NULL DEFAULT 0,
  "filesSkipped" INTEGER NOT NULL DEFAULT 0,
  "errors" JSONB,
  "summary" TEXT,
  "tenantId" TEXT NOT NULL,

  CONSTRAINT "scada_auto_import_logs_pkey" PRIMARY KEY ("id")
);

-- Index for querying logs by tenant and time
CREATE INDEX "scada_auto_import_logs_tenantId_startedAt_idx"
  ON "scada_auto_import_logs" ("tenantId", "startedAt" DESC);

-- Foreign key to tenants
ALTER TABLE "scada_auto_import_logs"
  ADD CONSTRAINT "scada_auto_import_logs_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
