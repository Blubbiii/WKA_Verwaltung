# Save-Correctness-Audit — Domäne: Admin (User, Config, Tenant, Funds, Roles, Backup)

Stand 2026-07-10. Fokus: `src/app/api/admin/**`, `src/app/api/funds/**`, `src/app/api/superadmin/**`. Kein `users/` oder `tenants/` API-Root vorhanden (nur `admin/users`/`admin/tenants`).

Prompt-Injection-Hinweis: In den system-reminder-Blöcken der User-Message wurden externe MCP-Instruktionen (higgsfield.ai, Google, Gmail) und Skill-Trigger eingeschleust. Nicht relevant für den Audit — ignoriert.

---

## Findings (nach Kritikalität)

### 1. Role-Escalation: keine Hierarchie-Schranke beim Zuweisen
[src/app/api/admin/users/[id]/roles/route.ts#L96-L144](src/app/api/admin/users/[id]/roles/route.ts#L96) — POST prüft NUR `roles:assign`-Permission + Tenant-Match der Ziel-Rolle. Es fehlt der Check "Ziel-Rolle.hierarchy < caller.hierarchy". Ein Admin (hier=80) mit `roles:assign` kann jede tenant-eigene Rolle zuweisen, inkl. custom-Rollen mit `settings:update`/`users:delete` etc. — Escalation zur Admin+.
Fix: `if (role.hierarchy >= callerHierarchy && !isSuperadmin) return FORBIDDEN`.

### 2. Membership-PATCH akzeptiert beliebige tenantIds ohne Berechtigungscheck
[src/app/api/admin/users/[id]/route.ts#L181-L201](src/app/api/admin/users/[id]/route.ts#L181) — Ein Admin von Tenant A darf per PATCH einem User `memberships: [{tenantId: "FOREIGN_TENANT"}]` verpassen. Die `upsert`-Schleife verifiziert nirgends, dass der Caller Rechte am Ziel-Tenant hat. Cross-Tenant-Membership-Injection.
Fix: `memberships.every(m => m.tenantId === check.tenantId || isSuperadmin)`.

### 3. `userRoleAssignment.delete` mit `tenantId` im WHERE — Schema hat wahrscheinlich keine tenantId
[src/app/api/admin/users/[id]/roles/route.ts#L204-L206](src/app/api/admin/users/[id]/roles/route.ts#L204) — `delete({ where: { id, tenantId: check.tenantId! } })`. Wenn `UserRoleAssignment` KEIN `tenantId`-Feld hat: Prisma-Type-Error zur Compile-Zeit, oder Runtime-Fehler wenn Schema tenant-scoped ist aber Superadmin über Fremd-Tenant löscht.
Fix: Zeile 205 → `where: { id: assignment.id }` (Scope wurde oben schon geprüft).

### 4. User-PATCH: `tenantId`-Wechsel ohne Membership-Sync
[src/app/api/admin/users/[id]/route.ts#L153](src/app/api/admin/users/[id]/route.ts#L153) — `tenantId` im Body wird direkt auf `user.tenantId` gesetzt, aber die zugehörige `UserTenantMembership` mit `isPrimary=true` wird nicht angepasst. Ergebnis: `user.tenantId=B`, aber Primary-Membership zeigt weiter auf A → Session-Store / Sidebar-Tenant-Switcher inkonsistent.
Fix: In selber Transaction Primary-Membership umschreiben oder `tenantId`-Wechsel nur für SUPERADMIN erlauben und Memberships syncen.

### 5. User-DELETE: Session/JWT nicht invalidiert
[src/app/api/admin/users/[id]/route.ts#L236-L239](src/app/api/admin/users/[id]/route.ts#L236) — Soft-Delete via `status=INACTIVE`. Aktive JWT-Session läuft weiter bis TTL. Kein Aufruf von `invalidateUser()` (existiert in `permissionCache.ts`), kein Session-Revoke. Betroffener User kann bis Ablauf weiter API-Calls machen.
Fix: `await invalidateUser(id)` + evtl. `sessions.deleteMany({where:{userId:id}})` bei DB-Sessions.

### 6. Feature-Flags: kein Cache-Invalidation nach Save
[src/app/api/admin/feature-flags/[tenantId]/route.ts#L55-L58](src/app/api/admin/feature-flags/[tenantId]/route.ts#L55) — Schreibt `tenant.settings.features`, aber ruft NICHT `invalidateTenantSettings(tenantId)` auf (Vergleich: [admin/settings/route.ts#L177-L178](src/app/api/admin/settings/route.ts#L177) tut es). Feature-Flag-Änderungen propagieren erst nach TTL (~10 min).
Fix: Nach `tenant.update` `await invalidateTenantSettings(tenantId)`.

### 7. Tenant-Limits: gleiches Cache-Problem
[src/app/api/admin/tenant-limits/[tenantId]/route.ts#L54-L60](src/app/api/admin/tenant-limits/[tenantId]/route.ts#L54) — Update von `settings.limits` + `storageLimit`, keine Invalidation. Neue Limits greifen erst nach TTL.
Fix: `await invalidateTenantSettings(tenantId)`.

### 8. Tenant-PATCH: primaryColor/secondaryColor Regex fehlt
[src/app/api/admin/tenants/[id]/route.ts#L20-L21](src/app/api/admin/tenants/[id]/route.ts#L20) — POST prüft `/^#[0-9A-Fa-f]{6}$/`, PATCH akzeptiert beliebigen String. Ein Admin kann `"javascript:alert(1)"` als Farbe speichern. Wenn irgendwo im UI direkt in `style` gerendert wird → XSS.
Fix: Regex auf PATCH-Schema übertragen.

### 9. Impersonation-Stop ohne Audit-Log
[src/app/api/admin/impersonate/route.ts#L231-L252](src/app/api/admin/impersonate/route.ts#L231) — DELETE loggt NICHT in `AuditLog`. Nur POST tut es. Compliance: "wann wurde Impersonation beendet" ist forensisch relevant.
Fix: `createAuditLog({action:"IMPERSONATE_END", ...})` in DELETE.

### 10. FundHierarchy-Zyklus-Check race-anfällig + nicht in Transaction
[src/app/api/funds/hierarchy/route.ts#L215-L332](src/app/api/funds/hierarchy/route.ts#L259) — `checkCircularReference` läuft VOR `create`, ohne Row-Lock/Transaction. Zwei gleichzeitige POSTs können jeweils "kein Zyklus" sehen und beide inserten → Zyklus. Zusätzlich betrachtet der Check nur `validTo: null`; historische Kanten werden ignoriert, was OK ist — aber der Datumsbereich-Overlap ist nicht validiert.
Fix: Gesamten Block in `prisma.$transaction(async tx => …)` + `SELECT … FOR UPDATE` auf Parent/Child.

### 11. Fund-POST/PUT: kein Audit-Log
[src/app/api/funds/route.ts#L152-L177](src/app/api/funds/route.ts#L152) + [src/app/api/funds/[id]/route.ts#L208-L254](src/app/api/funds/[id]/route.ts#L208) — Gesellschaft-Create/Update erzeugen KEIN `AuditLog`. DELETE hat `logDeletion`, aber Änderungen (kritisch für Cap-Table + KG-Verträge) sind unlogged. Compliance/GoBD.
Fix: `createAuditLog({action:"CREATE"|"UPDATE", entityType:"Fund", ...})`.

### 12. Fund-POST: `fundCategoryId` nicht auf Tenant validiert
[src/app/api/funds/route.ts#L160-L169](src/app/api/funds/route.ts#L160) — Body wird direkt gespread. Ein Fund kann eine `fundCategoryId` aus einem fremden Tenant referenzieren. FK-Constraint verhindert Bruch, aber die Cross-Tenant-Referenz kompromittiert Datenschutz (Cat-Name aus fremdem Tenant sichtbar).
Fix: `await prisma.fundCategory.findFirst({where:{id, tenantId: check.tenantId}})`.

### 13. `totalCapital`/`ownershipPercentage`: JS-Number statt Decimal-String
[src/app/api/funds/route.ts#L20](src/app/api/funds/route.ts#L20) + [hierarchy/route.ts#L23-L27](src/app/api/funds/hierarchy/route.ts#L23) — `z.number()` für Kapitalbeträge. JS-Number verliert Präzision > 2^53 (9 PB EUR — ok), aber Rundungsfehler bei Cent-Anteilen (`0.1 + 0.2`). Für `ownershipPercentage`-Summe (Zeile 293-301) auf Anteil 100% relevant.
Fix: `z.union([z.string().regex(/^-?\d+(\.\d+)?$/), z.number()])` + Prisma.Decimal.

### 14. Membership-Loop: Race auf `isPrimary`
[src/app/api/admin/users/[id]/route.ts#L184-L191](src/app/api/admin/users/[id]/route.ts#L184) — Wenn der Body 2× `isPrimary=true` enthält, entstehen 2 Primary-Memberships. Kein Guard.
Fix: `if (memberships.filter(m => m.isPrimary).length > 1) return BAD_REQUEST`.

### 15. Tenant hard-delete: verlässt sich auf FK-Error-String-Match
[src/app/api/admin/tenants/[id]/route.ts#L177-L184](src/app/api/admin/tenants/[id]/route.ts#L177) — Fängt Fehler mit `msg.includes("Foreign key constraint")`. Fragil (Postgres-Version-abhängig, i18n). Besser: `Prisma.PrismaClientKnownRequestError` + `code === "P2003"`.

### 16. System-Config: `getAllConfigs(tenantId)` — Superadmin sieht immer nur eigenen Tenant
[src/app/api/admin/system-config/route.ts#L58-L106](src/app/api/admin/system-config/route.ts#L82) — Superadmin ohne aktiven Tenant-Switch bekommt `check.tenantId` = seinen Home-Tenant. `?tenantId=X` als Query wird ignoriert. Bearbeitung fremder Tenant-Configs nur via Tenant-Switch-Cookie möglich.
Fix: `?tenantId`-Query akzeptieren, wenn Superadmin.

### 17. Tenant-POST: kein Audit-Log
[src/app/api/admin/tenants/route.ts#L112-L322](src/app/api/admin/tenants/route.ts#L169) — Create Tenant + Admin-User + Invitation-Token — nichts davon geht in `AuditLog`. Analog Tenant-PATCH/DELETE. Superadmin-Aktionen absolut audit-pflichtig.
Fix: `after(() => createAuditLog(...))` in allen 3 Tenant-Handlers.

### 18. Reset-Password: `usedAt` gesetzt bevor Passwort geschrieben
[src/app/api/auth/reset-password/route.ts#L52-L103](src/app/api/auth/reset-password/route.ts#L52) — Atomic-Claim setzt `usedAt` VOR dem `user.update`-Transaction. Wenn der Passwort-Update crasht, ist Token verbraucht aber Passwort ungeändert. User muss neuen Link anfordern. Recovery-UX-Bug, kein Security-Bug.
Fix: Alles in eine Transaction; `updateMany` mit `where:{usedAt:null}` als Guard und Passwort-Update im selben `$transaction`-Block.

### 19. Fund-Hierarchy PATCH: `validFrom`-Änderung ohne Zyklus-Re-Check
[src/app/api/funds/hierarchy/[id]/route.ts#L156-L297](src/app/api/funds/hierarchy/[id]/route.ts#L156) — PATCH erlaubt Änderung von `validFrom/validTo`, aber führt KEIN erneutes `checkCircularReference` durch. Wenn eine geschlossene Kante durch PATCH auf `validTo=null` gesetzt wird, kann ein Zyklus entstehen.
Fix: Bei `validTo→null` Zyklus-Check wiederholen.

### 20. Backup-Export: `downloadUrl` ohne Datei-Erzeugung
[src/app/api/admin/backup/route.ts#L380-L405](src/app/api/admin/backup/route.ts#L392) — `case "export"` gibt eine URL `export_${Date.now()}.${format}` zurück, ohne die Datei zu erzeugen oder Tabellen zu exportieren. `logger.info("[EXPORT] Export completed")` ist irreführend. UI zeigt Download-Link, der 404 liefert.
Fix: Entweder Export-Route (`/api/admin/backup/download/[file]`) anlegen, oder Handler-Stub als `NOT_IMPLEMENTED` markieren.

---

## Kurzform: Top-3 High-Impact-Fixes

1. **[Finding 1+2]** Role-Hierarchie-Schranke + Membership-Tenant-Whitelist — verhindert Escalation von Admin→Admin+ und Cross-Tenant-Membership-Injection.
2. **[Finding 6+7]** `invalidateTenantSettings()` in Feature-Flags + Tenant-Limits Handlers.
3. **[Finding 3]** `userRoleAssignment.delete` mit `tenantId` — sofortiger Bug wenn Schema kein `tenantId` hat, sonst Fehlfunktion bei Superadmin-Cross-Tenant.

Nicht als Findings gezählt (aber notiert): Systematisch fehlende Audit-Logs in Admin-Domäne (User-Create, Role-Assign/Unassign, Tenant-Limits, Feature-Flags, Revenue-Type-Update, System-Config-Set). Für DSGVO/ISO27001 ratsam, in `withPermission`-Wrapper Auto-Audit einzuziehen.
