-- Migration: Add hierarchy field to Role model
-- Purpose: Unify dual role system by giving each Role a numeric hierarchy level.
--          This allows replacing legacy UserRole enum checks with hierarchy-based checks.
-- Date: 2026-02-12
-- Safe: Only ADDs a column with a DEFAULT, no data loss possible.

-- Step 1: Add hierarchy column with default 0
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "hierarchy" INTEGER NOT NULL DEFAULT 0;

-- Step 2: Set hierarchy values for existing system roles
-- Higher number = more privileges
-- 100 = Superadmin (full system access)
--  80 = Administrator (full tenant access)
--  60 = Manager (create/edit/delete data, no user management)
--  50 = Mitarbeiter (limited create/edit)
--  40 = Nur Lesen (read-only)
--  20 = Portal-Benutzer (external portal only)
--   0 = Custom roles (default, no implicit hierarchy)

UPDATE "roles" SET "hierarchy" = 100 WHERE "name" = 'Superadmin' AND "isSystem" = true;
UPDATE "roles" SET "hierarchy" = 80  WHERE "name" = 'Administrator' AND "isSystem" = true;
UPDATE "roles" SET "hierarchy" = 60  WHERE "name" = 'Manager' AND "isSystem" = true;
UPDATE "roles" SET "hierarchy" = 50  WHERE "name" = 'Mitarbeiter' AND "isSystem" = true;
UPDATE "roles" SET "hierarchy" = 40  WHERE "name" = 'Nur Lesen' AND "isSystem" = true;
UPDATE "roles" SET "hierarchy" = 20  WHERE "name" = 'Portal-Benutzer' AND "isSystem" = true;

-- Step 3: Add index for fast hierarchy lookups (used in permission checks)
CREATE INDEX IF NOT EXISTS "idx_roles_hierarchy" ON "roles" ("hierarchy");
