-- A3 (Audit 2026-07): Zaehlpunkt/Marktlokation + Plausibilisierung der
-- Netzbetreiber-Abrechnung.
--
-- Befund: "Zaehlpunkt / Marktlokations-ID kommen im ganzen Codebase nicht
-- vor." Damit fehlte der Schluessel, ueber den sich eine Abrechnung
-- ueberhaupt einem Park zuordnen laesst. Und der Dreiecksabgleich
-- (abgerechnete Menge <-> SCADA <-> erfasste Produktion) fehlte ganz: die
-- Zahlen wurden abgetippt und geglaubt.

DO $$ BEGIN
  CREATE TYPE "MeteringPointKind" AS ENUM ('MARKTLOKATION', 'MESSLOKATION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MeteringDirection" AS ENUM ('FEED_IN', 'CONSUMPTION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Zaehlpunkte ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "metering_points" (
  "id"               TEXT PRIMARY KEY,
  "tenantId"         TEXT NOT NULL,
  "kind"             "MeteringPointKind" NOT NULL,
  "direction"        "MeteringDirection" NOT NULL DEFAULT 'FEED_IN',
  -- Als Text und nicht mit fester Breite: eine MaLo hat 11 Stellen, eine MeLo
  -- 33 Zeichen.
  "code"             VARCHAR(40) NOT NULL,
  "parkId"           TEXT NOT NULL,
  "turbineId"        TEXT,
  "gridOperator"     VARCHAR(200),
  "meteringOperator" VARCHAR(200),
  "balancingGroup"   VARCHAR(50),
  "validFrom"        TIMESTAMP(3),
  "validTo"          TIMESTAMP(3),
  "isActive"         BOOLEAN NOT NULL DEFAULT true,
  "notes"            TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'metering_points_tenantId_fkey') THEN
    ALTER TABLE "metering_points" ADD CONSTRAINT "metering_points_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'metering_points_parkId_fkey') THEN
    ALTER TABLE "metering_points" ADD CONSTRAINT "metering_points_parkId_fkey"
      FOREIGN KEY ("parkId") REFERENCES "parks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'metering_points_turbineId_fkey') THEN
    ALTER TABLE "metering_points" ADD CONSTRAINT "metering_points_turbineId_fkey"
      FOREIGN KEY ("turbineId") REFERENCES "turbines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Eine Kennung je Mandant nur einmal: zwei Datensaetze mit derselben MaLo
-- wuerden eine Abrechnung zwei Parks zuordnen.
CREATE UNIQUE INDEX IF NOT EXISTS "metering_points_tenantId_code_key"
  ON "metering_points"("tenantId", "code");
CREATE INDEX IF NOT EXISTS "metering_points_tenantId_idx" ON "metering_points"("tenantId");
CREATE INDEX IF NOT EXISTS "metering_points_parkId_idx" ON "metering_points"("parkId");
CREATE INDEX IF NOT EXISTS "metering_points_turbineId_idx" ON "metering_points"("turbineId");

-- Abgleichsergebnisse ----------------------------------------------------

CREATE TABLE IF NOT EXISTS "settlement_checks" (
  "id"                 TEXT PRIMARY KEY,
  "tenantId"           TEXT NOT NULL,
  "settlementId"       TEXT NOT NULL,
  -- Die drei verglichenen Mengen werden MITGESPEICHERT: der Abgleich ist eine
  -- Momentaufnahme. SCADA-Daten koennen nachgeliefert werden, und dann stimmt
  -- eine nachgerechnete Zahl nicht mehr mit der ueberein, die beim
  -- Reklamieren vorlag.
  "settledKwh"         DECIMAL(15,3),
  "scadaKwh"           DECIMAL(15,3),
  "reportedKwh"        DECIMAL(15,3),
  "settledRevenueEur"  DECIMAL(15,2),
  "expectedRatePerKwh" DECIMAL(10,4),
  "expectedRevenueEur" DECIMAL(15,2),
  "findings"           JSONB NOT NULL,
  "worstSeverity"      VARCHAR(10) NOT NULL,
  "interpretation"     TEXT,
  "tolerances"         JSONB,
  "reviewNotes"        TEXT,
  "reviewedAt"         TIMESTAMP(3),
  "reviewedById"       TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'settlement_checks_tenantId_fkey') THEN
    ALTER TABLE "settlement_checks" ADD CONSTRAINT "settlement_checks_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'settlement_checks_settlementId_fkey') THEN
    ALTER TABLE "settlement_checks" ADD CONSTRAINT "settlement_checks_settlementId_fkey"
      FOREIGN KEY ("settlementId") REFERENCES "energy_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'settlement_checks_reviewedById_fkey') THEN
    ALTER TABLE "settlement_checks" ADD CONSTRAINT "settlement_checks_reviewedById_fkey"
      FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "settlement_checks_tenantId_idx" ON "settlement_checks"("tenantId");
CREATE INDEX IF NOT EXISTS "settlement_checks_settlementId_idx" ON "settlement_checks"("settlementId");
CREATE INDEX IF NOT EXISTS "settlement_checks_tenantId_worstSeverity_idx"
  ON "settlement_checks"("tenantId", "worstSeverity");
