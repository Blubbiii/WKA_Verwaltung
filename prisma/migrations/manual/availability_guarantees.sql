-- A2 (Audit 2026-07): Verfuegbarkeitsgarantie und Bonus/Malus.
--
-- Wartungsvertraege lagen als Contract(SERVICE) mit annualValue vor, aber ohne
-- garantierte Verfuegbarkeit, Berechnungsmethode, Ausschlusstatbestaende und
-- Bonus/Malus-Staffel. Der Hersteller rechnete die Verfuegbarkeit selbst ab,
-- der Betreiber hatte keine unabhaengige Gegenrechnung.
--
-- Gehoert mit Finding F21 zusammen: die bestehende Kennzahl T1/(T1+T5) ist
-- NICHT die, gegen die Garantien abgerechnet werden.

DO $$ BEGIN
  CREATE TYPE "AvailabilityMethod" AS ENUM ('TIME_BASED', 'ENERGY_BASED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PointRounding" AS ENUM ('UP', 'DOWN', 'EXACT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BonusMalusKind" AS ENUM ('BONUS', 'MALUS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BonusMalusMode" AS ENUM ('PER_PERCENTAGE_POINT', 'FIXED_EUR', 'PERCENT_OF_ANNUAL_VALUE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AvailabilitySettlementStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'INVOICED', 'DISPUTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Garantie ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "availability_guarantees" (
  "id"                    TEXT PRIMARY KEY,
  "tenantId"              TEXT NOT NULL,
  "contractId"            TEXT NOT NULL,
  "targetAvailabilityPct" DECIMAL(5,2) NOT NULL,
  "method"                "AvailabilityMethod" NOT NULL DEFAULT 'TIME_BASED',
  -- Als Textliste und nicht als Flags: der Vertrag zaehlt die Kategorien auf,
  -- und so liest sich die Erfassung wie der Vertragstext.
  "availableCategories"   TEXT[] NOT NULL DEFAULT '{}',
  "excludedCategories"    TEXT[] NOT NULL DEFAULT '{}',
  "exclusionNotes"        TEXT,
  "pointRounding"         "PointRounding" NOT NULL DEFAULT 'UP',
  "maxMalusEur"           DECIMAL(15,2),
  "maxBonusEur"           DECIMAL(15,2),
  "validFrom"             TIMESTAMP(3) NOT NULL,
  "validTo"               TIMESTAMP(3),
  "isActive"              BOOLEAN NOT NULL DEFAULT true,
  "notes"                 TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'availability_guarantees_tenantId_fkey') THEN
    ALTER TABLE "availability_guarantees" ADD CONSTRAINT "availability_guarantees_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'availability_guarantees_contractId_fkey') THEN
    ALTER TABLE "availability_guarantees" ADD CONSTRAINT "availability_guarantees_contractId_fkey"
      FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "availability_guarantees_tenantId_idx" ON "availability_guarantees"("tenantId");
CREATE INDEX IF NOT EXISTS "availability_guarantees_contractId_idx" ON "availability_guarantees"("contractId");
CREATE INDEX IF NOT EXISTS "availability_guarantees_tenantId_isActive_idx" ON "availability_guarantees"("tenantId", "isActive");

-- Bonus-/Malus-Staffel ---------------------------------------------------

CREATE TABLE IF NOT EXISTS "availability_guarantee_tiers" (
  "id"          TEXT PRIMARY KEY,
  "guaranteeId" TEXT NOT NULL,
  -- Untere Grenze einschliesslich, obere ausschliesslich. Sonst faellt genau
  -- die Zielmarke in die Poenalestaffel.
  "fromPct"     DECIMAL(5,2) NOT NULL,
  "toPct"       DECIMAL(5,2) NOT NULL,
  "kind"        "BonusMalusKind" NOT NULL,
  "mode"        "BonusMalusMode" NOT NULL,
  "amount"      DECIMAL(15,2) NOT NULL,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'availability_guarantee_tiers_guaranteeId_fkey') THEN
    ALTER TABLE "availability_guarantee_tiers" ADD CONSTRAINT "availability_guarantee_tiers_guaranteeId_fkey"
      FOREIGN KEY ("guaranteeId") REFERENCES "availability_guarantees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "availability_guarantee_tiers_guaranteeId_idx"
  ON "availability_guarantee_tiers"("guaranteeId");

-- Jahresabgleich ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS "availability_settlements" (
  "id"                    TEXT PRIMARY KEY,
  "tenantId"              TEXT NOT NULL,
  "guaranteeId"           TEXT NOT NULL,
  "periodStart"           TIMESTAMP(3) NOT NULL,
  "periodEnd"             TIMESTAMP(3) NOT NULL,
  -- NULL heisst "nicht berechenbar", NICHT 0 %. 0 % wuerde die volle Poenale
  -- ausloesen und darf kein Ergebnis fehlender Daten sein.
  "actualAvailabilityPct" DECIMAL(5,2),
  -- Zielmarke mitgespeichert: eine spaetere Vertragsaenderung darf eine
  -- gestellte Forderung nicht veraendern.
  "targetAvailabilityPct" DECIMAL(5,2) NOT NULL,
  "basis"                 JSONB,
  -- Positiv = Forderung des Betreibers (Malus), negativ = Bonus.
  "bonusMalusEur"         DECIMAL(15,2),
  "annualValueEur"        DECIMAL(15,2),
  "status"                "AvailabilitySettlementStatus" NOT NULL DEFAULT 'DRAFT',
  "vendorReportedPct"     DECIMAL(5,2),
  "vendorReportNotes"     TEXT,
  "invoiceId"             TEXT,
  "computedAt"            TIMESTAMP(3),
  "confirmedAt"           TIMESTAMP(3),
  "notes"                 TEXT,
  "createdById"           TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'availability_settlements_tenantId_fkey') THEN
    ALTER TABLE "availability_settlements" ADD CONSTRAINT "availability_settlements_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'availability_settlements_guaranteeId_fkey') THEN
    ALTER TABLE "availability_settlements" ADD CONSTRAINT "availability_settlements_guaranteeId_fkey"
      FOREIGN KEY ("guaranteeId") REFERENCES "availability_guarantees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'availability_settlements_invoiceId_fkey') THEN
    ALTER TABLE "availability_settlements" ADD CONSTRAINT "availability_settlements_invoiceId_fkey"
      FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'availability_settlements_createdById_fkey') THEN
    ALTER TABLE "availability_settlements" ADD CONSTRAINT "availability_settlements_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Ein Zeitraum je Garantie genau einmal — sonst entstehen zwei Forderungen
-- fuer dasselbe Jahr.
CREATE UNIQUE INDEX IF NOT EXISTS "availability_settlements_guaranteeId_period_key"
  ON "availability_settlements"("guaranteeId", "periodStart", "periodEnd");
CREATE INDEX IF NOT EXISTS "availability_settlements_tenantId_idx" ON "availability_settlements"("tenantId");
CREATE INDEX IF NOT EXISTS "availability_settlements_tenantId_status_idx" ON "availability_settlements"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "availability_settlements_guaranteeId_idx" ON "availability_settlements"("guaranteeId");
