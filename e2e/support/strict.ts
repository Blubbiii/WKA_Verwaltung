/**
 * Hilfsmittel, die scheitern statt zu schweigen.
 *
 * Die bestehende Suite enthält 72 Zweige der Form
 *
 *     if (await element.isVisible({ timeout: 5000 }).catch(() => false)) {
 *       …hier steht der eigentliche Test…
 *     }
 *
 * Fehlt das Element, tut der Test nichts — und gilt als bestanden. Bei 162
 * verschluckten Fehlern (`catch(() => {})`) heisst „147 Tests grün“ deshalb
 * nicht, dass 147 Dinge geprüft wurden. Es heisst nur, dass nichts geworfen
 * hat.
 *
 * Das ist derselbe Befund wie im ganzen Audit, nur im Prüfwerkzeug selbst:
 * ein nicht stattgefundener Vorgang sieht aus wie ein unauffälliger. Dort ist
 * er besonders tückisch, weil das Grün Sicherheit suggeriert.
 *
 * ## Die Regel
 *
 * Was der Test braucht, MUSS da sein. Ist es nicht da, ist das ein
 * Fehlschlag — mit einer Meldung, die sagt, was gesucht wurde und wo.
 *
 * Es gibt genau eine berechtigte Ausnahme: Zustände, die vom Datenbestand
 * abhängen (»falls es eine Entwurfsrechnung gibt«). Dafür ist
 * `requireOrSkip()` da — sie überspringt SICHTBAR mit Begründung, statt
 * stillschweigend durchzuwinken.
 */

import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "@playwright/test";

/**
 * Element muss sichtbar sein — sonst Fehlschlag mit sprechender Meldung.
 */
export async function must(
  locator: Locator,
  what: string,
  timeout = 10_000,
): Promise<Locator> {
  await expect(locator, `Erwartet: ${what}`).toBeVisible({ timeout });
  return locator;
}

/**
 * Erste Zeile einer Tabelle — mit klarer Meldung, wenn die Tabelle leer ist.
 *
 * „locator.first() ist nicht sichtbar“ sagt nichts. „Die Liste unter /parks
 * ist leer, der Test braucht mindestens einen Eintrag" sagt alles.
 */
export async function firstRow(page: Page, context: string): Promise<Locator> {
  const rows = page.locator("table tbody tr");
  const count = await rows.count();
  expect(
    count,
    `${context}: Die Tabelle ist leer. Dieser Test braucht mindestens einen Eintrag — ` +
      `entweder fehlt der Datenbestand oder die Liste laedt nicht.`,
  ).toBeGreaterThan(0);
  return rows.first();
}

/**
 * Bedingung, die vom Datenbestand abhängt.
 *
 * Ist sie nicht erfüllt, wird der Test ÜBERSPRUNGEN — sichtbar im Bericht,
 * mit Begründung. Der Unterschied zum stillen `if` ist entscheidend: ein
 * übersprungener Test steht als übersprungen da und nicht als bestanden.
 */
export async function requireOrSkip(
  condition: Promise<boolean> | boolean,
  reason: string,
): Promise<void> {
  const ok = await condition;
  test.skip(!ok, `Vorbedingung fehlt: ${reason}`);
}

/**
 * Wartet, bis die Anwendung fertig geladen hat — ohne feste Wartezeiten.
 *
 * Die alte Suite nutzt `waitForTimeout(2000)` an zwei Dutzend Stellen. Das
 * ist entweder zu kurz (dann wackelt der Test) oder zu lang (dann dauert der
 * Lauf). Beides lässt sich vermeiden, indem man auf das wartet, worauf es
 * ankommt.
 */
export async function ready(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  // Ladeplatzhalter sind das verlaessliche Signal: solange einer steht, ist
  // die Seite nicht fertig.
  const skeleton = page.locator('[class*="animate-pulse"]').first();
  await skeleton
    .waitFor({ state: "detached", timeout: 15_000 })
    .catch(() => {
      // Kein Platzhalter vorhanden — die Seite rendert direkt. Kein Fehler.
    });
}

/**
 * Füllt ein Feld über sein Label und stellt sicher, dass der Wert ankam.
 *
 * `fill()` scheitert stumm, wenn ein Feld schreibgeschützt ist oder eine
 * Maske den Wert wieder verwirft. Die Nachprüfung kostet nichts und fängt
 * genau das ab.
 */
export async function fillField(
  page: Page,
  label: string | RegExp,
  value: string,
): Promise<void> {
  const field = page.getByLabel(label).first();
  await must(field, `Eingabefeld „${label}“`);
  await field.fill(value);
  await expect(field, `Wert in „${label}“ wurde nicht uebernommen`).toHaveValue(
    value,
  );
}

/**
 * Klickt eine Schaltfläche, die es geben MUSS.
 */
export async function clickButton(
  page: Page,
  name: string | RegExp,
  what?: string,
): Promise<void> {
  const button = page.getByRole("button", { name }).first();
  await must(button, what ?? `Schaltflaeche „${name}“`);
  await button.click();
}
