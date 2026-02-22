-- Migration: Add document approval lifecycle workflow
-- Date: 2026-02-12
-- Description: Adds DocumentApprovalStatus enum and approval tracking fields
--              (approvalStatus, reviewedById, reviewedAt, reviewNotes, publishedAt)
--              to the documents table. Existing documents default to PUBLISHED
--              so they continue to work without changes.

-- Step 1: Create the DocumentApprovalStatus enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentApprovalStatus') THEN
    CREATE TYPE "DocumentApprovalStatus" AS ENUM (
      'DRAFT',
      'PENDING_REVIEW',
      'APPROVED',
      'PUBLISHED',
      'REJECTED'
    );
  END IF;
END
$$;

-- Step 2: Add approval lifecycle columns to documents table
ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "approvalStatus" "DocumentApprovalStatus" NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN IF NOT EXISTS "reviewedById" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "reviewNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMPTZ;

-- Step 3: Set publishedAt for all existing documents (they are already published)
UPDATE "documents"
SET "publishedAt" = "createdAt"
WHERE "publishedAt" IS NULL AND "approvalStatus" = 'PUBLISHED';

-- Step 4: Add foreign key constraint for reviewedById -> users(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'documents_reviewedById_fkey'
  ) THEN
    ALTER TABLE "documents"
      ADD CONSTRAINT "documents_reviewedById_fkey"
      FOREIGN KEY ("reviewedById") REFERENCES "users"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END
$$;

-- Step 5: Add indexes for performance
CREATE INDEX IF NOT EXISTS "documents_approvalStatus_idx" ON "documents"("approvalStatus");
CREATE INDEX IF NOT EXISTS "documents_reviewedById_idx" ON "documents"("reviewedById");
