-- =============================================================================
-- TimescaleDB Setup for WindparkManager
--
-- Run this ONCE after switching the postgres image to:
--   timescale/timescaledb:latest-pg16
--
-- Usage (from host or Portainer console on postgres container):
--   docker exec -i wpm-postgres psql -U wpm -d windparkmanager \
--     < scripts/setup-timescaledb.sql
-- =============================================================================

-- 1. Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- 2. Convert scada_measurements to a hypertable (partitioned by timestamp)
--    migrate_data => true  : keep existing rows
--    if_not_exists => true : safe to re-run
SELECT create_hypertable(
  'scada_measurements',
  by_range('timestamp'),
  migrate_data    => true,
  if_not_exists   => true
);

-- 3. Enable compression (segment by turbine so each chunk stays compact)
ALTER TABLE scada_measurements SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'turbine_id',
  timescaledb.compress_orderby   = 'timestamp DESC'
);

-- 4. Auto-compress chunks older than 7 days
SELECT add_compression_policy(
  'scada_measurements',
  INTERVAL '7 days',
  if_not_exists => true
);

-- 5. Continuous Aggregate: hourly rollup (speeds up charts & analytics queries)
CREATE MATERIALIZED VIEW IF NOT EXISTS scada_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', timestamp)  AS hour,
  turbine_id,
  tenant_id,
  AVG(wind_speed_ms)                AS avg_wind_speed_ms,
  AVG(power_w)                      AS avg_power_w,
  MAX(power_w)                      AS max_power_w,
  AVG(rotor_rpm)                    AS avg_rotor_rpm,
  AVG(nacelle_direction_deg)        AS avg_nacelle_direction_deg
FROM scada_measurements
GROUP BY 1, turbine_id, tenant_id
WITH NO DATA;

-- 6. Policy: refresh the last 3 hours every hour
SELECT add_continuous_aggregate_policy(
  'scada_hourly',
  start_offset      => INTERVAL '3 hours',
  end_offset        => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists     => true
);

-- Done
\echo 'TimescaleDB setup complete. Hypertable, compression and continuous aggregate configured.'
