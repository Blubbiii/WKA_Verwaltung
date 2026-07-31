-- A5 (Audit 2026-07): Mehrere Verpaechter je Pachtvertrag + Eigentuemerwechsel.
--
-- `Lease.lessorId` war genau EINE Person — keine Quote, kein Stichtag, keine
-- Historie. Nach 20 Jahren Vertragslaufzeit ist die Erbengemeinschaft der
-- Normalfall, ebenso der Flurstuecksverkauf mitten in der Abrechnungsperiode.
--
-- Behelfsloesungen: Sammel-Person "Erbengemeinschaft Mueller" mit einem Konto,
-- oder Vertragsdubletten. Beides bricht SEPA und die Umsatzsteuerzuordnung —
-- jeder Miteigentuemer ist ein eigenes Umsatzsteuersubjekt.
--
-- KEIN BACKFILL. `Lease.lessorId` bleibt unveraendert bestehen und gilt
-- weiterhin, solange keine Anteile erfasst sind (Rueckfall in
-- resolveSharesFrom). Bestandsvertraege rechnen dadurch unveraendert weiter;
-- wer die Erbengemeinschaft braucht, erfasst sie, alle anderen merken nichts.

-- Anteile am Pachtvertrag ------------------------------------------------

CREATE TABLE IF NOT EXISTS "lease_lessors" (
  "id"           TEXT PRIMARY KEY,
  "leaseId"      TEXT NOT NULL,
  "personId"     TEXT NOT NULL,
  -- Vier Nachkommastellen, damit Bruchquoten wie 1/3 (33,3333 %) ohne
  -- spuerbaren Rundungsverlust abbildbar sind.
  "sharePercent" DECIMAL(7,4) NOT NULL,
  "validFrom"    TIMESTAMP(3),
  -- Bis EINSCHLIESSLICH. Ein Eigentuemerwechsel entsteht, indem der alte
  -- Anteil ein validTo bekommt und ein neuer am Folgetag beginnt — der alte
  -- wird NICHT geloescht, sonst verloere eine bereits abgerechnete Periode
  -- ihre Grundlage.
  "validTo"      TIMESTAMP(3),
  "bankIban"     VARCHAR(34),
  "bankBic"      VARCHAR(11),
  "notes"        TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lease_lessors_leaseId_fkey') THEN
    ALTER TABLE "lease_lessors" ADD CONSTRAINT "lease_lessors_leaseId_fkey"
      FOREIGN KEY ("leaseId") REFERENCES "leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  -- RESTRICT und nicht CASCADE: eine Person, die an einer abgerechneten
  -- Periode beteiligt war, darf nicht mitsamt ihrem Anteil verschwinden.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lease_lessors_personId_fkey') THEN
    ALTER TABLE "lease_lessors" ADD CONSTRAINT "lease_lessors_personId_fkey"
      FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "lease_lessors_leaseId_personId_validFrom_key"
  ON "lease_lessors"("leaseId", "personId", "validFrom");
CREATE INDEX IF NOT EXISTS "lease_lessors_leaseId_idx" ON "lease_lessors"("leaseId");
CREATE INDEX IF NOT EXISTS "lease_lessors_personId_idx" ON "lease_lessors"("personId");

-- Aufteilung einer Abrechnungsposition -----------------------------------
--
-- BEWUSST eine Untertabelle statt mehrerer Positionen je Vertrag:
-- `advancePaidEur` wird in der Engine je LEASE nachgeschlagen. Waere die
-- Position je Miteigentuemer vervielfacht worden, kaeme der gezahlte
-- Vorschuss n-fach in Abzug — stillschweigend, weil die Summen je Vertrag
-- weiterhin plausibel aussaehen.

CREATE TABLE IF NOT EXISTS "lease_revenue_settlement_item_lessors" (
  "id"                    TEXT PRIMARY KEY,
  "itemId"                TEXT NOT NULL,
  "personId"              TEXT NOT NULL,
  -- Miteigentumsquote MAL Zeitanteil. Bei einem Wechsel zur Jahresmitte sind
  -- das 50 % von 50 %, also 25 %.
  "effectiveSharePercent" DECIMAL(9,4) NOT NULL,
  "days"                  INTEGER NOT NULL,
  "amountEur"             DECIMAL(15,2) NOT NULL,
  -- Getrennt fortgeschrieben: jeder Miteigentuemer ist ein eigenes
  -- Umsatzsteuersubjekt.
  "taxableAmountEur"      DECIMAL(15,2) NOT NULL,
  "exemptAmountEur"       DECIMAL(15,2) NOT NULL,
  "bankIban"              VARCHAR(34),
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lrsi_lessors_itemId_fkey') THEN
    ALTER TABLE "lease_revenue_settlement_item_lessors" ADD CONSTRAINT "lrsi_lessors_itemId_fkey"
      FOREIGN KEY ("itemId") REFERENCES "lease_revenue_settlement_items"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lrsi_lessors_personId_fkey') THEN
    ALTER TABLE "lease_revenue_settlement_item_lessors" ADD CONSTRAINT "lrsi_lessors_personId_fkey"
      FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "lrsi_lessors_itemId_personId_key"
  ON "lease_revenue_settlement_item_lessors"("itemId", "personId");
CREATE INDEX IF NOT EXISTS "lrsi_lessors_itemId_idx"
  ON "lease_revenue_settlement_item_lessors"("itemId");
CREATE INDEX IF NOT EXISTS "lrsi_lessors_personId_idx"
  ON "lease_revenue_settlement_item_lessors"("personId");
