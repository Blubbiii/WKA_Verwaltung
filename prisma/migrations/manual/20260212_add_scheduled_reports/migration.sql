-- Migration: Add Scheduled Reports
-- Date: 2026-02-12
-- Description: Adds scheduled_reports table for automatic report generation

-- ===========================================
-- ENUMS
-- ===========================================

-- Scheduled Report Type
DO $$ BEGIN
  CREATE TYPE "ScheduledReportType" AS ENUM (
    'MONTHLY_PRODUCTION',
    'QUARTERLY_FINANCIAL',
    'ANNUAL_SUMMARY',
    'CUSTOM'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Scheduled Report Schedule
DO $$ BEGIN
  CREATE TYPE "ScheduledReportSchedule" AS ENUM (
    'MONTHLY',
    'QUARTERLY',
    'ANNUALLY'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ===========================================
-- TABLE: scheduled_reports
-- ===========================================

CREATE TABLE IF NOT EXISTS "scheduled_reports" (
  "id"           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"         TEXT         NOT NULL,
  "reportType"   "ScheduledReportType" NOT NULL,
  "schedule"     "ScheduledReportSchedule" NOT NULL,
  "recipients"   TEXT[]       NOT NULL DEFAULT '{}',
  "config"       JSONB        NOT NULL DEFAULT '{}',

  "enabled"      BOOLEAN      NOT NULL DEFAULT true,
  "nextRunAt"    TIMESTAMPTZ  NOT NULL,
  "lastRunAt"    TIMESTAMPTZ,

  "createdAt"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updatedAt"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Multi-Tenancy
  "tenantId"     UUID         NOT NULL,
  "createdById"  UUID         NOT NULL,

  -- Foreign Keys
  CONSTRAINT "scheduled_reports_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "scheduled_reports_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE
);

-- ===========================================
-- INDEXES
-- ===========================================

-- Tenant-based queries (multi-tenancy)
CREATE INDEX IF NOT EXISTS "scheduled_reports_tenantId_idx"
  ON "scheduled_reports"("tenantId");

-- Cron job: find enabled reports that are due
CREATE INDEX IF NOT EXISTS "scheduled_reports_enabled_nextRunAt_idx"
  ON "scheduled_reports"("enabled", "nextRunAt")
  WHERE "enabled" = true;

-- Filter by report type
CREATE INDEX IF NOT EXISTS "scheduled_reports_reportType_idx"
  ON "scheduled_reports"("reportType");
