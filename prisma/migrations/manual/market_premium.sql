-- B1 (Audit 2026-07): Marktpraemie, anzulegender Wert, negative Preise.
--
-- "EnergyMonthlyRate hat marketValue und managementFee als Eingabefelder …
-- Es fehlt die Rechenlogik … und die Stunden mit negativen Preisen mit dem
-- daraus entfallenden Verguetungsanspruch (0 Treffer fuer §51/negativePrice).
-- Braucht eine stuendliche Preisreihe — heute nur Monatsaggregat, also neue
-- Infrastruktur."
--
-- `market_prices` (Monatsaggregat) bleibt UNVERAENDERT bestehen. Die
-- stuendliche Reihe steht daneben; sie ersetzt das Aggregat nicht.

BEGIN;

-- Stuendliche Preisreihe ----------------------------------------------------
--
-- Mandantenuebergreifend: der Boersenpreis ist fuer alle derselbe. Ihn je
-- Mandant zu fuehren hiesse, Abweichungen zwischen Mandanten zu ermoeglichen,
-- die es nicht geben kann.

CREATE TABLE IF NOT EXISTS "hourly_spot_prices" (
  "id"          TEXT PRIMARY KEY,
  "biddingZone" VARCHAR(20) NOT NULL DEFAULT 'DE-LU',
  "hour"        TIMESTAMP(3) NOT NULL,
  -- Negativ ist zulaessig — genau darum geht es.
  "priceEurMwh" DECIMAL(10,2) NOT NULL,
  "source"      VARCHAR(20) NOT NULL DEFAULT 'SMARD',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Eine Stunde je Zone und Quelle genau einmal. Ohne das entstuenden beim
-- wiederholten Import Dubletten, und jede doppelte negative Stunde
-- verdoppelte den entfallenden Anspruch.
CREATE UNIQUE INDEX IF NOT EXISTS "hourly_spot_prices_biddingZone_hour_source_key"
  ON "hourly_spot_prices" ("biddingZone", "hour", "source");
CREATE INDEX IF NOT EXISTS "hourly_spot_prices_biddingZone_hour_idx"
  ON "hourly_spot_prices" ("biddingZone", "hour");

-- Regulatorik-Stammdaten ergaenzen (B2) --------------------------------------

ALTER TABLE "regulatory_profiles"
  -- Korrekturfaktor nach § 36h EEG (Anlage 2). BEWUSST ein Feld und keine
  -- Ableitung aus "siteQualityPercent": die Stuetzstellentabelle hat sich mit
  -- jeder Novelle geaendert, und ein falscher Faktor verschoebe jede
  -- Marktpraemie um wenige Prozent, ohne aufzufallen.
  ADD COLUMN IF NOT EXISTS "correctionFactor" DECIMAL(6,4),
  -- Mindestdauer zusammenhaengender negativer Stunden (§ 51 EEG). Die
  -- Schwelle hat sich mehrfach geaendert: EEG 2017 sechs, EEG 2021 vier,
  -- EEG 2023 eine Stunde fuer neue Anlagen. Welche gilt, haengt an
  -- Inbetriebnahme und Zuschlag der einzelnen Anlage — deshalb ein Feld.
  --
  -- Der Vorgabewert 4 ist eine VORBELEGUNG, keine Rechtsauskunft. Bestandsdaten
  -- bekommen ihn, weil eine Spalte einen Wert braucht; er ist je Anlage zu
  -- pruefen.
  ADD COLUMN IF NOT EXISTS "negativePriceThresholdHours" INTEGER NOT NULL DEFAULT 4;

-- Berechnete Marktpraemie ---------------------------------------------------

CREATE TABLE IF NOT EXISTS "market_premium_calculations" (
  "id"        TEXT PRIMARY KEY,
  "tenantId"  TEXT NOT NULL,
  "turbineId" TEXT NOT NULL,
  "year"      INTEGER NOT NULL,
  "month"     INTEGER NOT NULL,

  -- Rechnungsgrundlagen MITGESPEICHERT: der Monatsmarktwert wird nachtraeglich
  -- korrigiert und der Korrekturfaktor kann sich nach einer
  -- Standortguete-Nachpruefung aendern (§ 36h Abs. 4 EEG). Eine bereits
  -- abgerechnete Praemie darf sich nicht rueckwirkend verschieben.
  "awardValueCtPerKwh"     DECIMAL(8,4),
  "correctionFactor"       DECIMAL(6,4),
  "marketValueCtPerKwh"    DECIMAL(8,4),
  "productionKwh"          DECIMAL(15,3),
  "negativeThresholdHours" INTEGER NOT NULL,

  "appliedValueCtPerKwh" DECIMAL(8,4),
  "premiumCtPerKwh"      DECIMAL(8,4),
  "premiumEur"           DECIMAL(15,2),

  -- NULL = keine Preisreihe vorhanden. Ausdruecklich NICHT 0: "keine Reihe
  -- geladen" ist nicht "keine negativen Preise", und der Unterschied ist
  -- bares Geld.
  "affectedHours" INTEGER,
  "negativeHours" INTEGER,
  -- NULL, solange die Erzeugung in diesen Stunden nicht bekannt ist. Die
  -- Stundenzahl allein sagt nichts ueber die Menge — in einer Flautestunde
  -- entfaellt nichts.
  "forfeitedEur" DECIMAL(15,2),

  "basis"      JSONB,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes"      TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "market_premium_calculations_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "market_premium_calculations_turbineId_fkey"
    FOREIGN KEY ("turbineId") REFERENCES "turbines"("id") ON DELETE CASCADE
);

-- Ein Ergebnis je Anlage und Monat.
CREATE UNIQUE INDEX IF NOT EXISTS "market_premium_calculations_turbineId_year_month_key"
  ON "market_premium_calculations" ("turbineId", "year", "month");
CREATE INDEX IF NOT EXISTS "market_premium_calculations_tenantId_idx"
  ON "market_premium_calculations" ("tenantId");
CREATE INDEX IF NOT EXISTS "market_premium_calculations_tenantId_year_month_idx"
  ON "market_premium_calculations" ("tenantId", "year", "month");

COMMIT;
