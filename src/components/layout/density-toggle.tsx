"use client";

/**
 * Detailgrad der Tabellen — kompakt oder normal. Umgeschaltet wird im
 * Benutzermenü der Kopfzeile.
 *
 * ## Warum es das gibt
 *
 * Die Dokumentenliste zeigte sieben Zeilen auf achthundert Pixeln. Wer täglich
 * dreihundert Flurstücke abgleicht, scrollt damit den halben Tag. Wer einmal
 * im Monat eine Rechnung sucht, will es luftig.
 *
 * Beides ist richtig, und beides gleichzeitig geht nicht. Also entscheidet es
 * der Nutzer — einmal, und es bleibt.
 *
 * ## Warum über ein Attribut am Dokument
 *
 * Es gibt rund 169 Listen im Produkt. Ein Schalter, der sie einzeln anfassen
 * müsste, wäre nie fertig und würde bei jeder neuen Liste wieder vergessen.
 * Stattdessen setzt er ein Attribut am `<html>`, und die Zellenpolsterung
 * kommt aus einer CSS-Variablen — jede Tabelle folgt, auch die, die es noch
 * nicht gibt.
 *
 * ## Warum kein dritter Grad
 *
 * „Kompakt / normal / gemütlich" klingt gründlicher und ist es nicht: beim
 * dritten Wert fängt man an zu überlegen, welcher gerade an ist. Zwei Zustände
 * kann man umschalten, ohne hinzusehen.
 */

import { useEffect, useState } from "react";

const SPEICHER_SCHLUESSEL = "wpm.density";

/**
 * Applies the stored density on mount and returns the toggle. Called by the
 * header itself — the toggle lives in the user menu, whose content is only
 * mounted while open.
 */
export function useDichte() {
  const [kompakt, setKompakt] = useState(false);

  // Erst nach dem Einhaengen lesen: auf dem Server gibt es keinen
  // localStorage, und ein Unterschied zwischen Server- und Client-Ausgabe
  // fuehrt zu einem Hydrierungsfehler.
  useEffect(() => {
    try {
      const gespeichert = window.localStorage.getItem(SPEICHER_SCHLUESSEL);
      if (gespeichert === "compact") {
        setKompakt(true);
        document.documentElement.setAttribute("data-density", "compact");
      }
    } catch {
      // Gesperrter Speicher — dann eben in der Voreinstellung.
    }
  }, []);

  function umschalten() {
    const neu = !kompakt;
    setKompakt(neu);
    if (neu) {
      document.documentElement.setAttribute("data-density", "compact");
    } else {
      document.documentElement.removeAttribute("data-density");
    }
    try {
      window.localStorage.setItem(SPEICHER_SCHLUESSEL, neu ? "compact" : "normal");
    } catch {
      // Gilt dann nur für diese Sitzung.
    }
  }

  return { kompakt, umschalten };
}
