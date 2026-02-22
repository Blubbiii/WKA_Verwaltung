-- Migration: Create mass_communications table
-- Purpose: Mass Communication (Massen-Kommunikation) for WindparkManager
-- Date: 2026-02-12
-- Safe: Only creates table if not exists

-- Step 1: Create mass_communications table if not exists
CREATE TABLE IF NOT EXISTS "mass_communications" (
  "id" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "recipientFilter" TEXT NOT NULL,
  "recipientCount" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "sentAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tenantId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,

  CONSTRAINT "mass_communications_pkey" PRIMARY KEY ("id")
);

-- Step 2: Add foreign key constraints if they don't exist
DO $$ BEGIN
  ALTER TABLE "mass_communications"
    ADD CONSTRAINT "mass_communications_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "mass_communications"
    ADD CONSTRAINT "mass_communications_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Step 3: Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS "mass_communications_tenantId_idx"
  ON "mass_communications"("tenantId");

CREATE INDEX IF NOT EXISTS "mass_communications_tenantId_createdAt_idx"
  ON "mass_communications"("tenantId", "createdAt");
