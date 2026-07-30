-- TF-10: `MassCommunication` ausser Dienst stellen.
--
-- Das Modell war vollstaendig implementiert (CRUD-Route, Audit-Entity-Typ,
-- Permission `admin:mass-communication`) und hatte KEIN UI. Der Anwendungsfall
-- ist im vereinheitlichten Mailing-Wizard aufgegangen: `Mailing` ist eine echte
-- Obermenge (Templates, Fonds-Bezug, Status als Enum statt String, sentCount,
-- recipientFilter als Json statt String), und `/kommunikation/masse` leitet
-- schon lange dorthin um.
--
-- Der Prisma-Model und die tote API-Route sind entfernt. Diese Migration nimmt
-- die Tabelle aus dem Weg.
--
-- WARUM RENAME UND KEIN DROP:
-- Der Tabelleninhalt konnte nicht geprueft werden (keine DB-Verbindung zur
-- Entwicklungszeit). Versendete Massen-Kommunikation kann aufbewahrungs-
-- pflichtig sein. Ein RENAME nimmt die Tabelle aus dem Prisma-Schema und aus
-- dem Zugriff der Anwendung, laesst die Daten aber wiederherstellbar.
--
-- Idempotent: mehrfaches Ausfuehren ist unschaedlich.
--
-- Aufruf:
--   npx prisma db execute --file prisma/migrations/manual/retire_mass_communications.sql --schema prisma/schema.prisma

BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'mass_communications'
    ) THEN
        RAISE NOTICE 'mass_communications enthaelt % Zeile(n) — wird umbenannt',
            (SELECT count(*) FROM mass_communications);

        ALTER TABLE mass_communications
            RENAME TO mass_communications_retired_20260730;
    ELSE
        RAISE NOTICE 'mass_communications existiert nicht (bereits erledigt)';
    END IF;
END $$;

COMMIT;

-- ---------------------------------------------------------------------------
-- ENDGUELTIGES LOESCHEN — bewusst NICHT Teil dieser Migration.
--
-- Erst ausfuehren, wenn geklaert ist, dass die Altdaten nicht mehr
-- aufbewahrungspflichtig sind. Vorher den Inhalt sichten:
--
--   SELECT count(*), min("createdAt"), max("createdAt")
--   FROM mass_communications_retired_20260730;
--
-- Danach:
--
--   DROP TABLE mass_communications_retired_20260730;
-- ---------------------------------------------------------------------------
