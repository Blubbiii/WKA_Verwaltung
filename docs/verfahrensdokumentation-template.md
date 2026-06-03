# Verfahrensdokumentation (GoBD §145 AO)

**Mandant:** {{TENANT_NAME}}
**Geschäftsjahr:** {{FISCAL_YEAR}}
**Stand:** {{GENERATED_AT}}
**WindparkManager-Version:** {{APP_VERSION}}
**Anzahl aktive Nutzer:** {{USER_COUNT}}
**Anzahl Mandanten gesamt:** {{TENANT_COUNT}}

---

## 1. Allgemeine Beschreibung des DV-Systems

**Produkt:** WindparkManager (WPM) — kaufmännisches Verwaltungssystem für Windpark-Betreibergesellschaften.

**Aufgabenbereich:**
- Stammdatenverwaltung (Personen, Flurstücke, Pachtverträge, Anlagen)
- Energiedaten-Erfassung (SCADA-Import) und Abrechnung (Direktvermarktung / Netzbetreiber)
- Buchhaltung nach SKR03/SKR04 (HGB-konform)
- Ausschüttungsverwaltung an Gesellschafter
- Vertrags- und Dokumentenmanagement
- Portal-Zugang für Pächter und Gesellschafter

**Technische Plattform:**
- Application: Next.js 16.2.1 / Node.js 20 / Docker-Container
- Datenbank: PostgreSQL 16 (Single-Instance, repliziert über Volume-Backup)
- Cache/Queues: Redis 7 (BullMQ Workers)
- Hosting: On-Premise, Server 192.168.178.101 (Portainer-managed)

**Verantwortliche Stelle:** {{TENANT_NAME}}, {{TENANT_ADDRESS}}
**Ansprechpartner Fachseite:** {{TENANT_CONTACT_EMAIL}}

---

## 2. Berechtigungskonzept

Rollen-basiert (RBAC) + Attribut-basiert (ABAC für Fund-Scoping):

| Rolle | Permission-Scope |
|-------|------------------|
| Superadmin | Mandantenübergreifend, alle Permissions |
| Admin (Tenant) | Vollzugriff innerhalb des Mandanten |
| Buchhaltung | Buchungen, Rechnungen, Settlements |
| Lesezugriff | Read-only auf zugewiesene Funds |
| Portal-Pächter | Eigene Verträge + Stammdaten |
| Portal-Gesellschafter | Eigene Beteiligungen + Ausschüttungen |

**Authentifizierung:** NextAuth v5 mit JWT-Sessions (24h), Passwort-Hashing via bcrypt (12 Rounds).
**Impersonation:** Superadmin-Funktion mit lückenloser AuditLog-Erfassung (`impersonatedById`).

→ Vollständige Permission-Matrix: Siehe Admin → Rollen → Permissions (`/admin/roles`).

---

## 3. Datenfluss-Diagramm

```
+-----------------+         +------------------+         +---------------+
|  SCADA-Quellen  |  --->   |   n8n / Importer |  --->   |  PostgreSQL   |
|  (Enercon WSD,  |         |   (BullMQ Worker)|         |  (TurbineProd,|
|   Vestas, etc.) |         |                  |         |   Energy DB)  |
+-----------------+         +------------------+         +---------------+
                                                                |
+-----------------+         +------------------+                v
|  Direktvermark- |  --->   |  Settlement-     |         +---------------+
|  ter / NB       |         |  Engine          |  --->   |  Invoice /    |
|  (CSV-Import)   |         |                  |         |  Booking      |
+-----------------+         +------------------+         +---------------+
                                                                |
+-----------------+         +------------------+                v
|  Portal-User    |  <----  |  Next.js API     |  <----  +---------------+
|  (Browser)      |         |  + RBAC/ABAC     |         |  Reports/PDF/ |
+-----------------+         +------------------+         |  DATEV-Export |
                                                         +---------------+
                                     |
                                     v
                            +------------------+
                            |  AuditLog        |
                            |  (Append-Only,   |
                            |   PostgreSQL-    |
                            |   Trigger)       |
                            +------------------+
```

---

## 4. Backup-Konzept

| Komponente | Verfahren | Frequenz | Aufbewahrung |
|------------|-----------|----------|--------------|
| PostgreSQL | `pg_dump` -> verschlüsseltes Volume | Täglich 03:00 | 30 Tage rolling + Monatsende 1 Jahr |
| Dateien (Documents) | rsync Volume-Snapshot | Täglich 03:30 | 30 Tage rolling |
| Redis | nicht gesichert (transient) | n/a | n/a |
| Konfiguration / `.env` | Git (verschlüsselt via SOPS) | Bei Änderung | unbegrenzt |
| Off-Site-Replikat | rclone -> S3-kompatibler Bucket | Wöchentlich | 12 Wochen |

**Restore-Test:** quartalsweise dokumentiert im Operations-Logbuch.

---

## 5. Lösch-Konzept (Retention pro Entity)

| Entity | Aufbewahrungsdauer | Rechtsgrundlage | Verfahren |
|--------|--------------------|-----------------| ----------|
| Rechnungen (Invoice) | **{{RETENTION_INVOICE}} Jahre** | §147 AO, §257 HGB | Soft-Delete + Archiv-Flag |
| Verträge (Contract, Lease) | **{{RETENTION_CONTRACT}} Jahre** | §147 AO | Soft-Delete |
| Buchungen (JournalEntry) | 10 Jahre | §147 AO | Append-Only |
| CRM-Aktivitäten | bis Widerruf / Vertragsende +3 J. | DSGVO Art. 6(1)(f) | Anonymisierung |
| AuditLog | 10 Jahre | §147 AO + GoBD | Append-Only Trigger (siehe §6) |
| Portal-Sessions | 24h Session, 30d Login-Log | DSGVO Art. 5(1)(e) | Auto-Delete |

**Automatisierung:** Täglicher Retention-Cron-Job (`retention-cron.queue.ts`),
Default Dry-Run-Modus (`RETENTION_DRY_RUN=true`).

---

## 6. Audit-Trail

**Tabelle:** `audit_logs`

**Erfasste Aktionen:** CREATE, UPDATE, DELETE, READ (für sensible Endpoints),
LOGIN, LOGOUT, IMPERSONATE, PERMISSION_CHANGE, BANK_DATA_CHANGE.

**Erfasste Felder pro Eintrag:**
- Zeitstempel (createdAt)
- Akteur (userId) + ggf. impersonatedById
- Aktion + Entity-Typ + Entity-ID
- alte/neue Werte (Json-Diff)
- IP-Adresse, User-Agent
- Tenant-Scope

**Append-Only-Garantie:**
- PostgreSQL-Trigger `audit_logs_no_update` und `audit_logs_no_delete`
  blockieren UPDATE/DELETE auf SQL-Ebene.
- Status: {{AUDIT_TRIGGER_STATUS}}
- Migration: `prisma/migrations/manual/audit_log_hardening.sql`
- Dokumentation: `docs/audit-log-append-only.md`

**Boot-Check:** Beim Server-Start prüft `src/lib/audit-trigger-check.ts`
das Vorhandensein der Trigger und loggt Warning bei Fehlen.

---

## 7. Authentifizierung & Identitätsmanagement

**Login-Verfahren:**
- E-Mail + Passwort via NextAuth v5 Credentials-Provider
- Passwort-Hashing: bcrypt, 12 Rounds
- Optional: TOTP-MFA für Admin-Rollen (Feature-Flag)

**Session-Management:**
- JWT-Sessions, signiert mit `AUTH_SECRET` (mind. 32 Bytes Entropie)
- Cookie: `httpOnly`, `sameSite=lax`, `secure` (https only)
- Session-Dauer: 24h, sliding renewal

**Impersonation (Superadmin):**
- Bewusst protokollierte Aktion (jeder Request mit `impersonatedById`)
- Niemals zur Passwort-Übernahme — Audit-Trail-Pflicht
- Auto-Ende der Impersonation nach 1h oder manuellem Logout

**Passwort-Policy:**
- Mindestlänge 12 Zeichen
- Zwangswechsel bei Verdacht / nach Sicherheitsvorfall
- Keine Speicherung von Klartext-Passwörtern (nirgendwo, auch nicht in Logs)

---

## Anhang: Versions-Historie dieses Dokuments

Dieses Dokument wird automatisch aus aktuellem System-Zustand generiert via
`GET /api/admin/verfahrensdokumentation`. Bei jedem Audit oder
Software-Update sollte eine PDF-Kopie als Belegversion archiviert werden.
