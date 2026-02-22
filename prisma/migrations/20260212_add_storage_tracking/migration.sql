-- Add storage tracking fields to Tenant
-- storageUsedBytes: tracks current storage usage in bytes
-- storageLimit: configurable storage limit per tenant (default 5 GB)

ALTER TABLE "tenants" ADD COLUMN "storageUsedBytes" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "tenants" ADD COLUMN "storageLimit" BIGINT NOT NULL DEFAULT 5368709120;

-- Initialize storageUsedBytes from existing documents
-- This calculates the actual storage used by summing up all document file sizes per tenant
UPDATE "tenants" t
SET "storageUsedBytes" = COALESCE(
  (SELECT SUM(COALESCE(d."fileSizeBytes", 0))
   FROM "documents" d
   WHERE d."tenantId" = t."id"),
  0
);
