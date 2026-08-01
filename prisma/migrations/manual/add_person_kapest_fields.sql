-- =============================================================================
-- A3 (Audit 2026-08): Kapitalertragsteuer-Merkmale je Person
-- =============================================================================
--
-- Kirchensteuersatz und Freistellungsauftrag kamen bisher als Abfrageparameter
-- an /api/funds/[id]/distributions/[distributionId]/kapest und galten damit
-- EINHEITLICH fuer alle Gesellschafter einer Ausschuettung. Beides ist aber
-- personenbezogen:
--
--   - Der Kirchensteuersatz betraegt 8 % in Bayern und Baden-Wuerttemberg und
--     9 % im uebrigen Bundesgebiet — und 0 % fuer Nicht-Mitglieder. Ein Fonds
--     mit Gesellschaftern in mehreren Bundeslaendern kann mit EINEM Satz gar
--     nicht richtig rechnen.
--   - Der Freistellungsauftrag (§ 44a EStG) wird von jedem Gesellschafter
--     einzeln erteilt. Der bisherige Standardwert von 1.000 EUR unterstellte
--     ihn fuer alle.
--
-- HINWEIS: Der Docker-Entrypoint fuehrt `prisma db push` aus und legt diese
-- Spalten beim Start selbst an. Dieses Skript ist fuer Umgebungen ohne den
-- Entrypoint und als Beleg, was sich geaendert hat.
--
-- Reihenfolge: erst dieses Skript ODER `db push`, dann das neue Image starten.
-- Alle drei Spalten sind NULL-bar bzw. haben einen Default — bestehende
-- Datensaetze bleiben unveraendert und gueltig.
-- =============================================================================

ALTER TABLE "persons"
  ADD COLUMN IF NOT EXISTS "churchTaxLiable" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "persons"
  ADD COLUMN IF NOT EXISTS "churchTaxRate" DECIMAL(5, 4);

ALTER TABLE "persons"
  ADD COLUMN IF NOT EXISTS "exemptionOrderEur" DECIMAL(10, 2);

COMMENT ON COLUMN "persons"."churchTaxLiable" IS
  '§ 51a EStG — kirchensteuerpflichtig ja/nein.';

COMMENT ON COLUMN "persons"."churchTaxRate" IS
  '§ 51a EStG — Satz als Dezimalbruch (0.08 = BY/BW, 0.09 = uebrige Laender). '
  'NULL bei churchTaxLiable = true bedeutet "pflichtig, Satz nicht erfasst" — '
  'die Berechnung weist das aus statt mit 0 zu rechnen.';

COMMENT ON COLUMN "persons"."exemptionOrderEur" IS
  '§ 44a EStG — erteilter Freistellungsauftrag in EUR. NULL = kein Auftrag '
  'erfasst; das ist NICHT dasselbe wie ein Auftrag ueber 0 EUR.';

-- -----------------------------------------------------------------------------
-- Verifikation — erwartet: 3
-- -----------------------------------------------------------------------------
-- SELECT count(*) FROM information_schema.columns
--  WHERE table_name = 'persons'
--    AND column_name IN ('churchTaxLiable', 'churchTaxRate', 'exemptionOrderEur');

-- -----------------------------------------------------------------------------
-- Was dieses Skript BEWUSST NICHT tut
-- -----------------------------------------------------------------------------
-- Es traegt keine Werte ein. Wer bisher das Beiblatt mit „Kirchensteuer 9 %"
-- erzeugt hat, hat damit eine Annahme gedruckt und keinen erfassten Wert —
-- diese Annahme jetzt als Datenbestand festzuschreiben waere schlimmer als sie
-- offen als fehlend auszuweisen. Die Felder bleiben leer, bis jemand sie pflegt.
