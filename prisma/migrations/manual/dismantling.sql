-- A7 (Audit 2026-07): Rueckbauverpflichtung, Sicherheitsleistung,
-- Rueckbaurueckstellung.
--
-- "Kein einziger Treffer fuer 'Rueckbau' im gesamten Codebase." Jeder Park hat
-- eine behoerdlich festgesetzte Rueckbausicherheit (Buergschaft mit Laufzeit)
-- und eine Rueckstellung, die jaehrlich fortzuschreiben ist. Heute: Excel beim
-- Steuerberater, Buergschaft im Aktenordner.

DO $$ BEGIN
  CREATE TYPE "DismantlingSecurityType" AS ENUM
    ('BANK_GUARANTEE', 'PARENT_GUARANTEE', 'CASH_DEPOSIT', 'SURETY_BOND', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Verpflichtung ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "dismantling_obligations" (
  "id"                    TEXT PRIMARY KEY,
  "tenantId"              TEXT NOT NULL,
  "parkId"                TEXT NOT NULL,
  "estimatedCostTodayEur" DECIMAL(15,2) NOT NULL,
  -- Ein Kostenansatz ohne Datum laesst sich nicht beurteilen: 500.000 EUR von
  -- 2012 sind eine andere Aussage als dieselbe Zahl von 2026.
  "costEstimateDate"      TIMESTAMP(3),
  "costEstimateSource"    VARCHAR(200),
  "dismantlingYear"       INTEGER NOT NULL,
  -- Nur handelsrechtlich relevant (§ 253 Abs. 1 S. 2 HGB: Erfuellungsbetrag).
  "costInflationPercent"  DECIMAL(5,2) NOT NULL DEFAULT 2.00,
  "requiredSecurityEur"   DECIMAL(15,2),
  "providedSecurityEur"   DECIMAL(15,2),
  "securityType"          "DismantlingSecurityType",
  "securityProvider"      VARCHAR(200),
  "securityReference"     VARCHAR(100),
  "securityValidFrom"     TIMESTAMP(3),
  -- Die Buergschaft laeuft still ab, weil niemand den Aktenordner liest —
  -- deshalb indiziert.
  "securityValidTo"       TIMESTAMP(3),
  "authorityReference"    VARCHAR(100),
  "notes"                 TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dismantling_obligations_tenantId_fkey') THEN
    ALTER TABLE "dismantling_obligations" ADD CONSTRAINT "dismantling_obligations_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dismantling_obligations_parkId_fkey') THEN
    ALTER TABLE "dismantling_obligations" ADD CONSTRAINT "dismantling_obligations_parkId_fkey"
      FOREIGN KEY ("parkId") REFERENCES "parks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Eine Verpflichtung je Park.
CREATE UNIQUE INDEX IF NOT EXISTS "dismantling_obligations_parkId_key"
  ON "dismantling_obligations"("parkId");
CREATE INDEX IF NOT EXISTS "dismantling_obligations_tenantId_idx"
  ON "dismantling_obligations"("tenantId");
CREATE INDEX IF NOT EXISTS "dismantling_obligations_tenantId_securityValidTo_idx"
  ON "dismantling_obligations"("tenantId", "securityValidTo");

-- Jahresfortschreibung -----------------------------------------------------

CREATE TABLE IF NOT EXISTS "dismantling_provisions" (
  "id"                     TEXT PRIMARY KEY,
  "obligationId"           TEXT NOT NULL,
  "year"                   INTEGER NOT NULL,
  -- Rechnungsgrundlagen MITGESPEICHERT: eine spaetere Aenderung des
  -- Gutachtens oder des Rueckbautermins darf einen festgestellten
  -- Jahresabschluss nicht rueckwirkend umrechnen.
  "estimatedCostTodayEur"  DECIMAL(15,2) NOT NULL,
  "costInflationPercent"   DECIMAL(5,2) NOT NULL,
  -- NULL = nicht hinterlegt; dann wird NICHT abgezinst und der Betrag ist zu
  -- hoch. Ihn zu schaetzen waere eine erfundene Bilanzgroesse — die Bundesbank
  -- veroeffentlicht ihn laufzeitabhaengig.
  "hgbDiscountRatePercent" DECIMAL(5,3),
  -- Handelsbilanz (§ 253 HGB): Erfuellungsbetrag MIT Kostensteigerung.
  "hgbSettlementAmountEur" DECIMAL(15,2) NOT NULL,
  "hgbProvisionEur"        DECIMAL(15,2) NOT NULL,
  "hgbAdditionEur"         DECIMAL(15,2),
  -- Steuerbilanz (§ 6 Abs. 1 Nr. 3a EStG): OHNE Steigerung, 5,5 % Abzinsung.
  "taxSettlementAmountEur" DECIMAL(15,2) NOT NULL,
  "taxProvisionEur"        DECIMAL(15,2) NOT NULL,
  "taxAdditionEur"         DECIMAL(15,2),
  -- Grundlage der latenten Steuern.
  "differenceEur"          DECIMAL(15,2) NOT NULL,
  "accrualRatio"           DECIMAL(7,4) NOT NULL,
  "remainingYears"         INTEGER NOT NULL,
  "basis"                  JSONB,
  "journalEntryId"         TEXT,
  "computedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes"                  TEXT,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dismantling_provisions_obligationId_fkey') THEN
    ALTER TABLE "dismantling_provisions" ADD CONSTRAINT "dismantling_provisions_obligationId_fkey"
      FOREIGN KEY ("obligationId") REFERENCES "dismantling_obligations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dismantling_provisions_journalEntryId_fkey') THEN
    ALTER TABLE "dismantling_provisions" ADD CONSTRAINT "dismantling_provisions_journalEntryId_fkey"
      FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Ein Datensatz je Verpflichtung und Jahr — sonst entstehen zwei
-- Rueckstellungswerte fuer denselben Abschluss.
CREATE UNIQUE INDEX IF NOT EXISTS "dismantling_provisions_obligationId_year_key"
  ON "dismantling_provisions"("obligationId", "year");
CREATE INDEX IF NOT EXISTS "dismantling_provisions_obligationId_idx"
  ON "dismantling_provisions"("obligationId");
