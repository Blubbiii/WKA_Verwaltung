-- ============================================================================
-- Partial Unique Index für Jahres-Settlement-Perioden
-- ============================================================================
--
-- Problem: Das Prisma-Schema hat @@unique([tenantId, parkId, year, month, periodType]),
-- aber PostgreSQL behandelt NULL in UNIQUE-Constraints als verschieden. Für
-- Jahresabrechnungen ist `month = NULL` — dadurch greift das Constraint NICHT,
-- und parallele Bulk-Create-Jobs können doppelte Perioden für denselben
-- (tenantId, parkId, year, periodType) mit month=NULL erzeugen.
--
-- Prisma-Schema unterstützt kein partial `@@unique(..., where: ...)`, daher
-- muss der Index manuell via SQL erstellt werden. `db push` lässt ihn stehen.
--
-- Ausführen NACH `prisma db push`:
--   docker exec -i windparkmanager-postgres-1 psql -U wpm -d windparkmanager \
--     -f /tmp/2026-07-01-lease-settlement-partial-unique.sql
--
-- Idempotent — kann mehrfach ausgeführt werden.
-- ============================================================================

-- WICHTIG: Prisma mapped nur den Tabellen-Namen auf snake_case
-- (@@map("lease_settlement_periods")). Die Spalten-Namen bleiben camelCase
-- ("tenantId", "parkId", "periodType") und brauchen in raw SQL die
-- Anführungszeichen, sonst wandelt Postgres sie automatisch in Kleinbuchstaben.

CREATE UNIQUE INDEX IF NOT EXISTS lease_settlement_periods_annual_unique
ON lease_settlement_periods ("tenantId", "parkId", year, "periodType")
WHERE month IS NULL;
