-- A4 (Audit 2026-07): Redispatch / Einspeisemanagement.
--
-- Die Abregelungsgruende kamen aus dem DBF-Reader und landeten in Charts und
-- PDF-Reports. Es fehlte die ANSPRUCHSSEITE: Ausfallarbeit je Ereignis,
-- Anspruchsgrundlage, Forderungsaufstellung, Abgleich mit der gezahlten
-- Entschaedigung, Nachverfolgung offener Betraege. Man verliess sich auf die
-- Berechnung des Netzbetreibers.

DO $$ BEGIN
  CREATE TYPE "CurtailmentLegalBasis" AS ENUM ('EEG_15', 'ENWG_13A', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CurtailmentLostWorkMethod" AS ENUM
    ('CONTROLLER_SIGNAL', 'REFERENCE_TURBINE', 'GRID_OPERATOR', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CurtailmentClaimStatus" AS ENUM
    ('OPEN', 'SUBMITTED', 'ACKNOWLEDGED', 'PARTIALLY_PAID', 'PAID', 'REJECTED', 'TIME_BARRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "curtailment_events" (
  "id"                        TEXT PRIMARY KEY,
  "tenantId"                  TEXT NOT NULL,
  "eventNumber"               TEXT NOT NULL,
  "parkId"                    TEXT NOT NULL,
  "turbineId"                 TEXT,
  "startAt"                   TIMESTAMP(3) NOT NULL,
  "endAt"                     TIMESTAMP(3),
  "legalBasis"                "CurtailmentLegalBasis" NOT NULL DEFAULT 'ENWG_13A',
  "gridOperatorReference"     VARCHAR(100),
  "gridOperator"              VARCHAR(200),
  "reason"                    VARCHAR(200),
  "description"               TEXT,
  -- NULL heisst "noch nicht ermittelt", NICHT 0 kWh.
  "lostWorkKwh"               DECIMAL(15,3),
  "lostWorkMethod"            "CurtailmentLostWorkMethod",
  "lostWorkBasis"             JSONB,
  "lostWorkNotes"             TEXT,
  -- Satz MITGESPEICHERT: sonst aendert sich eine gestellte Forderung
  -- rueckwirkend, wenn jemand einen Monatssatz korrigiert.
  "ratePerKwh"                DECIMAL(10,4),
  "rateSource"                VARCHAR(100),
  "lostRevenueEur"            DECIMAL(15,2),
  -- Aufteilung nach § 15 EEG: ein Ereignis kann die 1-%-Schwelle
  -- ueberschreiten und muss dann geteilt werden.
  "portionAt95Eur"            DECIMAL(15,2),
  "portionAt100Eur"           DECIMAL(15,2),
  "claimEur"                  DECIMAL(15,2),
  "additionalExpensesEur"     DECIMAL(15,2),
  "savedExpensesEur"          DECIMAL(15,2),
  -- Rechnungsgrundlagen der Schwelle, mitgespeichert: sonst laesst sich die
  -- Aufteilung spaeter nicht mehr nachvollziehen.
  "annualRevenueBasisEur"     DECIMAL(15,2),
  "priorLostRevenueInYearEur" DECIMAL(15,2),
  "computedAt"                TIMESTAMP(3),
  "claimStatus"               "CurtailmentClaimStatus" NOT NULL DEFAULT 'OPEN',
  "claimSubmittedAt"          TIMESTAMP(3),
  "claimDeadline"             TIMESTAMP(3),
  "claimNotes"                TEXT,
  -- Der Abgleich zwischen claimEur und diesem Betrag ist der eigentliche
  -- Zweck des Vorgangs.
  "compensationPaidEur"       DECIMAL(15,2),
  "compensationPaidAt"        TIMESTAMP(3),
  "gridOperatorReportedKwh"   DECIMAL(15,3),
  "followUpAt"                TIMESTAMP(3),
  "createdById"               TEXT,
  "createdAt"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                 TIMESTAMP(3) NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'curtailment_events_tenantId_fkey') THEN
    ALTER TABLE "curtailment_events" ADD CONSTRAINT "curtailment_events_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'curtailment_events_parkId_fkey') THEN
    ALTER TABLE "curtailment_events" ADD CONSTRAINT "curtailment_events_parkId_fkey"
      FOREIGN KEY ("parkId") REFERENCES "parks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'curtailment_events_turbineId_fkey') THEN
    ALTER TABLE "curtailment_events" ADD CONSTRAINT "curtailment_events_turbineId_fkey"
      FOREIGN KEY ("turbineId") REFERENCES "turbines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'curtailment_events_createdById_fkey') THEN
    ALTER TABLE "curtailment_events" ADD CONSTRAINT "curtailment_events_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "curtailment_events_tenantId_eventNumber_key"
  ON "curtailment_events"("tenantId", "eventNumber");
CREATE INDEX IF NOT EXISTS "curtailment_events_tenantId_idx" ON "curtailment_events"("tenantId");
CREATE INDEX IF NOT EXISTS "curtailment_events_parkId_startAt_idx" ON "curtailment_events"("parkId", "startAt");
CREATE INDEX IF NOT EXISTS "curtailment_events_tenantId_claimStatus_idx" ON "curtailment_events"("tenantId", "claimStatus");
-- Traegt die Arbeitsliste: offene Forderungen und ablaufende Fristen.
CREATE INDEX IF NOT EXISTS "curtailment_events_tenantId_claimDeadline_idx" ON "curtailment_events"("tenantId", "claimDeadline");
CREATE INDEX IF NOT EXISTS "curtailment_events_tenantId_followUpAt_idx" ON "curtailment_events"("tenantId", "followUpAt");
