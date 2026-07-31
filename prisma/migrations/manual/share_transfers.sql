-- A8 (Audit 2026-07): Anteilsuebertragung mit stichtagsgenauer Verteilung.
--
-- Zwei Dinge auf einmal:
--
-- 1. Der Anteilsverlauf (`shareholder_shares`) und der Uebertragungsvorgang
--    (`share_transfers`). Bisher wurde `ownershipPercentage` beim Verkauf
--    ueberschrieben — die Gesellschafterliste zum letzten Bilanzstichtag war
--    danach nicht mehr rekonstruierbar.
--
-- 2. Die Felder, mit denen eine Ausschuettung ihre Grundlage dokumentiert
--    (Zeitraum, Verteilungsgrundlage, nicht verteilter Rest). Finding 4.1:
--    die Ausschuettung filterte auf `status = 'ACTIVE'` und normalisierte die
--    verbleibenden Quoten auf 100 % — wer zum 31.03. ausgetreten war, bekam
--    nichts, und die uebrigen bekamen seinen vollen Jahresanteil geschenkt.
--    Das betraf auch die KapESt-Bescheinigungen.
--
-- Bestandsdaten werden NICHT angefasst. `shareholder_shares` bleibt leer, und
-- solange sie leer ist, kommen die Anteile weiterhin aus dem Stammsatz — dann
-- allerdings MIT `entryDate`/`exitDate`, die schon immer da waren und nur nie
-- gelesen wurden. Genau das behebt 4.1 ohne Nachpflege.

BEGIN;

-- Enums --------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "ShareTransferType" AS ENUM
    ('SALE', 'GIFT', 'INHERITANCE', 'REDEMPTION', 'ISSUE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ShareTransferStatus" AS ENUM
    ('DRAFT', 'PENDING_CONSENT', 'EXECUTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DistributionBasis" AS ENUM
    ('PRO_RATA_TEMPORIS', 'REGISTER_AT_DATE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Uebertragungsvorgang -----------------------------------------------------

CREATE TABLE IF NOT EXISTS "share_transfers" (
  "id"                TEXT PRIMARY KEY,
  "transferNumber"    TEXT NOT NULL,
  "fundId"            TEXT NOT NULL,
  "tenantId"          TEXT NOT NULL,
  "type"              "ShareTransferType" NOT NULL,
  "status"            "ShareTransferStatus" NOT NULL DEFAULT 'DRAFT',
  -- Stichtag: ab diesem Tag gilt der neue Stand. Beim Erbfall der Todestag,
  -- nicht der Tag der Erfassung.
  "effectiveDate"     TIMESTAMP(3) NOT NULL,
  -- NULL bei Neuaufnahme/Kapitalerhoehung.
  "fromShareholderId" TEXT,
  -- NULL bei Einziehung: der Anteil geht unter, die Anteilssumme sinkt.
  "toShareholderId"   TEXT,
  "sharePercent"      DECIMAL(8,5) NOT NULL,
  "capitalAmount"     DECIMAL(15,2),
  -- Nur bei SALE. Bei GIFT/INHERITANCE ist der gemeine Wert massgeblich und
  -- steht nicht hier.
  "priceEur"          DECIMAL(15,2),
  -- Vinkulierung. Vorbelegt mit TRUE, weil das bei Personengesellschaften der
  -- Regelfall ist und die fehlende Zustimmung die Uebertragung schwebend
  -- unwirksam laesst.
  "consentRequired"   BOOLEAN NOT NULL DEFAULT TRUE,
  "consentGrantedAt"  TIMESTAMP(3),
  "consentReference"  TEXT,
  "notarizedAt"       TIMESTAMP(3),
  "notaryName"        TEXT,
  "registerFiledAt"   TIMESTAMP(3),
  "executedAt"        TIMESTAMP(3),
  "executedById"      TEXT,
  "documentId"        TEXT,
  "notes"             TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById"       TEXT,

  CONSTRAINT "share_transfers_fundId_fkey"
    FOREIGN KEY ("fundId") REFERENCES "funds"("id") ON DELETE CASCADE,
  CONSTRAINT "share_transfers_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  -- RESTRICT: ein Gesellschafter, der an einer vollzogenen Uebertragung
  -- beteiligt war, darf nicht spurlos geloescht werden.
  CONSTRAINT "share_transfers_fromShareholderId_fkey"
    FOREIGN KEY ("fromShareholderId") REFERENCES "shareholders"("id") ON DELETE RESTRICT,
  CONSTRAINT "share_transfers_toShareholderId_fkey"
    FOREIGN KEY ("toShareholderId") REFERENCES "shareholders"("id") ON DELETE RESTRICT,
  CONSTRAINT "share_transfers_executedById_fkey"
    FOREIGN KEY ("executedById") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "share_transfers_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "share_transfers_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "share_transfers_tenantId_transferNumber_key"
  ON "share_transfers" ("tenantId", "transferNumber");
CREATE INDEX IF NOT EXISTS "share_transfers_fundId_idx" ON "share_transfers" ("fundId");
CREATE INDEX IF NOT EXISTS "share_transfers_tenantId_idx" ON "share_transfers" ("tenantId");
CREATE INDEX IF NOT EXISTS "share_transfers_fundId_effectiveDate_idx"
  ON "share_transfers" ("fundId", "effectiveDate");
CREATE INDEX IF NOT EXISTS "share_transfers_status_idx" ON "share_transfers" ("status");

-- Anteilsverlauf -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS "shareholder_shares" (
  "id"            TEXT PRIMARY KEY,
  "shareholderId" TEXT NOT NULL,
  "sharePercent"  DECIMAL(8,5) NOT NULL,
  -- Stimmrechtsquote, falls abweichend (Vorzugsanteile).
  "votingPercent" DECIMAL(8,5),
  "capitalAmount" DECIMAL(15,2),
  -- NULL = seit Beitritt bzw. offen. Ein Wechsel entsteht, indem die alte
  -- Zeile ein "validTo" bekommt und eine neue am Folgetag beginnt — die alte
  -- wird NICHT geloescht.
  "validFrom"     TIMESTAMP(3),
  "validTo"       TIMESTAMP(3),
  "transferId"    TEXT,
  "notes"         TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "shareholder_shares_shareholderId_fkey"
    FOREIGN KEY ("shareholderId") REFERENCES "shareholders"("id") ON DELETE CASCADE,
  CONSTRAINT "shareholder_shares_transferId_fkey"
    FOREIGN KEY ("transferId") REFERENCES "share_transfers"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "shareholder_shares_shareholderId_idx"
  ON "shareholder_shares" ("shareholderId");
CREATE INDEX IF NOT EXISTS "shareholder_shares_shareholderId_validFrom_idx"
  ON "shareholder_shares" ("shareholderId", "validFrom");
CREATE INDEX IF NOT EXISTS "shareholder_shares_transferId_idx"
  ON "shareholder_shares" ("transferId");

-- Ausschuettung: Grundlage dokumentieren -----------------------------------

ALTER TABLE "distributions"
  ADD COLUMN IF NOT EXISTS "periodStart"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "periodEnd"           TIMESTAMP(3),
  -- Bestandsdaten bekommen REGISTER_AT_DATE, nicht PRO_RATA_TEMPORIS: sie
  -- WURDEN nicht zeitanteilig gerechnet. Ihnen die andere Grundlage
  -- anzuschreiben waere eine falsche Behauptung ueber bereits ausgezahltes
  -- Geld.
  ADD COLUMN IF NOT EXISTS "basis"               "DistributionBasis" NOT NULL DEFAULT 'REGISTER_AT_DATE',
  ADD COLUMN IF NOT EXISTS "undistributedAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "computationNotes"    JSONB;

ALTER TABLE "distribution_items"
  -- NULL bei Verteilung nach Stichtag — dann gibt es keinen Zeitanteil zu
  -- erklaeren. Bestandszeilen bleiben deshalb NULL.
  ADD COLUMN IF NOT EXISTS "days"              INTEGER,
  ADD COLUMN IF NOT EXISTS "nominalPercentage" DECIMAL(8,5);

-- Recht --------------------------------------------------------------------

-- "shareholders:transfer": der Vollzug aendert die zum Handelsregister
-- eingereichte Gesellschafterliste. Das ist nicht dasselbe wie eine
-- Adressaenderung, deshalb ein eigenes Recht.
--
-- Der Boot-Sync (sync-permissions.ts) legt es ohnehin an; hier steht es, damit
-- die Migration allein vollstaendig ist.
INSERT INTO "permissions" ("id", "name", "module", "action", "displayName", "sortOrder", "createdAt")
VALUES (gen_random_uuid()::text, 'shareholders:transfer', 'shareholders', 'transfer',
        'Anteilsübertragung vollziehen', 35, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

COMMIT;
