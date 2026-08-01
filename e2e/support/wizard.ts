/**
 * Assistenten durchklicken — ohne zwölfmal dasselbe zu schreiben.
 *
 * Zwölf Assistenten, jeder mit eigenen Feldern. Sie einzeln auszuprogrammieren
 * hiesse zwölf Testdateien, die bei jeder Feldänderung nachgezogen werden
 * müssen — und die deshalb nach dem dritten Umbau niemand mehr pflegt.
 *
 * ## Wie es stattdessen läuft
 *
 * Der Läufer arbeitet mit dem, was auf der Seite steht:
 *
 *  1. Aktuellen Schritt am `aria-current="step"` des Schrittanzeigers ablesen.
 *  2. Alle sichtbaren, leeren Pflichtfelder mit passenden Werten füllen —
 *     Text, Zahl, Datum, Auswahl je nach Typ.
 *  3. Warten, bis „Weiter“ freigeschaltet ist. Bleibt sie gesperrt, ist das
 *     ein Fehlschlag MIT Angabe, welche Felder noch leer sind.
 *  4. Klicken und prüfen, dass der Schrittanzeiger WIRKLICH weitergerückt
 *     ist — nicht nur, dass irgendwo etwas passiert ist.
 *
 * ## Was er bewusst nicht tut
 *
 * Er schliesst nicht ab. Der letzte Klick eines Assistenten erzeugt einen
 * Vorgang — einen SEPA-Zahllauf, eine finalisierte Abrechnung, einen
 * Mandanten. Was davon abgeschlossen wird, entscheidet der einzelne Test und
 * nicht der Läufer.
 *
 * ## Die Grenze dieses Ansatzes
 *
 * Ein generischer Läufer prüft, dass ein Assistent BEDIENBAR ist — nicht, dass
 * er fachlich das Richtige tut. Ein Assistent, der alle Schritte durchläuft
 * und am Ende Unsinn speichert, kommt hier durch. Dafür sind die Abläufe mit
 * echten Werten da (park-lifecycle, invoice-lifecycle). Beides zusammen ergibt
 * das Bild; eines allein täuscht.
 */

import { expect, type Locator, type Page } from "@playwright/test";
import { must } from "./strict";

/** Werte, die der Läufer je Feldtyp einsetzt. */
export interface WizardFillValues {
  text: string;
  number: string;
  date: string;
}

const DEFAULTS: WizardFillValues = {
  text: "E2E-Assistent",
  number: "10",
  // Heute — Vergangenheitsdaten sind bei Rechnungen Pflicht (§ 239 HGB) und
  // stören nirgends.
  date: new Date().toISOString().slice(0, 10),
};

/**
 * Nummer des aktuellen Schritts, 0-basiert. `-1`, wenn es keinen Anzeiger gibt.
 *
 * Zwei Wege, in dieser Reihenfolge:
 *
 *  1. `aria-current="step"` — der saubere Weg, seit der Schrittanzeiger ihn
 *     setzt. Er dient zugleich Bildschirmlesern, die vorher nicht ansagen
 *     konnten, wo man steht.
 *  2. Abgeschlossene Schritte zählen. Der Anzeiger ersetzt die Nummer eines
 *     erledigten Schritts durch ein Häkchen — die Anzahl der Häkchen ist damit
 *     der Index des aktuellen Schritts.
 *
 * Der zweite Weg ist der Rückfall für Instanzen, auf denen das `aria-current`
 * noch nicht ausgeliefert ist. Er hängt an der Darstellung und ist deshalb
 * nicht der bevorzugte — aber er macht diese Tests unabhängig davon, ob gerade
 * schon ausgerollt wurde.
 */
export async function currentStep(page: Page): Promise<number> {
  const items = page.locator('nav[aria-label="Progress"] li');
  const total = await items.count();
  if (total === 0) return -1;

  for (let i = 0; i < total; i++) {
    if ((await items.nth(i).getAttribute("aria-current")) === "step") return i;
  }

  const completed = await items.locator("svg.lucide-check, svg").count();
  return completed >= 0 && completed < total ? completed : -1;
}

/**
 * Anzahl der Schritte laut Anzeiger.
 *
 * Wartet auf den Anzeiger, statt sofort zu zaehlen. Mehrere Assistenten
 * rendern ihn erst nach dem Laden ihrer Daten (`if (loadingData) return …`) —
 * ein sofortiges Zaehlen ergibt dann 0 und sieht aus wie „kein Anzeiger
 * vorhanden".
 */
export async function stepCount(page: Page): Promise<number> {
  const nav = page.locator('nav[aria-label="Progress"]');
  await nav.first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  return page.locator('nav[aria-label="Progress"] li').count();
}

/**
 * Füllt die sichtbaren, leeren Eingabefelder des aktuellen Schritts.
 *
 * @returns Bezeichner der gefüllten Felder — für die Fehlermeldung, falls
 *          „Weiter“ trotzdem gesperrt bleibt.
 */
export async function fillVisibleFields(
  page: Page,
  values: Partial<WizardFillValues> = {},
): Promise<string[]> {
  const v = { ...DEFAULTS, ...values };
  const filled: string[] = [];

  const inputs = page.locator(
    "input:visible:not([type=checkbox]):not([type=radio]):not([type=file]):not([readonly]):not([disabled])",
  );
  const count = await inputs.count();

  for (let i = 0; i < count; i++) {
    const field = inputs.nth(i);
    const existing = await field.inputValue().catch(() => "");
    if (existing) continue; // Vorbelegtes nicht überschreiben.

    const type = (await field.getAttribute("type")) ?? "text";
    const id = (await field.getAttribute("id")) ?? `feld-${i}`;

    const value =
      type === "number" ? v.number : type === "date" ? v.date : v.text;
    await field.fill(value).catch(() => {});
    filled.push(`${id}(${type})`);
  }

  return filled;
}

/** Die Schaltfläche, die einen Schritt weiterführt. */
function nextButton(page: Page): Locator {
  return page.getByRole("button", { name: /^weiter/i }).first();
}

/**
 * Einen Schritt weitergehen — mit Nachweis, dass es wirklich passiert ist.
 *
 * Der Nachweis ist der Schrittanzeiger, nicht ein neues Feld: eine Maske, die
 * sich ändert, ohne dass der Anzeiger mitgeht, ist genauso falsch wie
 * umgekehrt.
 */
export async function goToNextStep(page: Page, wizardName: string): Promise<void> {
  const before = await currentStep(page);
  expect(
    before,
    `${wizardName}: kein Schrittanzeiger gefunden (nav[aria-label="Progress"])`,
  ).toBeGreaterThanOrEqual(0);

  const filled = await fillVisibleFields(page);
  const next = nextButton(page);
  await must(next, `${wizardName}: Schaltflaeche Weiter in Schritt ${before + 1}`);

  await expect(
    next,
    `${wizardName}: Weiter bleibt in Schritt ${before + 1} gesperrt, obwohl ` +
      `${filled.length} Feld(er) gefuellt wurden: ${filled.join(", ") || "keine"}. ` +
      `Vermutlich verlangt der Schritt eine Auswahl, die der Laeufer nicht ` +
      `bedienen kann — dann gehoert dieser Assistent in einen eigenen Test.`,
  ).toBeEnabled({ timeout: 10_000 });

  await next.click();

  await expect
    .poll(() => currentStep(page), {
      message:
        `${wizardName}: Der Schrittanzeiger steht nach dem Klick weiterhin auf ` +
        `Schritt ${before + 1}. Entweder hat der Wechsel nicht stattgefunden, ` +
        `oder der Anzeiger geht nicht mit.`,
      timeout: 10_000,
    })
    .toBe(before + 1);
}

/**
 * Geht bis zum letzten Schritt — ohne abzuschliessen.
 *
 * @returns Der erreichte Schritt (0-basiert).
 */
export async function walkToLastStep(
  page: Page,
  wizardName: string,
): Promise<number> {
  const total = await stepCount(page);
  expect(total, `${wizardName}: kein Schrittanzeiger`).toBeGreaterThan(0);

  for (let i = (await currentStep(page)); i < total - 1; i = await currentStep(page)) {
    await goToNextStep(page, wizardName);
  }
  return currentStep(page);
}

/**
 * Prüft, dass „Zurück“ den vorherigen Schritt zeigt UND die Eingabe erhält.
 *
 * Der Fehler, den man ohne diesen Test nie bemerkt: der Nutzer geht zurück,
 * um etwas zu korrigieren, und tippt alles neu.
 */
export async function assertBackKeepsInput(
  page: Page,
  wizardName: string,
  firstFieldSelector: string,
): Promise<void> {
  const field = page.locator(firstFieldSelector).first();
  await must(field, `${wizardName}: erstes Eingabefeld (${firstFieldSelector})`);

  const marker = `E2E-Zustand-${Date.now().toString().slice(-6)}`;
  await field.fill(marker);

  await goToNextStep(page, wizardName);

  const back = page.getByRole("button", { name: /^zurück|^zurueck/i }).first();
  await must(back, `${wizardName}: Schaltflaeche Zurueck`);
  await back.click();

  await expect
    .poll(() => currentStep(page), {
      message: `${wizardName}: Zurueck hat den Schritt nicht gewechselt`,
      timeout: 10_000,
    })
    .toBe(0);

  await expect(
    page.locator(firstFieldSelector).first(),
    `${wizardName}: Nach dem Zurueckgehen ist die Eingabe aus Schritt 1 verloren`,
  ).toHaveValue(marker);
}

/**
 * Einen Eintrag in einem Combobox auswählen.
 *
 * Der Combobox ist eine Schaltfläche mit `role="combobox"`, die ein Popover
 * mit Suchfeld und Liste öffnet. Ein `fill()` auf das sichtbare Element
 * bewirkt nichts — genau deshalb blieb „Weiter“ im Pacht-Assistenten
 * gesperrt, obwohl der Läufer meldete, ein Feld gefüllt zu haben.
 *
 * @param label   Beschriftung oder Platzhalter der Schaltfläche.
 * @param suchen  Text, nach dem im Popover gesucht wird.
 */
export async function selectFromCombobox(
  page: Page,
  label: string | RegExp,
  suchen: string,
): Promise<void> {
  const trigger = page.getByRole("combobox", { name: label }).first();
  const fallback = page.locator('[role="combobox"]').first();
  const box = (await trigger.count()) > 0 ? trigger : fallback;

  await must(box, `Auswahlfeld ${label}`);
  await box.click();

  const suche = page.locator('[role="dialog"] input, [cmdk-input]').first();
  await must(suche, `Suchfeld im Auswahlfeld ${label}`);
  await suche.fill(suchen);

  const treffer = page.getByRole("option", { name: new RegExp(suchen, "i") }).first();
  await expect(
    treffer,
    `Kein Eintrag „${suchen}“ im Auswahlfeld ${label} — entweder ist der ` +
      `Datensatz nicht angelegt oder die Liste laedt ihn nicht.`,
  ).toBeVisible({ timeout: 10_000 });
  await treffer.click();
}

/**
 * Einen Eintrag in einem Radix-Select waehlen.
 *
 * Unterschied zum Combobox: kein Suchfeld. Der Ausloeser oeffnet direkt eine
 * Liste. Beide tragen `role="combobox"`, weshalb der Unterschied im Test
 * leicht untergeht — und ein `fill()` auf beiden gleichermassen nichts tut.
 *
 * @param triggerId  id des SelectTrigger (z. B. "status").
 * @param eintrag    Sichtbarer Text des gewuenschten Eintrags.
 */
export async function selectOption(
  page: Page,
  triggerId: string,
  eintrag: string | RegExp,
): Promise<void> {
  const trigger = page.locator(`#${triggerId}`);
  await must(trigger, `Auswahlfeld #${triggerId}`);
  await trigger.click();

  const option = page.getByRole("option", { name: eintrag }).first();
  await expect(
    option,
    `Kein Eintrag ${eintrag} im Auswahlfeld #${triggerId}`,
  ).toBeVisible({ timeout: 10_000 });
  await option.click();
}
