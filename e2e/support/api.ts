/**
 * API-Zugriff für Vorbereitung, Nachprüfung und Aufräumen.
 *
 * ## Warum die Suite überhaupt die API benutzt
 *
 * Ein Test, der einen Park über den Assistenten anlegt, hat damit den
 * Assistenten geprüft. Ein Test, der eine RECHNUNG prüfen will, braucht auch
 * einen Park — aber nicht dessen Assistenten noch einmal. Vorbedingungen über
 * die Oberfläche zu erzeugen macht Tests langsam und lässt sie an Stellen
 * scheitern, um die es gar nicht geht.
 *
 * Deshalb: **Vorbedingungen über die API, das Prüfobjekt über die
 * Oberfläche.**
 *
 * ## Warum das Ergebnis auch über die API geprüft wird
 *
 * Dass nach dem Speichern eine Erfolgsmeldung erscheint, heisst nicht, dass
 * etwas gespeichert wurde. Die alte Suite prüfte an mehreren Stellen nur, ob
 * die Seite länger als hundert Zeichen ist. Wer wissen will, ob ein Park
 * angelegt wurde, fragt danach — und zwar nach dem Wert, nicht nach der Optik.
 */

import type { APIRequestContext } from "@playwright/test";
import { expect } from "@playwright/test";
import { isTestArtifact } from "./run-context";

export interface CreatedRef {
  /** API-Sammlung, über die sich das Objekt wieder löschen lässt. */
  collection: string;
  id: string;
  name: string;
}

/**
 * Antwort auslesen und bei Fehlschlag mit dem TATSÄCHLICHEN Text scheitern.
 *
 * `expect(res.ok()).toBeTruthy()` meldet nur „false ist nicht true“ — bei
 * einem Validierungsfehler steht die Ursache aber im Rumpf. Ohne sie sucht
 * man den Fehler in der falschen Ecke.
 */
async function readOrFail(res: Awaited<ReturnType<APIRequestContext["post"]>>, what: string) {
  const body = await res.text();
  if (!res.ok()) {
    throw new Error(
      `${what} fehlgeschlagen: HTTP ${res.status()}\n${body.slice(0, 600)}`,
    );
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${what}: Antwort ist kein JSON\n${body.slice(0, 300)}`);
  }
}

export class WpmApi {
  /** Alles, was dieser Lauf erzeugt hat — in umgekehrter Anlegereihenfolge. */
  private readonly created: CreatedRef[] = [];

  constructor(private readonly request: APIRequestContext) {}

  /** Merkt ein extern (z. B. über die Oberfläche) erzeugtes Objekt zum Aufräumen vor. */
  track(ref: CreatedRef): CreatedRef {
    this.created.unshift(ref);
    return ref;
  }

  /**
   * Nimmt ein Objekt aus der Aufräumliste.
   *
   * Für den Fall, dass der Test das Löschen SELBST prüft — sonst versucht die
   * Nachbereitung es ein zweites Mal, bekommt 404 und meldet einen
   * Fehlschlag für etwas, das gerade erfolgreich entfernt wurde.
   */
  untrack(id: string): void {
    const i = this.created.findIndex((r) => r.id === id);
    if (i >= 0) this.created.splice(i, 1);
  }

  async create(
    collection: string,
    data: Record<string, unknown>,
    nameField = "name",
  ): Promise<CreatedRef> {
    const res = await this.request.post(`/api/${collection}`, { data });
    const json = await readOrFail(res, `POST /api/${collection}`);
    const entity = json.data ?? json;
    const ref: CreatedRef = {
      collection,
      id: entity.id,
      name: String(entity[nameField] ?? ""),
    };
    expect(ref.id, `POST /api/${collection} lieferte keine id`).toBeTruthy();
    return this.track(ref);
  }

  async get<T = unknown>(path: string): Promise<T> {
    const res = await this.request.get(path);
    return readOrFail(res, `GET ${path}`);
  }

  /**
   * Existiert ein Objekt mit diesem Namen in der Sammlung?
   *
   * Die Nachprüfung nach einem Anlegen über die Oberfläche. Bewusst über die
   * Liste und nicht über die id: der Test kennt die id nicht, weil er über
   * die Maske gegangen ist — und genau das soll er auch nicht müssen.
   */
  async findByName(
    collection: string,
    name: string,
  ): Promise<{ id: string; name: string } | null> {
    const json = await this.get<{ data?: { id: string; name?: string }[] }>(
      `/api/${collection}?limit=500`,
    );
    const rows = json.data ?? [];
    const hit = rows.find((r) => (r.name ?? "").trim() === name.trim());
    return hit ? { id: hit.id, name: hit.name ?? "" } : null;
  }

  async remove(ref: CreatedRef): Promise<boolean> {
    // Der Riegel: es wird nur gelöscht, was nachweislich aus einem Testlauf
    // stammt. Verlässt man sich darauf, dass die Liste „ja nur eigene“
    // enthält, löscht man irgendwann das Falsche.
    if (!isTestArtifact(ref.name)) {
      throw new Error(
        `Aufraeumen abgelehnt: "${ref.name}" traegt kein Testlauf-Praefix. ` +
          `Das ist kein von der Suite erzeugter Datensatz.`,
      );
    }
    const res = await this.request.delete(`/api/${ref.collection}/${ref.id}`);
    return res.ok();
  }

  /**
   * Räumt alles auf, was dieser Lauf angelegt hat.
   *
   * Umgekehrte Reihenfolge, weil Abhängigkeiten so herum aufgehen: die Anlage
   * vor dem Park, die Rechnung vor dem Gesellschafter. Ein Fehlschlag bricht
   * NICHT ab — ein Objekt, das sich nicht löschen lässt, darf die übrigen
   * nicht mit stehen lassen.
   */
  async cleanup(): Promise<{ removed: number; failed: CreatedRef[] }> {
    const failed: CreatedRef[] = [];
    let removed = 0;
    for (const ref of this.created) {
      try {
        (await this.remove(ref)) ? removed++ : failed.push(ref);
      } catch {
        failed.push(ref);
      }
    }
    this.created.length = 0;
    return { removed, failed };
  }

  get tracked(): readonly CreatedRef[] {
    return this.created;
  }
}
