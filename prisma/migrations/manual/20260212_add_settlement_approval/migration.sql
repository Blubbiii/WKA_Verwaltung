-- Migration: Add settlement approval workflow
-- Date: 2026-02-12
-- Description: Adds PENDING_REVIEW and APPROVED statuses to SettlementPeriodStatus enum,
--              and adds approval tracking fields (reviewedById, reviewedAt, reviewNotes)
--              to the lease_settlement_periods table.

-- Step 1: Add new enum values to SettlementPeriodStatus
ALTER TYPE "SettlementPeriodStatus" ADD VALUE IF NOT EXISTS 'PENDING_REVIEW' AFTER 'IN_PROGRESS';
ALTER TYPE "SettlementPeriodStatus" ADD VALUE IF NOT EXISTS 'APPROVED' AFTER 'PENDING_REVIEW';

-- Step 2: Add approval tracking columns to lease_settlement_periods
ALTER TABLE "lease_settlement_periods"
  ADD COLUMN IF NOT EXISTS "reviewedById" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "reviewNotes" TEXT;

-- Step 3: Add foreign key constraint for reviewedById -> users(id)
ALTER TABLE "lease_settlement_periods"
  ADD CONSTRAINT "lease_settlement_periods_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "users"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- Step 4: Add index for reviewer lookups
CREATE INDEX IF NOT EXISTS "lease_settlement_periods_reviewedById_idx"
  ON "lease_settlement_periods"("reviewedById");
