-- GoBD-compliant Archive System
-- Migration: 20260212_add_gobd_archive
--
-- Creates tables for immutable document archiving with hash-chain
-- integrity verification per GoBD (Grundsaetze zur ordnungsgemaessen
-- Fuehrung und Aufbewahrung von Buechern, Aufzeichnungen und Unterlagen
-- in elektronischer Form).

-- =================================================================
-- 1. ArchivedDocument - immutable archive entries
-- =================================================================

CREATE TABLE "archived_documents" (
  "id"                  TEXT NOT NULL,
  "tenantId"            TEXT NOT NULL,
  "documentType"        TEXT NOT NULL,
  "referenceId"         TEXT NOT NULL,
  "referenceNumber"     TEXT NOT NULL,
  "fileName"            TEXT NOT NULL,
  "fileSize"            INTEGER NOT NULL,
  "mimeType"            TEXT NOT NULL DEFAULT 'application/pdf',
  "storageKey"          TEXT NOT NULL,

  -- GoBD integrity fields
  "contentHash"         TEXT NOT NULL,
  "chainHash"           TEXT NOT NULL,
  "previousArchiveId"   TEXT,

  -- Metadata
  "metadata"            JSONB,
  "archivedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedById"        TEXT NOT NULL,
  "retentionUntil"      TIMESTAMP(3) NOT NULL,

  -- Access tracking
  "lastAccessedAt"      TIMESTAMP(3),
  "accessCount"         INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "archived_documents_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one archive entry per (tenant, reference, type)
CREATE UNIQUE INDEX "archived_documents_tenantId_referenceId_documentType_key"
  ON "archived_documents" ("tenantId", "referenceId", "documentType");

-- Query performance indexes
CREATE INDEX "archived_documents_tenantId_documentType_archivedAt_idx"
  ON "archived_documents" ("tenantId", "documentType", "archivedAt" DESC);

CREATE INDEX "archived_documents_tenantId_referenceNumber_idx"
  ON "archived_documents" ("tenantId", "referenceNumber");

CREATE INDEX "archived_documents_tenantId_retentionUntil_idx"
  ON "archived_documents" ("tenantId", "retentionUntil");

CREATE INDEX "archived_documents_tenantId_chainHash_idx"
  ON "archived_documents" ("tenantId", "chainHash");

-- Foreign keys
ALTER TABLE "archived_documents"
  ADD CONSTRAINT "archived_documents_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "archived_documents"
  ADD CONSTRAINT "archived_documents_archivedById_fkey"
  FOREIGN KEY ("archivedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "archived_documents"
  ADD CONSTRAINT "archived_documents_previousArchiveId_fkey"
  FOREIGN KEY ("previousArchiveId") REFERENCES "archived_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =================================================================
-- 2. ArchiveVerificationLog - verification run results
-- =================================================================

CREATE TABLE "archive_verification_logs" (
  "id"            TEXT NOT NULL,
  "tenantId"      TEXT NOT NULL,
  "verifiedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedById"  TEXT NOT NULL,
  "scope"         TEXT NOT NULL,
  "result"        TEXT NOT NULL,
  "totalDocs"     INTEGER NOT NULL,
  "validDocs"     INTEGER NOT NULL,
  "invalidDocs"   INTEGER NOT NULL,
  "details"       JSONB,

  CONSTRAINT "archive_verification_logs_pkey" PRIMARY KEY ("id")
);

-- Query performance index
CREATE INDEX "archive_verification_logs_tenantId_verifiedAt_idx"
  ON "archive_verification_logs" ("tenantId", "verifiedAt" DESC);

-- Foreign keys
ALTER TABLE "archive_verification_logs"
  ADD CONSTRAINT "archive_verification_logs_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "archive_verification_logs"
  ADD CONSTRAINT "archive_verification_logs_verifiedById_fkey"
  FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
