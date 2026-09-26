# Changelog

All notable changes to WindparkManager.

## [Unreleased]

### September 2026 — Buchhaltung ausgebaut, Abregelung richtig gerechnet

> **Vor dem nächsten Deployment lesen.** Der Container gleicht das Schema beim
> Start mit `prisma db push --accept-data-loss` ab. Mit diesem Stand löscht er
> dabei **24 Tabellen** der entfernten Buchhaltung, des SEPA-Zahllaufs und des
> Bank-Imports (Buchungen, Kontenrahmen, Bankkonten und -umsätze, SEPA-Läufe,
> Angebote, Kassenbuch, Anlagen, Steuerschlüssel u. a.) sowie die Spalten
> `invoice_payments.bankTransactionId/journalEntryId`,
> `invoices.taxCodeId`, `incoming_invoices.taxCodeId` und
> `dismantling_provisions.journalEntryId`. **Vorher eine Sicherung ziehen.**
>
> `db push` löscht außerdem **jede** Tabelle, die nicht im Schema steht — auch
> von Hand angelegte. Das galt schon immer, fiel beim Prüfen aber auf.
>
> Die Enum-Werte `SEPA_RUN`, `JOURNAL_POST` und `JOURNAL_REVERSE` bleiben
> absichtlich stehen: Trägt eine alte Freigabe-Anfrage einen davon, scheitert
> `db push` beim Entfernen — und der Container startet nicht.

**Abregelung: 430 % der Produktion als Verlust**

Die SCADA-Felder `mrwSmpPwin/Pte/Pfm/Pext` sind Leistungsgrenzen, keine
ausgefallene Leistung. Die Auswertung summierte sie auf und wies an echten
Daten 96.280 MWh „Verlust" bei 22.391 MWh Produktion aus; „beim Netzbetreiber
einforderbar" entsprach etwa der ganzen Einspeisung. Jetzt zählt nur die
Differenz zur Windleistung, wenn eine Grenze tatsächlich bindet — 2.571 MWh
(11,5 %), dreifach gegengerechnet (Python, SQL, TypeScript). Bewertet wird mit
dem Monatssatz statt mit fest verdrahteten 0,08 €/kWh.

**Buchhaltungs-Reste entfernt**

Nach dem Ausbau standen noch DATEV-Konten, Kontenrahmen, Bilanz-Toleranz und
das Konto „Jahresergebnis" in den Einstellungen — ohne jede Wirkung. Sie sind
aus Oberfläche, API und Typen entfernt. Die Einstellungs-API filtert beim Lesen
und Schreiben auf bekannte Felder, so verschwinden die Altwerte auch aus dem
gespeicherten JSON eines Mandanten. Aufbewahrungsfristen und Soft-Delete
nannten noch die gelöschten Modelle `JournalEntry` und `Quote`; ein neuer Test
gleicht beide Listen mit `schema.prisma` ab. Das Audit-Log verlinkt Buchungen,
SEPA-Läufe und Bankumsätze nicht mehr ins Leere.

Bleibt bewusst: der DATEV-Export der Eingangsrechnungen für den Steuerberater,
die DATEV-Konten je Rechnungsposition und die Enum-Werte `SEPA_RUN`/`JOURNAL_*`.

**UX-Durchsicht, Welle 1: Stolpersteine**

- **Pachtvertrag anlegen:** Ein ausgefülltes, noch nicht übernommenes
  Flurstück übernimmt jetzt „Weiter“ selbst. Ein gesperrtes „Weiter“ nennt
  seinen Grund. Sind alle Flurstücke verpachtet, sagt die Liste das und bietet
  „Alle Flurstücke anzeigen“ an, statt „Keine Flurstücke gefunden“.
- **Ausgeschaltete Module:** Statt „Bitte wenden Sie sich an Ihren
  Administrator“ (auch zum Administrator) erfährt jeder, wer das Modul
  einschalten kann; der Superadmin bekommt den Link dorthin. Die CRM-Seiten
  blitzen beim Laden nicht mehr als „ausgeschaltet“ auf.
- **Dashboard:** „Erste Schritte“ schrumpft ab 80 % auf eine Zeile.
  „Letzte Aktivitäten“ zeigt Sätze statt Rohcodes („hat den Zugriffsbericht
  angesehen“ statt „hat ACCESS_REPORT view“).
- **Pachtvertrag:** Restlaufzeit in Jahren und Monaten statt „8954 Tage“; die
  Laufzeit in der Liste bricht nicht mehr um. Lässt sich eine Bankverbindung
  nicht entschlüsseln, steht dort ein Hinweis statt des Chiffretexts.
- **Kopfzeile:** Mandantenname nur noch in der Seitenleiste. Design, Sprache,
  Tabellendichte und Tastenkombinationen stehen beschriftet im Benutzermenü.
- **Rundgang:** wird nur noch auf dem Dashboard angeboten, nicht mehr über
  jede Seite gelegt.
- **Einstellungen:** Kleinunternehmer (§19 UStG), USt-Split und
  Geschäftsjahresbeginn entfernt — ohne Wirkung seit dem Ausbau der
  Buchhaltung; der Geschäftsjahresbeginn ließ sich nicht einmal speichern.
  Der Tab „HGB-Compliance“ heißt „Prüfregeln“ und spricht ohne interne Kürzel.

**UX-Durchsicht, Welle 2: Aktionen einheitlich**

- **Ein Muster für Detailseiten:** „Bearbeiten“ sichtbar, weitere Aktionen
  und „Löschen“ im „…“-Menü oben rechts, Löschen immer mit Rückfrage
  (`DetailAktionen`). Umgestellt: Park, Gesellschaft, Pachtvertrag, Vertrag,
  Kontakt, Service-Vorgang, Störung. Park und Gesellschaft lassen sich jetzt
  auch von der Detailseite aus löschen.
- **Störung speichert mit Knopf:** Die Seite schrieb jedes Feld beim
  Verlassen sofort in die Datenbank. Jetzt sammelt sie Änderungen, zeigt
  „Verwerfen / Speichern“ und warnt beim Verlassen.
- **Rechnungsdetail:** eine Hauptaktion je Status (Entwurf: Versenden,
  versendet: Zahlung erfassen), alles andere im „…“-Menü, Stornos abgesetzt
  in Rot. Vorher bis zu zehn gleichrangige Knöpfe, die rechts aus dem Bild
  liefen.
- **Listen:** Eine Zeile öffnet den Datensatz, das Augen-Symbol entfällt,
  Bearbeiten steht im Menü. Die Pachtliste verliert die Spalte „Vertrag“ (es
  gibt keine Vertragsnummer am Pachtvertrag); die Rechnungsliste zeigt
  „Versand“ statt zweier grauer Symbole je Zeile und blendet „Versender“ aus,
  wenn keine Rechnung einen hat.
- **Tote und falsch benannte Knöpfe:** „Als bezahlt markieren“ in der
  Rechnungsliste tat nichts (nur `stopPropagation`) und funktioniert jetzt;
  80 Zurück-Pfeile hießen für Screenreader „Verknüpfen“. Beides fangen jetzt
  Wächter-Tests. Löschen eines Vertrags scheiterte bei Fehlern stumm.

**UX-Durchsicht, Welle 3: Navigation**

- **Seitenleiste springt nicht mehr.** Sie baute sich in drei Schritten auf:
  Die Standardreihenfolge stand doppelt im Code (Hook und API), kannte
  „Betriebsführung“ und „Grundstücke & Pachten“ nicht und schob sie ans Ende;
  Rechte, Modul-Schalter, Favoriten und Mandantenname kamen erst per Fetch.
  Jetzt liefert das Layout alles für das erste Bild mit. „Zuletzt besucht“
  liegt zusätzlich in einem Cookie (streng geprüft), damit auch sie sofort
  steht.
- **Favoriten und Zuletzt besucht** stehen immer an festen Plätzen statt sich
  abzuwechseln; „Zuletzt besucht“ zeigt drei Seiten und keine Favoriten.
- **Ein aktiver Eintrag:** Die längste passende Adresse gewinnt. Vorher
  leuchteten auf jeder Energie-Unterseite „Übersicht“ und der Unterpunkt.
- **Energie** ist geteilt in „Energiedaten“ und „Auswertung“; Turbinen-Import,
  SCADA-Zuordnung und Netz-Topologie stehen als „Datenanbindung“ unter
  Administration. PPA-Verträge stehen bei den Verträgen. „Einstellungen“ gab
  es zweimal: jetzt „Mein Konto“ und „Systemeinstellungen“. Die
  Periodensperre bleibt bewusst neben dem Belegexport.

**UX-Durchsicht, Welle 4: Seitenaufbau**

- **Kennzahlen als eine Zeile:** Die vier gerahmten Karten vor jeder Liste
  (rund 180 px) sind eine schmale Zeile; klickbar nur, was filtert. Gilt für
  alle Listen mit Kennzahlen auf einmal. In der Pachtliste filtert „Laufen
  aus“ jetzt die Liste.
- **Phantom-Jahrespacht:** Spalte „Jahrespacht“ und Kennzahl „Jährliche
  Pacht“ zeigten immer „–“ bzw. 0,00 € — `Lease` hat kein solches Feld; die
  Pacht entsteht aus Erlösanteilen und Flächenbeträgen. Beides entfernt, auch
  aus dem CSV-Export.
- **Doppelte Überschriften** (Pachtverträge, Produktionsdaten, Meldung
  bearbeiten) entfernt; ein Wächter-Test vergleicht Seiten- und Kartentitel
  über die deutschen Texte.
- **Park:** Die Übersicht beginnt mit den Stammdaten (Standort,
  Inbetriebnahme, Leistung, Betreiber, Betriebsführung).
- **Gesellschaft:** öffnet mit „Übersicht“ als erstem Reiter; die Kennzahl
  „Gesellschaften“ heißt „Verbundene Gesellschaften“.

**UX-Durchsicht, Welle 5: Begriffe**

Je Sache ein Wort, festgelegt mit dem Fachbereich:

| Begriff | Bedeutung |
|---|---|
| Abrechnungen | Menü und Seite `/invoices` — Rechnungen und Gutschriften. Abgerechnet werden die WEA; eine Rechnung stellt man jemandem. |
| Netzbetreiber-Abrechnung | was „Stromabrechnung“ und „Netzbetreiber-Daten“ hieß |
| Produktionsdaten, SCADA-Messdaten | „Ertragsdaten“ war ein dritter Name |
| Gesellschaft | was „Fonds“ und „Beteiligungen“ hieß; „Beteiligung“ nur für den Anteil einer Person |
| BF-Abrechnungen, Abrechnungseinstellungen | die übrigen „Abrechnung“-Einträge im Menü |

- Umgesetzt in Menü, Brotkrumen, Seiten, Meldungen der API, Audit-Filter und
  Rechtekatalog (`energy:*` heißt „Energiedaten …“, weil es alle
  Energiedaten betrifft). Der Audit-Filter nannte Produktionsdaten
  „Netzbetreiber-Daten“, die Brotkrume für `/energy` „Stromabrechnung“.
- 108 ausgeschriebene Umlaute je deutscher Sprachdatei korrigiert — der
  Durchgang im Bugtest hatte nur `.tsx` erfasst.
- **Seed repariert:** `prisma/seed.ts` ließ sich seit dem Ausbau der
  Buchhaltung nicht mehr übersetzen (Reste von `seedLedgerAccounts`, Import
  entfernter Enums). Ein neuer Test übersetzt den Seed gegen den
  Prisma-Client.
- Wächter-Tests für Glossar und Umlaute.

**Aus der Auswahl anlegen**

Fehlte beim Vertrag die Gesellschaft, der Partner oder der Windpark, hieß das
bisher: Assistent verlassen, anlegen, von vorn anfangen. Jetzt steht in der
Auswahl unten „+ Neue Gesellschaft anlegen“ — mit dem Suchtext als
Vorschlag („„Siedecamp“ als neue Gesellschaft anlegen“). Das volle Formular
öffnet als Dialog, der neue Eintrag ist danach ausgewählt, alle übrigen
Eingaben bleiben.

- Für Gesellschaft, Windpark (der ganze Assistent), Kontakt (Firma oder
  Person wird am Suchtext erkannt; mit CRM samt Dublettenprüfung und
  „Vorhandenen übernehmen“), Lieferant, Gemeinde und Kostenstelle — nur mit
  dem Recht zum Anlegen.
- Eingesetzt in: Vertrag (Assistent und Bearbeiten), Rechnung (neu und
  bearbeiten), PPA, Eingangsrechnung (Lieferant, Aufteilung auf
  Gesellschaften), Beteiligung, Anlage und Gemeindebeteiligung (Gemeinde),
  Budget (Kostenstelle). Nicht beim BF-Vertrag: dort wählt der Superadmin
  Parks über Mandanten hinweg.
- Listenseite und Dialog nutzen dasselbe Formular; Wächter-Test.
- Nebenbei: „Vertrag bearbeiten“ zeigte leere Vertragspartner (die Seite las
  ein Feld `name`, das Personen nicht haben), mehrere Auswahlfelder waren auf
  100 Einträge begrenzt.

**Verdrahtungs-Audit: Oberfläche und API passen wieder zusammen**

Geprüft wurde jeder Aufruf aus der Oberfläche gegen die vorhandenen Routen,
jedes Formularfeld gegen das Schema, das es annimmt, und jeder Schalter auf
Wirkung. Ein neuer Wächter (`app/api/aufrufe-haben-routen.test.ts`) prüft
künftig, dass jeder Aufruf eine Route mit genau dieser Methode trifft.

- Briefpapier-Vorschau lief ins Leere — die Route gab es nie. Sie zeigt jetzt
  eine Musterrechnung mit genau diesem Briefpapier.
- Dokumente: „Kategorie ändern" für mehrere schickte PATCH an eine PUT-Route.
- Produktionsdaten: Erlös und Erlösart wurden verworfen. Sie sind jetzt von
  Hand erfassbar und werden gespeichert — gerechnet wird weiter mit der
  Netzbetreiber-Abrechnung.
- Gesellschaften: Die Notiz-Spalte schrieb in ein Feld, das es nicht gibt. Sie
  zeigt jetzt die letzte CRM-Notiz; eine Eingabe legt eine neue an. Ohne
  CRM-Modul oder Leserecht bleibt die Spalte weg.
- Versicherungsschaden: Das Schadensdatum wurde nicht gespeichert.
- BF-Vertrag: „Gebühr ändern" änderte nichts.
- Mandanten-Assistent: Angelegte Benutzer bekamen keine Rolle.
- Abrechnungen-Liste: „Als bezahlt markieren" für mehrere und die Status-Auswahl
  scheiterten. Bezahlt markieren läuft jetzt über denselben Weg wie in der
  Einzelansicht; der Status ist in der Liste nur noch Anzeige.

Entfernt, weil nichts sie aufrief und die Funktion anderswo lebt: die
Verwaltung der Erlösarten unter `/api/admin/energy-revenue-types`,
Einzelansicht und Wiederholen von Jobs (`/api/admin/jobs/[id]`), die
JSON-Metriken `/api/admin/metrics` (Prometheus liest weiter `/api/metrics`),
der Sammel-E-Mail-Versand `/api/batch/email`, `/api/reports/park-pl`, die
öffentliche `/api/marketing-config` (die Startseite liest serverseitig) und
`/api/energy/reports/generate` (der Berichts-Baukasten nutzt
`/api/reports/custom`).

**Verdrahtungs-Audit, Block B: Funktionen, die es nur als API gab**

- **Legitimationsprüfung (GwG):** Im Gesellschafter-Dialog lässt sich die
  Prüfung jetzt erfassen und ihr Stand ablesen. Die Zeichnungen-Karte sperrte
  die Annahme bei fehlender Legitimation, bot aber keinen Weg, sie zu erfassen;
  jetzt steht der Knopf direkt dort. Auf der Fristen-Seite stehen die fälligen
  Wiedervorlagen. Dabei behoben: Die Wiedervorlageliste zählte jede einzelne
  Prüfung — eine alte, abgelaufene blieb „fällig", obwohl längst eine neuere
  vorlag. Maßgeblich ist jetzt die neueste je Person.
- **Versicherungsschaden:** Ein Schadenfall ließ sich keiner Police zuordnen,
  „Entschädigung ermitteln" wäre also nie gelaufen. Die neue Karte
  „Versicherungsleistung" ordnet Police und Deckung zu und rechnet
  Selbstbehalt, Unterversicherung und Versicherungssumme durch.
- **Großkomponenten:** „Tauschen" im Register. Das alte Teil bleibt mit
  Ausbaugrund stehen, Hersteller und Modell werden übernommen, die
  Gewährleistung ausdrücklich nicht.
- **Audit-Log:** Export als CSV, Excel oder PDF mit den Filtern der Liste.
- **Netzbetreiber-Abrechnungen:** Auswahl und Sammelaktionen „Freigeben"
  (fakturiert → abgeschlossen) und „Zurückweisen" (berechnet → Entwurf). Es
  gehen nur passende Abrechnungen an den Server; der Rest wird benannt.
- **Dokumente:** „Archivieren" für mehrere. Die Sammel-Route konnte außerdem
  freigeben, veröffentlichen und löschen — schwächer als die Einzelroute
  (keine Admin-Prüfung, kein Freigabedatum, keine Benachrichtigung, endgültiges
  Löschen). Diese Zweige sind entfernt. Die Einzelfreigabe verlangt jetzt
  zusätzlich das Recht `documents:approve` bzw. `documents:publish`.
- **Jahresbericht:** entsteht im Hintergrund, die Seite bleibt bedienbar. Läuft
  kein Worker, bietet sie nach 45 Sekunden an, den Bericht direkt zu erzeugen.
  Neue Route `/api/reports/jobs/[id]/download` liefert das fertige PDF.
- **Monitoring:** Cache-Karte mit Trefferquote, Backend (Redis oder
  Arbeitsspeicher) und „Caches leeren".
- **Paperless:** Übersicht archiviert / in Übertragung / fehlgeschlagen /
  nicht gesendet auf der Paperless-Seite.

**Verdrahtungs-Audit, Block C: Vertragsverlängerung läuft von selbst**

Verträge mit „automatischer Verlängerung" bekamen nie ihren
Verlängerungsentwurf: `/api/admin/contracts/auto-renew` war der einzige Weg,
und niemand rief ihn auf. Jetzt ist es ein täglicher Wartungslauf um 6:30
(`CRON_CONTRACT_AUTO_RENEW`), vor der Fristenprüfung um 7:00. Er ist
idempotent, ein vorhandener Entwurf wird übersprungen. Die Route bleibt zum
Anstoßen von Hand.

**Backup-Zeitplan aus der Oberfläche (E3, behebt F8)**

> **Beim nächsten Deployment in Portainer übernehmen.** Der Dienst `backup`
> startet jetzt `scripts/backup-scheduler.sh` statt eines festen Crontabs. Im
> Portainer-Stack muss das Skript als Config `backup_scheduler_script`
> eingefügt werden (wie `backup_script`, mit `$$` statt `$`), `entrypoint`
> wird `/bin/sh`, `command` `["/scripts/backup-scheduler.sh"]`, der
> Healthcheck `pgrep -f backup-scheduler`. Bis dahin zeigt die Oberfläche
> „Backup-Dienst meldet sich nicht" — zu Recht, denn der alte Dienst meldet
> nichts zurück. Der alte Portainer-Dienst installierte `cron` per `apt-get`
> auf einem TimescaleDB-Image; ob der dort je lief, ist ungeprüft. Genau das
> macht die neue Anzeige sichtbar.

Das Speichern der Backup-Einstellungen scheiterte immer (400): Das Formular
schickte eine Aktion, die die Route nicht kannte (F8). Jetzt steht der Zeitplan
in der Datenbank: Rhythmus (täglich, wöchentlich, monatlich), Uhrzeit, wie
viele Sicherungen je Art bleiben, S3 ja/nein. Der Backup-Container liest ihn
alle fünf Minuten, holt verpasste Termine nach und meldet zurück. Die
Oberfläche zeigt das letzte Backup (Zeit, Art, Größe), das nächste geplante
und das letzte Lebenszeichen. Sie unterscheidet drei Warnungen: Dienst meldet
sich nicht, letztes Backup fehlgeschlagen, überfällig. Ohne Datenbank fällt
der Dienst auf den bisherigen Plan zurück (täglich 02:00, sonntags
wöchentlich, am Ersten monatlich).

**Neue Seite: Marktprämie (E5)**

Unter Auswertung → Marktprämie gibt es jetzt eine eigene Seite. Die Rechnung
gab es schon, eine Oberfläche nicht.

- **Spotpreise:** Import der SMARD-CSV (Großhandelspreise
  Deutschland/Luxemburg), altes Stundenformat wie neues Viertelstundenformat.
  Viertelstunden werden je Stunde gemittelt und das wird angezeigt.
  Ortszeit wird korrekt umgerechnet, auch die doppelte Stunde im Oktober. Die
  Karte zeigt, wie vollständig der Monat ist und wie viele Stunden negativ
  waren.
- **Berechnung:** Monatsmarktwert Wind an Land eintragen, je Park oder für
  alle berechnen, vorhandene Ergebnisse nur auf ausdrückliche Bestätigung
  ersetzen.
- **Ergebnis:** Anlage, anzulegender Wert, Marktwert, Prämie je kWh und in
  Euro, Menge, Stunden mit negativem Preis und davon betroffene, mit Summe.

Dabei behoben: Spotpreise und Marktprämie schnitten den Monat in UTC und
erwarteten immer „Tage × 24" Stunden. Die ersten ein bis zwei Stunden jedes
Monats fielen so in den Vormonat, und eine vollständige März-Reihe (743
Stunden) galt als lückenhaft. Maßgeblich ist jetzt der Liefermonat nach
deutscher Ortszeit (`lib/zeit/berlin`).

**Park-Zugriff je Benutzer (E4)**

Neue Seite Administration → Park-Zugriff, neben dem Gesellschafts-Zugriff.
Ist kein Park ausgewählt, sieht der Benutzer alle Parks. Mit Auswahl zeigen
Parkliste, Auswahlfelder, Parkseite (lesen, ändern, löschen) und die
Dashboard-Zahlen nur noch diese Parks. Die Freigaben werden also wirklich
durchgesetzt, nicht nur verwaltet. Die Dashboard-Zahlen berücksichtigen
jetzt auch den Gesellschafts-Zugriff, den sie bisher übergingen.

Dabei behoben: Die Dashboard-Zahlen wurden nur je Mandant zwischengespeichert,
obwohl der Kommentar einen Schlüssel je Benutzer versprach. Die Sicht eines
eingeschränkten Benutzers konnte so bei allen landen, oder er sah die
ungefilterten Zahlen. Eingeschränkte Sichten werden jetzt frisch berechnet
und nicht zwischengespeichert.

**Showcase-Video und Speicherkontingent bekommen eine Oberfläche**

- **Video:** In den Marketing-Einstellungen (Tab Abschnitte) lässt sich das
  Video des Produkt-Showcase hochladen, ersetzen und entfernen. Behoben: Der
  Upload speicherte einen Speicherschlüssel, den die Startseite als
  Video-Adresse benutzt hätte; das Video wäre nie gelaufen. Jetzt spielt die
  Startseite es über die öffentliche Route `/api/marketing/video`, die genau
  dieses eine Video ausliefert, mit Spulen (Range). Ein ersetztes Video wird
  gelöscht, statt im Speicher liegen zu bleiben.
- **Speicher:** Karte „Speicherkontingent“ unter System → Backup →
  Speicher-Verwaltung: belegt gegen Limit, Aufteilung nach Kategorie,
  „Neu berechnen“. Der Zähler steigt bei jedem Upload, sinkt beim Löschen
  aber nicht. Die Neuberechnung zählt alles Gespeicherte neu zusammen.

**Lizenzmodell: Tarife, Grenzen je Kunde, Kundenübersicht**

> Beim Deployment legt `db push` die Tabelle `tarife` und neue Spalten an
> (`tenants.tarifId`, `lizenzAbweichung`, `lizenzUeberschrittenSeit`,
> `funds.verwaltung`). Nur Ergänzungen, keine Daten gehen verloren. Kunden
> ohne Tarif bleiben unbegrenzt, es ändert sich also nichts, bis ein Tarif
> zugewiesen wird.

- **Tarife** pflegt der Plattform-Betreiber unter Marketing → Tarife: Name,
  Preis, Grenzen für Firmen, Umspannwerke, WEA, Benutzer und Speicher sowie
  die enthaltenen Leistungen. Sichtbare Tarife stehen auf der Startseite und
  ersetzen dort den Preisrechner. Dieselben Datensätze sind die Lizenz der
  Kunden: Was beworben wird, ist genau das, was gebucht wird.
- **Gezählt** werden aktiv verwaltete Gesellschaften (Firmen) und
  Umspannwerk-Gesellschaften getrennt, WEA (ohne NVP und Parkrechner) und
  aktive Benutzer. **Nicht gezählt** werden Gesellschaften, an denen der
  Kunde nur beteiligt ist (neuer Schalter „aktiv verwaltet / nur beteiligt“
  an der Gesellschaft), und Portal-Zugänge der Gesellschafter.
- **Überschritten:** Anlegen ist sofort gesperrt, mit der Meldung „Ihr Tarif …
  umfasst … Bitte buchen Sie eine größere Stufe.“ Nach 30 Tagen ist auch das
  Bearbeiten von Stammdaten gesperrt. Lesen, Export, Löschen und alle
  Abrechnungen bleiben immer möglich. Ein täglicher Wartungslauf (5:30)
  schreibt den Stand fort.
- **Kundenübersicht** (Administration → Mandanten → Lizenzen): Tarif,
  Verbrauch gegen Grenze, Stand und Sonderregel je Kunde. Nur Zahlen, keine
  Inhalte. Sie ersetzt die bisherigen Mandanten-Limits, die gespeichert,
  aber nie durchgesetzt wurden.
- **Kunde:** Einstellungen → Lizenz zeigt Tarif und Verbrauch. Solange die
  Lizenz überschritten ist, erscheint ein Hinweisbalken mit Frist.

Dabei behoben: Ein Kunden-Admin konnte über `/api/admin/users` einen
Benutzer in einem **fremden Mandanten** anlegen. Die Mandanten-ID kam
ungeprüft aus dem Request. Jetzt darf das nur der Superadmin.

**Weitere Funde aus Review und Prüfung**

- **Fremdes Impressum möglich.** Öffentliche Seiten lasen beim erstbesten
  aktiven Mandanten. Neu: `PUBLIC_SITE_TENANT_SLUG` (siehe `.env.example`).
- **Eingehende Rechnungen beim falschen Mandanten.** E-Mails ohne
  Zuordnungsregel gingen an den erstbesten; jetzt nur bei genau einem
  Mandanten, sonst Ablehnung mit Hinweis auf die E-Mail-Routen.
- **Probeberechnung wurde gespeichert.** Ungültige Werte im optionalen Rumpf
  der Abrechnungsperiode wurden verschluckt; gerechnet wurde mit dem alten
  Erlös, gespeichert trotz „nicht speichern". Sechs Routen prüfen jetzt.
- **Datum um Mitternacht.** Acht Formulare setzten „heute" nach UTC — bis
  01:00/02:00 deutscher Zeit also gestern.
- Periodensperre war gerettet, aber im Menü nicht erreichbar; „Mahnwesen"
  stand zweimal im Menü; die Abregelungs-Feature-Flags konnten den
  Admin-Bereich zum Absturz bringen; vier tote Links, zwei tote API-Aufrufe
  (SEPA-Knopf im Posteingang, Anlagenliste der Schadensmeldung).
- Tabellenlisten riefen den Router während des Renderns auf (React-Warnung
  in zehn Listen); die Ersteinrichtung verlor unter Last Eingaben.
- Exporte und Karte halten jetzt ihre Obergrenzen ein; die Energieabrechnung
  stellt zwei statt 2 × n Abfragen; leere `catch`-Blöcke auf dem Server
  35 → 8, jeder verbleibende begründet.
- **Brotkrumen ins Leere.** Jeder Pfadabschnitt war ein Link, auch ohne
  eigene Seite: „Verwaltung", „Berichte" und die Erzeugungsdaten-Ansicht
  endeten in 404, „Setup" bei den Nutzungsentgelten auf einer leeren Seite.
  Solche Abschnitte stehen jetzt als Text da; ein Test gleicht die Liste mit
  dem Dateibaum ab.

**Bugtest der ganzen Anwendung (16 Befunde, alle behoben und nachgetestet)**

Browser- und API-Durchlauf gegen den Produktions-Build: 530 API-Aufrufe,
168 Seiten, Anlegen/Bearbeiten/Löschen in allen Formularen und Dialogen.

- **Sicherheit:** Die Gebühren-Historie eines Stakeholders ließ sich über die
  ID mandantenübergreifend lesen und ändern.
- **Ging gar nicht:** Verpächteranteile (500 auf jedem Pachtvertrag),
  Optimierungs-Maßnahmen speichern (Priorität als Text statt Zahl), PPA
  (Knöpfe ohne Funktion, Modulschalter wurde nie ausgeliefert), GIS-Import
  per Dateiauswahl, Monatssätze pflegen (keine Oberfläche).
- **Ging nur halb:** Störungsende nachtragen, wiederkehrende Rechnung
  bearbeiten (leeres Formular), Rechnungsentwurf ohne Adresse speichern,
  Fondszugriff des Superadmins für andere Mandanten.
- **Fehlende Knöpfe:** Bearbeiten beim Pachtvertrag, Kostenstellen, Löschen
  bei Erzeugungsdaten, Kontakten, Budgets, Posteingang; Gemeinden bearbeiten.
- **Meldungen und Texte:** Validierungsfehler auf Deutsch mit Feldname statt
  „Too big: expected string…“; Pachtabrechnung sperrt Jahre vor der
  Inbetriebnahme; Brotkrumen übersetzt; rund 540 ausgeschriebene Umlaute
  korrigiert; 180 Symbolknöpfe mit Namen für Screenreader.
- **Wächter-Tests:** Knöpfe ohne Aktion, Symbolknöpfe ohne Namen, Brotkrumen
  ohne Übersetzung, abgefragte aber nie ausgelieferte Feature-Schalter.

### August 2026 — Stabilisierung, UI-Überarbeitung, Admin-Tests

Der Monat hat weniger gebaut als geprüft. Das Ergebnis war unangenehm: mehrere
Ketten, die als fertig galten, waren unterbrochen — und zwar so, dass es im
Betrieb nicht auffällt.

**Fünf Ausfälle, die niemand gemeldet hätte**

- **Mahnwesen war vollständig ausgefallen.** Die Kandidatenabfrage filterte mit
  `{ dunningHold: null }` auf ein nicht-nullbares Feld; Prisma 7 wies daraufhin
  die *ganze* Abfrage ab. Jeder Aufruf endete in HTTP 500 — Kandidatenliste wie
  Mahnlauf. TypeScript sah es nicht, weil die generierten Filter-Typen `null`
  erlauben.
- **SCADA-Kette unterbrochen.** Die Monatsaggregation brach bei jedem Aufruf mit
  einem SQL-Fehler ab (derselbe Ausdruck in SELECT und GROUP BY erzeugte über
  Prisma zwei verschiedene Platzhalter). Der Import fing den Fehler und meldete
  PARTIAL. Die Zehn-Minuten-Werte wurden gespeichert, aber **nie zu einem
  Monatswert verdichtet** — und der ist der Verteilschlüssel der Erlösverteilung.
- **Dieselbe Abstimmung galt je nach Ansicht als angenommen oder abgelehnt.**
  Die Auszählung existierte dreimal (Portal, Verwaltung, Beschlussprotokoll) und
  die Fassungen wichen voneinander ab: Enthaltungen zählten mal zur
  Mehrheitsgrundlage, mal nicht.
- **Dokumente lieferten immer die erste Fassung.** Herunterladen und Vorschau
  riefen die Wurzel der Versionskette auf. Wer einen berichtigten Vertrag
  hochlud, bekam weiter den alten.
- **Eine global zugewiesene Rolle liess sich nicht entziehen.** Der Administrator
  bekam „Fehler beim Entfernen der Rolle" — und der Benutzer behielt seine
  Rechte.

**Weitere Funde**

- Beide Import-Assistenten waren unbenutzbar (`.nullable()` auf optionalen
  Zuordnungsfeldern)
- Verzugstage wurden nach UTC gezählt statt nach dem lokalen Kalendertag — im
  Nachtfenster ein Tag zu wenig, und nächtliche Läufe fallen genau hinein
- Ein SCADA-Import ohne Anlagenzuordnung schob das Wasserzeichen vor: die Tage
  wurden nie wieder gelesen, auch nicht nach dem Nachtragen der Zuordnung
- Kennzahlen über Listen summierten die geladene Seite statt des Bestands —
  „Windparks 20" war die Seitengrösse, tatsächlich 93
- Parks jenseits der ersten 100 waren nicht abrechenbar (Auswahlfeld mit fester
  Obergrenze bei 117 Parks)
- 23 rohe Übersetzungsschlüssel standen in der Oberfläche
- Zeichensatz-Reparatur galt nur für Shapefiles, nicht für CSV

### Added

- **Eigentümer und Bewirtschafter am Flurstück** — der Eigentümer hing bisher nur
  am Pachtvertrag; ein Flurstück in der Akquise hatte keinen. Der Bewirtschafter
  (Landwirt) kam gar nicht vor, obwohl ihn Bauarbeiten und Flurschäden treffen.
  Mit Miteigentumsquoten und Zeiträumen.
- **Favoriten in der Seitenleiste**, mit eigenen Gruppen und persönlich
  ausblendbaren Bereichen. Die Systemnavigation ordnet nach Sachgebieten, Arbeit
  läuft quer dazu.
- **„Das braucht Ihre Aufmerksamkeit"** auf dem Dashboard statt elf
  Bestandszahlen
- **Detailgrad-Schalter** für alle Tabellen (kompakt/normal, über eine
  CSS-Variable, wirkt auf alle 169 Listen)
- **Admin- und Superadmin-Tests** — Rollen, Mandanten, Steuersätze,
  Systemeinstellungen und Zugriffsschutz. Vorher lief die gesamte Suite als ein
  einziger Superadmin; dass jemand irgendwo *ausgesperrt* wird, war nie geprüft.

### Changed

- Filter über Listen liegen hinter einer Schaltfläche, gesetzte Filter bleiben
  als entfernbare Marken sichtbar
- Navigationsgruppen sind zugeklappt bis auf die aktive, dazu „Zuletzt besucht"
- Kennzahlkarten kappen keine Zahlen mehr; das Raster leitet die Spaltenzahl aus
  der Mindestbreite ab
- 55 Pakete aktualisiert (Radix-Set, React 19.2.8, TipTap, recharts, Playwright).
  `sharp` ist jetzt deklariert statt zufällig über Next mitzukommen, und auf
  0.35.3 wegen vier libvips-CVEs auf unserem Weg.
- `bullmq` auf `~5.79.2` festgehalten: 5.81 baut die Queue-Typparameter um, 64
  Typfehler im Job-System
- **TypeScript bleibt auf 6.x** — `@typescript-eslint` unterstützt TS 7 in keiner
  veröffentlichten Fassung, und `next build` bricht damit ab. Siehe
  `docs/ABHAENGIGKEITEN.md`.

### Removed

- Vier tote Dateien (1.186 Zeilen), die niemand mehr importierte
- `graphify-out/` aus der Versionsverwaltung (18 MB, 70 Dateien) — erzeugtes
  Artefakt, das nach Tagen ohnehin überholt ist

---

### Added — Juli 2026: Audit-Programm

Zehn Audits (Rechenkorrektheit, Prozessketten, Randfälle, Regressionen, tote
Funktionalität, Worker/Queues, SCADA-Abrechnungskette, Bedienaufwand, fehlende
Funktionen, Gesamtbild), abgearbeitet in sieben Wellen. Die Berichte liegen unter
`docs/archiv/`.

- **Gemeindebeteiligung nach § 6 EEG** — Gemeinden als Stammdatensatz, Anlagen
  zuordnen, Berechnung, Vereinbarungen erfassen und abrechnen, CSV für den
  Steuerberater (Wellen 5a–5d)
- **Kirchensteuer und Freibetrag je Person** statt pauschal
- **Kapitalertragsteuersätze einstellbar**, Jahreslänge, eine Datumsausgabe
- **Anteilsübertragung** mit stichtagsgenauer Ausschüttung
- **Großkomponenten-Register** je Anlage
- **Regulatorik-Stammdaten** und Meldefristen
- **Zeichnungsprozess** mit GwG-Legitimation
- **Gesellschafterversammlung** als eigener Vorgang
- **Portfolio-Cockpit** Park × Jahr
- **Marktprämie**, anzulegender Wert, negative Preise
- **Bankanbindung** mit automatischem Kontoabruf
- **Worker-Service** im Portainer-Stack
- **DataTable** und gestaltete Leerzustände
- **Konventions-Sperren** statt eines Migrations-PR: Zahlen, die nur sinken
  dürfen, statt hunderter Dateien in einem Zug

---

### Added — Juni 2026 UX-Wellen + R-1 bis R-11

Phase 19: vollständige Umsetzung des `docs/REDESIGN-KONZEPT-2026-06.md` (R-1 bis R-11),
zusätzlich 5 Audit-Ideen (A–E) aus dem Audit 2026-06-26.

**REDESIGN-KONZEPT R-11 SEPA-Wizard** (Commit `4b8effe`)
- 4-Step-Wizard mit eigener URL pro Step (`/buchhaltung/sepa/new/step-{1..4}`)
- State persistiert in localStorage über Refresh + Step-Wechsel (`useSepaWizardState`)
- StepIndicator-Component mit Done-Steps klickbar zurück
- Step 1: Multi-Select-Liste SENT-Rechnungen mit Suche + Summary-Footer
- Step 2: Bank-Konto als Radio-Cards + Date-Picker (default heute+2 Werktage)
- Step 3: 2-Spalten-Summary + Rechnungs-Liste vor Submit
- Step 4: Auto-Submit (Single-Fire-Guard via useRef + module-level Ref), AWV-Warnings,
  XML-Download, 4-Augen-Hinweis mit Link zu /admin/approvals
- Button "Neuen SEPA-Lauf erstellen" in der Bestehen-Liste
- i18n (~35 Keys) in DE/EN/DE-Personal

**Audit-Ideen A + B** (Commit `ace90f2`)
- Zentrale Status-Label-Lib (`src/lib/status-labels.ts`) mit 6 Enum-Mappings
  (Invoice, IncomingInvoice, Contract, Approval, Turbine, Vote)
- StatusBadge-Component (Icon + Farbe + i18n) — Showcase in Inbox
- System-Health-Indicator (Dot im Header, polled `/api/health` alle 60s,
  document.hidden-aware, ping-Animation nur on "down")

**Audit-Ideen C + D + E** (Commit `5da9e3e`)
- Permission-Why-Tooltip: `usePermissionGate` + `<PermissionGate>` Wrapper —
  disabled-Buttons zeigen "Du brauchst `xxx:yyy` für diese Aktion".
  Showcase: Approval-Card Reject/Approve.
- Multi-User-Presence (MVP via Polling): neues `EntityPresence`-Model,
  3 API-Routes (POST heartbeat / GET others / DELETE leave), 30s-Polling,
  Banner "Lisa M. sieht sich das gerade auch an" auf Contract-Detail-Page.
- Daily-Digest-E-Mail: opt-in per User (`dailyDigestEnabled` / `dailyDigestLastSentAt`),
  BullMQ-Cron 08:00, Worker mit Idempotenz-Check (skip wenn heute schon gesendet),
  Settings-Toggle, **Dry-Run-Default** (`DIGEST_DRY_RUN=false` für Live aktivieren).

**Glasmorphismus-Foundation + Layout-Polish** (Commits `ace90f2`, `c68797b`)
- Phase 18 (Glasmorphismus-Theme) abgeschlossen: `.ui-glass` Toggle in Settings,
  Body-Gradient (Light + Dark), `.card-surface` Utility, Print-Override,
  `prefers-reduced-transparency`-Override, nested-Cards kein Doppel-Blur.
- Layout-Polish: Dialog, AlertDialog, Popover, DropdownMenu (+SubContent)
  alle mit `card-surface`. Tooltip, Select, DatePicker-Calendar bewusst opak.
- Per-Instance Opt-out via `data-ui-surface="opaque"` für Form-dichte Dialogs.

**Audit-Marker-Cleanup + Permissions-Fix** (Commit `789328c`)
- 16 Files mit Block-Audit-Markern aus früheren Wellen bereinigt (32 Marker raus,
  alle WHY-Kommentare bleiben).
- Permissions 2-Pane Sticky-Footer-Fix: `sticky bottom-0 lg:static` für mobile
  Viewports (Save-Button vorher unsichtbar wenn Permission-Matrix gescrollt).

**CI/CD-Workflows wiederhergestellt** (Commit `dc7043a`)
- `.github/workflows/ci.yml`, `deploy.yml`, `permissions-drift.yml` waren in
  Welle 7a (Commit `43fca3d`) versehentlich mitgelöscht worden, ohne dass
  die Actions-Page aufzeigte. Aus `43fca3d~1` restored, unverändert.

**Lint-Cleanup** (Commit `9abdcb0`)
- 8 → 0 Warnings: 4× apiError-Konvention für echte Error-Returns,
  2× bewusste Opt-outs für "Failure ist 200" Test-Routen (file-level disable
  mit Begründung), 5× unused Imports entfernt, 1× img-Avatar mit per-line
  disable + Begründung (36px-Avatar, Next/Image-Overhead nicht sinnvoll).

### Removed — Juni 2026

- `docs/IMPLEMENTATION_STRATEGY.md` (Stand 26.02.2026) — die Strategie war auf
  7 Features ausgerichtet (K1 Ausschüttungsmodul, A1 Leistungskurven-Analyse,
  A2 Komponenten/Wartung, K3 Redispatch 2.0, A4 Echtzeit-Status-Map,
  U1 Mobile Inspektion, I2 SEPA-XML Sammel-Lastschriften) die strategisch
  nicht mehr geplant sind. Die in der Datei dokumentierten **fertigen** Features
  (K2 Serienbriefe, U2 Benachrichtigungs-Center, Paperless, Onboarding,
  Park-Wizard, Per-Turbine Pacht-Overrides, Cookie-Settings, Scrollbar-Theming,
  Dashboard-Footer) sind in `docs/ROADMAP.md` (Phase 14) als FERTIG dokumentiert.

### Added — April 2026 Audit-Refactor

- **Structured API errors** (`src/lib/api-errors.ts`) — `apiError(code, status, opts)` helper with 25 stable error codes (NOT_FOUND, FORBIDDEN, VALIDATION_FAILED, etc.). Response format now `{ code, error, details? }` for client-side i18n.
- **Client-side error translator** (`src/lib/api-error-client.ts`) — `translateApiError(res, t)` parses structured errors and returns localized messages via `useTranslations("apiErrors")`.
- **Centralized config modules:**
  - `src/lib/config/redis.ts` — `getBaseRedisOptions()` shared by cache, queue, and rate-limit (no more 3× duplicated URL parsing)
  - `src/lib/config/pagination.ts` — `PAGE_SIZE_DEFAULT/LARGE/DROPDOWN/CSV_EXPORT/MAX` (env-overridable)
- **`apiErrors` i18n namespace** — 25 keys in all 3 message files (de, en, de-personal)

### Changed — April 2026 Audit-Refactor

- **All 474 API routes refactored** to use `apiError()` (~1960 replacements, -4756 lines net via collapsing multi-line error returns)
- **Internal helpers migrated** — `api-utils.ts` (`badRequest`, `notFound`, `forbidden`, `serverError`, `handleApiError`), `auth/withPermission.ts`, `auth/apiKeyAuth.ts`, `rate-limit.ts` all return via `apiError()` internally. Result: 252 indirect callers automatically benefit from structured errors.
- **`apiError()` extended** with optional `headers` parameter for rate-limit `Retry-After` support.
- **i18n converted** ~110 components to next-intl in 2 waves (~280 toast calls + dialogs + form labels). All toasts/dialogs/forms/buttons/tables now translated.
- **i18n converted** ~72 dashboard pages (Contracts, Funds, Documents, Energy, Admin, GIS, Inbox, Portal, Service-Events, etc.). Pages are ~95% i18n-complete; remaining are redirect stubs.
- **Mahngebühren bug fixed** — `billing.worker.ts` now reads `reminderFee1/2/3` from `TenantSettings` instead of hardcoded 5/10€ (overrode tenant config).
- **Skonto defaults** in `invoices/new` now load from `TenantSettings.defaultSkontoPercent/Days` instead of hardcoded.
- **Seed passwords** — `prisma/seed.ts` now reads from `SEED_SUPERADMIN_PASSWORD` / `SEED_DEMO_ADMIN_PASSWORD` env vars (defaults remain for dev).
- **Backup script hardened** — `scripts/verify-backup.sh` no longer falls back to `devpassword`; requires `POSTGRES_PASSWORD` explicitly.

### Removed — April 2026 Audit-Refactor

- **Dead code** `src/lib/cache/api-cache.ts` (in-memory cache, never imported anywhere)
- **21 unused imports** across API routes (mostly `apiLogger as logger` left over from API-Refactor, `z` in leases routes, `handleApiError` in onboarding, etc.)
- **Several unused types/constants** — `DeliverBody`, `OperationalTaskStatus`, `ParkAvailRow`, `VALID_ROLES`, `eventTypeKeys`, `cellToString`
- **7 unused `(err)` parameters** in catch blocks (anomalies page) — replaced with bare `catch {}`

### Fixed — April 2026 Audit-Refactor

- **All 72 ESLint warnings** — codebase now reports 0 errors, 0 warnings
  - 32× `t` missing in useCallback/useEffect dep arrays (i18n migration follow-up)
  - 21× unused vars / imports
  - `service-events/page.tsx`: `events` array wrapped in `useMemo` (prevented stale dep arrays)
  - `admin/roles/page.tsx` + `RoleManagement.tsx` + `load-config-dialog.tsx`: `fetchData` converted to `useCallback`
  - `virtual-table.tsx`: TanStack Virtual library incompatibility suppressed with documented `eslint-disable-next-line`
- **2 React Compiler errors** in energy import pages — `validateAndSelectFile` `useCallback` dependency missing `t`

### Added

- **E2E Test Suite** — 247 Playwright tests across 19 files, 3 browsers (Chromium, Firefox, WebKit)
- **Responsive Design Overhaul** — mobile, tablet, and desktop layouts across the entire application
- **UX-Paket** — loading skeletons, error boundaries, bulk actions, inline editing
- **Predictive Maintenance** — degradation analysis, fault prediction via SCADA analytics
- **Weather Forecast** — 7-day forecast integration via Open-Meteo API per park location
- **PPA Management** — Power Purchase Agreement CRUD with status workflow
- **Solar & Storage** — support for solar parks and battery storage assets
- **Investor Reports** — quarterly investor PDF reports with modular sections
- **B2C UI Polish** — 15 measures including typography, contrast, onboarding wizard, mobile nav
- **Design System Document** — 773-line design system specification
- **Command Palette** — Cmd+K live search with keyboard navigation
- **Filter Feedback** — visual filter indicators with active filter count
- **Widget Visibility** — per-role dashboard widget configuration
- **Notification Deadlines Tab** — deadline tracking in notification center
- **Three-language system** — Deutsch (formell), Deutsch (Du), English
- **Fund-specific SMTP** — individual email sending per Gesellschaft
- **VirtualTable component** — virtualized rendering for 500+ row tables
- **Import validation** — client-side validation for CSV/Excel imports
- **API cache infrastructure** — Redis-backed response caching
- **Health check & offline indicator** — system health monitoring, offline detection, slow-query logging
- **SSO/OIDC login** — Authentik integration via NextAuth provider

### Changed
- **Design System Compliance** — 343 files updated to match design tokens (loading.tsx, error.tsx, EmptyState, Badge variants)
- **Code Audits** — 15 systematic audits completed, all findings resolved:
  - Audit 2: Performance optimizations (N+1 queries)
  - Audit 3: Zod validation + TypeScript fixes
  - Audit 6: Error handling gaps closed
  - Audit 7: N+1 query optimizations
  - Audit 8: 13 accessibility issues fixed
  - Audit 9: API response format standardized, `parsePaginationParams()` in 32 routes, `handleApiError()` in 114 routes, status colors centralized
  - Audit 10: .env.example updated
  - Audit 14: API response format standardized
  - Audit 16: Circular dependency auth/permissions resolved
- **Major package upgrades** — Next.js 16, React 19, Prisma 7, Tailwind CSS 4, Zod 4, Recharts 3, Node.js 24
- **SWR to React Query migration** — all 35 data-fetching files migrated to useQuery/useApiQuery
- **Admin sidebar consolidation** — 26 to 15 entries with tabbed pages
- **Accounting sidebar consolidation** — 18 to 8 entries with lazy-loaded tabs
- **Sidebar restructured** — 9 top-level groups (Windparks, BF, Grundstuecke, Kommunikation, Berichte as separate groups)
- **Dashboard** — widget tile grid with free positioning, system font
- **Brand color** — warm navy palette (primary light `#335E99`, dark `#598ACF`)
- **Console.error replaced** — structured pino logger in 14 locations
- **Dead code removal** — 2 unused hooks, 2 unused exports, 1 unused package (swr)
- **Hardcoded values centralized** — security and config constants extracted

### Fixed
- **E2E test stability** — auth timeouts, serial-to-parallel execution, strict-mode violations (.or() chains removed)
- **ESLint cleanup** — warnings reduced from 108 to 0, JSX in try/catch, unused vars, setState-in-effect
- **Security hardening** — XSS fixes, IDOR fixes, cookie security, Excel injection prevention, tenant isolation in 6+ API routes
- **GIS bugs** — polygon disappearing after save (race condition), create-panel not shown (reducer bug), state overwrite bugs, dark mode, coordinate search
- **Cookie secure:true on HTTP** — broke auth completely on local network deployments
- **Prisma 7 migration issues** — config file, URL handling, JSON null filters, db push flags
- **Dashboard error display** — error messages now shown in production (not just dev)
- **Fund distribution rounding** — compensation for rounding errors in distribution calculations
- **Invoice decimal serialization** — Prisma Decimal string concatenation fixed to Number addition
- **Invoice MwSt display** — grouped by item tax rates instead of invoice-level 0%
- **LegalForm duplication** — +/& normalization in 5 PDF templates
- **Sidebar system group** — superadmin menu restored after consolidation
- **Onboarding banner** — setState in useEffect error resolved
- **Recharts 3 TypeScript errors** — all chart components updated
- **Redis noeviction policy** — compact pino logs in production

## [0.5.0] — 2026-03-28

### Added
- **GIS Module** — Leaflet map, plot/cable drawing, layer management, tile switching, coordinate search, Shapefile import, area report, lease status colors, buffer zones, heatmap, annotations CRUD, plot split/merge/bulk API
- **QGIS Integration** — 7-step import wizard, project import, template export, roundtrip (export + re-import with update), layer color and transparency configuration
- **Document Explorer** — virtual folder structure, ZIP download, Steuerberater export, drag & drop upload
- **Market Value Comparison** — SMARD API (BnetzA), monthly averages, bar chart EEG vs. market price
- **Design Overhaul** — sidebar navy, header branding, KPI spacing, landing page (hero, trust bar, CTAs, footer badges), marketing video upload
- **Admin Consolidation** — 26 to 15 sidebar entries, 5 tabbed pages, 14 redirect stubs
- **Full-Stack Security Audit** — XSS fix, IDOR fixes, cookie security, Excel injection, soft-delete
- **Soft-Delete** — deletedAt for Park, Fund, Lease, Contract, Document via Prisma Extension
- **Notes field** — free-text notes on Park and Turbine models

### Fixed
- **Cookie secure:true** on HTTP breaking auth
- **GIS critical bugs** — create-panel, polygon persistence, reducer state overwrites
- **Fund distribution rounding** compensation
- **Document Explorer API** bugs from test audit

## [0.4.0] — 2026-03-15

### Added
- **Lexware Features Phase 1-4** — EUER, GuV, cost center report, budget comparison, quotes with status workflow (DRAFT to INVOICED), liquidity planning, OCR re-trigger, multibanking (bank account CRUD, CSV parser), ZM/EU reporting (BZSt XML export)
- **Backup Service** — TimescaleDB-compatible, daily/weekly/monthly cron, retention 7/4/3, on-demand via Docker profile
- **n8n SCADA Integration** — API endpoints for file upload and import trigger, PowerShell upload script, Windows scheduled task, n8n workflow

### Changed
- **Accounting sidebar** — 18 to 8 entries with tab pages and lazy loading
- **16 granular feature flags** for upselling

## [0.3.0] — 2026-03-08

### Added
- **Buchhaltungspaket** (all 4 phases) — SKR03 chart of accounts, auto-booking, SuSa, BWA, UStVA, bank import, dunning, SEPA XML, depreciation (AfA), cash book, DATEV export, annual closing
- **DSGVO Art. 15+17** — data export and account deletion
- **Demo Request** — `/register` marketing page with API endpoint
- **Paperless-ngx Addon** — feature-flag-controlled, API client, BullMQ queue/worker, 7 API routes, browser page, sync button, auto-archive hooks

### Changed
- **Brand color** — warm navy palette applied across CSS vars, charts, sidebar dark mode

### Fixed
- **PDF layout** — address block spacing (DIN 5008), sender line duplication
- **Invoice detail** — MwSt grouping by item tax rates, Prisma Decimal serialization
- **LegalForm duplication** — +/& normalization in 5 templates
- **CRM** — contact edit dialog and API extension
- **Invoices** — sortable column headers (number, type, sender, recipient, date, amounts, status)

## [0.2.0] — 2026-02-25

### Added
- **Dashboard Grid System** — 12-column grid, react-grid-layout, widget registry, default layouts
- **Energy/SCADA** — Enercon WSD/UID file import, 22 file types, anomaly detection, power curve, wind rose
- **RBAC** — role-based access control with granular permissions
- **Fund Hierarchy** — parent/child fund relationships
- **i18n** — German + English with next-intl
- **Security Audit** — comprehensive security review and fixes

### Changed
- **Spring cleaning** — 24 files deleted, -7,959 lines of dead code, 3 unused npm dependencies removed
