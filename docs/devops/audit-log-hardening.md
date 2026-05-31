# AuditLog DB-Manipulationsschutz (GoBD §147)

## Problem

Standardmäßig hat unser App-Datenbank-User (`wpm`) volle CRUD-Rechte auf alle Tabellen, also auch auf `audit_logs`. Das heißt: Eine kompromittierte App-Session, ein böswilliger Admin, oder ein Bug könnte AuditLog-Einträge **nachträglich verändern oder löschen** — was den gesamten Audit-Trail wertlos macht.

GoBD §147 verlangt Manipulationssicherheit (»Unveränderbarkeit«) für alle aufzeichnungspflichtigen Belege und ihren Audit-Trail. Bei einer Betriebsprüfung würde ein offener Schreibzugriff auf `audit_logs` sofort als Mangel gewertet.

## Lösung

Strikte DB-Rollen-Trennung:

| Rolle | Berechtigung auf `audit_logs` | Wer/Was nutzt sie |
|-------|--------------------------------|-------------------|
| `wpm` (App-User) | **SELECT + INSERT only** | Normale Applikation (Next.js, Worker) |
| `wpm_retention` (separater Cron-User) | **SELECT + DELETE** | Nur Retention-Service nach 10 Jahren |
| `postgres` (DBA) | **alles** | Nur manuelle Eingriffe, dokumentiert |

So kann die App neue Einträge anlegen, aber bestehende **niemals** ändern oder löschen — auch nicht versehentlich oder im Angriffsfall.

## Deployment

### Einmaliges Setup auf Proxmox

```bash
# Im Postgres-Container ausführen (NICHT im App-Container)
docker exec -i windparkmanager-postgres-1 psql -U postgres -d windparkmanager \
  < prisma/migrations/manual/audit_log_hardening.sql
```

**Wichtig:** Der `wpm`-User in der SQL-Datei muss zum tatsächlichen DB-User passen (siehe `docker-compose.yml` → `POSTGRES_USER`).

### Verifikation

```bash
docker exec -it windparkmanager-postgres-1 psql -U postgres -d windparkmanager -c \
  "SELECT grantee, privilege_type FROM information_schema.table_privileges
   WHERE table_name = 'audit_logs' AND grantee = 'wpm';"
```

Erwartete Ausgabe: **nur `SELECT` und `INSERT`**, kein `UPDATE`, `DELETE`, `TRUNCATE`.

### Funktions-Test nach Deployment

1. App neu starten, eine Aktion ausführen die einen AuditLog-Eintrag erzeugt (z.B. Invoice editieren)
2. Im UI prüfen: Eintrag erscheint in `/admin/audit-logs`
3. Im Postgres versuchen, einen Eintrag zu ändern:
   ```sql
   -- Als wpm-User: muss fehlschlagen mit "permission denied for table audit_logs"
   UPDATE audit_logs SET action = 'CHANGED' WHERE id = '...';
   ```

## Retention-Service Anpassung (für die 10-Jahre-Frist)

Der bestehende `runRetentionPurge()` in [src/lib/retention/retention-service.ts](../../src/lib/retention/retention-service.ts) müsste für AuditLog-Purges einen separaten Prisma-Client mit `wpm_retention`-Credentials nutzen:

```ts
// Pseudo-Code (nicht aktuell implementiert):
const retentionPrisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_RETENTION } },
});
await retentionPrisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
```

Aktuell ist das nicht implementiert — der App-User darf AuditLog gar nicht mehr löschen, daher müssen Retention-Purges manuell oder via separatem Cron-Job mit eigenem User erfolgen. Das ist beabsichtigt (Need-to-Know-Prinzip).

## Rollback

Falls die Hardening unerwartet etwas bricht (sollte nicht passieren, da die App nur SELECT+INSERT macht):

```sql
GRANT UPDATE, DELETE, TRUNCATE ON audit_logs TO wpm;
```
