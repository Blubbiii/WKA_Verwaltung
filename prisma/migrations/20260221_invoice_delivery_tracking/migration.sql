-- InvoiceDeliveryTracking
-- Adds delivery tracking fields (print + email) to invoices

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "printedAt" TIMESTAMP(3);
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "printedById" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "emailedAt" TIMESTAMP(3);
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "emailedById" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "emailedTo" TEXT;

-- FK for printedById
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_printedById_fkey"
  FOREIGN KEY ("printedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- FK for emailedById
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_emailedById_fkey"
  FOREIGN KEY ("emailedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
