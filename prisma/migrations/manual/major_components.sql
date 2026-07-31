-- B3 (Audit 2026-07): Grosskomponenten-Register je Anlage.
--
-- "0 Treffer fuer Ersatzteil/Komponente." Getriebe, Generator, Rotorblaetter
-- und Trafo standen als Freitext im ServiceEvent oder im technicalData-Json.
--
-- Kein Backfill: aus Freitext liesse sich weder eine Seriennummer noch ein
-- Einbaudatum verlaesslich ableiten. Was dabei herauskaeme, saehe aus wie ein
-- gepflegtes Register und waere geraten.

BEGIN;

DO $$ BEGIN
  CREATE TYPE "MajorComponentType" AS ENUM
    ('GEARBOX', 'GENERATOR', 'ROTOR_BLADE', 'MAIN_BEARING', 'TRANSFORMER',
     'CONVERTER', 'YAW_SYSTEM', 'PITCH_SYSTEM', 'TOWER_SECTION', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ComponentRemovalReason" AS ENUM
    ('SCHEDULED', 'FAILURE', 'UPGRADE', 'PREVENTIVE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "major_components" (
  "id"           TEXT PRIMARY KEY,
  "tenantId"     TEXT NOT NULL,
  "turbineId"    TEXT NOT NULL,
  "type"         "MajorComponentType" NOT NULL,
  -- Position, wo es mehrere gleiche gibt: Rotorblatt A/B/C, Turmsegment 1-4.
  "position"     VARCHAR(20),
  "manufacturer" VARCHAR(200),
  "model"        VARCHAR(200),
  -- Die Kennung gegenueber dem Hersteller im Garantiefall.
  "serialNumber" VARCHAR(100),

  "installedAt"   TIMESTAMP(3),
  -- Ausbau. Gesetzt = historisch. Der Datensatz bleibt bestehen, sonst gaebe
  -- es keine Tauschhistorie.
  "removedAt"     TIMESTAMP(3),
  "removalReason" "ComponentRemovalReason",
  "removalNotes"  TEXT,

  -- NULL = keine Angabe. Dann wird die Restdauer NICHT geschaetzt.
  "designLifeYears"         INTEGER,
  -- Bei einem gebrauchten Austauschteil nicht 0.
  "operatingHoursAtInstall" INTEGER,

  "warrantyEndDate"  TIMESTAMP(3),
  "warrantyProvider" VARCHAR(200),

  "costEur"        DECIMAL(15,2),
  "vendorId"       TEXT,
  "serviceEventId" TEXT,
  "faultCaseId"    TEXT,
  -- Die Tauschkette: von hier fuehrt der Weg zum Nachfolger.
  "replacedById"   TEXT,

  "notes"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "major_components_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "major_components_turbineId_fkey"
    FOREIGN KEY ("turbineId") REFERENCES "turbines"("id") ON DELETE CASCADE,
  CONSTRAINT "major_components_vendorId_fkey"
    FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL,
  CONSTRAINT "major_components_serviceEventId_fkey"
    FOREIGN KEY ("serviceEventId") REFERENCES "service_events"("id") ON DELETE SET NULL,
  CONSTRAINT "major_components_faultCaseId_fkey"
    FOREIGN KEY ("faultCaseId") REFERENCES "fault_cases"("id") ON DELETE SET NULL,
  CONSTRAINT "major_components_replacedById_fkey"
    FOREIGN KEY ("replacedById") REFERENCES "major_components"("id") ON DELETE SET NULL
);

-- Ein Nachfolger ersetzt genau einen Vorgaenger.
CREATE UNIQUE INDEX IF NOT EXISTS "major_components_replacedById_key"
  ON "major_components" ("replacedById");
CREATE INDEX IF NOT EXISTS "major_components_tenantId_idx"
  ON "major_components" ("tenantId");
CREATE INDEX IF NOT EXISTS "major_components_turbineId_idx"
  ON "major_components" ("turbineId");
-- Traegt die Liste der EINGEBAUTEN Komponenten je Anlage.
CREATE INDEX IF NOT EXISTS "major_components_turbineId_removedAt_idx"
  ON "major_components" ("turbineId", "removedAt");
-- Traegt die Uebersicht ablaufender Gewaehrleistungen.
CREATE INDEX IF NOT EXISTS "major_components_tenantId_warrantyEndDate_idx"
  ON "major_components" ("tenantId", "warrantyEndDate");

COMMIT;
