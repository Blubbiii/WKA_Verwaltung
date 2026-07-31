-- B2 (Audit 2026-07): Regulatorik-Stammdaten + Meldefristen.
--
-- "mastrNumber ist ein ungeprueftes Freitextfeld auf Turbine, sonst nichts."
-- Es fehlten EEG-Anlagenschluessel, MaStR-Registrierungsstatus, Zuschlagswert
-- und ein vorkonfiguriertes Fristenset.
--
-- `turbines.mastrNumber` bleibt UNVERAENDERT stehen und wird NICHT migriert:
-- bestehende Auswertungen lesen das Feld weiter, und ein stiller Backfill
-- wuerde ungepruefte Werte in ein geprueftes Feld heben. Die Maske schlaegt den
-- alten Wert vor; geprueft wird er beim Speichern wie jede andere Eingabe.

BEGIN;

-- Enums --------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "MastrRegistrationStatus" AS ENUM
    ('NOT_REGISTERED', 'PENDING', 'REGISTERED', 'DECOMMISSIONED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RemunerationScheme" AS ENUM
    ('FIXED_FEED_IN', 'MARKET_PREMIUM', 'TENDER_AWARD', 'OUTSIDE_EEG', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ComplianceDeadlineKind" AS ENUM
    ('EEG_ANNUAL_REPORT', 'MASTR_CHANGE_NOTICE', 'EEG_36H_SITE_REVIEW',
     'MASTR_REGISTRATION', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ComplianceDeadlineStatus" AS ENUM ('OPEN', 'DONE', 'NOT_APPLICABLE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Stammdaten ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "regulatory_profiles" (
  "id"                  TEXT PRIMARY KEY,
  "tenantId"            TEXT NOT NULL,
  "turbineId"           TEXT NOT NULL,

  "mastrUnitNumber"     VARCHAR(30),
  "mastrPlantNumber"    VARCHAR(30),
  "mastrStatus"         "MastrRegistrationStatus" NOT NULL DEFAULT 'NOT_REGISTERED',
  "mastrRegisteredAt"   TIMESTAMP(3),
  -- Die Differenz zwischen diesen beiden IST die Frist (§ 5 Abs. 1 MaStRV).
  "lastChangeAt"         TIMESTAMP(3),
  "lastChangeReportedAt" TIMESTAMP(3),

  -- 33 Zeichen nach § 3 Nr. 1 HkNRV. Als VARCHAR(40) mit Laengenpruefung in
  -- der Route: ein hartes CHAR(33) wuerde bestehende Kurzformen abweisen,
  -- bevor jemand sie korrigieren kann.
  "eegPlantKey"         VARCHAR(40),
  "scheme"              "RemunerationScheme" NOT NULL DEFAULT 'UNKNOWN',
  "awardValueCtPerKwh"  DECIMAL(8,4),
  "awardDate"           TIMESTAMP(3),
  "awardReference"      VARCHAR(100),
  "siteQualityPercent"  DECIMAL(6,2),

  "gridOperator"        VARCHAR(200),
  "gridConnectionDate"  TIMESTAMP(3),
  -- Abweichender Meldetermin des Netzbetreibers als MM-TT. Er liegt in der
  -- Praxis regelmaessig vor dem gesetzlichen 28.02.
  "annualReportDay"     VARCHAR(5),

  "notes"               TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "regulatory_profiles_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "regulatory_profiles_turbineId_fkey"
    FOREIGN KEY ("turbineId") REFERENCES "turbines"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "regulatory_profiles_turbineId_key"
  ON "regulatory_profiles" ("turbineId");
CREATE INDEX IF NOT EXISTS "regulatory_profiles_tenantId_idx"
  ON "regulatory_profiles" ("tenantId");
CREATE INDEX IF NOT EXISTS "regulatory_profiles_tenantId_mastrStatus_idx"
  ON "regulatory_profiles" ("tenantId", "mastrStatus");

-- Meldefristen -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "compliance_deadlines" (
  "id"            TEXT PRIMARY KEY,
  "tenantId"      TEXT NOT NULL,
  "kind"          "ComplianceDeadlineKind" NOT NULL,
  "status"        "ComplianceDeadlineStatus" NOT NULL DEFAULT 'OPEN',
  "turbineId"     TEXT,
  "parkId"        TEXT,
  "dueDate"       TIMESTAMP(3) NOT NULL,
  -- Die Rechtsgrundlage steht in der Zeile, damit niemand nachschlagen muss,
  -- warum dieser Termin gilt.
  "basis"         TEXT NOT NULL,
  "operatingYear" INTEGER,
  -- Traegt die Idempotenz: ein erneutes Erzeugen legt dieselbe Frist nicht
  -- zweimal an. NULL bei von Hand angelegten Fristen — Postgres behandelt
  -- NULLs im Unique-Index als verschieden, mehrere eigene Fristen je Anlage
  -- sind damit moeglich.
  "ruleKey"       VARCHAR(80),
  "completedAt"   TIMESTAMP(3),
  "completedById" TEXT,
  "reference"     VARCHAR(200),
  "notes"         TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "compliance_deadlines_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "compliance_deadlines_turbineId_fkey"
    FOREIGN KEY ("turbineId") REFERENCES "turbines"("id") ON DELETE CASCADE,
  CONSTRAINT "compliance_deadlines_parkId_fkey"
    FOREIGN KEY ("parkId") REFERENCES "parks"("id") ON DELETE CASCADE,
  CONSTRAINT "compliance_deadlines_completedById_fkey"
    FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "compliance_deadlines_tenantId_turbineId_ruleKey_key"
  ON "compliance_deadlines" ("tenantId", "turbineId", "ruleKey");
CREATE INDEX IF NOT EXISTS "compliance_deadlines_tenantId_idx"
  ON "compliance_deadlines" ("tenantId");
-- Traegt die Arbeitsliste: offene Fristen nach Faelligkeit.
CREATE INDEX IF NOT EXISTS "compliance_deadlines_tenantId_status_dueDate_idx"
  ON "compliance_deadlines" ("tenantId", "status", "dueDate");
CREATE INDEX IF NOT EXISTS "compliance_deadlines_turbineId_idx"
  ON "compliance_deadlines" ("turbineId");
CREATE INDEX IF NOT EXISTS "compliance_deadlines_parkId_idx"
  ON "compliance_deadlines" ("parkId");

COMMIT;
