-- B7 (Audit 2026-07): Bankanbindung — automatischer Kontoabruf.
--
-- "Parser sind da, der Import ist datei-basiert. Taeglicher automatischer
-- Kontoabruf wuerde Zahlungsabgleich und Mahnlauf vollstaendig automatisieren.
-- Ehrlich: der Datei-Import funktioniert — das ist Komfort, kein Schmerz."
--
-- EBICS und FinTS sind NICHT implementiert. Das ist keine Nachlaessigkeit,
-- sondern die Sachlage: EBICS verlangt Schluesselmaterial (A006/E002/X002),
-- unterschriebene INI-/HIA-Briefe und die Freischaltung durch die Bank; FinTS
-- verlangt eine Produktregistrierungsnummer der Deutschen Kreditwirtschaft.
-- Beides findet ausserhalb jeder Software statt.
--
-- Die Verbindungen sind trotzdem anlegbar und stehen dann auf SETUP_PENDING —
-- so bildet der Datenbestand den tatsaechlichen Zustand ab.

BEGIN;

DO $$ BEGIN
  CREATE TYPE "BankConnectionProvider" AS ENUM ('FILE_DROP', 'EBICS', 'FINTS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BankConnectionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ERROR', 'SETUP_PENDING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BankFetchStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "bank_connections" (
  "id"              TEXT PRIMARY KEY,
  "tenantId"        TEXT NOT NULL,
  "name"            VARCHAR(200) NOT NULL,
  "bankAccountIban" VARCHAR(34) NOT NULL,
  "provider"        "BankConnectionProvider" NOT NULL DEFAULT 'FILE_DROP',
  "status"          "BankConnectionStatus"   NOT NULL DEFAULT 'SETUP_PENDING',

  -- Auf Anwendungsebene verschluesselt, wie die SMTP-Zugaenge.
  "credentials" TEXT,
  -- NUR der Hash. Ein gespeicherter Token waere ein Zugang zum Kontoauszug,
  -- der bei jedem Datenbank-Dump mitwandert.
  "pushTokenHash" VARCHAR(128),
  "schedule"      VARCHAR(50),

  "lastRunAt"     TIMESTAMP(3),
  "lastSuccessAt" TIMESTAMP(3),
  -- Ab drei Fehlern in Folge geht der Status auf ERROR: ein einzelner
  -- Netzwerkfehler ist kein Grund, den Abruf abzuschalten, drei
  -- hintereinander sind kein Zufall mehr.
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "lastError"           TEXT,

  "notes"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,

  CONSTRAINT "bank_connections_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "bank_connections_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "bank_connections_tenantId_bankAccountIban_provider_key"
  ON "bank_connections" ("tenantId", "bankAccountIban", "provider");
CREATE INDEX IF NOT EXISTS "bank_connections_tenantId_idx" ON "bank_connections" ("tenantId");
CREATE INDEX IF NOT EXISTS "bank_connections_tenantId_status_idx"
  ON "bank_connections" ("tenantId", "status");

-- Laufhistorie --------------------------------------------------------------
--
-- Ein automatischer Abruf, der niemandem auffaellt, ist schlimmer als gar
-- keiner — er erweckt den Eindruck, die Umsaetze seien aktuell.

CREATE TABLE IF NOT EXISTS "bank_fetch_runs" (
  "id"           TEXT PRIMARY KEY,
  "connectionId" TEXT NOT NULL,
  "status"       "BankFetchStatus" NOT NULL DEFAULT 'RUNNING',
  "startedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt"   TIMESTAMP(3),

  -- Derselbe Auszug wird nicht zweimal verarbeitet. Beim Wiederholen nach
  -- einem Fehler ist das der Regelfall.
  "statementChecksum" VARCHAR(64),
  "fileName"          VARCHAR(200),

  "transactionsFound"     INTEGER NOT NULL DEFAULT 0,
  "transactionsImported"  INTEGER NOT NULL DEFAULT 0,
  "transactionsDuplicate" INTEGER NOT NULL DEFAULT 0,
  "transactionsMatched"   INTEGER NOT NULL DEFAULT 0,

  "importBatchId" VARCHAR(50),
  "errorMessage"  TEXT,

  CONSTRAINT "bank_fetch_runs_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "bank_connections"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "bank_fetch_runs_connectionId_startedAt_idx"
  ON "bank_fetch_runs" ("connectionId", "startedAt");
-- Traegt die Dublettenpruefung des Auszugs.
CREATE INDEX IF NOT EXISTS "bank_fetch_runs_connectionId_statementChecksum_idx"
  ON "bank_fetch_runs" ("connectionId", "statementChecksum");

COMMIT;
