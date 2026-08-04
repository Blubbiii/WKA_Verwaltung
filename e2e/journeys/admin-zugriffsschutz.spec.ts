/**
 * Zugriffsschutz: wer keine Rechte hat, kommt nicht hinein.
 *
 * ## Die Lücke, die dieser Test schliesst
 *
 * Die gesamte Journey-Suite meldet sich als **ein einziger Benutzer** an —
 * einem Superadmin. Jeder Test läuft also mit allen Rechten. Damit prüft die
 * Suite zwar, dass Dinge funktionieren, aber nie, dass sie **verhindert**
 * werden.
 *
 * Das ist die gefährlichere Hälfte. Eine Seite, die für einen Sachbearbeiter
 * gesperrt sein müsste, es aber nicht ist, fällt im Alltag nicht auf — sie
 * funktioniert ja. Sie fällt auf, wenn jemand etwas sieht, das ihn nichts
 * angeht, und dann ist es passiert.
 *
 * ## Wie er das macht
 *
 * Er legt einen Benutzer **ohne jede Rolle** an, meldet sich in einem eigenen
 * Browserfenster als dieser an und klopft die Admin-Schnittstellen ab. Jede
 * muss ihn abweisen.
 *
 * Der eigene Kontext ist wesentlich: die Anmeldung der übrigen Tests liegt in
 * `e2e/.auth/user.json` und wird bei jedem Test wiederverwendet. Würde dieser
 * Test sie überschreiben, liefe die restliche Suite als rechtloser Benutzer
 * weiter — und schlüge überall fehl.
 *
 * ## Was „abweisen" heisst
 *
 * 401 oder 403. **Nicht** 500: ein Serverfehler ist keine Abweisung, sondern
 * ein Absturz an der Rechteprüfung — und der sagt nichts darüber, ob der
 * Zugriff verhindert wurde. Auch nicht 200 mit leerer Liste: das wäre eine
 * stille Filterung, bei der niemand merkt, dass gerade jemand Unbefugtes
 * angeklopft hat.
 */

import { test, expect } from "../support/fixtures";
import { testName } from "../support/run-context";
import { requireOrSkip } from "../support/strict";

/**
 * Admin-Schnittstellen, die ein Benutzer ohne Rechte nicht erreichen darf.
 *
 * Bewusst nur LESENDE Aufrufe. Ein Test, der zur Prüfung des Zugriffsschutzes
 * schreibende Aufrufe absetzt, richtet echten Schaden an, sobald der Schutz
 * tatsächlich fehlt — er würde den Fehler nicht nur finden, sondern ausnutzen.
 */
const GESCHUETZT = [
  "/api/admin/roles",
  "/api/admin/users",
  "/api/admin/tenants",
  "/api/admin/tax-rates",
  "/api/admin/audit-logs",
  "/api/admin/tenant-settings",
  "/api/superadmin/system-settings",
] as const;

test.describe("Zugriffsschutz", () => {
  test("ein Benutzer ohne Rollen kommt in keinen Admin-Bereich", async ({
    page,
    api,
    browser,
  }) => {
    test.setTimeout(300_000);

    // --- Einen rechtlosen Benutzer anlegen --------------------------------
    const mandanten = await api.get<{ data?: { id: string }[] }>("/api/admin/tenants");
    const mandantId = (mandanten.data ?? [])[0]?.id;
    await requireOrSkip(Boolean(mandantId), "Kein Mandant vorhanden");

    const kennung = testName("rechtlos").toLowerCase().replace(/[^a-z0-9]/g, "");
    const adresse = `${kennung}@e2e.invalid`;
    const kennwort = "E2E-Rechtlos-2026!";

    const res = await page.request.post("/api/admin/users", {
      data: {
        email: adresse,
        firstName: "E2E",
        lastName: testName("Rechtlos"),
        password: kennwort,
        tenantId: mandantId,
        status: "ACTIVE",
      },
    });
    expect(
      res.ok(),
      `Benutzer anlegen fehlgeschlagen: HTTP ${res.status()}\n${await res.text()}`,
    ).toBe(true);
    const rumpf = await res.json();
    const benutzer = (rumpf.data ?? rumpf) as { id: string };
    api.track({
      collection: "admin/users",
      id: benutzer.id,
      name: testName("Rechtlos"),
    });

    // Sicherstellen, dass er wirklich keine Rolle hat. Ein Benutzer, der beim
    // Anlegen still eine Vorgaberolle bekaeme, wuerde diesen Test wertlos
    // machen — er pruefte dann nichts.
    const rollen = await api.get<{ roleId: string }[]>(
      `/api/admin/users/${benutzer.id}/roles`,
    );
    expect(
      rollen,
      "Der neu angelegte Benutzer hat bereits eine Rolle. Dann prueft dieser " +
        "Test nicht den Zugriffsschutz, sondern nur diese eine Rolle.",
    ).toEqual([]);

    // --- Eigenes Browserfenster, eigene Anmeldung -------------------------
    // OHNE storageState: sonst uebernaehme der Kontext die Anmeldung des
    // Superadmins, und der Test prueefte nichts.
    const kontext = await browser.newContext({ storageState: undefined });
    try {
      const fremd = await kontext.newPage();
      await fremd.goto("/login");
      await fremd.getByLabel(/e-?mail/i).fill(adresse);
      await fremd.locator("#password").fill(kennwort);
      await fremd.getByRole("button", { name: /anmelden|einloggen|login/i }).first().click();

      // Anmeldung muss klappen — der Benutzer ist aktiv, er hat nur keine
      // Rechte. Klappt sie nicht, prueft der Test wieder nichts.
      await expect(
        fremd,
        "Der rechtlose Benutzer konnte sich nicht anmelden — dann sagt " +
          "dieser Test nichts ueber den Zugriffsschutz aus",
      ).not.toHaveURL(/\/login/, { timeout: 20_000 });

      // --- Und jetzt anklopfen -------------------------------------------
      for (const pfad of GESCHUETZT) {
        const antwort = await fremd.request.get(pfad);
        const status = antwort.status();

        expect(
          [401, 403],
          `${pfad} antwortet einem Benutzer OHNE jede Rolle mit HTTP ${status}.\n\n` +
            (status < 400
              ? `Das ist eine Freigabe. Wer keine Rolle hat, darf hier nichts sehen.`
              : status >= 500
                ? `Das ist ein Absturz an der Rechtepruefung, keine Abweisung — ` +
                  `und er sagt nicht, ob der Zugriff verhindert wurde.`
                : `Erwartet ist 401 oder 403.`),
        ).toContain(status);
      }
    } finally {
      // Der Kontext muss weg, auch nach einem Fehlschlag: ein offener
      // Browserkontext haelt den Testlauf am Ende auf.
      await kontext.close();
    }
  });

  test("die Admin-Oberflaeche laesst einen rechtlosen Benutzer nicht hinein", async ({
    page,
    api,
    browser,
  }) => {
    test.setTimeout(300_000);

    // Dieselbe Frage eine Ebene hoeher: nicht die Schnittstelle, sondern die
    // Seite. Eine API, die abweist, waehrend die Seite sich oeffnet und leer
    // bleibt, ist keine Sperre — sie ist ein Hinweis darauf, dass es den
    // Bereich gibt.
    const mandanten = await api.get<{ data?: { id: string }[] }>("/api/admin/tenants");
    const mandantId = (mandanten.data ?? [])[0]?.id;
    await requireOrSkip(Boolean(mandantId), "Kein Mandant vorhanden");

    const kennung = testName("rechtlos ui").toLowerCase().replace(/[^a-z0-9]/g, "");
    const adresse = `${kennung}@e2e.invalid`;
    const kennwort = "E2E-Rechtlos-2026!";

    const res = await page.request.post("/api/admin/users", {
      data: {
        email: adresse,
        firstName: "E2E",
        lastName: testName("Rechtlos UI"),
        password: kennwort,
        tenantId: mandantId,
        status: "ACTIVE",
      },
    });
    expect(res.ok(), `Benutzer anlegen: ${await res.text()}`).toBe(true);
    const rumpf = await res.json();
    const benutzer = (rumpf.data ?? rumpf) as { id: string };
    api.track({
      collection: "admin/users",
      id: benutzer.id,
      name: testName("Rechtlos UI"),
    });

    const kontext = await browser.newContext({ storageState: undefined });
    try {
      const fremd = await kontext.newPage();
      await fremd.goto("/login");
      await fremd.getByLabel(/e-?mail/i).fill(adresse);
      await fremd.locator("#password").fill(kennwort);
      await fremd.getByRole("button", { name: /anmelden|einloggen|login/i }).first().click();
      await expect(fremd).not.toHaveURL(/\/login/, { timeout: 20_000 });

      await fremd.goto("/admin/roles");
      await fremd.waitForTimeout(2500);

      // Entweder umgeleitet, oder eine sichtbare Abweisung. Was NICHT geht:
      // die Rollenverwaltung oeffnet sich und zeigt eine leere Tabelle.
      const adresseJetzt = fremd.url();
      const umgeleitet = !/\/admin\/roles/.test(adresseJetzt);
      const abgewiesen = await fremd
        .locator("body")
        .textContent()
        .then((t) => /keine berechtigung|kein zugriff|nicht berechtigt|403|forbidden/i.test(t ?? ""));

      expect(
        umgeleitet || abgewiesen,
        `Ein Benutzer ohne jede Rolle steht auf ${adresseJetzt} und bekommt ` +
          `keine Abweisung zu sehen. Er sieht damit die Rollenverwaltung — ` +
          `moeglicherweise leer, aber er weiss jetzt, dass es sie gibt und wo.`,
      ).toBe(true);
    } finally {
      await kontext.close();
    }
  });
});
