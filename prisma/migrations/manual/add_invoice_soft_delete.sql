-- Add soft-delete support for invoices
-- Legal requirement: AO §147, HGB §257 - 10 year retention period
-- This replaces hard DELETE with a deletedAt timestamp

ALTER TABLE "invoices" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Index for filtering out soft-deleted records in list queries
CREATE INDEX "invoices_deletedAt_idx" ON "invoices" ("deletedAt");
