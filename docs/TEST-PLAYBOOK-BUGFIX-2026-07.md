# Test-Playbook — Bug-Fix-Sprint 2026-07

Nach Commit `a958395` (53 Fixes über 6 Batches). Automatisierte Verifikation ist grün:
- ✅ Vitest 694/694
- ✅ TSC strict 0 Errors
- ✅ ESLint 0 Warnings
- ✅ Next.js Build clean

**Was diese Datei ist:** Anleitung für manuelle UI-Prüfung nach Docker-Recreate. Struktur = Bug-Nummer → Reproduktions-Schritte → Erwartung. Wenn alle grün → Session erfolgreich.

---

## Vorbereitung

1. Neuen Docker-Build ziehen (Portainer Recreate mit "Pull latest image")
2. Als Test-User + Test-Tenant einloggen (nicht Produktions-Tenant!)
3. **Browser DevTools offen** — Console-Errors und Network-Tab beobachten

---

## 🔥 P0 — Turbine-Excel-Import

**Wo:** `/energy/turbine-import`

1. Excel-Datei mit Turbinen-Produktion vorbereiten (.xlsx oder .xlsm)
2. Datei via Drag&Drop reinziehen
3. **Erwartung:** Preview-Tabelle mit Zeilen erscheint (vorher: 400-Error-Toast)
4. Test mit .xls: **Erwartung:** klare Fehlermeldung "Legacy .xls nicht unterstützt, bitte als .xlsx speichern" (nicht 400)
5. Test mit Umlauten im Dateinamen (`Türk_2025.xlsx`): sollte durchgehen

## 🔴 P1 Data-Fetching — Listen die früher leer waren

Wo jeweils prüfen: **Liste ist gefüllt** wenn DB Daten enthält.

| # | URL | Was war leer |
|---|---|---|
| 1 | `/management-billing/billings` | Abrechnungs-Liste komplett leer |
| 2 | `/invoices/ppa` | PPA-Rechnungen leer |
| 3 | `/energy/scada/anomalies` | Anomalien-Tab leer |
| 4 | `/energy/scada/anomalies` (Park-Filter) | Park-Dropdown leer |

**Pagination-Test:**
| # | URL | Test |
|---|---|---|
| 5 | `/invoices` | Sind mehr als 100 Rechnungen sichtbar wenn DB > 100 hat? |
| 6 | `/leases` | Mehr als 100 sichtbar? |
| 7 | `/contracts` | Mehr als 100 sichtbar? |
| 8 | `/vendors` | Mehr als 200 sichtbar? |
| 9 | `/crm/contacts` | Mehr als 200 sichtbar? |

Bei allen: **noch keine Pagination-UI** (das war bewusst — TODO-Kommentar im Code). Aber Cutoff ist jetzt auf 200 (env-overridable `PAGE_SIZE_BULK_LIST`).

## 🔴 P1 Silent-Failures — Feedback bei Fehlern

Diese Handler haben früher stumm gefailt. Test = **künstlich Fehler provozieren + Toast erscheint**.

### #10-11: UserManagement
**Wo:** `/admin/users` (bzw. wo User-Rollen editiert werden)

1. User bearbeiten → Membership hinzufügen
2. Falls du Backend im Dev-Modus hast, kannst du DB kurz vom Netz nehmen
3. **Erwartung:** Toast "Memberships-Update fehlgeschlagen" (statt stummer Erfolg)

Alternativ: Beobachte Network-Tab beim normalen Save → wenn PATCH nicht 200 kommt, sollte User es sehen.

### #12: SCADA-Anomalien-Actions
**Wo:** `/energy/scada/anomalies`

1. Anomalie öffnen → "Bearbeitet markieren" klicken
2. Netzwerk trennen und nochmal klicken
3. **Erwartung:** Toast "Anomalie konnte nicht als bearbeitet markiert werden" (statt stummer Erfolg)
4. Wiederhole für Resolve, SaveNotes, SaveConfig

### #13: Sidebar-Links Toggle
**Wo:** `/admin/sidebar-links`

1. Toggle einer Nav-Link-Sichtbarkeit
2. **Erwartung:** Toast bei Fehler (statt stummer Rollback)

## 🔴 P1 Race-Conditions

### #14: CRM-Suche Race-Fix + Debounce
**Wo:** `/crm/contacts`

1. Schnell tippen im Suchfeld: "Meier", dann sofort "Müller"
2. **Erwartung:** **NUR** Müller-Ergebnisse (nicht kurz Meier durchflashen)
3. Beobachte Network-Tab: es sollten NICHT bei jedem Tastendruck Requests feuern (300ms Debounce)

### #15: SCADA-Data Race + Timezone
**Wo:** `/energy/scada/data`

1. Anlage A wählen → Daten laden
2. **Bevor die fertig sind:** Anlage B wählen
3. **Erwartung:** Endgültig zeigt Tabelle Daten von B (nicht A)
4. **Silvester-Test:** dateTo = "2025-12-31", dann prüfe ob letzte Records von 31.12 dabei sind (vorher fielen ins nächste Jahr)

### #16: Settlement-Wizard Doppel-Click
**Wo:** `/energy/settlements/new`

1. Wizard bis Step "Berechnung"
2. Auf "Berechnen"-Button **DOPPELT** klicken schnell
3. **Erwartung:** Nur **eine** Settlement wird erstellt (vorher: 2)

### #17: Settlement-Wizard Back-Reset
**Wo:** `/energy/settlements/new`

1. Wizard → Berechnung durchführen
2. "Zurück" klicken → im Confirm-Dialog "Ja, verwerfen"
3. Änderungen an Parametern machen
4. "Weiter" → "Berechnen"
5. **Erwartung:** **NEUE** Settlement mit neuen Werten (vorher: alte Settlement wurde weiterverwendet)

### #18: Notifications-Refetch
**Wo:** `/notifications`

1. Tab "Fristen" — Anzahl merken
2. Anderen Tab öffnen → Frist als erledigt markieren (via API oder Skript)
3. Zurück zu "Fristen"-Tab
4. **Erwartung:** Anzahl aktualisiert sich (vorher: alter Cache)

## 🔴 P1 Wizards & Modals

### #19: SEPA-Wizard-State stale
**Wo:** `/buchhaltung/sepa/new/step-1`

1. Step-1: 2 Rechnungen wählen → weiter zu Step-2
2. Tab schließen
3. **NACH 25h** wieder öffnen (oder: Browser DevTools → Application → localStorage `sepa-wizard-state` → `createdAt` manuell auf `Date.now() - 25*60*60*1000` setzen)
4. **Erwartung:** Wizard leitet zurück zu Step-1 (vorher: 400-Error in Step-4)

### #20: Onboarding Passwort-Dialog
**Wo:** Fund-Onboarding-Wizard, Result-Step (Passwort wird angezeigt)

1. Onboarding durchlaufen bis Passwort im Result-Dialog erscheint
2. **Escape drücken:** Dialog schließt NICHT (vorher: Passwort weg)
3. **Klick auf Overlay:** Dialog schließt NICHT
4. **Klick auf X-Button:** Dialog schließt (explizit) und routet zur Fund-Page
5. **Erwartung:** Passwort ist während Dialog immer sichtbar bis expliziter Close

### #21: Tenant-Onboarding Skip-Warnung
**Wo:** `/admin/tenant-onboarding` (oder wo Onboarding gestartet wird)

1. Step teilweise ausfüllen (z.B. Company-Name eingeben)
2. "Überspringen" klicken
3. Weiter zu Summary
4. **Erwartung:** **Amber Warning-Icon** + Text "Nicht gespeichert" (vorher: grüner Check "Übersprungen")

### #22: partial-cancel Dialog
**Wo:** `/invoices/[id]` → Aktion "Teilstornieren"

1. Dialog öffnen mit Rechnung A
2. Werte ändern
3. Dialog schließen (Cancel)
4. Dialog wieder öffnen mit **anderer** Rechnung B
5. **Erwartung:** Frische Werte von Rechnung B (vorher: alte Werte von A)

### #23: Production-Entry-Dialog Race
**Wo:** `/energy/productions`

1. Tabelle mit mehreren Produktions-Einträgen
2. Zeile A bearbeiten → Dialog öffnet mit Werten A
3. Ohne zu speichern: Dialog zumachen und Zeile B bearbeiten
4. **Erwartung:** Dialog zeigt Werte B korrekt (vorher: turbineId von A blieb)

## 🔴 P1 File-Handling

### #24: SEPA-XML Download (Firefox/Safari!)
**Wo:** `/buchhaltung/zahlungen` → Reiter SEPA

1. **In Firefox oder Safari:** SEPA-Batch generieren + XML herunterladen
2. **Erwartung:** Datei mit Content (vorher: 0-Byte oder Download bricht ab)

### #25: Invoice-Dispatch Downloads (Firefox/Safari!)
**Wo:** `/invoices/dispatch`

1. Print, Batch-Action, Group-Action — jeweils Download testen
2. **Erwartung:** Alle Files kommen komplett an

### #26: Uppy Ordner-Upload Performance
**Wo:** `/energy/scada` — SCADA-V2-Uploader (Feature-Flag `scada-uploader-v2` an)

1. Enercon-Root-Ordner mit 4000+ Files auswählen
2. **Erwartung:** UI reagiert innerhalb 1-2s (vorher: 5-10s hängen)
3. Nur SCADA-Extensions in Liste, Rest in "Verworfen" (batched)

### #27: iOS-Foto Upload
**Wo:** irgendein Documents-Upload (z.B. Lease-Details → Anhänge)

1. iOS-Foto `IMG_0001.JPG` (Uppercase!) drag&droppen
2. **Erwartung:** Upload startet (vorher: abgelehnt)

### #28: PDF-Vorschau
**Wo:** irgendein Dokument mit PDF-Vorschau (`/documents`)

1. PDF öffnen
2. Sofort schließen + gleiches PDF wieder öffnen — dann anderes PDF öffnen
3. **Erwartung:** Alle PDFs rendern konsistent (vorher: sporadisch leerer Viewer)

### #29: Filename mit Umlauten
**Wo:** Bericht mit Umlauten generieren (`Bericht_Süd_2025.pdf`)

1. `/energy/analytics` → Report-Config mit Namen `Süd-Süd` erstellen
2. Report generieren und herunterladen
3. **Erwartung:** Datei heißt `Bericht_Süd_2025.pdf` (vorher: Umlaut ging verloren)

## 🟡 P2 Stale-State

### #30: Kassenbuch-Balance
**Wo:** `/buchhaltung/kassenbuch` → "Tag abschließen"

1. Dialog öffnen: gezählten Betrag `123,00` eingeben
2. Ohne zu speichern: Cancel
3. Berechneter Betrag ändert sich (z.B. neue Buchung angelegt)
4. Dialog wieder öffnen
5. **Erwartung:** Neu berechneter Betrag im Feld (vorher: alter `123,00`)

### #31: Config-Forms Refresh
**Wo:** `/admin/system-admin` → System-Config-Tabs (general/features/weather/paperless/storage/email)

1. Wert ändern → Save → Toast "Gespeichert"
2. **NICHT** F5 drücken
3. **Erwartung:** Formular zeigt gespeicherten Wert (vorher: alter State bis Reload)
4. **Sensitive Felder** (Token/Password): bleiben leer — das ist bewusst so.

### #32: currentYear Jahreswechsel
**Wo:** `/energy`, `/energy/productions`, `/management-billing/billings`

1. Docker-Container schon seit Wochen laufen? (Uptime prüfen)
2. **Silvester-Sim:** Systemzeit auf 1.1.2027 setzen (Docker-Host)
3. Pages neu laden
4. **Erwartung:** currentYear = 2027 in KPIs, nicht altes Jahr (vorher: hardcoded beim Modul-Load)

Alternativ: warten bis 1.1.2027, dann prüfen ohne Redeploy. Wird jetzt automatisch klappen.

---

## 🎯 Wenn alles grün ist

Session war ein Erfolg. Die 53 Bugs waren tatsächlich vorhanden — jetzt gefixt.

## Wenn etwas rot ist

Öffne ein Issue mit:
1. Bug-Nummer aus diesem Playbook
2. Screenshot + Browser-DevTools-Console-Output
3. Reproduktions-Schritte

Ich (oder ein späterer Agent) kann dann gezielt nachlegen.

---

## Nicht abgedeckt (bewusst)

- P3 Findings (Kosmetik, native `confirm()` → AlertDialog, etc.) — opportunistisch später
- Envelope-Migration Backend-side (Billings/PPA/Anomalien senden noch Legacy-Format) — separater PR
- Echte Pagination-UI in den 5 Bulk-Listen — separater UI-Refactor

---

*Commit: `a958395` · Test-Playbook Version 1 · Stand 2026-07-10*
