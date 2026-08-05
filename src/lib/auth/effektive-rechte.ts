/**
 * EFFEKTIVE RECHTE EINER ROLLE
 * =============================
 *
 * Was eine Rolle **darf** ist nicht dasselbe wie was ihr **zugewiesen** ist.
 *
 * `requirePermission()` gibt bei Rangstufe >= 100 frei, ohne irgendetwas zu
 * prüfen (siehe `withPermission.ts`). Eine Superadmin-Rolle braucht die Rechte
 * deshalb gar nicht zu besitzen — und in der Datenbank besitzt sie sie auch
 * nicht.
 *
 * ## Warum das eine eigene Datei ist
 *
 * Die Berechtigungs-Matrix las bisher nur die Zuweisungen. Im Export vom
 * 05.08.2026 standen dadurch 61 der 188 Zeilen beim Superadmin leer — und weil
 * genau diese 61 sonst auch keiner Rolle zugewiesen sind, las sich jede dieser
 * Zeilen als „das darf niemand".
 *
 * Was dort stand: Buchungen festschreiben, Buchungen stornieren, Periode
 * sperren, Bilanz anzeigen, Jahresabschluss ausführen, GoBD Z3-Export,
 * DATEV-Export, Audit-Logs anzeigen. Also die Zeilen, wegen derer das Dokument
 * überhaupt erstellt wird.
 *
 * Ein Dokument, das an dieser Stelle das Gegenteil der Wahrheit behauptet, ist
 * schlimmer als keines: man verlässt sich darauf.
 *
 * Die Regel steht jetzt an einer Stelle und hat einen Wächter. Wer die
 * Bypass-Grenze in `withPermission.ts` verschiebt, ohne hier nachzuziehen,
 * bekommt einen roten Test statt eines stillen Fehlers im nächsten Export.
 */

import { ROLE_HIERARCHY } from "./hierarchy";

/** Das Nötigste, um die effektiven Rechte einer Rolle zu bestimmen. */
export interface RolleMitRechten {
  /** Rangstufe. 100 = Superadmin, 80 = Administrator, 60 = Manager … */
  hierarchy: number;
  /** Die ausdrücklich zugewiesenen Rechte. */
  zugewieseneRechte: string[];
}

/** Was sich über die Rechte einer Rolle sagen lässt. */
export interface RechteBefund {
  /** Alles, was die Rolle tatsächlich darf. */
  effektiv: string[];
  /** Wie viele davon ausdrücklich zugewiesen sind. */
  zugewiesen: number;
  /**
   * Ob die Rolle die Rechteprüfung umgeht.
   *
   * Wo das zutrifft, muss ein Dokument es dazuschreiben: die Haken folgen dann
   * aus der Rangstufe und lassen sich nicht entziehen.
   */
  umgehtPruefung: boolean;
}

/**
 * Ob eine Rangstufe die Rechteprüfung umgeht.
 *
 * Die Grenze steht in `withPermission.ts` als `rawHierarchy >= 100`. Hier
 * dieselbe Grenze über `ROLE_HIERARCHY.SUPERADMIN`, damit sie nicht zweimal
 * als nackte Zahl im Code steht.
 */
export function umgehtRechtepruefung(hierarchy: number): boolean {
  return hierarchy >= ROLE_HIERARCHY.SUPERADMIN;
}

/**
 * Die Rechte, die eine Rolle tatsächlich ausüben kann.
 *
 * @param rolle Rangstufe und zugewiesene Rechte
 * @param alleRechte Der vollständige Rechtekatalog — was eine Rolle mit
 *   Bypass alles darf. Bewusst ein Parameter und keine Abfrage: die Funktion
 *   soll ohne Datenbank prüfbar sein.
 */
export function effektiveRechte(
  rolle: RolleMitRechten,
  alleRechte: string[],
): RechteBefund {
  const umgeht = umgehtRechtepruefung(rolle.hierarchy);
  return {
    effektiv: umgeht ? [...alleRechte] : [...rolle.zugewieseneRechte],
    zugewiesen: rolle.zugewieseneRechte.length,
    umgehtPruefung: umgeht,
  };
}
