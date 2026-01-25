# Feature Specifications: WindparkManager (WPM)

## Übersicht der Module

| # | Modul | Priorität | Komplexität |
|---|-------|-----------|-------------|
| 1 | Multi-Tenancy & Admin-Bereich | Hoch | Hoch |
| 2 | Authentifizierung & Autorisierung | Hoch | Mittel |
| 3 | Park- und Anlagenverwaltung | Hoch | Mittel |
| 4 | Gesellschafter-/Kommanditistenverwaltung | Hoch | Hoch |
| 5 | Pacht- und Flächenverwaltung | Mittel | Mittel |
| 6 | Abstimmungssystem | Mittel | Hoch |
| 7 | Dokumentenmanagement | Hoch | Mittel |
| 8 | Abrechnungssystem | Hoch | Hoch |
| 9 | Vertragsmanagement | Mittel | Mittel |
| 10 | Benachrichtigungssystem | Mittel | Mittel |
| 11 | Wetter-Integration | Niedrig | Niedrig |
| 12 | Reporting & Export | Hoch | Mittel |

---

## Modul 1: Multi-Tenancy & Admin-Bereich

### User Stories

**US-1.1**: Als Superadmin möchte ich neue Mandanten anlegen können, damit diese die Plattform nutzen können.

**US-1.2**: Als Superadmin möchte ich Mandanten-Einstellungen (Logo, Farben, Kontaktdaten) verwalten können.

**US-1.3**: Als Superadmin möchte ich mich als beliebiger User einloggen können (Impersonation), um Support zu leisten.

**US-1.4**: Als Mandanten-Admin möchte ich User für meinen Mandanten anlegen und verwalten können.

### Acceptance Criteria

```gherkin
Feature: Mandanten-Verwaltung

Scenario: Neuen Mandanten anlegen
  Given ich bin als Superadmin eingeloggt
  When ich das Formular "Neuer Mandant" ausfülle
  And ich auf "Speichern" klicke
  Then wird ein neuer Mandant erstellt
  And ein Admin-User für diesen Mandanten wird erstellt
  And eine Willkommens-E-Mail wird versendet

Scenario: Mandanten-Branding konfigurieren
  Given ein Mandant existiert
  When ich ein Logo hochlade (max 2MB, PNG/SVG)
  And ich eine Primärfarbe wähle
  Then wird das Branding gespeichert
  And erscheint auf allen Seiten und Dokumenten dieses Mandanten

Scenario: User impersonieren
  Given ich bin als Superadmin eingeloggt
  When ich bei einem User auf "Als User anmelden" klicke
  Then werde ich als dieser User eingeloggt
  And sehe einen Banner "Impersonation aktiv"
  And kann jederzeit zur Superadmin-Ansicht zurückkehren
```

### Edge Cases
- Logo-Upload: Ungültiges Format, zu große Datei, transparenter Hintergrund
- Mandant löschen: Was passiert mit den Daten? (Soft-Delete)
- Impersonation: Audit-Log muss dokumentieren wer wen impersoniert hat

### Datenmodell-Anforderungen
- `tenants`: id, name, slug, logo_url, primary_color, settings (JSONB)
- `tenant_users`: Zuordnung User zu Tenant mit Rolle

---

## Modul 2: Authentifizierung & Autorisierung

### User Stories

**US-2.1**: Als User möchte ich mich mit E-Mail und Passwort anmelden können.

**US-2.2**: Als User möchte ich mein Passwort zurücksetzen können, wenn ich es vergessen habe.

**US-2.3**: Als Admin möchte ich Usern Rollen zuweisen können (Admin, Manager, Viewer).

**US-2.4**: Als User möchte ich nur Daten meines Mandanten sehen können.

### Acceptance Criteria

```gherkin
Feature: Authentifizierung

Scenario: Erfolgreicher Login
  Given ein User-Account existiert
  When ich korrekten Benutzername und Passwort eingebe
  Then werde ich zum Dashboard weitergeleitet
  And meine Session ist für 24h gültig

Scenario: Passwort vergessen
  Given meine E-Mail ist im System registriert
  When ich auf "Passwort vergessen" klicke
  And meine E-Mail eingebe
  Then erhalte ich einen Reset-Link per E-Mail
  And der Link ist 1h gültig

Scenario: Zugriffskontrolle
  Given ich bin als "Viewer" eingeloggt
  When ich versuche einen Datensatz zu bearbeiten
  Then sehe ich eine Fehlermeldung "Keine Berechtigung"
```

### Rollen-Matrix

| Aktion | Superadmin | Admin | Manager | Viewer |
|--------|------------|-------|---------|--------|
| Mandanten verwalten | ✓ | - | - | - |
| User verwalten | ✓ | ✓ | - | - |
| Daten bearbeiten | ✓ | ✓ | ✓ | - |
| Daten ansehen | ✓ | ✓ | ✓ | ✓ |
| Berichte erstellen | ✓ | ✓ | ✓ | - |
| Impersonation | ✓ | - | - | - |

---

## Modul 3: Park- und Anlagenverwaltung

### User Stories

**US-3.1**: Als Verwalter möchte ich Windparks mit allen Stammdaten anlegen können.

**US-3.2**: Als Verwalter möchte ich Windkraftanlagen einem Park zuordnen können.

**US-3.3**: Als Verwalter möchte ich technische Daten der Anlagen erfassen (Typ, Leistung, Nabenhöhe).

**US-3.4**: Als Verwalter möchte ich Service-Ereignisse dokumentieren können.

### Acceptance Criteria

```gherkin
Feature: Windpark-Verwaltung

Scenario: Windpark anlegen
  Given ich bin als Manager eingeloggt
  When ich einen neuen Windpark mit Name, Standort und Inbetriebnahme anlege
  Then wird der Park in der Liste angezeigt
  And ich kann Anlagen hinzufügen

Scenario: Anlage mit Service-Ereignis
  Given eine Windkraftanlage existiert
  When ich ein Service-Ereignis erfasse (Datum, Typ, Beschreibung, Kosten)
  Then wird das Ereignis in der Anlagen-Historie angezeigt
  And die Kosten werden für Abrechnungen berücksichtigt
```

### Datenfelder Windpark
- Name, Kurzbezeichnung
- Standort (Adresse, Koordinaten)
- Inbetriebnahme-Datum
- Betreiber, Eigentümer
- Status (aktiv, stillgelegt)

### Datenfelder Anlage
- Bezeichnung, Seriennummer
- Hersteller, Typ
- Nennleistung (kW)
- Nabenhöhe, Rotordurchmesser
- Inbetriebnahme, Garantie-Ende
- Status

---

## Modul 4: Gesellschafter-/Kommanditistenverwaltung

### User Stories

**US-4.1**: Als Verwalter möchte ich Kommanditisten mit Beteiligungsdaten erfassen können.

**US-4.2**: Als Verwalter möchte ich Beteiligungsübersichten pro Fonds generieren können.

**US-4.3**: Als Kommanditist möchte ich meine Beteiligungen und Ausschüttungen einsehen können.

### Acceptance Criteria

```gherkin
Feature: Kommanditisten-Portal

Scenario: Beteiligungsübersicht anzeigen
  Given ich bin als Kommanditist eingeloggt
  When ich die Beteiligungsübersicht öffne
  Then sehe ich alle meine Beteiligungen
  And die jeweiligen Einlagen und Ausschüttungen
  And aktuelle Kontostände

Scenario: Monatsbericht abrufen
  Given ein Monatsbericht wurde veröffentlicht
  When ich den Bereich "Berichte" öffne
  Then sehe ich alle verfügbaren Monatsberichte
  And kann diese als PDF herunterladen
```

### Datenfelder Kommanditist
- Personen-/Firmendaten
- Einlage (Pflichteinlage, Haftsumme)
- Kontoverbindung
- Kommunikationspräferenzen
- Beteiligungsquote

---

## Modul 5: Pacht- und Flächenverwaltung

### User Stories

**US-5.1**: Als Verwalter möchte ich Flurstücke mit Pachtverträgen erfassen können.

**US-5.2**: Als Verwalter möchte ich Pachtzahlungen planen und dokumentieren können.

**US-5.3**: Als Verwalter möchte ich bei auslaufenden Verträgen benachrichtigt werden.

### Acceptance Criteria

```gherkin
Feature: Pachtverwaltung

Scenario: Flurstück mit Pachtvertrag anlegen
  Given ich bin als Manager eingeloggt
  When ich ein Flurstück erfasse (Gemarkung, Flur, Flurstück)
  And einen Pachtvertrag mit Verpächter, Laufzeit, Pachtzins zuordne
  Then wird das Flurstück in der Karte angezeigt
  And Pachtzahlungen werden automatisch geplant

Scenario: Fristenwarnung
  Given ein Pachtvertrag läuft in 6 Monaten aus
  When das Datum erreicht wird
  Then erhalten alle zuständigen Manager eine E-Mail-Benachrichtigung
```

---

## Modul 6: Abstimmungssystem

### User Stories

**US-6.1**: Als Verwalter möchte ich Gesellschafterbeschlüsse zur Abstimmung stellen können.

**US-6.2**: Als Kommanditist möchte ich online abstimmen können.

**US-6.3**: Als Kommanditist möchte ich Vollmachten für Abstimmungen erteilen können.

**US-6.4**: Als Verwalter möchte ich Abstimmungsergebnisse einsehen und exportieren können.

### Acceptance Criteria

```gherkin
Feature: Online-Abstimmung

Scenario: Abstimmung erstellen
  Given ich bin als Admin eingeloggt
  When ich eine neue Abstimmung erstelle
  And Titel, Beschreibung, Optionen und Frist angebe
  Then werden alle stimmberechtigten Kommanditisten benachrichtigt
  And können bis zur Frist abstimmen

Scenario: Mit Vollmacht abstimmen
  Given Kommanditist A hat Kommanditist B eine Vollmacht erteilt
  When Kommanditist B abstimmt
  Then kann B auch im Namen von A abstimmen
  And beide Stimmen werden gezählt

Scenario: Abstimmung auswerten
  Given die Abstimmungsfrist ist abgelaufen
  When ich die Ergebnisse abrufe
  Then sehe ich Ja/Nein/Enthaltung nach Köpfen
  And Ja/Nein/Enthaltung nach Kapitalanteil
  And kann das Ergebnis als PDF exportieren
```

---

## Modul 7: Dokumentenmanagement

### User Stories

**US-7.1**: Als Verwalter möchte ich Dokumente hochladen und kategorisieren können.

**US-7.2**: Als User möchte ich Dokumente versionieren können (neue Version hochladen).

**US-7.3**: Als User möchte ich ältere Versionen eines Dokuments abrufen können.

**US-7.4**: Als Admin möchte ich ein revisionssicheres Archiv haben.

### Acceptance Criteria

```gherkin
Feature: Dokumentenarchiv

Scenario: Dokument hochladen
  Given ich bin als Manager eingeloggt
  When ich ein Dokument hochlade (PDF, max 50MB)
  And Kategorie, Beschreibung und Zuordnung angebe
  Then wird das Dokument gespeichert
  And im Audit-Log protokolliert

Scenario: Version hochladen
  Given ein Dokument existiert
  When ich eine neue Version hochlade
  Then wird die alte Version archiviert
  And die neue Version als aktuell markiert
  And beide Versionen sind abrufbar

Scenario: Revisionssicherheit
  Given ein Dokument wurde hochgeladen
  Then kann es nicht gelöscht werden (nur archiviert)
  And jeder Zugriff wird protokolliert
```

### Dokumentenkategorien
- Gesellschaftsverträge
- Protokolle
- Gutachten
- Rechnungen
- Genehmigungen
- Korrespondenz
- Monatsberichte

---

## Modul 8: Abrechnungssystem

### User Stories

**US-8.1**: Als Verwalter möchte ich Rechnungen und Gutschriften erstellen können.

**US-8.2**: Als System möchte ich periodische Abrechnungen automatisch generieren.

**US-8.3**: Als User möchte ich Abrechnungen als PDF mit Mandanten-Branding exportieren.

**US-8.4**: Als Kommanditist möchte ich meine Gutschriften einsehen können.

### Acceptance Criteria

```gherkin
Feature: Automatische Abrechnung

Scenario: Monatliche Pachtabrechnung
  Given Pachtverträge mit monatlicher Zahlung existieren
  When der Monatsanfang erreicht wird
  Then werden automatisch Zahlungsanweisungen erstellt
  And per E-Mail an die Buchhaltung gesendet

Scenario: Jahres-Gutschrift für Kommanditisten
  Given das Geschäftsjahr wurde abgeschlossen
  When ich die Ausschüttung berechne
  Then werden Gutschriften pro Kommanditist erstellt
  And mit dem Mandanten-Logo versehen
  And zum Download bereitgestellt
  And per E-Mail versendet
```

### Abrechnungstypen
- Pachtzahlungen (monatlich/jährlich)
- Kommanditisten-Ausschüttungen
- Service-Rechnungen
- Verwaltungsgebühren

---

## Modul 9: Vertragsmanagement

### User Stories

**US-9.1**: Als Verwalter möchte ich Verträge mit Metadaten erfassen können.

**US-9.2**: Als Verwalter möchte ich bei Fristen (Kündigung, Verlängerung) erinnert werden.

**US-9.3**: Als User möchte ich alle Verträge eines Parks/einer Anlage sehen können.

### Acceptance Criteria

```gherkin
Feature: Vertragsfristen

Scenario: Vertragswarnung
  Given ein Vertrag hat eine Kündigungsfrist von 3 Monaten
  And die Frist ist in 4 Monaten
  When das Warndatum erreicht wird (Frist - 1 Monat)
  Then erhalten zuständige Manager eine E-Mail
  And der Vertrag wird im Dashboard hervorgehoben

Scenario: Vertragsübersicht
  Given ich öffne einen Windpark
  When ich den Tab "Verträge" wähle
  Then sehe ich alle zugehörigen Verträge
  And deren Status (aktiv, auslaufend, gekündigt)
```

### Vertragstypen
- Pachtverträge
- Wartungsverträge
- Versicherungen
- Netzanschlussverträge
- Direktvermarktung

---

## Modul 10: Benachrichtigungssystem

### User Stories

**US-10.1**: Als User möchte ich bei wichtigen Ereignissen per E-Mail benachrichtigt werden.

**US-10.2**: Als User möchte ich meine Benachrichtigungspräferenzen einstellen können.

**US-10.3**: Als Admin möchte ich System-Meldungen an alle User senden können.

### Benachrichtigungstypen

| Ereignis | E-Mail | In-App |
|----------|--------|--------|
| Neues Dokument | ✓ | ✓ |
| Neue Abstimmung | ✓ | ✓ |
| Abstimmung endet bald | ✓ | ✓ |
| Vertragsfrist | ✓ | ✓ |
| Neue Gutschrift | ✓ | ✓ |
| System-Meldung | ✓ | ✓ |

---

## Modul 11: Wetter-Integration

### User Stories

**US-11.1**: Als Verwalter möchte ich Wetterdaten für Windpark-Standorte sehen.

**US-11.2**: Als Analyst möchte ich Wetter mit Produktionsdaten korrelieren können.

### Acceptance Criteria

```gherkin
Feature: Wetterdaten

Scenario: Aktuelle Wetterdaten anzeigen
  Given ein Windpark hat Koordinaten hinterlegt
  When ich das Dashboard öffne
  Then sehe ich aktuelle Windgeschwindigkeit und -richtung
  And Temperatur und Wetterlage

Scenario: Historische Daten (optional)
  Given Produktionsdaten wurden importiert
  When ich den Analyse-Bereich öffne
  Then kann ich Produktion vs. Windgeschwindigkeit vergleichen
```

---

## Modul 12: Reporting & Export

### User Stories

**US-12.1**: Als Verwalter möchte ich Monatsberichte generieren können.

**US-12.2**: Als User möchte ich Daten als Excel exportieren können.

**US-12.3**: Als Admin möchte ich PDF-Berichte mit Mandanten-Branding erstellen.

### Export-Formate
- PDF (mit Logo, formatiert)
- Excel (.xlsx)
- CSV (für Datenimport)

### Berichtstypen
- Monatsbericht (Produktion, Erlöse, Kosten)
- Jahresbericht
- Gesellschafterliste
- Beteiligungsübersicht
- Abstimmungsergebnis
- Vertragsübersicht

---

## Audit-Log Anforderungen

### Protokollierte Aktionen
- CREATE: Neuer Datensatz angelegt
- UPDATE: Datensatz geändert (mit Diff)
- DELETE: Datensatz gelöscht/archiviert
- VIEW: Sensible Daten eingesehen (optional)
- EXPORT: Daten exportiert
- LOGIN: User eingeloggt
- IMPERSONATE: Admin hat User impersoniert

### Log-Felder
- Timestamp
- User-ID
- Tenant-ID
- Aktion
- Entität (Tabelle)
- Entitäts-ID
- Alte Werte (JSON)
- Neue Werte (JSON)
- IP-Adresse
- User-Agent
