-- TF-12: Katalog-Dopplung "Buchungen stornieren" auflösen.
--
-- Der Permission-Katalog führte ZWEI Einträge für dieselbe Sache, mit
-- identischem displayName:
--   accounting:reverse          (sortOrder 241, requiresApproval, von der
--                                Storno-Route geprüft, im Seed an die Rolle
--                                "Bearbeiter" vergeben)
--   accounting:journal:reverse  (sortOrder 239, bis Welle 8 von KEINER Route
--                                geprüft)
--
-- Kanonisch ist `accounting:reverse`: es trägt requiresApproval, die bessere
-- Beschreibung (HGB-Verantwortungstrennung) und wird tatsächlich vergeben.
--
-- Diese Migration überträgt zuerst alle Rollenzuweisungen der abgelösten
-- Permission auf die kanonische und entfernt sie danach. Ohne den ersten
-- Schritt würde eine selbst angelegte Rolle, die NUR die abgelöste Variante
-- hält, den Storno-Zugriff verlieren.
--
-- Idempotent: mehrfaches Ausführen ist unschädlich.
--
-- Aufruf:
--   npx prisma db execute --file prisma/migrations/manual/merge_duplicate_reverse_permission.sql --schema prisma/schema.prisma

BEGIN;

-- 1. Zuweisungen übertragen, sofern die kanonische Permission existiert und
--    die Rolle sie nicht schon hat (ON CONFLICT deckt das @@unique ab).
INSERT INTO role_permissions ("id", "createdAt", "roleId", "permissionId")
SELECT
    gen_random_uuid(),
    NOW(),
    rp."roleId",
    canonical."id"
FROM role_permissions rp
JOIN permissions deprecated
    ON deprecated."id" = rp."permissionId"
   AND deprecated."name" = 'accounting:journal:reverse'
JOIN permissions canonical
    ON canonical."name" = 'accounting:reverse'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- 2. Abgelöste Permission entfernen. Die Zuweisungen hängen per
--    onDelete: Cascade daran und verschwinden mit.
DELETE FROM permissions
WHERE "name" = 'accounting:journal:reverse';

COMMIT;

-- Kontrolle nach dem Lauf:
--   SELECT name FROM permissions WHERE name LIKE 'accounting%reverse';
--   -> darf nur noch 'accounting:reverse' liefern.
