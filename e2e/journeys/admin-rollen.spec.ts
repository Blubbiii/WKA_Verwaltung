/**
 * Rollen und Rechte: anlegen, zuweisen, entziehen, löschen.
 *
 * ## Warum es diesen Test bisher nicht gab
 *
 * Der Admin-Bereich hatte einen Rauchmelder — „Seite antwortet mit HTTP < 400
 * und sagt nicht Application error". Das findet einen Absturz und sonst
 * nichts. Ob eine Rolle wirklich entsteht, ob ihre Rechte ankommen, ob ein
 * Entzug wirkt: ungeprüft.
 *
 * Das wiegt schwer, weil Rechte die einzige Sache sind, die **verhindert**,
 * dass jemand etwas tut. Ein Fehler dort fällt im Alltag nicht auf — er fällt
 * auf, wenn jemand etwas sieht, das er nicht sehen sollte.
 *
 * ## Die eiserne Regel dieses Tests
 *
 * **Er fasst die Rolle des eigenen Benutzers niemals an.** Alle Tests laufen
 * als derselbe Superadmin; nähme dieser Test ihm ein Recht und käme nicht
 * dazu, es zurückzugeben, wäre die gesamte Suite ausgesperrt — und zwar auch
 * beim nächsten Lauf, weil die Anmeldung selbst dann nicht mehr reicht.
 *
 * Deshalb legt er sich einen **eigenen Benutzer** an und probiert alles an
 * dem aus. Was er kaputt macht, betrifft nur ihn.
 *
 * ## Was geprüft wird
 *
 * Nicht „ein Aufruf hat 200 geliefert", sondern der Zustand danach: hat der
 * Benutzer die Rolle, und ist sie nach dem Entzug wirklich weg. Ein Entzug,
 * der Erfolg meldet und nichts tut, ist die gefährlichste Möglichkeit von
 * allen.
 */

import { test, expect } from "../support/fixtures";
import { testName } from "../support/run-context";
import { requireOrSkip } from "../support/strict";

interface Rolle {
  id: string;
  name: string;
}

/**
 * Die Detailansicht liefert die Rechte mit Namen, die Liste nur ihre Anzahl.
 * Geprueft wird gegen die Detailansicht: eine Zahl sagt nicht, WELCHE Rechte
 * angekommen sind, und genau darauf kommt es an.
 */
interface RolleMitRechten extends Rolle {
  permissions?: { permission?: { name: string } }[];
}

interface Benutzer {
  id: string;
  email: string;
}

/** Eine Rollenzuweisung, wie sie /api/admin/users/[id]/roles liefert. */
interface Zuweisung {
  roleId: string;
  resourceType: string;
}

/** Rechte, die sich gut prüfen lassen: lesend, ungefährlich, klar benannt. */
const RECHTE = ["parks:read", "turbines:read"];

test.describe("Admin: Rollen und Rechte", () => {
  test("Rolle anlegen, zuweisen, entziehen, loeschen", async ({ page, api }) => {
    test.setTimeout(240_000);

    // --- Die Sicherheitsregel -------------------------------------------
    //
    // Dieser Test darf den ANGEMELDETEN Benutzer niemals anfassen. Alle Tests
    // laufen als derselbe Superadmin; naehme dieser Test ihm ein Recht und
    // kaeme nicht dazu, es zurueckzugeben, waere die ganze Suite ausgesperrt
    // — auch beim naechsten Lauf, weil dann schon die Anmeldung nicht mehr
    // reicht.
    //
    // Geprueft wird ueber die Anmelde-Adresse: der Test legt sich einen
    // eigenen Benutzer mit erzeugter Adresse an, und die kann die eigene
    // nicht sein.
    const ANMELDE_ADRESSE = (process.env.E2E_EMAIL || "admin@windparkmanager.de")
      .toLowerCase();

    // --- Eigener Benutzer zum Ausprobieren --------------------------------
    const mandanten = await api.get<{ data?: { id: string }[] }>("/api/admin/tenants");
    const mandantId = (mandanten.data ?? [])[0]?.id;
    await requireOrSkip(
      Boolean(mandantId),
      "Kein Mandant vorhanden — ohne ihn laesst sich kein Benutzer anlegen",
    );

    const kennung = testName("rollentest").toLowerCase().replace(/[^a-z0-9]/g, "");
    const adresse = `${kennung}@e2e.invalid`;
    expect(
      adresse,
      "Der Pruefbenutzer traegt die Anmelde-Adresse des Testlaufs — dieser " +
        "Test darf die eigenen Rechte niemals anfassen",
    ).not.toBe(ANMELDE_ADRESSE);

    const benutzerRes = await page.request.post("/api/admin/users", {
      data: {
        email: adresse,
        firstName: "E2E",
        lastName: testName("Rollenpruefling"),
        // Nur fuer diesen Lauf, in der Testumgebung. Der Benutzer wird am
        // Ende wieder entfernt.
        password: "E2E-Pruefling-2026!",
        tenantId: mandantId,
        status: "ACTIVE",
      },
    });
    expect(
      benutzerRes.ok(),
      `Benutzer anlegen fehlgeschlagen: HTTP ${benutzerRes.status()}\n` +
        `${await benutzerRes.text()}`,
    ).toBe(true);
    const benutzerRumpf = await benutzerRes.json();
    const benutzer = (benutzerRumpf.data ?? benutzerRumpf) as Benutzer;
    api.track({
      collection: "admin/users",
      id: benutzer.id,
      name: testName("Rollenpruefling"),
    });

    // --- Rolle mit genau zwei Rechten -------------------------------------
    const rollenName = testName("Rolle");
    const rolleRes = await page.request.post("/api/admin/roles", {
      data: {
        name: rollenName,
        description: "Von der Journey-Suite angelegt",
        color: "#335E99",
        permissions: RECHTE,
      },
    });
    expect(
      rolleRes.ok(),
      `Rolle anlegen fehlgeschlagen: HTTP ${rolleRes.status()}\n${await rolleRes.text()}`,
    ).toBe(true);
    const rolleRumpf = await rolleRes.json();
    const rolle = (rolleRumpf.data ?? rolleRumpf) as Rolle;
    api.track({ collection: "admin/roles", id: rolle.id, name: rollenName });

    // Steht sie in der Liste? Die Liste liefert ein rohes Feld, kein
    // { data: [...] } — das ist im Admin-Bereich anders als im Rest der API.
    const rollen = await api.get<Rolle[]>("/api/admin/roles");
    expect(
      rollen.some((r) => r.id === rolle.id),
      "Die angelegte Rolle steht nicht in der Rollenliste",
    ).toBe(true);

    // Die Rechte muessen wirklich an der Rolle haengen. Eine Rolle, die
    // angelegt wird und ihre Rechte verliert, sieht in der Liste richtig aus
    // und wirkt nicht.
    const detail = await api.get<RolleMitRechten>(`/api/admin/roles/${rolle.id}`);
    const rechteNamen = (detail.permissions ?? [])
      .map((p) => p.permission?.name)
      .filter((n): n is string => Boolean(n));
    for (const recht of RECHTE) {
      expect(
        rechteNamen,
        `Das Recht "${recht}" ist an der Rolle nicht angekommen. Eine Rolle ` +
          `ohne ihre Rechte erlaubt nichts — und niemand sieht ihr das an.`,
      ).toContain(recht);
    }

    // --- Zuweisen ---------------------------------------------------------
    const zuweisen = await page.request.post(`/api/admin/users/${benutzer.id}/roles`, {
      data: { roleId: rolle.id, resourceType: "__global__", resourceIds: [] },
    });
    expect(
      zuweisen.ok(),
      `Rolle zuweisen fehlgeschlagen: HTTP ${zuweisen.status()}\n${await zuweisen.text()}`,
    ).toBe(true);

    // Auch hier ein rohes Feld, kein { data: [...] }.
    const nachZuweisung = await api.get<Zuweisung[]>(
      `/api/admin/users/${benutzer.id}/roles`,
    );
    const zugewiesen = nachZuweisung.map((z) => z.roleId);
    expect(
      zugewiesen,
      "Die Rolle wurde zugewiesen, steht aber nicht an dem Benutzer",
    ).toContain(rolle.id);

    // --- Entziehen --------------------------------------------------------
    // Der gefaehrlichste Schritt: ein Entzug, der Erfolg meldet und nichts
    // tut, ist schlimmer als einer, der fehlschlaegt. Beim Fehlschlag sieht
    // man es.
    const entziehen = await page.request.delete(
      `/api/admin/users/${benutzer.id}/roles?roleId=${rolle.id}&resourceType=__global__`,
    );
    expect(
      entziehen.ok(),
      `Rolle entziehen fehlgeschlagen: HTTP ${entziehen.status()}\n${await entziehen.text()}`,
    ).toBe(true);

    const nachEntzug = await api.get<Zuweisung[]>(
      `/api/admin/users/${benutzer.id}/roles`,
    );
    const nochDa = nachEntzug.map((z) => z.roleId);
    expect(
      nochDa,
      `Die Rolle haengt nach dem Entzug weiter am Benutzer. Der Entzug hat ` +
        `Erfolg gemeldet und nichts getan — genau so behaelt jemand Rechte, ` +
        `die ihm genommen wurden, und niemand bemerkt es.`,
    ).not.toContain(rolle.id);
  });

  test("eine Rolle ohne Rechte erlaubt nichts", async ({ page, api }) => {
    test.setTimeout(180_000);

    // Die Gegenprobe. Ohne sie waere nicht zu unterscheiden, ob die
    // Rechtepruefung wirkt oder ob ohnehin alles erlaubt ist.
    const rollenName = testName("Rolle leer");
    const res = await page.request.post("/api/admin/roles", {
      data: { name: rollenName, description: "Ohne Rechte", permissions: [] },
    });
    expect(res.ok(), `Rolle anlegen: ${await res.text()}`).toBe(true);
    const rumpf = await res.json();
    const rolle = (rumpf.data ?? rumpf) as Rolle;
    api.track({ collection: "admin/roles", id: rolle.id, name: rollenName });

    const detail = await api.get<RolleMitRechten>(`/api/admin/roles/${rolle.id}`);
    const rechte = (detail.permissions ?? [])
      .map((p) => p.permission?.name)
      .filter((n): n is string => Boolean(n));
    expect(
      rechte,
      "Eine ohne Rechte angelegte Rolle hat welche bekommen — dann ist nicht " +
        "mehr zu sagen, was eine Rolle eigentlich erlaubt",
    ).toEqual([]);
  });

  test("eine Rolle anklicken oeffnet ihre Detailansicht", async ({ page, api }) => {
    /*
      Gemeldet am 04.08.2026: "unter /admin/roles wenn ich da auf der linken
      seite auf die rolle klicke kommt eine fehlermeldung".

      Zwei Ursachen lagen uebereinander:

      1. Die Detail-Route lieferte kein `_count`, die Seite las es aber
         ungeprueft — `Cannot read properties of undefined`. Die ganze
         Rollenverwaltung landete im Fehler-Auffangnetz.
      2. Ein Hydrierungsfehler aus dem Offline-Hinweis, der React den Baum
         verwerfen liess (siehe offline-indicator.tsx).

      Die uebrigen Tests dieser Datei arbeiten ueber die Schnittstelle und haben
      beides nicht bemerkt: die API war in Ordnung, kaputt war das Zusammenspiel
      von API-Antwort und Seite. Dieser Test klickt deshalb wirklich.
    */
    test.setTimeout(180_000);

    const seitenfehler: string[] = [];
    const abweisungen: string[] = [];
    page.on("pageerror", (e) => seitenfehler.push(e.message.slice(0, 200)));
    page.on("response", (r) => {
      if (r.status() >= 400 && r.url().includes("/api/admin/roles")) {
        abweisungen.push(`HTTP ${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, "")}`);
      }
    });

    // Die Rolle NICHT auf einen Namen festnageln. Wie die Rollen in der
    // jeweiligen Datenbank heissen, ist Sache der Grunddaten — geprueft wird
    // das Anklicken, nicht der Name.
    /*
      `?includeSystem=true` ist Pflicht — und das ist keine Feinheit.

      Fragt ein SUPERADMIN die Rollenliste ohne diesen Schalter ab, setzt die
      Route `where.isSystem = false`: er bekommt nur die selbst angelegten
      Rollen, nicht die des Systems. Ein normaler Admin bekommt an derselben
      Stelle mehr — naemlich System- UND Mandantenrollen. Wer mehr darf, sieht
      weniger; die Seite ruft deshalb `?includeSystem=true` auf.

      Hier stand die nackte Adresse. Lokal fiel das nicht auf: die Datenbank
      hatte noch Rollen aus frueheren Testlaeufen. In der CI wird frisch
      geseedet — dort gibt es keine einzige Nicht-System-Rolle, und die Liste
      kam leer zurueck.

      Die Antwort ist ausserdem ein nacktes Array, nicht `{ data: [...] }`.
      Beide Formen kommen im Haus vor.
    */
    const liste = await api.get<Rolle[] | { data?: Rolle[] }>(
      "/api/admin/roles?includeSystem=true",
    );
    const rollen = Array.isArray(liste) ? liste : (liste.data ?? []);
    expect(
      rollen.length,
      "Die Rollenliste ist leer oder hat eine unerwartete Form — dann sagt " +
        "dieser Test nichts ueber das Anklicken einer Rolle aus",
    ).toBeGreaterThan(0);
    const ziel = rollen[0];

    await page.goto("/admin/roles");
    const eintrag = page.getByText(ziel.name, { exact: true }).first();
    await eintrag.waitFor({ timeout: 30_000 });
    await eintrag.click();

    /*
      Anker ist das Namensfeld ueber seine `id`: das gibt es NUR in der
      Detailansicht, und die `id` haengt weder an der Sprache noch an den
      Grunddaten.

      Vorher stand hier `input[value="..."]`. Das prueft das ATTRIBUT im
      Markup — React setzt bei einem kontrollierten Feld aber die Property.
      Ob das Attribut daneben auch im DOM landet, haengt daran, wie das Feld
      eingehaengt wurde; lokal war es da, in der CI nicht. Der Test war damit
      von einem Umstand abhaengig, ueber den er gar nichts aussagen wollte.
    */
    const erschienen = await page
      .locator("#role-name")
      .waitFor({ state: "visible", timeout: 20_000 })
      .then(() => true)
      .catch(() => false);

    if (!erschienen) {
      /*
        Nicht bloss "nicht sichtbar" melden. Die Detailansicht kann aus drei
        Gruenden fehlen, und die drei brauchen verschiedene Reparaturen:

        - Das Ladegeruest steht noch → der Abruf haengt oder ist gescheitert.
          Die Seite faellt bei einem Fehler in `catch` zurueck und laesst das
          Geruest stehen; sichtbar wird der Fehler nur als kurze Meldung.
        - Der Leerzustand steht noch → der Klick ist gar nicht angekommen.
        - Das Fehler-Auffangnetz → die Seite ist abgestuerzt.

        Ohne diese Unterscheidung sagt ein CI-Fehlschlag nur, dass etwas fehlt.
      */
      const geruest = await page.locator(".animate-shimmer-bg").count();
      const sichtbar = (
        await page.locator("main").innerText().catch(() => "")
      )
        .replace(/\s+/g, " ")
        .slice(0, 400);

      throw new Error(
        `Nach dem Klick auf "${ziel.name}" erscheint die Detailansicht nicht.
` +
          `Ladegeruest-Elemente: ${geruest}
` +
          `Abgewiesene Aufrufe: ${abweisungen.join(" | ") || "(keine)"}
` +
          `Seitenfehler: ${seitenfehler.join(" | ") || "(keine)"}
` +
          `Sichtbarer Text: ${sichtbar}`,
      );
    }

    // Und es ist wirklich die angeklickte Rolle. `toHaveValue` liest die
    // Property — das ist der Wert, den der Nutzer im Feld stehen sieht.
    await expect(
      page.locator("#role-name"),
      "Die Detailansicht zeigt eine andere Rolle als die angeklickte",
    ).toHaveValue(ziel.name, { timeout: 10_000 });

    // Nur SICHTBAREN Text pruefen. `body.textContent()` enthaelt auch die
    // RSC-Nutzlast in den <script>-Bloecken — und darin steht der Text des
    // Fehler-Auffangnetzes immer, auch wenn es gar nicht angezeigt wird. Diese
    // Pruefung schlug damit erst falsch-positiv an.
    await expect(
      page.getByText("Ein Fehler ist aufgetreten"),
      `Das Anklicken einer Rolle fuehrt in das Fehler-Auffangnetz.
` +
        `Seitenfehler: ${seitenfehler.join(" | ") || "(keine)"}`,
    ).toBeHidden();

    expect(
      seitenfehler.filter((f) => /Hydration|hydrat/i.test(f)),
      "Hydrierungsfehler: Server und Browser rendern Verschiedenes. React " +
        "verwirft dann den Baum — auf manchen Seiten sichtbar als Fehlerseite.",
    ).toEqual([]);
  });
});
