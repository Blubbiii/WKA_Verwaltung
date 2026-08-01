-- =============================================================================
-- A5 (Audit 2026-08): Gemeinde als Stammdatensatz
-- =============================================================================
--
-- Die Gemeinde stand als Freitext an `plots.municipality`. Damit gab es keinen
-- Ort, an dem etwas Gemeindebezogenes haengen koennte, und jede Auswertung
-- fragmentierte an Schreibweisen: „Musterdorf" und „Musterdorf, Gem." sind
-- fuer die Datenbank zwei Gemeinden.
--
-- Neu ist ausserdem die Standortgemeinde AN DER ANLAGE. Ueber den Park laesst
-- sie sich nicht bestimmen: eine Beziehung Turbine → Plot gibt es nicht, und
-- ein Park liegt regelmaessig in mehreren Gemeinden — genau deshalb wird der
-- Gewerbesteuer-Messbetrag nach § 29 GewStG ueberhaupt zerlegt.
--
-- HINWEIS: Der Docker-Entrypoint fuehrt `prisma db push` aus und legt Tabelle
-- und Spalten beim Start selbst an. Teil 1 ist deshalb nur fuer Umgebungen
-- ohne Entrypoint. TEIL 2 (Uebernahme der Freitexte) macht `db push` NICHT —
-- der ist von Hand auszufuehren, wenn er gewuenscht ist.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- TEIL 1 · Struktur
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "municipalities" (
  "id"          TEXT         NOT NULL,
  "tenantId"    TEXT         NOT NULL,
  "name"        TEXT         NOT NULL,
  "officialKey" VARCHAR(12),
  "state"       VARCHAR(50),
  "notes"       TEXT,
  "status"      TEXT         NOT NULL DEFAULT 'ACTIVE',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "municipalities_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "municipalities"
  DROP CONSTRAINT IF EXISTS "municipalities_tenantId_fkey";
ALTER TABLE "municipalities"
  ADD CONSTRAINT "municipalities_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Der Riegel gegen genau die Fragmentierung, die den Freitext unbrauchbar
-- gemacht hat: derselbe Name kommt im Mandanten nur einmal vor.
CREATE UNIQUE INDEX IF NOT EXISTS "municipalities_tenantId_name_key"
  ON "municipalities" ("tenantId", "name");
CREATE INDEX IF NOT EXISTS "municipalities_tenantId_idx"
  ON "municipalities" ("tenantId");
CREATE INDEX IF NOT EXISTS "municipalities_tenantId_officialKey_idx"
  ON "municipalities" ("tenantId", "officialKey");

ALTER TABLE "plots"    ADD COLUMN IF NOT EXISTS "municipalityId" TEXT;
ALTER TABLE "turbines" ADD COLUMN IF NOT EXISTS "municipalityId" TEXT;

ALTER TABLE "plots" DROP CONSTRAINT IF EXISTS "plots_municipalityId_fkey";
ALTER TABLE "plots"
  ADD CONSTRAINT "plots_municipalityId_fkey"
  FOREIGN KEY ("municipalityId") REFERENCES "municipalities"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "turbines" DROP CONSTRAINT IF EXISTS "turbines_municipalityId_fkey";
ALTER TABLE "turbines"
  ADD CONSTRAINT "turbines_municipalityId_fkey"
  FOREIGN KEY ("municipalityId") REFERENCES "municipalities"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "plots_municipalityId_idx"    ON "plots" ("municipalityId");
CREATE INDEX IF NOT EXISTS "turbines_municipalityId_idx" ON "turbines" ("municipalityId");


-- -----------------------------------------------------------------------------
-- TEIL 2 · Uebernahme der vorhandenen Freitexte  (OPTIONAL, von Hand)
-- -----------------------------------------------------------------------------
--
-- Legt je unterschiedlichem Freitext EINE Gemeinde an und verknuepft die
-- Flurstuecke damit. Das ist keine Schaetzung, sondern eine originalgetreue
-- Uebernahme — aber sie uebernimmt auch die Schreibfehler: aus „Musterdorf"
-- und „Musterdorf, Gem." werden zwei Datensaetze, die anschliessend von Hand
-- zusammengefuehrt werden muessen.
--
-- Deshalb ZUERST ansehen, was entstehen wuerde:
--
--   SELECT "tenantId", btrim("municipality") AS name, count(*) AS plots
--     FROM "plots"
--    WHERE "municipality" IS NOT NULL AND btrim("municipality") <> ''
--    GROUP BY 1, 2
--    ORDER BY 1, 2;
--
-- Sehen zwei Zeilen nach derselben Gemeinde aus, lohnt es sich, den Freitext
-- vorher zu vereinheitlichen. Danach:

-- INSERT INTO "municipalities" ("id", "tenantId", "name", "status", "createdAt", "updatedAt")
-- SELECT gen_random_uuid(), p."tenantId", btrim(p."municipality"), 'ACTIVE', now(), now()
--   FROM "plots" p
--  WHERE p."municipality" IS NOT NULL
--    AND btrim(p."municipality") <> ''
--  GROUP BY p."tenantId", btrim(p."municipality")
-- ON CONFLICT ("tenantId", "name") DO NOTHING;
--
-- UPDATE "plots" p
--    SET "municipalityId" = m."id"
--   FROM "municipalities" m
--  WHERE m."tenantId" = p."tenantId"
--    AND m."name" = btrim(p."municipality")
--    AND p."municipalityId" IS NULL;

-- Die ANLAGEN bleiben bewusst unverknuepft. Ihre Standortgemeinde steht
-- nirgends — sie aus dem Park oder aus irgendeinem Flurstueck desselben Parks
-- abzuleiten waere geraten, und die Zahl ginge als Zerlegungsgrundlage zum
-- Finanzamt. Sie wird erfasst, nicht hergeleitet.


-- -----------------------------------------------------------------------------
-- Verifikation
-- -----------------------------------------------------------------------------
-- SELECT count(*) FROM information_schema.tables
--  WHERE table_schema = 'public' AND table_name = 'municipalities';           -- 1
-- SELECT count(*) FROM information_schema.columns
--  WHERE column_name = 'municipalityId' AND table_name IN ('plots','turbines'); -- 2
