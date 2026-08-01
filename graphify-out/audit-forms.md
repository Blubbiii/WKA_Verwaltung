# Audit: Formulare & Speichern-Actions (admin / leases / buchhaltung / energy)

Stand: 2026-07-10. Scan-Basis: 58 Client-Component-Files + zugehörige API-Routes.

Grunderkenntnis: die meisten Handler folgen dem etablierten Pattern (preventDefault, try/catch, toast.error, disabled state). Kein Massen-Bug bei `await`, `preventDefault` oder Zod-Payload-Mismatch gefunden. Aber es gibt reale Landminen:

## Findings (Priorität)

### Rot

1. **KassenbuchDailyCloseDialog — stale prop im `useState`-Initialwert**
   [src/components/buchhaltung/KassenbuchDailyCloseDialog.tsx:53](src/components/buchhaltung/KassenbuchDailyCloseDialog.tsx#L53)
   `useState(computedBalance.toFixed(2))` initialisiert nur beim Mount. Öffnet Nutzer den Dialog zum ersten Mal noch bevor Entries geladen sind (0.00) und dann später wieder, wird der Zähler nicht mit dem aktuellen Bilanzwert vor-befüllt.
   Symptom: „Ich hab die Bilanz geändert, aber der Dialog zeigt noch alten Wert." Fix: `useEffect(() => setCountedBalance(computedBalance.toFixed(2)), [computedBalance, open])`.

2. **UserManagement — Memberships-PATCH ohne Response-Check**
   [src/components/admin/UserManagement.tsx:595](src/components/admin/UserManagement.tsx#L595)
   Zweiter `await fetch(... PATCH memberships)` ohne `if (!res.ok)`. User sieht „gespeichert", Memberships wurden aber verworfen.
   Symptom: Multi-Tenant-Membership-Änderungen verschwinden lautlos. Fix: `if (!res.ok) throw new Error(...)`.

3. **UserManagement — DELETE-Result ignoriert vor Re-POST**
   [src/components/admin/UserManagement.tsx:449](src/components/admin/UserManagement.tsx#L449)
   `await fetch(... DELETE)` ohne Prüfung, danach POST für neue Zuweisung. Wenn DELETE 4xx/5xx wirft, entsteht Duplikat oder Scope-Update schlägt inkonsistent fehl.
   Symptom: Rollen-Scope-Änderungen greifen unregelmäßig. Fix: `const delRes = await fetch(...); if (!delRes.ok) throw new Error(...)`.

4. **System-Config-Forms — stale form-state bei prop-refresh**
   [src/components/admin/system-config/general-config-form.tsx:69-81](src/components/admin/system-config/general-config-form.tsx#L69)
   [src/components/admin/system-config/features-config-form.tsx:65-70](src/components/admin/system-config/features-config-form.tsx#L65)
   [src/components/admin/system-config/weather-config-form.tsx:85-90](src/components/admin/system-config/weather-config-form.tsx#L85)
   [src/components/admin/system-config/paperless-config-form.tsx](src/components/admin/system-config/paperless-config-form.tsx)
   [src/components/admin/system-config/storage-config-form.tsx](src/components/admin/system-config/storage-config-form.tsx)
   [src/components/admin/system-config/email-config-form.tsx](src/components/admin/system-config/email-config-form.tsx)
   Alle initialisieren `useState(getConfigValue(...))` nur beim Mount. Nach Save ruft das Formular `onSave()` das parent-`refetch` triggert — die Kinder rendern aber immer noch mit alten local-States. Nutzer sieht „gespeichert", nach Refresh haben Werte-Diff.
   Fix: `useEffect(() => setAppName(getConfigValue("general.app.name") || "..."), [configs])` je Field.

5. **admin/sidebar-links — toggleStatus schluckt Fehler komplett**
   [src/app/(dashboard)/admin/sidebar-links/page.tsx:211-221](src/app/(dashboard)/admin/sidebar-links/page.tsx#L211)
   Wenn `!res.ok`, keine Aktion — kein toast, kein state-rollback. Der Toggle bleibt visuell im alten Zustand (weil setLinks nur bei ok läuft), aber ohne Feedback.
   Symptom: „Ich toggle den Link, nichts passiert." Fix: `else { toast.error(...) }` ergänzen.

### Gelb

6. **admin/email-routes — Save/Delete ohne Error-Toast bei Non-2xx**
   [src/app/(dashboard)/admin/email-routes/page.tsx:121-131](src/app/(dashboard)/admin/email-routes/page.tsx#L121)
   handleDelete: bei `!res.ok` kein toast; nur bei network-throw. handleSave OK, aber DELETE-Path zeigt keinen Fehler. User klickt Löschen, nichts passiert bei 500.
   Fix: `else { toast.error(...); }` einfügen.

7. **energy/scada/anomalies — 4 handler mit „silent catch"**
   [src/app/(dashboard)/energy/scada/anomalies/page.tsx:311-385](src/app/(dashboard)/energy/scada/anomalies/page.tsx#L311)
   `handleAcknowledge`, `handleResolve`, `handleSaveNotes`, `handleSaveConfig` haben `} catch {}` ohne toast.error. Bei 500 bleibt Dialog offen, nichts passiert sichtbar. Kommentar sagt „UI shows saving state" — falsch, Spinner verschwindet ohne Feedback.
   Fix: `toast.error("Fehler beim Speichern")` in catch-Block.

8. **admin/system-admin/backup — Fehler nur als setState, kein Toast**
   [src/app/(dashboard)/admin/system-admin/tabs/backup.tsx:164-170](src/app/(dashboard)/admin/system-admin/tabs/backup.tsx#L164)
   6 handler nutzen `setError(...)` anstatt `toast.error(...)`. Weicht von übrigen Admin-Pages ab; Nutzer erwartet Toast, sieht nur roten Bereich weiter oben. Nicht bug, aber inkonsistent → Beschwerde „nichts passiert nach klick" möglich.

9. **buchhaltung/kassenbuch — handleCreate ohne preventDefault (Dialog, kein form)**
   [src/app/(dashboard)/buchhaltung/kassenbuch/page.tsx:80-103, 196](src/app/(dashboard)/buchhaltung/kassenbuch/page.tsx#L80)
   Kein `<form>`, sondern Button `onClick={handleCreate}` — daher kein full-reload-Risiko. Aber: kein `disabled={saving}` würde ausreichen? Button hat `disabled={saving || !form.description || !form.amount}` — OK. Kein Bug, nur unschön dass es kein Form ist (Enter-Key funktioniert nicht).

10. **admin/sidebar-links, buchhaltung/kontenrahmen — `confirm()` statt AlertDialog**
    [src/app/(dashboard)/admin/kontenrahmen/page.tsx:198](src/app/(dashboard)/admin/kontenrahmen/page.tsx#L198)
    [src/app/(dashboard)/admin/email-routes/page.tsx:122](src/app/(dashboard)/admin/email-routes/page.tsx#L122)
    Native `confirm()` blockiert. Kein Speichern-Bug, aber inkonsistent mit übrigem Design-System (AlertDialog). Falls confirm() in einer async-Kette hängt, kann es zu doppel-klicks kommen.

## Positiv-Befund (kein Bug)

- **energy/production-entry-dialog, settlement-entry-dialog, settlement-wizard**: sauber (preventDefault, try/catch/finally, toast, disabled-Button, refetch).
- **admin/RoleManagement, admin/TenantManagement, admin/webhooks, admin/tax-rates, admin/hgb-system-settings, admin/document-routing**: alles korrekt.
- **leases/usage-fees/[id], leases/usage-fees/setup, leases/LeaseDialogs, PersonEditDialog**: sauber; PersonEditDialog hat sogar korrektes `useEffect([open, person])` für stale-state.
- **Zod-Schema vs. Payload**: energy/settlements POST schema akzeptiert `distributionMode` mit default `"SMOOTHED"` → beide Callsites (settlement-wizard sendet ihn, settlement-entry-dialog sendet ihn nicht) sind valide.
- **API-Route `/api/superadmin/system-settings`** existiert — kein Path-Mismatch obwohl das UI unter `admin/hgb-system-settings` liegt.

## Empfehlung Priorität

1. Fix Findings 1-3 (funktionale Datenverluste) sofort.
2. Fix Finding 4 (system-config stale state) — betrifft alle 6 Config-Tabs, User-verwirrend.
3. Findings 5-7 (silent errors) — Debug-Killer, schnell zu fixen.
