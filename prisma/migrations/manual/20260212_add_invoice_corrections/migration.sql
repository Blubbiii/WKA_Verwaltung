-- Migration: Add invoice correction/partial cancellation support
-- Date: 2026-02-12
-- Description: Adds fields for partial cancellations (Teilstorno) and corrections (Rechnungskorrektur)

-- Add correction fields to invoices table
ALTER TABLE "invoices" ADD COLUMN "correctionOf" TEXT;
ALTER TABLE "invoices" ADD COLUMN "correctionType" TEXT;
ALTER TABLE "invoices" ADD COLUMN "correctedPositions" JSONB;

-- Add foreign key constraint for correction reference (self-relation)
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_correctionOf_fkey"
  FOREIGN KEY ("correctionOf")
  REFERENCES "invoices"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- Add index for efficient lookup of corrections by original invoice
CREATE INDEX "invoices_correctionOf_idx" ON "invoices"("correctionOf");

-- Add check constraint for correctionType values
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_correctionType_check"
  CHECK ("correctionType" IS NULL OR "correctionType" IN ('FULL_CANCEL', 'PARTIAL_CANCEL', 'CORRECTION'));
