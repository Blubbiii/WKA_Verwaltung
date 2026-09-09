/**
 * Wächter für vier Fehler, die eine Debug-Sitzung am 09.09.2026 zutage
 * gefördert hat. Sie haben nichts miteinander zu tun außer ihrer Art: alle
 * vier sahen im Alltag nach nichts aus.
 *
 * 1. (entfallen — /buchhaltung gibt es nicht mehr, das Modul wurde ausgebaut)
 * ALT: `/buchhaltung` gab es nicht. Die Navigation führt acht Gruppen, sieben
 *    zeigen auf eine echte Seite — diese eine auf eine Adresse, die mit 404
 *    antwortete. In der Seitenleiste fiel es nicht auf, weil eine Gruppe mit
 *    Unterpunkten als Schaltfläche gerendert wird und nicht als Verweis.
 *
 * 2. `/portal/proxies` stürzte für jeden Benutzer ohne verknüpftes
 *    Gesellschafterprofil ab. Die Route lieferte im Sonderfall
 *    `{ grantedProxies, receivedProxies }` statt `{ granted, received }` —
 *    mit Status 200, also ohne dass eine Fehlerprüfung angeschlagen hätte.
 *
 * 3. Der Beteiligungs-Assistent zeigte als Fehlermeldung den rohen
 *    Übersetzungsschlüssel, weil der Namensraum doppelt davorstand. Sichtbar
 *    nur, wenn man den Assistenten absichtlich falsch ausfüllt.
 *
 * 4. Die Anmeldemaske sagte „Ungültige Anmeldedaten" auch dann, wenn die
 *    Zugangsdaten nie geprüft wurden. Hier steht die Gegenprobe: ein wirklich
 *    falsches Passwort MUSS weiterhin genau diese Meldung bekommen — sonst
 *    hätte die Unterscheidung die andere Richtung kaputtgemacht.
 *
 * Was hier bewusst NICHT steht: die Messung, dass die Redis-Routen bei
 * abgeschaltetem Redis schnell antworten. Sie war der Anlass der Sitzung, sagt
 * aber nur etwas aus, wenn Redis wirklich weg ist — in der CI läuft es. Ein
 * Test, der unter den üblichen Bedingungen gar nichts prüft, gehört nicht in
 * eine Suite: er meldet grün und meint nichts.
 */

import { test, expect } from "../support/fixtures";

test.describe("Behobene Fehler", () => {

  test("die Vollmachten-Seite haelt eine unerwartete Antwort aus", async ({ page }) => {
    test.setTimeout(120_000);
    const ausnahmen: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && /Cannot read properties of undefined/.test(m.text())) {
        ausnahmen.push(m.text().slice(0, 160));
      }
    });

    await page.goto("/portal/proxies");
    await page.waitForTimeout(4000);

    await expect(
      page.getByText("Ein Fehler ist aufgetreten"),
      "Die Vollmachten-Seite landet wieder im Fehler-Auffangnetz",
    ).toBeHidden();
    expect(
      ausnahmen,
      "Zugriff auf ein Feld, das die Antwort nicht enthaelt — genau der " +
        "urspruengliche Absturz",
    ).toEqual([]);
  });

  test("der Beteiligungs-Assistent zeigt echte Fehlertexte", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/funds/onboarding");
    await page.waitForTimeout(2500);

    const weiter = page.getByRole("button", { name: /weiter/i }).first();
    if (await weiter.count()) {
      await weiter.click({ force: true }).catch(() => {});
      await page.waitForTimeout(2000);
    }

    const sichtbar = (await page.locator("main").innerText().catch(() => "")) || "";
    expect(
      /funds\.onboardingWizard/.test(sichtbar),
      "Dem Nutzer steht ein roher Uebersetzungsschluessel als Fehlermeldung " +
        "unter dem Eingabefeld",
    ).toBe(false);
  });

  test("ein falsches Passwort bleibt ein falsches Passwort", async ({ browser }) => {
    /*
      Die Gegenprobe zur neuen Unterscheidung in `lib/auth/index.ts`: ein
      Datenbankausfall wird nicht mehr als falsches Passwort ausgegeben. Der
      umgekehrte Fehler waere genauso schlimm — wer sich wirklich vertippt,
      muss das erfahren und nicht „technische Stoerung" lesen.

      Eigener Browserkontext OHNE gespeicherte Anmeldung: sonst uebernaehme
      der Test die Sitzung der Suite und landete direkt im Dashboard.
    */
    test.setTimeout(120_000);
    const kontext = await browser.newContext({ storageState: undefined });
    try {
      const seite = await kontext.newPage();
      await seite.goto("/login");
      await seite.getByLabel(/e-?mail/i).fill("admin@windparkmanager.de");
      await seite.locator("#password").fill("garantiert-falsch-xyz");
      await seite
        .getByRole("button", { name: /anmelden|einloggen|login/i })
        .first()
        .click();
      await seite.waitForTimeout(6000);

      const text = (await seite.locator("body").innerText().catch(() => "")) || "";
      expect(
        /Ungültige Anmeldedaten/.test(text),
        `Bei falschem Passwort steht nicht mehr "Ungueltige Anmeldedaten" da. ` +
          `Angezeigt wurde: ${text.replace(/\s+/g, " ").slice(0, 200)}`,
      ).toBe(true);
    } finally {
      await kontext.close();
    }
  });
});
