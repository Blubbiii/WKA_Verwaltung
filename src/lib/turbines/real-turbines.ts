/**
 * „Anlage" ist nicht dasselbe wie „Gerät".
 *
 * `POST /api/parks` legt zu jedem Park zwei virtuelle Geräte an — einen
 * Netzverknüpfungspunkt und einen Parkrechner — und speichert sie in derselben
 * Tabelle wie die Windkraftanlagen, unterschieden nur durch `deviceType`.
 *
 * Das ist eine sinnvolle Modellierung: der Parkrechner liefert SCADA-Daten und
 * muss adressierbar sein. Es ist zugleich eine Falle, die bis zum 02.08.2026
 * **viermal** zugeschnappt ist:
 *
 *  1. Die Löschsperre für Parks — ein frisch angelegter Park war nie löschbar.
 *  2. Die Zerlegung nach § 29 GewStG — die Geräte galten als „Anlage ohne
 *     Standortgemeinde" und lösten eine falsche Warnung aus.
 *  3. Die **Mindestpacht** — `Mindestentgelt je WEA × Anzahl Geräte`. Bei zwei
 *     echten Anlagen also der doppelte Betrag. Geld, das floss.
 *  4. Der Verteiler der Betreiberanteile — die Geräte standen im Nenner.
 *
 * Viermal dieselbe Ursache heisst: das Problem ist nicht die einzelne Abfrage,
 * sondern dass „alle Turbine-Datensätze" und „alle Windkraftanlagen" gleich
 * aussehen. Diese Datei gibt dem Unterschied einen Namen.
 *
 * ## Wann NICHT filtern
 *
 * Nicht überall sind Windkraftanlagen gemeint. Wo es um **Geräte** geht,
 * gehören die virtuellen dazu:
 *
 *  - Die SCADA-Zuordnung (`ScadaMappingsTab`) braucht sie — ein Parkrechner
 *    ist dort genau das, was zugeordnet wird.
 *  - `GET /api/turbines` liefert die Geräteliste, aus der jene Zuordnung
 *    ihre Auswahl speist.
 *  - Prüfungen auf konkrete Kennungen („gibt es diese Anlage?") — dort wäre
 *    ein Filter schlicht falsch.
 *
 * Die Faustregel: **wird gezählt oder gerechnet, sind Anlagen gemeint.** Wird
 * verwaltet oder zugeordnet, sind es Geräte.
 */

import type { Prisma } from "@prisma/client";

/**
 * `where`-Bedingung für „nur echte Windkraftanlagen".
 *
 * Für Zählungen, Summen und alles, was als Anzahl Anlagen erscheint:
 *
 * ```ts
 * prisma.turbine.count({ where: { ...NUR_ANLAGEN, park: { tenantId } } })
 * _count: { select: { turbines: { where: NUR_ANLAGEN } } }
 * ```
 */
export const NUR_ANLAGEN = { deviceType: "WEA" } satisfies Prisma.TurbineWhereInput;
