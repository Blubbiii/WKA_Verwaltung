-- Eigentuemer und Bewirtschafter am Flurstueck
--
-- Bisher war der Eigentuemer eines Flurstuecks nur ueber den Pachtvertrag
-- bekannt (Lease.lessorId). Ein Flurstueck ohne Vertrag - etwa in der
-- Akquise - hatte gar keinen. Und wer die Flaeche tatsaechlich bestellt,
-- kam im Datenmodell ueberhaupt nicht vor, obwohl ihn Bauarbeiten,
-- Zuwegung und Flurschaeden treffen.
--
-- Beide Tabellen sind rein additiv. Bestehende Daten werden nicht
-- angefasst, keine Spalte faellt weg, kein Wert wird umgeschrieben.
-- Die Migration ist damit auch bei laufendem Betrieb gefahrlos.

-- ---------------------------------------------------------------------
-- Eigentuemer (mit Miteigentumsquoten und Zeitraeumen)
-- ---------------------------------------------------------------------
CREATE TABLE "plot_owners" (
    "id"           TEXT NOT NULL,
    "plotId"       TEXT NOT NULL,
    "personId"     TEXT NOT NULL,
    "sharePercent" DECIMAL(7,4) NOT NULL,
    "validFrom"    TIMESTAMP(3),
    "validTo"      TIMESTAMP(3),
    "notes"        TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plot_owners_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------
-- Bewirtschafter (ohne Quoten - eine Flaeche bestellt zu einem Zeitpunkt
-- einer; Teilflaechen liegen in plot_areas)
-- ---------------------------------------------------------------------
CREATE TABLE "plot_farmers" (
    "id"        TEXT NOT NULL,
    "plotId"    TEXT NOT NULL,
    "personId"  TEXT NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validTo"   TIMESTAMP(3),
    "notes"     TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plot_farmers_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------
-- Eindeutigkeit und Indizes
--
-- Dieselbe Person darf mehrfach am Flurstueck stehen (Eigentuemerwechsel
-- und Rueckkauf), aber nicht zweimal mit demselben Beginn - das waere eine
-- Doppelerfassung.
--
-- Hinweis zu NULL: in PostgreSQL sind zwei NULL in einem UNIQUE-Index
-- NICHT gleich. Zwei Eintraege derselben Person ohne validFrom sind damit
-- erlaubt. Das ist hingenommen: der Fall bedeutet "Beginn unbekannt", und
-- ihn hart zu verbieten haette bedeutet, ein Ersatzdatum zu erfinden.
-- Die Anwendung weist beim Speichern darauf hin.
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX "plot_owners_plotId_personId_validFrom_key"
    ON "plot_owners"("plotId", "personId", "validFrom");
CREATE INDEX "plot_owners_plotId_idx"   ON "plot_owners"("plotId");
CREATE INDEX "plot_owners_personId_idx" ON "plot_owners"("personId");

CREATE UNIQUE INDEX "plot_farmers_plotId_personId_validFrom_key"
    ON "plot_farmers"("plotId", "personId", "validFrom");
CREATE INDEX "plot_farmers_plotId_idx"   ON "plot_farmers"("plotId");
CREATE INDEX "plot_farmers_personId_idx" ON "plot_farmers"("personId");

-- ---------------------------------------------------------------------
-- Fremdschluessel
--
-- Auf das Flurstueck: CASCADE. Verschwindet das Flurstueck, sind seine
-- Eigentums- und Bewirtschaftungsangaben gegenstandslos.
--
-- Auf die Person: RESTRICT. Eine Person, die als Eigentuemer oder
-- Bewirtschafter eingetragen ist, darf nicht einfach geloescht werden -
-- sonst haette das Flurstueck einen Eintrag ins Leere. Wie bei
-- lease_lessors.
-- ---------------------------------------------------------------------
ALTER TABLE "plot_owners"
    ADD CONSTRAINT "plot_owners_plotId_fkey"
    FOREIGN KEY ("plotId") REFERENCES "plots"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "plot_owners"
    ADD CONSTRAINT "plot_owners_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "persons"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "plot_farmers"
    ADD CONSTRAINT "plot_farmers_plotId_fkey"
    FOREIGN KEY ("plotId") REFERENCES "plots"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "plot_farmers"
    ADD CONSTRAINT "plot_farmers_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "persons"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
