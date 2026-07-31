-- B4 (Audit 2026-07): Gesellschafterversammlung als Vorgang.
--
-- "Vote, VoteProxy und Mailing existieren jeweils einzeln. Es fehlt die
-- Klammer: Einladung mit Ladungsfrist, Tagesordnung, Anwesenheitsliste mit
-- vertretenem Kapital, Beschlussfaehigkeitspruefung, Protokoll und
-- Beschlussbuch mit Nachweiskette."
--
-- Der Bericht nennt B4 "rechtlich heikel wenn schlecht dokumentiert". Genau
-- deshalb sind die Ergebnisse MITGESPEICHERT und nicht abgeleitet: eine
-- spaetere Korrektur der Anwesenheitsliste darf ein unterzeichnetes Protokoll
-- nicht rueckwirkend umrechnen.
--
-- Kein Backfill: bestehende Vote-Datensaetze werden NICHT zu Versammlungen
-- umgedeutet. Eine elektronische Abstimmung ist keine Versammlung, und ihr
-- eine Ladungsfrist und eine Anwesenheitsliste anzudichten waere die falsche
-- Art von Vollstaendigkeit.

BEGIN;

DO $$ BEGIN
  CREATE TYPE "MeetingType" AS ENUM ('ORDINARY', 'EXTRAORDINARY', 'WRITTEN_PROCEDURE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MeetingStatus" AS ENUM ('DRAFT', 'INVITED', 'HELD', 'MINUTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AttendancePresence" AS ENUM ('PRESENT', 'REPRESENTED', 'ABSENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MajorityBase" AS ENUM ('VOTES_CAST', 'CAPITAL_PRESENT', 'CAPITAL_TOTAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ResolutionOutcome" AS ENUM ('ADOPTED', 'REJECTED', 'DEFERRED', 'NO_RESOLUTION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Versammlung ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "shareholder_meetings" (
  "id"            TEXT PRIMARY KEY,
  "tenantId"      TEXT NOT NULL,
  "fundId"        TEXT NOT NULL,
  "meetingNumber" TEXT NOT NULL,
  "type"          "MeetingType"   NOT NULL DEFAULT 'ORDINARY',
  "status"        "MeetingStatus" NOT NULL DEFAULT 'DRAFT',

  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "location"    VARCHAR(300),
  "isVirtual"   BOOLEAN NOT NULL DEFAULT FALSE,

  -- Ohne dieses Datum ist die Einhaltung der Ladungsfrist nicht nachweisbar —
  -- und "nicht nachweisbar" ist nicht dasselbe wie "eingehalten".
  "invitationSentAt"  TIMESTAMP(3),
  -- Ein Feld, weil die gesetzliche Wochenfrist der GmbH (§ 51 Abs. 1 S. 2
  -- GmbHG) regelmaessig vertraglich verlaengert wird und bei
  -- Personengesellschaften gar nicht gilt.
  "noticePeriodDays"  INTEGER NOT NULL DEFAULT 14,
  -- Vollversammlung heilt einen Ladungsmangel (§ 51 Abs. 3 GmbHG).
  "noticeWaivedByAll" BOOLEAN NOT NULL DEFAULT FALSE,

  -- NULL = kein Quorum hinterlegt. Dann wird von Beschlussfaehigkeit
  -- ausgegangen UND das gesagt.
  "quorumPercent" DECIMAL(5,2),

  "chairperson" VARCHAR(200),
  "minuteTaker" VARCHAR(200),

  "minutesDocumentId"   TEXT,
  "minutesApprovedAt"   TIMESTAMP(3),
  "invitationMailingId" TEXT,

  "notes"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,

  CONSTRAINT "shareholder_meetings_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "shareholder_meetings_fundId_fkey"
    FOREIGN KEY ("fundId") REFERENCES "funds"("id") ON DELETE CASCADE,
  CONSTRAINT "shareholder_meetings_minutesDocumentId_fkey"
    FOREIGN KEY ("minutesDocumentId") REFERENCES "documents"("id") ON DELETE SET NULL,
  CONSTRAINT "shareholder_meetings_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "shareholder_meetings_tenantId_meetingNumber_key"
  ON "shareholder_meetings" ("tenantId", "meetingNumber");
CREATE INDEX IF NOT EXISTS "shareholder_meetings_tenantId_idx"
  ON "shareholder_meetings" ("tenantId");
CREATE INDEX IF NOT EXISTS "shareholder_meetings_fundId_scheduledAt_idx"
  ON "shareholder_meetings" ("fundId", "scheduledAt");
CREATE INDEX IF NOT EXISTS "shareholder_meetings_tenantId_status_idx"
  ON "shareholder_meetings" ("tenantId", "status");

-- Tagesordnung und Beschluss ------------------------------------------------

CREATE TABLE IF NOT EXISTS "meeting_agenda_items" (
  "id"          TEXT PRIMARY KEY,
  "meetingId"   TEXT NOT NULL,
  "position"    INTEGER NOT NULL,
  "title"       VARCHAR(300) NOT NULL,
  "description" TEXT,

  "requiresResolution"      BOOLEAN NOT NULL DEFAULT TRUE,
  "requiredMajorityPercent" DECIMAL(5,2) NOT NULL DEFAULT 50,
  -- Dieselbe Abstimmung kann auf der einen Basis angenommen und auf der
  -- anderen abgelehnt sein. Deshalb ein Feld je Punkt.
  "majorityBase" "MajorityBase" NOT NULL DEFAULT 'VOTES_CAST',

  "resolutionText" TEXT,
  "votesInFavor"   DECIMAL(12,4),
  "votesAgainst"   DECIMAL(12,4),
  "votesAbstain"   DECIMAL(12,4),

  -- NULL = kein Ergebnis. Das ist NICHT dasselbe wie abgelehnt: eine
  -- beschlussunfaehige Versammlung faellt keinen Beschluss.
  "outcome"         "ResolutionOutcome",
  -- Mitgespeichert, damit eine spaetere Korrektur der Anwesenheitsliste ein
  -- protokolliertes Ergebnis nicht rueckwirkend umrechnet.
  "achievedPercent" DECIMAL(6,2),
  "resultStatement" TEXT,

  "voteId" TEXT,
  "notes"  TEXT,

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "meeting_agenda_items_meetingId_fkey"
    FOREIGN KEY ("meetingId") REFERENCES "shareholder_meetings"("id") ON DELETE CASCADE,
  CONSTRAINT "meeting_agenda_items_voteId_fkey"
    FOREIGN KEY ("voteId") REFERENCES "votes"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "meeting_agenda_items_meetingId_position_key"
  ON "meeting_agenda_items" ("meetingId", "position");
CREATE UNIQUE INDEX IF NOT EXISTS "meeting_agenda_items_voteId_key"
  ON "meeting_agenda_items" ("voteId");
CREATE INDEX IF NOT EXISTS "meeting_agenda_items_meetingId_idx"
  ON "meeting_agenda_items" ("meetingId");

-- Anwesenheitsliste ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS "meeting_attendance" (
  "id"            TEXT PRIMARY KEY,
  "meetingId"     TEXT NOT NULL,
  "shareholderId" TEXT NOT NULL,
  "presence"      "AttendancePresence" NOT NULL DEFAULT 'ABSENT',

  -- Snapshot ZUM VERSAMMLUNGSTAG aus dem Anteilsverlauf (A8). Nicht spaeter
  -- nachgerechnet: sonst aenderte ein Anteilsuebergang im Juli rueckwirkend
  -- die Beschlussfaehigkeit der Mai-Versammlung.
  "sharePercent" DECIMAL(8,5) NOT NULL,

  "representedByPersonId" TEXT,
  "proxyId"               TEXT,
  "notes"                 TEXT,

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "meeting_attendance_meetingId_fkey"
    FOREIGN KEY ("meetingId") REFERENCES "shareholder_meetings"("id") ON DELETE CASCADE,
  CONSTRAINT "meeting_attendance_shareholderId_fkey"
    FOREIGN KEY ("shareholderId") REFERENCES "shareholders"("id") ON DELETE CASCADE,
  CONSTRAINT "meeting_attendance_representedByPersonId_fkey"
    FOREIGN KEY ("representedByPersonId") REFERENCES "persons"("id") ON DELETE SET NULL,
  CONSTRAINT "meeting_attendance_proxyId_fkey"
    FOREIGN KEY ("proxyId") REFERENCES "vote_proxies"("id") ON DELETE SET NULL
);

-- Ein Gesellschafter erscheint in der Liste genau einmal.
CREATE UNIQUE INDEX IF NOT EXISTS "meeting_attendance_meetingId_shareholderId_key"
  ON "meeting_attendance" ("meetingId", "shareholderId");
CREATE INDEX IF NOT EXISTS "meeting_attendance_meetingId_idx"
  ON "meeting_attendance" ("meetingId");
CREATE INDEX IF NOT EXISTS "meeting_attendance_shareholderId_idx"
  ON "meeting_attendance" ("shareholderId");

COMMIT;
