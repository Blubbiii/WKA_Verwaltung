/**
 * TimescaleDB Hypertable Migration
 *
 * Converts scada_measurements to a TimescaleDB hypertable partitioned by timestamp.
 * This dramatically improves query performance for time-range queries on SCADA data.
 *
 * PREREQUISITES:
 * - TimescaleDB extension must be enabled (already in Docker stack)
 * - Run AFTER prisma db push
 *
 * Run command (in app container):
 *   NODE_PATH=/prisma-cli/node_modules /prisma-cli/node_modules/.bin/tsx prisma/migrate-timescaledb-hypertable.ts
 *
 * This script is idempotent — safe to run multiple times.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🕐 Checking TimescaleDB extension...");

  // Enable TimescaleDB extension if not already enabled
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;`);
  console.log("✓ TimescaleDB extension ready");

  // Check if scada_measurements is already a hypertable
  const existing = await prisma.$queryRawUnsafe<{ hypertable_name: string }[]>(`
    SELECT hypertable_name
    FROM timescaledb_information.hypertables
    WHERE hypertable_name = 'scada_measurements'
  `);

  if (existing.length > 0) {
    console.log("✓ scada_measurements is already a hypertable — nothing to do");
    return;
  }

  // Prisma creates a composite primary key (id, timestamp) — TimescaleDB requires
  // the partition column (timestamp) to be part of the primary key, which it is.
  console.log("🔄 Converting scada_measurements to hypertable (chunk_time_interval = 1 month)...");
  await prisma.$executeRawUnsafe(`
    SELECT create_hypertable(
      'scada_measurements',
      'timestamp',
      chunk_time_interval => INTERVAL '1 month',
      if_not_exists => TRUE
    );
  `);

  // Add compression policy: compress chunks older than 30 days
  console.log("🗜️  Adding compression policy (compress after 30 days)...");
  await prisma.$executeRawUnsafe(`
    ALTER TABLE scada_measurements SET (
      timescaledb.compress,
      timescaledb.compress_orderby = 'timestamp DESC',
      timescaledb.compress_segmentby = 'turbine_id'
    );
  `);
  await prisma.$executeRawUnsafe(`
    SELECT add_compression_policy(
      'scada_measurements',
      INTERVAL '30 days',
      if_not_exists => TRUE
    );
  `);

  // Add retention policy: drop chunks older than 10 years
  console.log("🗑️  Adding retention policy (keep 10 years)...");
  await prisma.$executeRawUnsafe(`
    SELECT add_retention_policy(
      'scada_measurements',
      INTERVAL '10 years',
      if_not_exists => TRUE
    );
  `);

  console.log("✅ scada_measurements is now a TimescaleDB hypertable");
  console.log("   - Chunk interval: 1 month");
  console.log("   - Compression: after 30 days (segmented by turbine_id)");
  console.log("   - Retention: 10 years");
}

main()
  .catch((e) => {
    console.error("❌ Migration failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
