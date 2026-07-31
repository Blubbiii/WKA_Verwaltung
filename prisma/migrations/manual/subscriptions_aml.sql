-- B6 (Audit 2026-07): Zeichnungsprozess + GwG-Legitimation.
--
-- "shareholders/onboard deckt die Datenerfassung. Es fehlen Zeichnungsschein
-- mit Widerrufsfrist, Einzahlungsueberwachung und Legitimationspruefung nach
-- GwG mit Wiedervorlage."
--
-- Kein Backfill: bestehende Gesellschafter bekommen KEINE nachtraegliche
-- Zeichnung und keine Legitimationspruefung angelegt. Eine erfundene
-- Identifizierung waere schlimmer als eine fehlende — sie saehe aus wie ein
-- Nachweis und waere keiner.

BEGIN;

DO $$ BEGIN
  CREATE TYPE "SubscriptionStatus" AS ENUM
    ('DRAFT', 'SIGNED', 'ACCEPTED', 'PAID', 'WITHDRAWN', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AmlCheckStatus" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AmlMethod" AS ENUM
    ('IN_PERSON', 'VIDEO_IDENT', 'POST_IDENT', 'QUALIFIED_SIGNATURE', 'THIRD_PARTY', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AmlRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Zeichnungsschein ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id"                 TEXT PRIMARY KEY,
  "tenantId"           TEXT NOT NULL,
  "fundId"             TEXT NOT NULL,
  "subscriptionNumber" TEXT NOT NULL,
  "personId"           TEXT NOT NULL,
  -- Erst nach Annahme.
  "shareholderId"      TEXT,
  "status"             "SubscriptionStatus" NOT NULL DEFAULT 'DRAFT',

  "amountEur"   DECIMAL(15,2) NOT NULL,
  -- Das Agio gehoert zum Soll, auch wenn es nicht auf die Einlage angerechnet
  -- wird. Es wegzulassen ergaebe eine Einzahlung, die vollstaendig aussieht
  -- und es nicht ist.
  "agioPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,

  "signedAt" TIMESTAMP(3),
  -- Ohne Widerrufsbelehrung laeuft die Frist NICHT an (§ 356 Abs. 3 S. 1 BGB)
  -- — deshalb ein eigenes Datum und kein Haken.
  "withdrawalInstructionAt" TIMESTAMP(3),
  "withdrawalPeriodDays"    INTEGER NOT NULL DEFAULT 14,
  -- NULL, solange keine Belehrung erfasst ist.
  "withdrawalDeadline" TIMESTAMP(3),
  "withdrawnAt"        TIMESTAMP(3),
  "withdrawalReason"   TEXT,

  "acceptedAt"      TIMESTAMP(3),
  "acceptedById"    TEXT,
  "rejectedAt"      TIMESTAMP(3),
  "rejectionReason" TEXT,

  "paymentDueDate" TIMESTAMP(3),
  "paidEur"        DECIMAL(15,2) NOT NULL DEFAULT 0,
  "fullyPaidAt"    TIMESTAMP(3),

  "documentId" TEXT,
  "notes"      TEXT,

  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,

  CONSTRAINT "subscriptions_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "subscriptions_fundId_fkey"
    FOREIGN KEY ("fundId") REFERENCES "funds"("id") ON DELETE CASCADE,
  -- RESTRICT: der Zeichner darf nicht spurlos geloescht werden, solange eine
  -- Zeichnung auf ihn laeuft.
  CONSTRAINT "subscriptions_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT,
  CONSTRAINT "subscriptions_shareholderId_fkey"
    FOREIGN KEY ("shareholderId") REFERENCES "shareholders"("id") ON DELETE SET NULL,
  CONSTRAINT "subscriptions_acceptedById_fkey"
    FOREIGN KEY ("acceptedById") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "subscriptions_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "subscriptions_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_tenantId_subscriptionNumber_key"
  ON "subscriptions" ("tenantId", "subscriptionNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_shareholderId_key"
  ON "subscriptions" ("shareholderId");
CREATE INDEX IF NOT EXISTS "subscriptions_tenantId_idx" ON "subscriptions" ("tenantId");
CREATE INDEX IF NOT EXISTS "subscriptions_fundId_status_idx" ON "subscriptions" ("fundId", "status");
CREATE INDEX IF NOT EXISTS "subscriptions_personId_idx" ON "subscriptions" ("personId");
-- Traegt die Arbeitsliste: offene Einzahlungen und ablaufende Fristen.
CREATE INDEX IF NOT EXISTS "subscriptions_tenantId_status_paymentDueDate_idx"
  ON "subscriptions" ("tenantId", "status", "paymentDueDate");

-- GwG-Legitimation ----------------------------------------------------------
--
-- Eigene Tabelle und keine Felder am Personenstammsatz: die Pruefung wird
-- wiederholt (§ 10 Abs. 1 Nr. 5 GwG), und jede einzelne ist ein eigener
-- Nachweis mit eigener Aufbewahrungsfrist (§ 8 Abs. 4 GwG). Am Stammsatz zu
-- ueberschreiben wuerde genau den Nachweis vernichten, fuer den die
-- Aufbewahrungspflicht besteht.

CREATE TABLE IF NOT EXISTS "aml_checks" (
  "id"             TEXT PRIMARY KEY,
  "tenantId"       TEXT NOT NULL,
  "personId"       TEXT NOT NULL,
  "subscriptionId" TEXT,

  "status" "AmlCheckStatus" NOT NULL DEFAULT 'PENDING',
  "method" "AmlMethod"      NOT NULL DEFAULT 'IN_PERSON',

  "identifiedAt"   TIMESTAMP(3),
  "identifiedById" TEXT,

  "documentType"       VARCHAR(60),
  "documentNumber"     VARCHAR(60),
  "issuingAuthority"   VARCHAR(200),
  "documentValidUntil" TIMESTAMP(3),

  "beneficialOwnerVerified" BOOLEAN NOT NULL DEFAULT FALSE,
  "beneficialOwnerNotes"    TEXT,
  -- Politisch exponierte Person (§ 1 Abs. 12 GwG) — verstaerkte
  -- Sorgfaltspflichten nach § 15 Abs. 4 GwG.
  "isPep"     BOOLEAN        NOT NULL DEFAULT FALSE,
  "riskLevel" "AmlRiskLevel" NOT NULL DEFAULT 'LOW',

  "nextReviewAt" TIMESTAMP(3),
  -- Fuenf Jahre nach Ende der Geschaeftsbeziehung (§ 8 Abs. 4 S. 1 GwG).
  -- Mitgefuehrt, damit nicht zu frueh geloescht wird — und nicht zu spaet.
  "retentionUntil" TIMESTAMP(3),

  "documentId" TEXT,
  "notes"      TEXT,

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "aml_checks_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "aml_checks_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE CASCADE,
  CONSTRAINT "aml_checks_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL,
  CONSTRAINT "aml_checks_identifiedById_fkey"
    FOREIGN KEY ("identifiedById") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "aml_checks_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "aml_checks_tenantId_idx" ON "aml_checks" ("tenantId");
CREATE INDEX IF NOT EXISTS "aml_checks_personId_idx" ON "aml_checks" ("personId");
CREATE INDEX IF NOT EXISTS "aml_checks_subscriptionId_idx" ON "aml_checks" ("subscriptionId");
-- Traegt die Wiedervorlageliste.
CREATE INDEX IF NOT EXISTS "aml_checks_tenantId_status_nextReviewAt_idx"
  ON "aml_checks" ("tenantId", "status", "nextReviewAt");

COMMIT;
