-- A1 (Audit 2026-07): Stoerungsvorgang mit bewertetem Ertragsausfall.
--
-- Die Stoerungsdaten lagen vollstaendig vor (scada_state_events,
-- scada_status_codes, scada_availability mit t1-t6), die Auswertung ebenfalls.
-- Es fehlte der VORGANG: kein Bezug von einem SCADA-Ereignis auf einen
-- bearbeitbaren Fall, keine Verursacherkategorie, kein bezifferter
-- Ertragsausfall, keine Wiedervorlage. Folge laut Auditbericht: Ansprueche
-- gegen den Hersteller verjaehren unbemerkt.

-- Enums -----------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "FaultCauseCategory" AS ENUM (
    'MANUFACTURER', 'GRID', 'WEATHER', 'OWN_FAULT', 'AUTHORITY', 'THIRD_PARTY', 'UNKNOWN'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "FaultCaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "FaultClaimStatus" AS ENUM (
    'NONE', 'PENDING', 'ASSERTED', 'ACCEPTED', 'REJECTED', 'SETTLED', 'TIME_BARRED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "LostEnergyMethod" AS ENUM ('REFERENCE_TURBINE', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Vorgang ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "fault_cases" (
  "id"                   TEXT PRIMARY KEY,
  "tenantId"             TEXT NOT NULL,
  "caseNumber"           TEXT NOT NULL,
  "turbineId"            TEXT NOT NULL,
  "title"                VARCHAR(200) NOT NULL,
  "description"          TEXT,
  "startAt"              TIMESTAMP(3) NOT NULL,
  "endAt"                TIMESTAMP(3),
  "status"               "FaultCaseStatus" NOT NULL DEFAULT 'OPEN',
  "causeCategory"        "FaultCauseCategory" NOT NULL DEFAULT 'UNKNOWN',
  "statusCodeId"         TEXT,
  -- Bewerteter Ausfall. NULL heisst "noch nicht ermittelt", nicht null kWh.
  "lostEnergyKwh"        DECIMAL(15,3),
  "lostEnergyMethod"     "LostEnergyMethod",
  "lostEnergyBasis"      JSONB,
  "lostEnergyNotes"      TEXT,
  "lostEnergyComputedAt" TIMESTAMP(3),
  -- Satz wird MITGESPEICHERT: sonst aendert sich der bezifferte Schaden
  -- rueckwirkend, wenn jemand einen Monatssatz korrigiert.
  "ratePerKwh"           DECIMAL(10,4),
  "rateSource"           VARCHAR(100),
  "lostRevenueEur"       DECIMAL(15,2),
  "claimStatus"          "FaultClaimStatus" NOT NULL DEFAULT 'NONE',
  "claimDeadline"        TIMESTAMP(3),
  "claimAmountEur"       DECIMAL(15,2),
  "claimNotes"           TEXT,
  "followUpAt"           TIMESTAMP(3),
  "serviceEventId"       TEXT,
  "operationalTaskId"    TEXT,
  "defectId"             TEXT,
  "assignedToId"         TEXT,
  "createdById"          TEXT,
  "resolutionNotes"      TEXT,
  "resolvedAt"           TIMESTAMP(3),
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fault_cases_tenantId_fkey') THEN
    ALTER TABLE "fault_cases" ADD CONSTRAINT "fault_cases_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fault_cases_turbineId_fkey') THEN
    ALTER TABLE "fault_cases" ADD CONSTRAINT "fault_cases_turbineId_fkey"
      FOREIGN KEY ("turbineId") REFERENCES "turbines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fault_cases_statusCodeId_fkey') THEN
    ALTER TABLE "fault_cases" ADD CONSTRAINT "fault_cases_statusCodeId_fkey"
      FOREIGN KEY ("statusCodeId") REFERENCES "scada_status_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fault_cases_serviceEventId_fkey') THEN
    ALTER TABLE "fault_cases" ADD CONSTRAINT "fault_cases_serviceEventId_fkey"
      FOREIGN KEY ("serviceEventId") REFERENCES "service_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fault_cases_operationalTaskId_fkey') THEN
    ALTER TABLE "fault_cases" ADD CONSTRAINT "fault_cases_operationalTaskId_fkey"
      FOREIGN KEY ("operationalTaskId") REFERENCES "operational_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fault_cases_defectId_fkey') THEN
    ALTER TABLE "fault_cases" ADD CONSTRAINT "fault_cases_defectId_fkey"
      FOREIGN KEY ("defectId") REFERENCES "defects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fault_cases_assignedToId_fkey') THEN
    ALTER TABLE "fault_cases" ADD CONSTRAINT "fault_cases_assignedToId_fkey"
      FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fault_cases_createdById_fkey') THEN
    ALTER TABLE "fault_cases" ADD CONSTRAINT "fault_cases_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "fault_cases_tenantId_caseNumber_key"
  ON "fault_cases"("tenantId", "caseNumber");
CREATE INDEX IF NOT EXISTS "fault_cases_tenantId_idx" ON "fault_cases"("tenantId");
CREATE INDEX IF NOT EXISTS "fault_cases_turbineId_startAt_idx" ON "fault_cases"("turbineId", "startAt");
CREATE INDEX IF NOT EXISTS "fault_cases_tenantId_status_idx" ON "fault_cases"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "fault_cases_tenantId_causeCategory_idx" ON "fault_cases"("tenantId", "causeCategory");
-- Traegt die beiden Listen, die der Betriebsfuehrer taeglich braucht:
-- offene Wiedervorlagen und ablaufende Ansprueche.
CREATE INDEX IF NOT EXISTS "fault_cases_tenantId_followUpAt_idx" ON "fault_cases"("tenantId", "followUpAt");
CREATE INDEX IF NOT EXISTS "fault_cases_tenantId_claimDeadline_idx" ON "fault_cases"("tenantId", "claimDeadline");

-- Zugeordnete SCADA-Ereignisse ------------------------------------------
--
-- BEWUSST OHNE FK auf scada_state_events: die Tabelle ist eine Hypertable mit
-- zusammengesetztem Schluessel und wird nach Aufbewahrungsfrist beschnitten.
-- Ein FK wuerde entweder das Beschneiden blockieren oder den Vorgang
-- mitloeschen. Der Vorgang muss den Rohdatenstand ueberleben, deshalb sind
-- Zeitstempel und Codes als Momentaufnahme mitgespeichert.

CREATE TABLE IF NOT EXISTS "fault_case_scada_events" (
  "id"             TEXT PRIMARY KEY,
  "faultCaseId"    TEXT NOT NULL,
  "scadaEventId"   TEXT NOT NULL,
  "eventTimestamp" TIMESTAMP(3) NOT NULL,
  "state"          INTEGER NOT NULL,
  "subState"       INTEGER NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fault_case_scada_events_faultCaseId_fkey') THEN
    ALTER TABLE "fault_case_scada_events" ADD CONSTRAINT "fault_case_scada_events_faultCaseId_fkey"
      FOREIGN KEY ("faultCaseId") REFERENCES "fault_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "fault_case_scada_events_faultCaseId_scadaEventId_key"
  ON "fault_case_scada_events"("faultCaseId", "scadaEventId");
CREATE INDEX IF NOT EXISTS "fault_case_scada_events_faultCaseId_idx"
  ON "fault_case_scada_events"("faultCaseId");
