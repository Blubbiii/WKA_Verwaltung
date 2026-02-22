-- Migration: Add SCADA Anomaly Detection
-- Date: 2026-02-12
-- Description: Adds scada_anomalies and scada_anomaly_configs tables
--              for automated SCADA data anomaly detection and alerting.

-- ===========================================
-- TABLE: scada_anomalies
-- ===========================================

CREATE TABLE IF NOT EXISTS "scada_anomalies" (
  "id"               TEXT         PRIMARY KEY,
  "tenantId"         UUID         NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "turbineId"        UUID         NOT NULL REFERENCES "turbines"("id") ON DELETE CASCADE,
  "type"             TEXT         NOT NULL, -- PERFORMANCE_DROP, LOW_AVAILABILITY, CURVE_DEVIATION, DATA_QUALITY, EXTENDED_DOWNTIME
  "severity"         TEXT         NOT NULL, -- WARNING, CRITICAL
  "message"          TEXT         NOT NULL,
  "details"          JSONB        NOT NULL DEFAULT '{}',

  "detectedAt"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "resolvedAt"       TIMESTAMPTZ,
  "acknowledged"     BOOLEAN      NOT NULL DEFAULT false,
  "acknowledgedById" UUID         REFERENCES "users"("id"),
  "acknowledgedAt"   TIMESTAMPTZ,
  "notes"            TEXT,

  "createdAt"        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updatedAt"        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS "scada_anomalies_tenant_detected"
  ON "scada_anomalies" ("tenantId", "detectedAt");

CREATE INDEX IF NOT EXISTS "scada_anomalies_turbine_type"
  ON "scada_anomalies" ("turbineId", "type");

CREATE INDEX IF NOT EXISTS "scada_anomalies_tenant_type_severity"
  ON "scada_anomalies" ("tenantId", "type", "severity");

-- ===========================================
-- TABLE: scada_anomaly_configs
-- ===========================================

CREATE TABLE IF NOT EXISTS "scada_anomaly_configs" (
  "id"                      TEXT         PRIMARY KEY,
  "tenantId"                UUID         NOT NULL UNIQUE REFERENCES "tenants"("id") ON DELETE CASCADE,
  "enabled"                 BOOLEAN      NOT NULL DEFAULT true,
  "performanceThreshold"    DECIMAL(5,2) NOT NULL DEFAULT 15,    -- % drop threshold
  "availabilityThreshold"   DECIMAL(5,2) NOT NULL DEFAULT 90,    -- min availability %
  "downtimeHoursThreshold"  INTEGER      NOT NULL DEFAULT 24,    -- max consecutive downtime hours
  "curveDeviationThreshold" DECIMAL(5,2) NOT NULL DEFAULT 20,    -- % deviation from power curve
  "dataQualityThreshold"    DECIMAL(5,2) NOT NULL DEFAULT 80,    -- min data coverage %
  "notifyByEmail"           BOOLEAN      NOT NULL DEFAULT true,
  "notifyInApp"             BOOLEAN      NOT NULL DEFAULT true,

  "createdAt"               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updatedAt"               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ===========================================
-- COMMENTS (documentation)
-- ===========================================

COMMENT ON TABLE "scada_anomalies" IS 'Detected anomalies from SCADA measurement data analysis';
COMMENT ON COLUMN "scada_anomalies"."type" IS 'PERFORMANCE_DROP | LOW_AVAILABILITY | CURVE_DEVIATION | DATA_QUALITY | EXTENDED_DOWNTIME';
COMMENT ON COLUMN "scada_anomalies"."severity" IS 'WARNING | CRITICAL';
COMMENT ON COLUMN "scada_anomalies"."details" IS 'JSON with anomaly-specific metric values for context';

COMMENT ON TABLE "scada_anomaly_configs" IS 'Per-tenant configuration for SCADA anomaly detection thresholds';
COMMENT ON COLUMN "scada_anomaly_configs"."performanceThreshold" IS 'Capacity factor drop percentage that triggers a PERFORMANCE_DROP anomaly';
COMMENT ON COLUMN "scada_anomaly_configs"."availabilityThreshold" IS 'Minimum daily availability percentage before triggering LOW_AVAILABILITY';
COMMENT ON COLUMN "scada_anomaly_configs"."curveDeviationThreshold" IS 'Maximum allowed deviation from historical power curve before CURVE_DEVIATION';
COMMENT ON COLUMN "scada_anomaly_configs"."dataQualityThreshold" IS 'Minimum data coverage percentage before triggering DATA_QUALITY alert';
