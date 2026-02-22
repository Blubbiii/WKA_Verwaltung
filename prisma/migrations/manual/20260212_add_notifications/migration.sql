-- Migration: Create notifications table + add link column
-- Purpose: In-App Notification Center for WindparkManager
-- Date: 2026-02-12
-- Safe: Only creates table if not exists and adds column if not exists

-- Step 1: Create NotificationType enum if not exists
DO $$ BEGIN
  CREATE TYPE "NotificationType" AS ENUM ('DOCUMENT', 'VOTE', 'CONTRACT', 'INVOICE', 'SYSTEM');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Step 2: Create notifications table if not exists
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT,
  "link" TEXT,
  "referenceType" TEXT,
  "referenceId" TEXT,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "emailSent" BOOLEAN NOT NULL DEFAULT false,
  "emailSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,

  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- Step 3: Add link column if table already existed without it
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "link" TEXT;

-- Step 4: Add foreign keys (safe: will fail silently if they already exist)
DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Step 5: Create indexes
CREATE INDEX IF NOT EXISTS "notifications_userId_idx" ON "notifications"("userId");
CREATE INDEX IF NOT EXISTS "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");
CREATE INDEX IF NOT EXISTS "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");
