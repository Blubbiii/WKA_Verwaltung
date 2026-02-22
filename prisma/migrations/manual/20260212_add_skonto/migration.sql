-- Add Skonto (early payment discount) fields to invoices table
-- Skonto is a common German business practice where a discount is granted for early payment

ALTER TABLE "invoices" ADD COLUMN "skontoPercent" DECIMAL(5,2);
ALTER TABLE "invoices" ADD COLUMN "skontoDays" INTEGER;
ALTER TABLE "invoices" ADD COLUMN "skontoDeadline" TIMESTAMPTZ;
ALTER TABLE "invoices" ADD COLUMN "skontoAmount" DECIMAL(12,2);
ALTER TABLE "invoices" ADD COLUMN "skontoPaid" BOOLEAN NOT NULL DEFAULT false;

-- Index for querying invoices with active Skonto deadlines
CREATE INDEX "invoices_skontoDeadline_idx" ON "invoices" ("skontoDeadline")
  WHERE "skontoDeadline" IS NOT NULL AND "skontoPaid" = false;

COMMENT ON COLUMN "invoices"."skontoPercent" IS 'Skonto discount percentage, e.g. 2.00 for 2%';
COMMENT ON COLUMN "invoices"."skontoDays" IS 'Number of days from invoice date within which Skonto applies';
COMMENT ON COLUMN "invoices"."skontoDeadline" IS 'Calculated deadline: invoiceDate + skontoDays';
COMMENT ON COLUMN "invoices"."skontoAmount" IS 'Calculated discount amount: grossAmount * skontoPercent / 100';
COMMENT ON COLUMN "invoices"."skontoPaid" IS 'Whether Skonto was applied when marking the invoice as paid';
