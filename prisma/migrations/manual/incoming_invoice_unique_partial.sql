-- P13: Duplikatsschutz für IncomingInvoice (D7).
--
-- Wir verhindern, dass die gleiche Eingangsrechnung (gleicher Lieferant +
-- gleiche externe Rechnungsnummer) zweimal angelegt wird — Top-1-Quelle
-- für Doppelzahlungen.
--
-- Prisma 7.8 unterstützt keine Partial-Indexes als Schema-Annotation,
-- daher manuelle Migration. Der Application-Layer (POST /api/inbox)
-- prüft zusätzlich vor dem Insert mit klarer Fehlermeldung — diese SQL-
-- Migration ist Defense-in-Depth gegen Race-Conditions.
--
-- WICHTIG vor Anwendung: Duplikate in Bestandsdaten bereinigen!
-- Test mit:
--   SELECT count(*), "tenantId", "vendorId", "invoiceNumber"
--   FROM "incoming_invoices"
--   WHERE "vendorId" IS NOT NULL
--     AND "invoiceNumber" IS NOT NULL
--     AND "deletedAt" IS NULL
--   GROUP BY "tenantId", "vendorId", "invoiceNumber"
--   HAVING count(*) > 1;
-- Vor Migration alle Treffer manuell mit User reviewen + mergen.
--
-- Aufruf:
--   psql $DATABASE_URL -f prisma/migrations/manual/incoming_invoice_unique_partial.sql

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "ix_incoming_invoice_supplier_unique"
  ON "incoming_invoices"("tenantId", "vendorId", "invoiceNumber")
  WHERE "vendorId" IS NOT NULL
    AND "invoiceNumber" IS NOT NULL
    AND "deletedAt" IS NULL;

COMMENT ON INDEX "ix_incoming_invoice_supplier_unique" IS
  'P13: Verhindert Duplikat-Erfassung (gleicher Lieferant + Rechnungsnummer). Partial-Unique nur für nicht-gelöschte Records.';
