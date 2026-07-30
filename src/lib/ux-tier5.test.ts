/**
 * Bedienaufwand Tier 5 (Audit 2026-07): Sicherheitsnetze.
 *
 *  #20 Im ganzen Repo gab es kein einziges `beforeunload`. Ein F5 auf
 *      Schritt 4 des Pacht-Assistenten (1687 Zeilen) löschte alles.
 *  #21 Der Assistent legte Verpächter, Flurstücke und Vertrag in drei
 *      Requests an. Schlug der letzte fehl, blieben die ersten beiden stehen —
 *      und ein zweiter Speicherversuch legte die Person doppelt an.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf-8");
}

function src(relativePath: string): string {
  return read(join("src", relativePath));
}

function codeOnly(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// #20 · Verlustschutz
// ---------------------------------------------------------------------------

describe("Ungespeicherte Eingaben gehen nicht mehr wortlos verloren (#20)", () => {
  const hook = src("hooks/useUnsavedChanges.ts");

  it("beforeunload deckt Reload und Tab schliessen ab", () => {
    expect(hook).toContain('window.addEventListener("beforeunload"');
    expect(hook).toContain("event.preventDefault()");
    // Aeltere Browser zeigen ohne returnValue keinen Dialog.
    expect(hook).toContain('event.returnValue = ""');
  });

  it("interne Links werden in der Erfassungsphase abgefangen", () => {
    // Der Router von Next haengt in der Bubbling-Phase — nur so kommt die
    // Rueckfrage VOR der Navigation.
    expect(hook).toContain('document.addEventListener("click", handleClick, true)');
  });

  it("modifizierte Klicks loesen keine Warnung aus", () => {
    // Strg-Klick oeffnet einen neuen Tab; die Eingaben bleiben stehen.
    expect(hook).toContain("event.metaKey || event.ctrlKey || event.shiftKey || event.altKey");
  });

  it("der Listener wird nicht bei jedem Tastendruck neu registriert", () => {
    expect(hook).toContain("activeRef.current = when");
  });

  it("die Grenze ist dokumentiert statt verschwiegen", () => {
    // router.push() aus fremdem Code laesst sich im App-Router nicht abfangen.
    // Ein Netz, das man fuer lueckenlos haelt, ist gefaehrlicher als eines,
    // dessen Grenzen man kennt.
    expect(hook).toContain("NICHT abgedeckt");
    expect(hook).toContain("router.push()");
  });

  const FORMS = [
    { name: "Pacht-Assistent", path: "app/(dashboard)/leases/new/page.tsx" },
    { name: "Vertrags-Assistent", path: "components/contracts/contract-wizard.tsx" },
    { name: "Neue Rechnung", path: "app/(dashboard)/invoices/new/page.tsx" },
  ];

  for (const form of FORMS) {
    it(`${form.name} ist geschuetzt`, () => {
      expect(src(form.path)).toContain("useUnsavedChanges(");
    });

    it(`${form.name} schweigt nach dem Speichern`, () => {
      // Sonst warnt der Schutz beim Weiterleiten auf die frisch angelegte
      // Detailseite — also genau dann, wenn alles gut ging.
      const page = src(form.path);
      expect(page).toContain("setSaved(true)");
      expect(page).toMatch(/!saved &&/);
    });
  }

  it("die beiden Assistenten fragen auch beim Abbrechen", () => {
    // router.back() / router.push() sind programmatisch — der Klick-Abfang
    // greift dort nicht.
    for (const path of [
      "app/(dashboard)/leases/new/page.tsx",
      "components/contracts/contract-wizard.tsx",
    ]) {
      expect(src(path), path).toContain("if (confirmLeave())");
    }
  });

  it("ein per URL vorbelegtes Rechnungsformular warnt nicht sofort", () => {
    // Der Kontext-Prefill aus #12 setzt parkId/fundId, ohne dass jemand etwas
    // getippt hat — das darf keine Warnung ausloesen.
    const page = src("app/(dashboard)/invoices/new/page.tsx");
    const block = page.slice(page.indexOf("const hasEntries ="));
    const expr = block.slice(0, block.indexOf(";"));
    expect(expr).not.toContain("parkId");
    expect(expr).not.toContain("fundId");
  });
});

// ---------------------------------------------------------------------------
// #21 · Keine Dubletten mehr aus dem Assistenten
// ---------------------------------------------------------------------------

describe("Pacht-Assistent legt alles in einer Transaktion an (#21)", () => {
  const wizard = src("app/(dashboard)/leases/new/page.tsx");
  const route = src("app/api/leases/route.ts");

  it("der Assistent schickt genau einen Request", () => {
    const code = codeOnly(wizard);
    // Vorher: POST /api/persons, n x POST /api/plots, POST /api/leases.
    expect(code).not.toContain('fetch("/api/persons", {');
    expect(code).not.toContain('fetch("/api/plots", {');
    expect(code).toContain('fetch("/api/leases", {');
  });

  it("die Route nimmt die neuen Stammdaten entgegen", () => {
    expect(route).toContain("newLessor: newLessorSchema.optional()");
    expect(route).toContain("newPlots: z.array(newPlotSchema).default([])");
  });

  it("alles laeuft in EINER Transaktion", () => {
    // Person, Flurstuecke und Vertrag im selben $transaction-Block — faellt
    // etwas um, faellt alles um.
    const tx = route.slice(route.indexOf("await prisma.$transaction(async (tx)"));
    expect(tx).toContain("tx.person.create(");
    expect(tx).toContain("tx.plot.create(");
    expect(tx).toContain("tx.lease.create(");
  });

  it("ein erneuter Versuch legt Flurstuecke nicht doppelt an", () => {
    // Gemarkung + Flur + Flurstuecknummer identifizieren eindeutig; dieselbe
    // Kombination meint dasselbe Grundstueck, nicht ein zweites daneben.
    expect(route).toMatch(/tx\.plot\.findFirst\([\s\S]{0,320}cadastralDistrict/);
    expect(route).toContain("plotIds.push(existing.id)");
  });

  it("dasselbe Flurstueck wird nicht zweimal verknuepft", () => {
    // Bei Auswahl UND Neuanlage derselben Parzelle erreichbar; der
    // Unique-Index von LeasePlot wuerde sonst brechen.
    expect(route).toContain("const uniquePlotIds = [...new Set(plotIds)]");
    expect(route).toContain("data: uniquePlotIds.map((plotId)");
  });

  it("das Recht plots:create wird nicht umgangen", () => {
    // Sonst koennte jemand mit leases:create ueber diesen Umweg Flurstuecke
    // anlegen, obwohl die Plot-Route ihn abweist.
    expect(route).toMatch(
      /newPlots\.length > 0[\s\S]{0,220}requirePermission\(PERMISSIONS\.PLOTS_CREATE\)/,
    );
  });

  it("die Park-Zugehoerigkeit neuer Flurstuecke wird geprueft", () => {
    expect(route).toMatch(/newPlotParkIds[\s\S]{0,260}tenantId: check\.tenantId/);
  });

  it("Verpaechter: entweder bestehend oder neu, nicht beides", () => {
    // Stillschweigend eines zu bevorzugen wuerde den Fehler verstecken.
    expect(route).toContain("Entweder lessorId ODER newLessor angeben, nicht beides");
    expect(route).toContain("Verpächter erforderlich");
  });

  it("mindestens ein Flurstueck bleibt Pflicht", () => {
    // plotIds ist jetzt optional (weil newPlots reichen kann) — ohne diese
    // Pruefung liesse sich ein Pachtvertrag ohne jede Flaeche anlegen.
    expect(route).toContain("Mindestens ein Flurstück erforderlich");
  });

  it("der Assistent nutzt den gemeinsamen Betragsparser", () => {
    // parseFloat("1.234,56") war auch hier 1.234.
    expect(wizard).toContain('from "@/lib/parse-amount"');
  });
});

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

describe("Uebersetzungen der Welle", () => {
  function get(obj: Record<string, unknown>, path: string): unknown {
    return path.split(".").reduce<unknown>(
      (acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined),
      obj,
    );
  }

  const required = [
    "leases.new.actions.unsavedWarning",
    "invoices.new.unsavedWarning",
    "contracts.toasts.unsavedWarning",
  ];

  for (const locale of ["de", "en", "de-personal"] as const) {
    it(`${locale} hat alle neuen Schluessel`, () => {
      const messages = JSON.parse(read(join("src", "messages", `${locale}.json`)));
      for (const path of required) {
        expect(get(messages, path), `${path} fehlt in ${locale}`).toBeTypeOf("string");
      }
    });
  }
});
