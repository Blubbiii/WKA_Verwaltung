-- Bedienaufwand #11 (Audit 2026-07): Rechnungsempfaenger mit dem CRM-Kontakt verknuepfen.
--
-- Bisher stand der Empfaenger nur als Freitext auf der Rechnung. Der
-- Auswahldialog kannte die Person-ID, verwarf sie aber. Folge: keine
-- 360-Grad-Sicht auf den Kontakt, und die Adresse wurde beim Uebernehmen per
-- Zeilenumbruch und Hausnummern-Regex wieder zerlegt.
--
-- recipientName/recipientAddress bleiben bewusst erhalten. Sie sind die
-- Momentaufnahme zum Rechnungsdatum; §14 UStG und AO §147 verlangen, dass eine
-- ausgestellte Rechnung sich nachtraeglich nicht aendert. Ein Umzug des
-- Kontakts darf die alte Rechnung also NICHT umschreiben.
--
-- ON DELETE SET NULL aus demselben Grund: das Loeschen eines Kontakts entfernt
-- nur den Ruecksprung ins CRM, nicht den Rechnungsinhalt.
--
-- Kein Backfill: bestehende Rechnungen ueber Namensgleichheit einer Person
-- zuzuordnen waere geraten. Zwei "Meyer GmbH" im Mandanten reichen fuer eine
-- falsche Zuordnung, und die waere in der 360-Grad-Sicht nicht als Vermutung
-- erkennbar. Altbestand bleibt unverknuepft; neue Rechnungen tragen den Verweis.

ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "recipientPersonId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_recipientPersonId_fkey'
  ) THEN
    ALTER TABLE "invoices"
      ADD CONSTRAINT "invoices_recipientPersonId_fkey"
      FOREIGN KEY ("recipientPersonId") REFERENCES "persons"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Traegt die 360-Grad-Sicht: "alle Rechnungen dieses Kontakts".
CREATE INDEX IF NOT EXISTS "invoices_recipientPersonId_idx"
  ON "invoices"("recipientPersonId");
