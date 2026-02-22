-- ConsolidateLeaseSettlements
-- Erweitert LeaseRevenueSettlement um Periodentyp, Vorschuss-Intervall und Approval-Workflow
-- aus dem bisherigen LeaseSettlementPeriod-Modell.

-- 1. Neue Enum-Werte fuer LeaseRevenueSettlementStatus
ALTER TYPE "LeaseRevenueSettlementStatus" ADD VALUE IF NOT EXISTS 'PENDING_REVIEW';
ALTER TYPE "LeaseRevenueSettlementStatus" ADD VALUE IF NOT EXISTS 'APPROVED';

-- 2. Neue Spalten auf lease_revenue_settlements
ALTER TABLE "lease_revenue_settlements" ADD COLUMN IF NOT EXISTS "periodType" TEXT NOT NULL DEFAULT 'FINAL';
ALTER TABLE "lease_revenue_settlements" ADD COLUMN IF NOT EXISTS "advanceInterval" TEXT;
ALTER TABLE "lease_revenue_settlements" ADD COLUMN IF NOT EXISTS "month" INTEGER;
ALTER TABLE "lease_revenue_settlements" ADD COLUMN IF NOT EXISTS "linkedEnergySettlementId" TEXT;
ALTER TABLE "lease_revenue_settlements" ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;
ALTER TABLE "lease_revenue_settlements" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);
ALTER TABLE "lease_revenue_settlements" ADD COLUMN IF NOT EXISTS "reviewNotes" TEXT;
ALTER TABLE "lease_revenue_settlements" ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- 3. FK fuer reviewedById
ALTER TABLE "lease_revenue_settlements"
  ADD CONSTRAINT "lease_revenue_settlements_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Unique Constraint anpassen (alt: tenantId+parkId+year → neu: +periodType+month)
-- Drop as constraint (if created via Prisma @@unique) AND as index (if created via CREATE UNIQUE INDEX)
ALTER TABLE "lease_revenue_settlements"
  DROP CONSTRAINT IF EXISTS "lease_revenue_settlements_tenantId_parkId_year_key";
DROP INDEX IF EXISTS "lease_revenue_settlements_tenantId_parkId_year_key";

CREATE UNIQUE INDEX "lease_revenue_settlements_tenantId_parkId_year_periodType_month_key"
  ON "lease_revenue_settlements"("tenantId", "parkId", "year", "periodType", "month");

-- 5. Neue Indizes
CREATE INDEX IF NOT EXISTS "lease_revenue_settlements_periodType_idx"
  ON "lease_revenue_settlements"("periodType");

CREATE INDEX IF NOT EXISTS "lease_revenue_settlements_tenantId_parkId_year_idx"
  ON "lease_revenue_settlements"("tenantId", "parkId", "year");
