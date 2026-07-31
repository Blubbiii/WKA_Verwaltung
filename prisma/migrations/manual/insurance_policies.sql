-- A6 (Audit 2026-07): Versicherungspolice als eigenes Objekt.
--
-- Policen waren nur Contract(contractType=INSURANCE); der Insurance-Screen
-- zeigte Titel, Typ, Status, Laufzeit — mehr nicht. Es fehlten
-- Versicherungssumme, Selbstbehalt, Praemie und Zahlweise, Deckungsarten,
-- versicherte Objekte, Kuendigungsfrist und die Verknuepfung Schaden->Police
-- mit Selbstbehaltsabzug.
--
-- Bewusst AM Vertrag und nicht statt seiner: Laufzeit, Kuendigungsfristen,
-- Dokumente und Erinnerungen haengen bereits am Contract.

DO $$ BEGIN
  CREATE TYPE "InsuranceDeductibleType" AS ENUM
    ('FIXED_EUR', 'PERCENT_OF_LOSS', 'PERCENT_OF_SUM_INSURED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "InsurancePremiumInterval" AS ENUM
    ('MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "InsuranceCoverageType" AS ENUM
    ('MACHINERY_BREAKDOWN', 'BUSINESS_INTERRUPTION', 'LIABILITY', 'ELEMENTAL',
     'ERECTION', 'TRANSPORT', 'LEGAL_PROTECTION', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Police ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "insurance_policies" (
  "id"                   TEXT PRIMARY KEY,
  "tenantId"             TEXT NOT NULL,
  "contractId"           TEXT NOT NULL,
  "policyNumber"         VARCHAR(100),
  "insurerName"          VARCHAR(200),
  "brokerName"           VARCHAR(200),
  "sumInsuredEur"        DECIMAL(15,2),
  -- Ohne Versicherungswert laesst sich eine Unterversicherung nach § 75 VVG
  -- NICHT pruefen. "Nicht erfasst" ist etwas anderes als "keine
  -- Unterversicherung" — bei einem Grossschaden existenziell.
  "insuredValueEur"      DECIMAL(15,2),
  -- In der Praxis haeufig vereinbart, deshalb ein eigenes Feld und keine
  -- Annahme.
  "waivesUnderinsurance" BOOLEAN NOT NULL DEFAULT false,
  "deductibleType"       "InsuranceDeductibleType" NOT NULL DEFAULT 'FIXED_EUR',
  "deductibleValue"      DECIMAL(15,2) NOT NULL DEFAULT 0,
  -- Nur bei prozentualen Formen wirksam.
  "deductibleMinEur"     DECIMAL(15,2),
  "deductibleMaxEur"     DECIMAL(15,2),
  "premiumEur"           DECIMAL(15,2),
  "premiumInterval"      "InsurancePremiumInterval",
  "nextPremiumDue"       TIMESTAMP(3),
  "noticePeriodMonths"   INTEGER,
  "notes"                TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'insurance_policies_tenantId_fkey') THEN
    ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'insurance_policies_contractId_fkey') THEN
    ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_contractId_fkey"
      FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Eine Police je Vertrag.
CREATE UNIQUE INDEX IF NOT EXISTS "insurance_policies_contractId_key"
  ON "insurance_policies"("contractId");
CREATE INDEX IF NOT EXISTS "insurance_policies_tenantId_idx" ON "insurance_policies"("tenantId");
CREATE INDEX IF NOT EXISTS "insurance_policies_tenantId_nextPremiumDue_idx"
  ON "insurance_policies"("tenantId", "nextPremiumDue");

-- Deckungsarten -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS "insurance_coverages" (
  "id"                    TEXT PRIMARY KEY,
  "policyId"              TEXT NOT NULL,
  "coverageType"          "InsuranceCoverageType" NOT NULL,
  "sumInsuredEur"         DECIMAL(15,2),
  "insuredValueEur"       DECIMAL(15,2),
  "deductibleType"        "InsuranceDeductibleType",
  "deductibleValue"       DECIMAL(15,2),
  -- Haftzeit bei Betriebsunterbrechung: die Dauer, fuer die der entgangene
  -- Ertrag ersetzt wird.
  "indemnityPeriodMonths" INTEGER,
  "notes"                 TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'insurance_coverages_policyId_fkey') THEN
    ALTER TABLE "insurance_coverages" ADD CONSTRAINT "insurance_coverages_policyId_fkey"
      FOREIGN KEY ("policyId") REFERENCES "insurance_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "insurance_coverages_policyId_coverageType_key"
  ON "insurance_coverages"("policyId", "coverageType");
CREATE INDEX IF NOT EXISTS "insurance_coverages_policyId_idx" ON "insurance_coverages"("policyId");

-- Versicherte Objekte -----------------------------------------------------

CREATE TABLE IF NOT EXISTS "insured_objects" (
  "id"              TEXT PRIMARY KEY,
  "policyId"        TEXT NOT NULL,
  "parkId"          TEXT,
  "turbineId"       TEXT,
  -- Die Summe ueber alle Objekte ist die belastbarere Grundlage fuer die
  -- Unterversicherungspruefung als ein pauschaler Wert an der Police.
  "insuredValueEur" DECIMAL(15,2),
  "notes"           TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'insured_objects_policyId_fkey') THEN
    ALTER TABLE "insured_objects" ADD CONSTRAINT "insured_objects_policyId_fkey"
      FOREIGN KEY ("policyId") REFERENCES "insurance_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'insured_objects_parkId_fkey') THEN
    ALTER TABLE "insured_objects" ADD CONSTRAINT "insured_objects_parkId_fkey"
      FOREIGN KEY ("parkId") REFERENCES "parks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'insured_objects_turbineId_fkey') THEN
    ALTER TABLE "insured_objects" ADD CONSTRAINT "insured_objects_turbineId_fkey"
      FOREIGN KEY ("turbineId") REFERENCES "turbines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "insured_objects_policyId_idx" ON "insured_objects"("policyId");
CREATE INDEX IF NOT EXISTS "insured_objects_parkId_idx" ON "insured_objects"("parkId");
CREATE INDEX IF NOT EXISTS "insured_objects_turbineId_idx" ON "insured_objects"("turbineId");

-- Verknuepfung Schaden -> Police -------------------------------------------

ALTER TABLE "insurance_claims" ADD COLUMN IF NOT EXISTS "policyId" TEXT;
ALTER TABLE "insurance_claims" ADD COLUMN IF NOT EXISTS "coverageId" TEXT;
-- MITGESPEICHERT: eine spaetere Aenderung der Police darf einen
-- abgeschlossenen Schadenfall nicht umrechnen.
ALTER TABLE "insurance_claims" ADD COLUMN IF NOT EXISTS "deductibleAppliedEur" DECIMAL(15,2);
ALTER TABLE "insurance_claims" ADD COLUMN IF NOT EXISTS "expectedReimbursementEur" DECIMAL(15,2);
ALTER TABLE "insurance_claims" ADD COLUMN IF NOT EXISTS "reimbursementBasis" JSONB;
-- Bei Betriebsunterbrechung: der Stoerungsvorgang aus A1, aus dem der
-- entgangene Ertrag stammt.
ALTER TABLE "insurance_claims" ADD COLUMN IF NOT EXISTS "faultCaseId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'insurance_claims_policyId_fkey') THEN
    ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_policyId_fkey"
      FOREIGN KEY ("policyId") REFERENCES "insurance_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'insurance_claims_coverageId_fkey') THEN
    ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_coverageId_fkey"
      FOREIGN KEY ("coverageId") REFERENCES "insurance_coverages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'insurance_claims_faultCaseId_fkey') THEN
    ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_faultCaseId_fkey"
      FOREIGN KEY ("faultCaseId") REFERENCES "fault_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
