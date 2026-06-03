-- H-1: Race-Protection für findOrCreateApprovalRequest auf DB-Level.
--
-- Partial Unique Index — nur PENDING-Approvals dürfen nicht doppelt für
-- (tenantId, entityType, entityId, action) existieren. APPROVED/REJECTED/
-- EXPIRED dürfen mehrfach existieren (historische Records).
--
-- Prisma unterstützt partial unique indexes nicht nativ → manuell ausführen.
--
-- Ausführen:
--   psql ... -f prisma/migrations/manual/approval_request_pending_unique.sql
-- Oder via Docker:
--   docker exec -i windparkmanager-postgres-1 psql -U wpm -d windparkmanager \
--     -f /tmp/approval_request_pending_unique.sql

CREATE UNIQUE INDEX IF NOT EXISTS approval_request_pending_unique
  ON "ApprovalRequest" ("tenantId", "entityType", "entityId", "action")
  WHERE status = 'PENDING';
