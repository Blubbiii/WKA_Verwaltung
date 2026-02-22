-- Migration: Add e-invoice (XRechnung/ZUGFeRD) fields to invoices table
-- Required by German law since 2025 for B2B invoices (EN 16931)
-- XRechnung 3.0 / ZUGFeRD 2.2 COMFORT profile
--
-- NOTE: Prisma uses camelCase field names as-is for column names (no @map)

-- Add e-invoice fields to the invoices table
ALTER TABLE "invoices" ADD COLUMN "einvoiceXml" TEXT;
ALTER TABLE "invoices" ADD COLUMN "einvoiceFormat" TEXT;
ALTER TABLE "invoices" ADD COLUMN "leitwegId" TEXT;
ALTER TABLE "invoices" ADD COLUMN "einvoiceGeneratedAt" TIMESTAMPTZ;

-- Add comment for documentation
COMMENT ON COLUMN "invoices"."einvoiceXml" IS 'Cached XRechnung/ZUGFeRD XML content';
COMMENT ON COLUMN "invoices"."einvoiceFormat" IS 'E-invoice format: XRECHNUNG or ZUGFERD';
COMMENT ON COLUMN "invoices"."leitwegId" IS 'Leitweg-ID for public sector invoices (e.g. 04011000-12345-67)';
COMMENT ON COLUMN "invoices"."einvoiceGeneratedAt" IS 'Timestamp when the e-invoice XML was last generated';

-- Index on leitwegId for lookups (sparse - most invoices won't have one)
CREATE INDEX "invoices_leitwegId_idx" ON "invoices" ("leitwegId") WHERE "leitwegId" IS NOT NULL;

-- Index on einvoiceFormat for filtering invoices with/without e-invoice
CREATE INDEX "invoices_einvoiceFormat_idx" ON "invoices" ("einvoiceFormat") WHERE "einvoiceFormat" IS NOT NULL;
