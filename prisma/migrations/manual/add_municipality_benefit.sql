-- =============================================================================
-- A2 (Audit 2026-08): Gemeindebeteiligung nach § 6 EEG
-- =============================================================================
--
-- Betreiber duerfen den Gemeinden im Umkreis von 2.500 Metern um den Turm bis
-- zu 0,2 ct/kWh anbieten — auf die eingespeiste Menge und auf die fiktive
-- Menge bei Abregelung. Faellt der Umkreis in mehrere Gemeinden, wird nach dem
-- Anteil der KREISFLAECHE verteilt.
--
-- Anders als bei der Gewerbesteuer rechnet WPM hier: es ist eine Zahlung, die
-- der Betreiber selbst leistet und selbst abrechnen muss.
--
-- HINWEIS: Der Docker-Entrypoint legt Tabelle und Fremdschluessel ueber
-- `prisma db push` selbst an. Dieses Skript ist fuer Umgebungen ohne
-- Entrypoint und als Beleg.
--
-- Voraussetzung: add_municipality.sql (bzw. dieselbe Struktur via db push).
-- =============================================================================

CREATE TABLE IF NOT EXISTS "municipality_benefits" (
  "id"             TEXT          NOT NULL,
  "tenantId"       TEXT          NOT NULL,
  "turbineId"      TEXT          NOT NULL,
  "municipalityId" TEXT          NOT NULL,
  -- Anteil der 2.500-m-Kreisflaeche, 0–1. Acht Nachkommastellen, weil der
  -- Anteil aus einer Flaechenverschneidung stammt und im Vertrag oft mit
  -- mehreren Stellen steht.
  "areaShare"      DECIMAL(9,8)  NOT NULL,
  -- Vereinbarter Satz in ct/kWh. Hoechstens 0,2 (§ 6 Abs. 1 EEG) — die
  -- Pruefung steht in der Anwendung, nicht als CHECK: ein hoeherer Satz ist
  -- zivilrechtlich moeglich, nur eben nicht foerderfaehig, und die Datenbank
  -- soll einen bestehenden Vertrag nicht unspeicherbar machen.
  "rateCtPerKwh"   DECIMAL(6,4)  NOT NULL,
  "validFrom"      TIMESTAMP(3),
  "validUntil"     TIMESTAMP(3),
  "reference"      VARCHAR(200),
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)  NOT NULL,
  CONSTRAINT "municipality_benefits_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "municipality_benefits"
  DROP CONSTRAINT IF EXISTS "municipality_benefits_tenantId_fkey";
ALTER TABLE "municipality_benefits"
  ADD CONSTRAINT "municipality_benefits_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "municipality_benefits"
  DROP CONSTRAINT IF EXISTS "municipality_benefits_turbineId_fkey";
ALTER TABLE "municipality_benefits"
  ADD CONSTRAINT "municipality_benefits_turbineId_fkey"
  FOREIGN KEY ("turbineId") REFERENCES "turbines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT, nicht SET NULL: eine Gemeinde zu loeschen, an die gezahlt wird,
-- darf die Vereinbarung nicht verwaisen lassen.
ALTER TABLE "municipality_benefits"
  DROP CONSTRAINT IF EXISTS "municipality_benefits_municipalityId_fkey";
ALTER TABLE "municipality_benefits"
  ADD CONSTRAINT "municipality_benefits_municipalityId_fkey"
  FOREIGN KEY ("municipalityId") REFERENCES "municipalities"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Je Anlage und Gemeinde eine Vereinbarung. Aendert sich der Satz, wird die
-- bestehende befristet und eine neue angelegt — deshalb gehoert validFrom in
-- den Schluessel.
CREATE UNIQUE INDEX IF NOT EXISTS "municipality_benefits_turbineId_municipalityId_validFrom_key"
  ON "municipality_benefits" ("turbineId", "municipalityId", "validFrom");
CREATE INDEX IF NOT EXISTS "municipality_benefits_tenantId_idx"
  ON "municipality_benefits" ("tenantId");
CREATE INDEX IF NOT EXISTS "municipality_benefits_turbineId_idx"
  ON "municipality_benefits" ("turbineId");
CREATE INDEX IF NOT EXISTS "municipality_benefits_municipalityId_idx"
  ON "municipality_benefits" ("municipalityId");


-- -----------------------------------------------------------------------------
-- Es werden KEINE Vereinbarungen angelegt
-- -----------------------------------------------------------------------------
-- Der Flaechenanteil ergaebe sich aus der Verschneidung des 2.500-m-Kreises
-- mit den Gemeindegrenzen. Die Grenzen liegen nicht im System, und ein aus
-- Naeherungen gerechneter Anteil saehe genauso aus wie ein aus dem Vertrag
-- uebernommener — waere aber die Grundlage einer Zahlung. Er wird erfasst.


-- -----------------------------------------------------------------------------
-- Verifikation — erwartet: 1
-- -----------------------------------------------------------------------------
-- SELECT count(*) FROM information_schema.tables
--  WHERE table_schema = 'public' AND table_name = 'municipality_benefits';
